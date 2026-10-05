alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_plan_member(uuid) to authenticated;
grant execute on function public.is_plan_host(uuid) to authenticated;
grant execute on function public.accept_plan_invitation(bytea) to authenticated;
grant execute on function public.replace_selected_calendars(uuid, text[], text[], text[], boolean[]) to authenticated;
grant execute on function public.save_guest_response(uuid, text, timestamptz[], timestamptz[]) to authenticated;

drop policy "members_manage_by_host" on public.plan_members;
create policy "participants_remove_by_host" on public.plan_members
for update to authenticated
using (public.is_plan_host(plan_id) and role = 'participant')
with check (public.is_plan_host(plan_id) and role = 'participant' and status = 'removed');
revoke insert, update, delete on public.plan_members from anon, authenticated;
grant update(status, removed_at) on public.plan_members to authenticated;

revoke insert, update, delete on public.invitations from anon, authenticated;
revoke delete on public.calendar_connections from anon, authenticated;
