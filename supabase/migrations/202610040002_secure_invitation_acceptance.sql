create or replace function public.accept_plan_invitation(invitation_token_hash bytea)
returns table(outcome text, accepted_plan_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.invitations%rowtype;
  current_email text;
begin
  select * into pending
  from public.invitations
  where token_hash = invitation_token_hash
    and status = 'pending'
  for update;

  if not found then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  if pending.expires_at <= now() then
    update public.invitations set status = 'expired' where id = pending.id;
    return query select 'expired'::text, null::uuid;
    return;
  end if;

  current_email := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  if current_email = '' or current_email <> lower(pending.email::text) then
    return query select 'email_mismatch'::text, null::uuid;
    return;
  end if;

  update public.invitations
  set status = 'accepted',
      accepted_by = (select auth.uid()),
      accepted_at = now()
  where id = pending.id;

  insert into public.plan_members(plan_id, user_id, role, status, joined_at, removed_at)
  values (pending.plan_id, (select auth.uid()), 'participant', 'ready', now(), null)
  on conflict (plan_id, user_id) do update
  set role = 'participant',
      status = 'ready',
      joined_at = now(),
      removed_at = null,
      updated_at = now();

  return query select 'accepted'::text, pending.plan_id;
end;
$$;

revoke all on function public.accept_plan_invitation(bytea) from public;
grant execute on function public.accept_plan_invitation(bytea) to authenticated;
