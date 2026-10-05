revoke update on public.plans from anon, authenticated;
revoke insert, update, delete on public.guest_responses, public.guest_response_slots from anon, authenticated;

create function public.transition_plan_status(
  requested_plan_id uuid,
  requested_user_id uuid,
  requested_status public.plan_status
)
returns public.plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.plans;
begin
  select * into result from public.plans
  where id = requested_plan_id and host_id = requested_user_id
  for update;
  if not found then raise exception 'not_a_plan_host'; end if;
  if not (
    (result.status = 'draft' and requested_status in ('collecting', 'cancelled'))
    or (result.status = 'collecting' and requested_status = 'cancelled')
  ) or requested_status is null then raise exception 'invalid_plan_transition'; end if;
  if exists (select 1 from public.bookings where plan_id = requested_plan_id) then
    raise exception 'booking_in_progress';
  end if;
  update public.plans set status = requested_status where id = requested_plan_id returning * into result;
  return result;
end;
$$;

create function public.reserve_calendar_booking(
  requested_plan_id uuid,
  requested_user_id uuid,
  requested_idempotency_key uuid,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz,
  requested_connection_id uuid,
  requested_calendar_id text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan public.plans;
  result public.bookings;
begin
  select * into current_plan from public.plans
  where id = requested_plan_id and host_id = requested_user_id
  for update;
  if not found then raise exception 'not_a_plan_host'; end if;
  if current_plan.status <> 'collecting' then raise exception 'plan_not_collecting'; end if;
  if not exists (
    select 1 from public.calendar_connections
    where id = requested_connection_id and user_id = requested_user_id and status = 'active'
  ) then raise exception 'invalid_calendar_connection'; end if;
  select * into result from public.bookings where plan_id = requested_plan_id;
  if found then
    if result.idempotency_key <> requested_idempotency_key
      or result.starts_at <> requested_starts_at or result.ends_at <> requested_ends_at
      or result.connection_id is distinct from requested_connection_id
      or result.provider_calendar_id is distinct from requested_calendar_id then
      raise exception 'booking_in_progress';
    end if;
    return result;
  end if;
  insert into public.bookings(plan_id, created_by, idempotency_key, starts_at, ends_at, connection_id, provider_calendar_id)
  values (requested_plan_id, requested_user_id, requested_idempotency_key, requested_starts_at, requested_ends_at, requested_connection_id, requested_calendar_id)
  returning * into result;
  return result;
end;
$$;

create or replace function public.finalize_calendar_booking(
  requested_idempotency_key uuid,
  requested_event_id text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan public.plans;
  result public.bookings;
begin
  if requested_event_id is null or length(requested_event_id) = 0 then raise exception 'invalid_event_id'; end if;
  select plans.* into current_plan from public.plans plans
  join public.bookings bookings on bookings.plan_id = plans.id
  where bookings.idempotency_key = requested_idempotency_key
  for update of plans;
  if not found then raise exception 'booking_not_found'; end if;
  select * into result from public.bookings where idempotency_key = requested_idempotency_key;
  if result.status = 'created' and result.provider_event_id = requested_event_id and current_plan.status = 'booked' then
    return result;
  end if;
  if current_plan.status <> 'collecting' or result.status <> 'pending' then raise exception 'plan_not_collecting'; end if;
  update public.bookings
  set status = 'created', provider_event_id = requested_event_id, failure_code = null
  where id = result.id returning * into result;
  update public.plans set status = 'booked' where id = result.plan_id;
  return result;
end;
$$;

drop function public.save_guest_response(uuid, text, timestamptz[], timestamptz[]);
create function public.save_guest_response(
  response_plan_id uuid,
  response_user_id uuid,
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
  saved_response_id uuid;
  current_plan public.plans;
begin
  select * into current_plan from public.plans where id = response_plan_id and status = 'collecting' for update;
  if not found then raise exception 'plan_not_collecting'; end if;
  perform 1 from public.plan_members
  where plan_id = response_plan_id and user_id = response_user_id and status <> 'removed'
  for share;
  if not found then raise exception 'not_a_plan_member'; end if;
  if response_starts_at is null or response_ends_at is null
    or cardinality(response_starts_at) <> cardinality(response_ends_at)
    or cardinality(response_starts_at) < 1 or cardinality(response_starts_at) > 50 then
    raise exception 'invalid_response_slots';
  end if;
  if exists (
    select 1 from unnest(response_starts_at, response_ends_at) as slot(starts_at, ends_at)
    where slot.starts_at is null or slot.ends_at is null
      or slot.ends_at - slot.starts_at <> make_interval(mins => current_plan.duration_minutes)
      or (slot.starts_at at time zone current_plan.time_zone)::date not between current_plan.start_date and current_plan.end_date
  ) then raise exception 'invalid_response_slots'; end if;
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

revoke all on function public.transition_plan_status(uuid, uuid, public.plan_status) from public, anon, authenticated;
revoke all on function public.reserve_calendar_booking(uuid, uuid, uuid, timestamptz, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.save_guest_response(uuid, uuid, text, timestamptz[], timestamptz[]) from public, anon, authenticated;
grant execute on function public.transition_plan_status(uuid, uuid, public.plan_status) to service_role;
grant execute on function public.reserve_calendar_booking(uuid, uuid, uuid, timestamptz, timestamptz, uuid, text) to service_role;
grant execute on function public.save_guest_response(uuid, uuid, text, timestamptz[], timestamptz[]) to service_role;
