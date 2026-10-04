alter table public.bookings
add column connection_id uuid references public.calendar_connections(id),
add column provider_calendar_id text;

create function public.finalize_calendar_booking(
  requested_idempotency_key uuid,
  requested_event_id text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.bookings;
begin
  if requested_event_id is null or length(requested_event_id) = 0 then
    raise exception 'invalid_event_id';
  end if;
  update public.bookings
    set status = 'created', provider_event_id = requested_event_id, failure_code = null
    where idempotency_key = requested_idempotency_key
    returning * into result;
  if result.id is null then raise exception 'booking_not_found'; end if;
  update public.plans set status = 'booked' where id = result.plan_id;
  return result;
end;
$$;

revoke all on function public.finalize_calendar_booking(uuid, text) from public;
grant execute on function public.finalize_calendar_booking(uuid, text) to service_role;
