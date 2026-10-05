create function public.save_guest_response(
  response_plan_id uuid,
  response_time_zone text,
  response_starts_at timestamptz[],
  response_ends_at timestamptz[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  response_user_id uuid := (select auth.uid());
  saved_response_id uuid;
  plan_duration smallint;
  plan_start date;
  plan_end date;
  plan_time_zone text;
begin
  if response_user_id is null or not public.is_plan_member(response_plan_id) then
    raise exception 'not_a_plan_member';
  end if;
  if cardinality(response_starts_at) <> cardinality(response_ends_at)
    or cardinality(response_starts_at) < 1
    or cardinality(response_starts_at) > 50 then
    raise exception 'invalid_response_slots';
  end if;

  select duration_minutes, start_date, end_date, time_zone
  into plan_duration, plan_start, plan_end, plan_time_zone
  from public.plans
  where id = response_plan_id and status = 'collecting';
  if not found then raise exception 'plan_not_collecting'; end if;

  if exists (
    select 1
    from unnest(response_starts_at, response_ends_at) as slot(starts_at, ends_at)
    where slot.ends_at - slot.starts_at <> make_interval(mins => plan_duration)
      or (slot.starts_at at time zone plan_time_zone)::date not between plan_start and plan_end
  ) then
    raise exception 'invalid_response_slots';
  end if;

  insert into public.guest_responses(plan_id, user_id, time_zone, submitted_at)
  values (response_plan_id, response_user_id, response_time_zone, now())
  on conflict (plan_id, user_id) do update
  set time_zone = excluded.time_zone, submitted_at = now(), updated_at = now()
  returning id into saved_response_id;

  delete from public.guest_response_slots where response_id = saved_response_id;
  insert into public.guest_response_slots(response_id, starts_at, ends_at)
  select saved_response_id, slot.starts_at, slot.ends_at
  from unnest(response_starts_at, response_ends_at) as slot(starts_at, ends_at);
  return saved_response_id;
end;
$$;

revoke all on function public.save_guest_response(uuid, text, timestamptz[], timestamptz[]) from public;
grant execute on function public.save_guest_response(uuid, text, timestamptz[], timestamptz[]) to authenticated;
