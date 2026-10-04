alter table public.oauth_states
add column authorization_kind text not null default 'availability'
check (authorization_kind in ('availability', 'booking'));

drop function public.store_oauth_state(uuid, text, bytea, text, text, timestamptz);

create function public.store_oauth_state(
  oauth_user_id uuid,
  oauth_provider text,
  oauth_state_hash bytea,
  oauth_code_verifier text,
  oauth_redirect_uri text,
  oauth_expires_at timestamptz,
  oauth_authorization_kind text
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
  if oauth_authorization_kind not in ('availability', 'booking') then
    raise exception 'invalid_authorization_kind';
  end if;
  verifier_secret_id := vault.create_secret(oauth_code_verifier);
  insert into public.oauth_states(
    user_id,
    provider,
    state_hash,
    code_verifier_secret_id,
    redirect_uri,
    expires_at,
    authorization_kind
  )
  values (
    oauth_user_id,
    oauth_provider,
    oauth_state_hash,
    verifier_secret_id,
    oauth_redirect_uri,
    oauth_expires_at,
    oauth_authorization_kind
  )
  returning id into oauth_state_id;
  return oauth_state_id;
end;
$$;

revoke all on function public.store_oauth_state(uuid, text, bytea, text, text, timestamptz, text) from public;
grant execute on function public.store_oauth_state(uuid, text, bytea, text, text, timestamptz, text) to service_role;
