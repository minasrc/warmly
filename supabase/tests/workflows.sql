begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

insert into auth.users(id, email, raw_user_meta_data)
values
  ('a1111111-1111-4111-8111-111111111111', 'workflow-host@example.com', '{}'),
  ('a2222222-2222-4222-8222-222222222222', 'workflow-guest@example.com', '{}'),
  ('a3333333-3333-4333-8333-333333333333', 'workflow-other@example.com', '{}');
insert into public.plans(id, host_id, name, status, start_date, end_date, duration_minutes, time_zone)
values ('a4444444-4444-4444-8444-444444444444', 'a1111111-1111-4111-8111-111111111111', 'Workflow test', 'collecting', '2026-10-12', '2026-10-18', 60, 'UTC');
insert into public.invitations(plan_id, invited_by, email, token_hash, expires_at)
values ('a4444444-4444-4444-8444-444444444444', 'a1111111-1111-4111-8111-111111111111', 'workflow-guest@example.com', decode(repeat('ab', 32), 'hex'), now() + interval '1 day');

select is((select role::text from public.plan_members where plan_id = 'a4444444-4444-4444-8444-444444444444'), 'host', 'plan creation adds its host');
select ok(not has_function_privilege('authenticated', 'public.finalize_calendar_booking(uuid,text)', 'execute'), 'clients cannot finalize calendar bookings');
select ok(not has_function_privilege('authenticated', 'public.consume_api_rate_limit(text,integer,integer)', 'execute'), 'clients cannot bypass request counters');
select ok(not has_function_privilege('authenticated', 'public.revoke_google_calendar_connection(uuid,uuid)', 'execute'), 'clients cannot touch stored provider tokens');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on p.pronamespace = n.oid
  where n.nspname = 'public'
    and p.proname in ('store_oauth_state', 'consume_oauth_state', 'save_google_calendar_connection', 'get_calendar_refresh_token', 'revoke_google_calendar_connection', 'consume_api_rate_limit', 'finalize_calendar_booking')
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
), 'all privileged functions reject both browser roles');
select ok(not has_table_privilege('authenticated', 'public.invitations', 'INSERT'), 'browser roles cannot mint or replace invitation token hashes');
select ok(not has_table_privilege('authenticated', 'public.calendar_connections', 'DELETE'), 'disconnects must use server-side grant and Vault cleanup');
select ok(not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT') and not has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT'), 'browser roles cannot read decrypted Vault contents');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-4111-8111-111111111111","email":"workflow-host@example.com"}';
select throws_ok(
  $$insert into public.plan_members(plan_id, user_id) values ('a4444444-4444-4444-8444-444444444444', 'a3333333-3333-4333-8333-333333333333')$$,
  '42501', 'permission denied for table plan_members', 'hosts cannot add calendars to a plan without invitation acceptance'
);
with attempted as (
  update public.plan_members set status = 'removed', removed_at = now()
  where plan_id = 'a4444444-4444-4444-8444-444444444444' and role = 'host' returning *
)
select is((select count(*)::integer from attempted), 0, 'hosts cannot remove their own host membership');
set local request.jwt.claims = '{"sub":"a3333333-3333-4333-8333-333333333333","email":"workflow-other@example.com"}';
select is((select outcome from public.accept_plan_invitation(decode(repeat('ab', 32), 'hex'))), 'email_mismatch', 'another email cannot accept');
set local request.jwt.claims = '{"sub":"a2222222-2222-4222-8222-222222222222","email":"WORKFLOW-GUEST@EXAMPLE.COM"}';
select is((select outcome from public.accept_plan_invitation(decode(repeat('ab', 32), 'hex'))), 'accepted', 'matching normalized email accepts once');
select is((select outcome from public.accept_plan_invitation(decode(repeat('ab', 32), 'hex'))), 'already_accepted', 'the same account can reopen its accepted invitation without mutating membership');
set local request.jwt.claims = '{"sub":"a3333333-3333-4333-8333-333333333333","email":"workflow-other@example.com"}';
select is((select outcome from public.accept_plan_invitation(decode(repeat('ab', 32), 'hex'))), 'invalid', 'another account cannot reopen an accepted invitation');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-4111-8111-111111111111","email":"workflow-host@example.com"}';
update public.plan_members set status = 'removed', removed_at = now()
where plan_id = 'a4444444-4444-4444-8444-444444444444' and user_id = 'a2222222-2222-4222-8222-222222222222';
select throws_ok(
  $$update public.plan_members set status = 'ready', removed_at = null where plan_id = 'a4444444-4444-4444-8444-444444444444' and user_id = 'a2222222-2222-4222-8222-222222222222'$$,
  '42501', 'new row violates row-level security policy for table "plan_members"', 'a host cannot restore removed consent without a new invitation'
);
set local request.jwt.claims = '{"sub":"a2222222-2222-4222-8222-222222222222","email":"workflow-guest@example.com"}';
select is((select outcome from public.accept_plan_invitation(decode(repeat('ab', 32), 'hex'))), 'invalid', 'a removed account cannot restore itself with an old invitation');
reset role;
select is((select role::text from public.plan_members where plan_id = 'a4444444-4444-4444-8444-444444444444' and user_id = 'a1111111-1111-4111-8111-111111111111'), 'host', 'guest acceptance preserves the host role');

insert into public.bookings(plan_id, created_by, idempotency_key, starts_at, ends_at)
values ('a4444444-4444-4444-8444-444444444444', 'a1111111-1111-4111-8111-111111111111', 'a5555555-5555-4555-8555-555555555555', '2026-10-12T13:00:00Z', '2026-10-12T14:00:00Z');
set local role service_role;
select is((public.finalize_calendar_booking('a5555555-5555-4555-8555-555555555555', 'provider-event')).status::text, 'created', 'finalization records the created event');
reset role;
select is((select status::text from public.plans where id = 'a4444444-4444-4444-8444-444444444444'), 'booked', 'finalization books the plan in the same transaction');
select is((select count(*)::integer from public.bookings where plan_id = 'a4444444-4444-4444-8444-444444444444'), 1, 'only one booking exists for the plan');
select * from finish();
rollback;
