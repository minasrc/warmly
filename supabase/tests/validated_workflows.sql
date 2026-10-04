begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(34);

insert into auth.users(id, email, raw_user_meta_data) values
  ('b1111111-1111-4111-8111-111111111111', 'host@example.com', '{}'),
  ('b2222222-2222-4222-8222-222222222222', 'guest@example.com', '{}');
insert into public.plans(id, host_id, name, status, start_date, end_date, duration_minutes, time_zone) values
  ('b4444444-4444-4444-8444-444444444441', 'b1111111-1111-4111-8111-111111111111', 'Booking first', 'collecting', '2026-10-12', '2026-10-18', 60, 'UTC'),
  ('b4444444-4444-4444-8444-444444444442', 'b1111111-1111-4111-8111-111111111111', 'Cancellation first', 'collecting', '2026-10-12', '2026-10-18', 60, 'UTC'),
  ('b4444444-4444-4444-8444-444444444443', 'b1111111-1111-4111-8111-111111111111', 'Legacy cancelled', 'cancelled', '2026-10-12', '2026-10-18', 60, 'UTC'),
  ('b4444444-4444-4444-8444-444444444444', 'b1111111-1111-4111-8111-111111111111', 'Draft', 'draft', '2026-10-12', '2026-10-18', 60, 'UTC');
insert into public.plan_members(plan_id, user_id, role, status) values
  ('b4444444-4444-4444-8444-444444444441', 'b2222222-2222-4222-8222-222222222222', 'participant', 'ready');
insert into public.calendar_connections(id, user_id, provider, provider_account_id, account_email, refresh_token_secret_id)
values ('b6666666-6666-4666-8666-666666666666', 'b1111111-1111-4111-8111-111111111111', 'google', 'account', 'calendar@example.com', 'b7777777-7777-4777-8777-777777777777');
insert into public.selected_calendars(connection_id, provider_calendar_id) values ('b6666666-6666-4666-8666-666666666666', 'primary');
insert into public.guest_responses(id, plan_id, user_id, time_zone)
values ('b8888888-8888-4888-8888-888888888888', 'b4444444-4444-4444-8444-444444444441', 'b2222222-2222-4222-8222-222222222222', 'UTC');
insert into public.guest_response_slots(response_id, starts_at, ends_at)
values ('b8888888-8888-4888-8888-888888888888', '2026-10-12T13:00Z', '2026-10-12T14:00Z');

select ok(not has_table_privilege('authenticated', 'public.plans', 'UPDATE'), 'browser hosts cannot update plan lifecycle directly');
select ok(not has_table_privilege('authenticated', 'public.guest_responses', 'INSERT,UPDATE,DELETE'), 'responses have no browser mutation grants');
select ok(not has_table_privilege('authenticated', 'public.guest_response_slots', 'INSERT,UPDATE,DELETE'), 'response slots have no browser mutation grants');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on p.pronamespace = n.oid
  where n.nspname = 'public' and p.proname in ('save_guest_response', 'transition_plan_status', 'reserve_calendar_booking')
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
), 'verified workflow mutation functions are service-only');
select ok(to_regprocedure('public.save_guest_response(uuid,text,timestamptz[],timestamptz[])') is null, 'the old unverified response RPC is removed');

set local role authenticated;
set local request.jwt.claims = '{"sub":"b1111111-1111-4111-8111-111111111111","email":"host@example.com"}';
select throws_ok($$update public.plans set status = 'booked' where id = 'b4444444-4444-4444-8444-444444444441'$$, '42501', 'permission denied for table plans', 'even hosts cannot forge plan status');
select lives_ok($$select public.replace_selected_calendars('b6666666-6666-4666-8666-666666666666', '{}'::text[], '{}'::text[], '{}'::text[], '{}'::boolean[])$$, 'an account can clear its selected calendars');
select is((select count(*)::integer from public.selected_calendars), 0, 'empty selection removes saved calendars');
set local request.jwt.claims = '{"sub":"b2222222-2222-4222-8222-222222222222","email":"guest@example.com"}';
select throws_ok($$insert into public.guest_responses(plan_id, user_id, time_zone) values ('b4444444-4444-4444-8444-444444444442', 'b2222222-2222-4222-8222-222222222222', 'UTC')$$, '42501', 'permission denied for table guest_responses', 'guests cannot insert responses directly');
select throws_ok($$insert into public.guest_response_slots values ('b8888888-8888-4888-8888-888888888888', '2026-10-12T15:00Z', '2026-10-12T16:00Z')$$, '42501', 'permission denied for table guest_response_slots', 'guests cannot insert arbitrary response slots');
select throws_ok($$update public.guest_response_slots set starts_at = '2026-10-12T12:00Z'$$, '42501', 'permission denied for table guest_response_slots', 'guests cannot change verified slots directly');
select throws_ok($$delete from public.guest_response_slots$$, '42501', 'permission denied for table guest_response_slots', 'guests cannot delete slots outside atomic submission');
select throws_ok($$select public.save_guest_response('b4444444-4444-4444-8444-444444444441', 'b2222222-2222-4222-8222-222222222222', 'UTC', array['2026-10-12T15:00Z'::timestamptz], array['2026-10-12T16:00Z'::timestamptz])$$, '42501', 'permission denied for function save_guest_response', 'guests cannot bypass candidate verification with RPC');
reset role;

set local role service_role;
select lives_ok($$select public.save_guest_response('b4444444-4444-4444-8444-444444444441', 'b2222222-2222-4222-8222-222222222222', 'UTC', array['2026-10-12T13:00Z'::timestamptz], array['2026-10-12T14:00Z'::timestamptz])$$, 'the server can atomically save verified choices');
select is((select count(*)::integer from public.guest_response_slots), 1, 'response replacement keeps one atomic set');
select throws_ok($$select public.save_guest_response('b4444444-4444-4444-8444-444444444441', 'b2222222-2222-4222-8222-222222222222', 'UTC', array['2026-10-12T13:00Z'::timestamptz], array['2026-10-12T15:00Z'::timestamptz])$$, 'P0001', 'invalid_response_slots', 'duration is checked inside the transaction');
select throws_ok($$select public.save_guest_response('b4444444-4444-4444-8444-444444444442', 'b2222222-2222-4222-8222-222222222222', 'UTC', array['2026-10-12T13:00Z'::timestamptz], array['2026-10-12T14:00Z'::timestamptz])$$, 'P0001', 'not_a_plan_member', 'membership is rechecked inside the transaction');
select is((public.reserve_calendar_booking('b4444444-4444-4444-8444-444444444441', 'b1111111-1111-4111-8111-111111111111', 'b5555555-5555-4555-8555-555555555551', '2026-10-12T13:00Z', '2026-10-12T14:00Z', 'b6666666-6666-4666-8666-666666666666', 'primary')).status::text, 'pending', 'a booking reserves its plan before provider work');
select is((public.reserve_calendar_booking('b4444444-4444-4444-8444-444444444441', 'b1111111-1111-4111-8111-111111111111', 'b5555555-5555-4555-8555-555555555551', '2026-10-12T13:00Z', '2026-10-12T14:00Z', 'b6666666-6666-4666-8666-666666666666', 'primary')).idempotency_key, 'b5555555-5555-4555-8555-555555555551'::uuid, 'identical reservations are idempotent');
select throws_ok($$select public.transition_plan_status('b4444444-4444-4444-8444-444444444441', 'b1111111-1111-4111-8111-111111111111', 'cancelled')$$, 'P0001', 'booking_in_progress', 'cancellation loses after booking reservation');
select throws_ok($$select public.reserve_calendar_booking('b4444444-4444-4444-8444-444444444441', 'b1111111-1111-4111-8111-111111111111', 'b5555555-5555-4555-8555-555555555551', '2026-10-12T15:00Z', '2026-10-12T16:00Z', 'b6666666-6666-4666-8666-666666666666', 'primary')$$, 'P0001', 'booking_in_progress', 'retry cannot replace the reserved moment');
select is((public.transition_plan_status('b4444444-4444-4444-8444-444444444442', 'b1111111-1111-4111-8111-111111111111', 'cancelled')).status::text, 'cancelled', 'an unreserved plan can be cancelled');
select throws_ok($$select public.reserve_calendar_booking('b4444444-4444-4444-8444-444444444442', 'b1111111-1111-4111-8111-111111111111', 'b5555555-5555-4555-8555-555555555552', '2026-10-12T13:00Z', '2026-10-12T14:00Z', 'b6666666-6666-4666-8666-666666666666', 'primary')$$, 'P0001', 'plan_not_collecting', 'reservation loses after cancellation');
select is((select status::text from public.plans where id = 'b4444444-4444-4444-8444-444444444442'), 'cancelled', 'losing booking cannot reopen a cancelled plan');
insert into public.bookings(plan_id, created_by, idempotency_key, starts_at, ends_at)
values ('b4444444-4444-4444-8444-444444444443', 'b1111111-1111-4111-8111-111111111111', 'b5555555-5555-4555-8555-555555555553', '2026-10-12T13:00Z', '2026-10-12T14:00Z');
select throws_ok($$select public.finalize_calendar_booking('b5555555-5555-4555-8555-555555555553', 'event')$$, 'P0001', 'plan_not_collecting', 'finalization cannot override legacy cancelled state');
select is((select status::text from public.plans where id = 'b4444444-4444-4444-8444-444444444443'), 'cancelled', 'failed finalization leaves cancellation intact');
select is((public.finalize_calendar_booking('b5555555-5555-4555-8555-555555555551', 'event')).status::text, 'created', 'reserved booking can finalize');
select is((select status::text from public.plans where id = 'b4444444-4444-4444-8444-444444444441'), 'booked', 'successful finalization changes plan atomically');
select is((public.finalize_calendar_booking('b5555555-5555-4555-8555-555555555551', 'event')).provider_event_id, 'event', 'identical finalization is idempotent');
select throws_ok($$select public.finalize_calendar_booking('b5555555-5555-4555-8555-555555555551', 'different-event')$$, 'P0001', 'plan_not_collecting', 'finalization cannot replace an event');
select throws_ok($$select public.transition_plan_status('b4444444-4444-4444-8444-444444444441', 'b1111111-1111-4111-8111-111111111111', 'collecting')$$, 'P0001', 'invalid_plan_transition', 'booked plans cannot reopen');
select is((public.transition_plan_status('b4444444-4444-4444-8444-444444444444', 'b1111111-1111-4111-8111-111111111111', 'collecting')).status::text, 'collecting', 'draft plans can begin collection');
select is((public.transition_plan_status('b4444444-4444-4444-8444-444444444444', 'b1111111-1111-4111-8111-111111111111', 'cancelled')).status::text, 'cancelled', 'collecting plans can close');
select throws_ok($$select public.transition_plan_status('b4444444-4444-4444-8444-444444444444', 'b2222222-2222-4222-8222-222222222222', 'collecting')$$, 'P0001', 'not_a_plan_host', 'status transitions recheck host ownership');
reset role;
select * from finish();
rollback;
