create extension if not exists supabase_vault with schema vault;

create or replace function public.store_oauth_state(
  oauth_user_id uuid,
  oauth_provider text,
  oauth_state_hash bytea,
  oauth_code_verifier text,
  oauth_redirect_uri text,
  oauth_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  verifier_secret_id uuid;
  oauth_state_id uuid;
begin
  verifier_secret_id := vault.create_secret(oauth_code_verifier);
  insert into public.oauth_states(
    user_id,
    provider,
    state_hash,
    code_verifier_secret_id,
    redirect_uri,
    expires_at
  )
  values (
    oauth_user_id,
    oauth_provider,
    oauth_state_hash,
    verifier_secret_id,
    oauth_redirect_uri,
    oauth_expires_at
  )
  returning id into oauth_state_id;
  return oauth_state_id;
end;
$$;

create or replace function public.consume_oauth_state(oauth_state_hash bytea)
returns table(
  oauth_user_id uuid,
  oauth_code_verifier text,
  oauth_redirect_uri text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.oauth_states%rowtype;
  verifier text;
begin
  select * into pending
  from public.oauth_states
  where state_hash = oauth_state_hash
    and consumed_at is null
    and expires_at > now()
  for update;

  if not found then return; end if;

  select decrypted_secret into verifier
  from vault.decrypted_secrets
  where id = pending.code_verifier_secret_id;

  update public.oauth_states set consumed_at = now() where id = pending.id;
  perform vault.update_secret(pending.code_verifier_secret_id, '');

  return query select pending.user_id, verifier, pending.redirect_uri;
end;
$$;

create or replace function public.save_google_calendar_connection(
  connection_user_id uuid,
  google_account_id text,
  google_account_email extensions.citext,
  google_refresh_token text,
  google_granted_scopes text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.calendar_connections%rowtype;
  secret_id uuid;
  connection_id uuid;
begin
  select * into existing
  from public.calendar_connections
  where user_id = connection_user_id
    and provider = 'google'
    and provider_account_id = google_account_id
  for update;

  if found then
    perform vault.update_secret(existing.refresh_token_secret_id, google_refresh_token);
    update public.calendar_connections
    set account_email = google_account_email,
        granted_scopes = google_granted_scopes,
        status = 'active',
        updated_at = now()
    where id = existing.id;
    return existing.id;
  end if;

  secret_id := vault.create_secret(google_refresh_token);
  insert into public.calendar_connections(
    user_id,
    provider,
    provider_account_id,
    account_email,
    refresh_token_secret_id,
    granted_scopes
  )
  values (
    connection_user_id,
    'google',
    google_account_id,
    google_account_email,
    secret_id,
    google_granted_scopes
  )
  returning id into connection_id;
  return connection_id;
end;
$$;

create or replace function public.get_calendar_refresh_token(
  requested_connection_id uuid,
  requested_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select secrets.decrypted_secret
  from public.calendar_connections connections
  join vault.decrypted_secrets secrets on secrets.id = connections.refresh_token_secret_id
  where connections.id = requested_connection_id
    and connections.user_id = requested_user_id
    and connections.status = 'active';
$$;

revoke all on function public.store_oauth_state(uuid, text, bytea, text, text, timestamptz) from public;
revoke all on function public.consume_oauth_state(bytea) from public;
revoke all on function public.save_google_calendar_connection(uuid, text, extensions.citext, text, text[]) from public;
revoke all on function public.get_calendar_refresh_token(uuid, uuid) from public;

grant execute on function public.store_oauth_state(uuid, text, bytea, text, text, timestamptz) to service_role;
grant execute on function public.consume_oauth_state(bytea) to service_role;
grant execute on function public.save_google_calendar_connection(uuid, text, extensions.citext, text, text[]) to service_role;
grant execute on function public.get_calendar_refresh_token(uuid, uuid) to service_role;
