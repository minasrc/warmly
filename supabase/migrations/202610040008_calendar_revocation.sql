create function public.revoke_google_calendar_connection(
  requested_connection_id uuid,
  requested_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection public.calendar_connections%rowtype;
begin
  select * into connection
  from public.calendar_connections
  where id = requested_connection_id
    and user_id = requested_user_id
    and provider = 'google'
  for update;
  if not found then return false; end if;

  delete from public.selected_calendars where connection_id = connection.id;
  update public.calendar_connections
  set status = 'revoked', granted_scopes = '{}', updated_at = now()
  where id = connection.id;
  perform vault.update_secret(connection.refresh_token_secret_id, '');
  return true;
end;
$$;

revoke all on function public.revoke_google_calendar_connection(uuid, uuid) from public;
grant execute on function public.revoke_google_calendar_connection(uuid, uuid) to service_role;
