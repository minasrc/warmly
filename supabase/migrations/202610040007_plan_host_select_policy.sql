drop policy "plans_select_for_members" on public.plans;
create policy "plans_select_for_members" on public.plans
for select to authenticated using (
  host_id = (select auth.uid()) or public.is_plan_member(id)
);
