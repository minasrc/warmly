create table public.api_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now(),
  constraint rate_limit_count_positive check (request_count > 0)
);

alter table public.api_rate_limits enable row level security;
create index api_rate_limits_updated_at_idx on public.api_rate_limits(updated_at);

create function public.consume_api_rate_limit(
  requested_bucket_key text,
  maximum_requests integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if length(requested_bucket_key) < 16
    or maximum_requests < 1
    or window_seconds < 1
  then
    raise exception 'invalid rate limit arguments';
  end if;

  delete from public.api_rate_limits where updated_at < now() - interval '1 day';

  insert into public.api_rate_limits(bucket_key, window_started_at, request_count)
  values (requested_bucket_key, now(), 1)
  on conflict (bucket_key) do update
  set request_count = case
        when public.api_rate_limits.window_started_at <= now() - make_interval(secs => window_seconds)
          then 1
        else public.api_rate_limits.request_count + 1
      end,
      window_started_at = case
        when public.api_rate_limits.window_started_at <= now() - make_interval(secs => window_seconds)
          then now()
        else public.api_rate_limits.window_started_at
      end,
      updated_at = now()
  returning request_count into updated_count;

  return updated_count <= maximum_requests;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;
