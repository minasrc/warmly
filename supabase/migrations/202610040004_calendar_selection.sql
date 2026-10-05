alter table public.plans
add column increment_minutes smallint not null default 30
check (increment_minutes between 5 and 120);

create or replace function public.replace_selected_calendars(
  requested_connection_id uuid,
  calendar_ids text[],
  calendar_names text[],
  calendar_time_zones text[],
  calendar_primary_flags boolean[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.calendar_connections
    where id = requested_connection_id
      and user_id = (select auth.uid())
      and status = 'active'
  ) then
    raise exception 'connection_not_found';
  end if;

  if cardinality(calendar_ids) <> cardinality(calendar_names)
    or cardinality(calendar_ids) <> cardinality(calendar_time_zones)
    or cardinality(calendar_ids) <> cardinality(calendar_primary_flags)
    or cardinality(calendar_ids) > 50 then
    raise exception 'invalid_calendar_selection';
  end if;

  delete from public.selected_calendars where connection_id = requested_connection_id;
  insert into public.selected_calendars(
    connection_id,
    provider_calendar_id,
    display_name,
    time_zone,
    is_primary
  )
  select
    requested_connection_id,
    calendar.id,
    calendar.name,
    nullif(calendar.time_zone, ''),
    calendar.is_primary
  from unnest(calendar_ids, calendar_names, calendar_time_zones, calendar_primary_flags)
    as calendar(id, name, time_zone, is_primary);
end;
$$;

revoke all on function public.replace_selected_calendars(uuid, text[], text[], text[], boolean[]) from public;
grant execute on function public.replace_selected_calendars(uuid, text[], text[], text[], boolean[]) to authenticated;
