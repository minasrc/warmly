create or replace function public.accept_plan_invitation(invitation_token_hash bytea)
returns table(outcome text, accepted_plan_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.invitations%rowtype;
  current_email text;
begin
  select * into invitation from public.invitations
    where token_hash = invitation_token_hash for update;
  if not found then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  if invitation.status = 'accepted' then
    if invitation.accepted_by = (select auth.uid()) and exists (
      select 1 from public.plan_members where plan_id = invitation.plan_id
        and user_id = (select auth.uid()) and status <> 'removed'
    ) then
      return query select 'already_accepted'::text, invitation.plan_id;
    else
      return query select 'invalid'::text, null::uuid;
    end if;
    return;
  end if;
  if invitation.status <> 'pending' then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  if invitation.expires_at <= now() then
    update public.invitations set status = 'expired' where id = invitation.id;
    return query select 'expired'::text, null::uuid;
    return;
  end if;
  current_email := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  if current_email = '' or current_email <> lower(invitation.email::text) then
    return query select 'email_mismatch'::text, null::uuid;
    return;
  end if;
  if not exists (select 1 from public.plans where id = invitation.plan_id and status = 'collecting') then
    return query select 'plan_closed'::text, null::uuid;
    return;
  end if;
  update public.invitations set status = 'accepted', accepted_by = (select auth.uid()), accepted_at = now()
    where id = invitation.id;
  insert into public.plan_members(plan_id, user_id, role, status, joined_at, removed_at)
    values (invitation.plan_id, (select auth.uid()), 'participant', 'ready', now(), null)
    on conflict (plan_id, user_id) do update set status = 'ready',
      joined_at = now(), removed_at = null, updated_at = now();
  return query select 'accepted'::text, invitation.plan_id;
end;
$$;

revoke all on function public.accept_plan_invitation(bytea) from public;
grant execute on function public.accept_plan_invitation(bytea) to authenticated;
