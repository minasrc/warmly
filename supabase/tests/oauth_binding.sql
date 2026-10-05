begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);
insert into auth.users(id, email, raw_user_meta_data) values
  ('c1111111-1111-4111-8111-111111111111', 'oauth-host@example.com', '{}'),
  ('c2222222-2222-4222-8222-222222222222', 'oauth-other@example.com', '{}');
select public.store_oauth_state('c1111111-1111-4111-8111-111111111111', 'google', decode(repeat('ac', 32), 'hex'), 'test-pkce-verifier', 'https://api.warmly.test/callback', now() + interval '10 minutes', 'availability');
select public.store_oauth_state('c1111111-1111-4111-8111-111111111111', 'google', decode(repeat('ad', 32), 'hex'), 'expired-test-verifier', 'https://api.warmly.test/callback', now() + interval '10 minutes', 'availability');
update public.oauth_states set created_at = now() - interval '2 minutes', expires_at = now() - interval '1 minute'
where state_hash = decode(repeat('ad', 32), 'hex');
select ok(to_regprocedure('public.consume_oauth_state(bytea)') is null, 'unbound OAuth consume function is removed');
select ok(not has_function_privilege('authenticated', 'public.consume_oauth_state(bytea,uuid)', 'execute') and not has_function_privilege('anon', 'public.consume_oauth_state(bytea,uuid)', 'execute'), 'browser roles cannot consume OAuth state directly');
set local role service_role;
select is((select count(*)::integer from public.consume_oauth_state(decode(repeat('ac', 32), 'hex'), 'c2222222-2222-4222-8222-222222222222')), 0, 'another authenticated principal cannot consume the initiating state');
select ok((select consumed_at is null from public.oauth_states where state_hash = decode(repeat('ac', 32), 'hex')), 'wrong-session attempts do not destroy the owner state');
select is((select oauth_user_id from public.consume_oauth_state(decode(repeat('ac', 32), 'hex'), 'c1111111-1111-4111-8111-111111111111')), 'c1111111-1111-4111-8111-111111111111'::uuid, 'the initiating identity can consume its state');
reset role;
select is((select secrets.decrypted_secret from vault.decrypted_secrets secrets join public.oauth_states states on states.code_verifier_secret_id = secrets.id where states.state_hash = decode(repeat('ac', 32), 'hex')), '', 'the consumed verifier is cleared in Vault');
select ok((select consumed_at is not null from public.oauth_states where state_hash = decode(repeat('ac', 32), 'hex')), 'successful consumption is recorded');
set local role service_role;
select is((select count(*)::integer from public.consume_oauth_state(decode(repeat('ac', 32), 'hex'), 'c1111111-1111-4111-8111-111111111111')), 0, 'state cannot be replayed');
select is((select count(*)::integer from public.consume_oauth_state(decode(repeat('ad', 32), 'hex'), 'c1111111-1111-4111-8111-111111111111')), 0, 'expired state cannot be consumed');
select ok((select consumed_at is null from public.oauth_states where state_hash = decode(repeat('ad', 32), 'hex')), 'expired consumption does not read or clear the verifier');
select is((select count(*)::integer from public.consume_oauth_state(decode(repeat('ad', 32), 'hex'), null)), 0, 'OAuth consumption cannot omit the authenticated principal');
reset role;
select * from finish();
rollback;
