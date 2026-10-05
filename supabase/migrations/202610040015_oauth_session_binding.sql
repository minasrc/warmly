drop function public.consume_oauth_state(bytea);
create function public.consume_oauth_state(oauth_state_hash bytea, requested_user_id uuid)
returns table(oauth_user_id uuid, oauth_code_verifier text, oauth_redirect_uri text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.oauth_states%rowtype;
  verifier text;
begin
  select * into pending from public.oauth_states
  where state_hash = oauth_state_hash and user_id = requested_user_id
    and consumed_at is null and expires_at > now()
  for update;
  if not found then return; end if;
  select decrypted_secret into verifier from vault.decrypted_secrets
  where id = pending.code_verifier_secret_id;
  update public.oauth_states set consumed_at = now() where id = pending.id;
  perform vault.update_secret(pending.code_verifier_secret_id, '');
  return query select pending.user_id, verifier, pending.redirect_uri;
end;
$$;
revoke all on function public.consume_oauth_state(bytea, uuid) from public, anon, authenticated;
grant execute on function public.consume_oauth_state(bytea, uuid) to service_role;
