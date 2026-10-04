create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.plan_status as enum ('draft', 'collecting', 'ready', 'booked', 'cancelled');
create type public.membership_role as enum ('host', 'participant');
create type public.membership_status as enum ('invited', 'ready', 'removed');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.connection_status as enum ('active', 'needs_reauth', 'revoked');
create type public.booking_status as enum ('pending', 'created', 'failed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext not null,
  display_name text,
  time_zone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (length(trim(email::text)) > 3),
  constraint profiles_time_zone_not_blank check (length(trim(time_zone)) > 0)
);

create unique index profiles_email_unique on public.profiles (lower(email::text));

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  status public.plan_status not null default 'draft',
  start_date date not null,
  end_date date not null,
  duration_minutes smallint not null,
  time_zone text not null,
  day_start time not null default '09:00',
  day_end time not null default '22:00',
  quorum smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_name_length check (length(trim(name)) between 1 and 120),
  constraint plans_date_order check (end_date >= start_date and end_date <= start_date + 62),
  constraint plans_duration check (duration_minutes between 15 and 1440),
  constraint plans_day_order check (day_end > day_start),
  constraint plans_quorum_range check (quorum between 1 and 50),
  constraint plans_time_zone_not_blank check (length(trim(time_zone)) > 0)
);

create index plans_host_id_idx on public.plans(host_id);

create table public.plan_members (
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.membership_role not null default 'participant',
  status public.membership_status not null default 'invited',
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id),
  constraint membership_lifecycle check (
    (status = 'removed' and removed_at is not null)
    or (status <> 'removed' and removed_at is null)
  )
);

create index plan_members_user_id_idx on public.plan_members(user_id);
create unique index one_host_per_plan on public.plan_members(plan_id) where role = 'host';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  email extensions.citext not null,
  token_hash bytea not null unique,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitation_email_not_blank check (length(trim(email::text)) > 3),
  constraint invitation_expiry_after_creation check (expires_at > created_at),
  constraint invitation_acceptance_consistent check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  ),
  constraint invitation_revocation_consistent check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked' and revoked_at is null)
  )
);

create unique index one_pending_invitation_per_email
  on public.invitations(plan_id, lower(email::text))
  where status = 'pending';
create index invitations_plan_id_idx on public.invitations(plan_id);
create index invitations_expiry_idx on public.invitations(expires_at) where status = 'pending';

create table public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  state_hash bytea not null unique,
  code_verifier_secret_id uuid not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint oauth_provider_supported check (provider in ('google')),
  constraint oauth_expiry_after_creation check (expires_at > created_at)
);

create index oauth_states_expiry_idx on public.oauth_states(expires_at) where consumed_at is null;

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  account_email extensions.citext not null,
  refresh_token_secret_id uuid not null,
  granted_scopes text[] not null default '{}',
  status public.connection_status not null default 'active',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connection_provider_supported check (provider in ('google')),
  unique (user_id, provider, provider_account_id)
);

create index calendar_connections_user_id_idx on public.calendar_connections(user_id);

create table public.selected_calendars (
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  provider_calendar_id text not null,
  display_name text,
  time_zone text,
  is_primary boolean not null default false,
  selected_at timestamptz not null default now(),
  primary key (connection_id, provider_calendar_id)
);

create table public.availability_preferences (
  plan_id uuid not null,
  user_id uuid not null,
  preferred_dayparts text[] not null default '{}',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id),
  foreign key (plan_id, user_id) references public.plan_members(plan_id, user_id) on delete cascade,
  constraint valid_dayparts check (preferred_dayparts <@ array['morning', 'afternoon', 'evening']::text[])
);

create table public.guest_responses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null,
  time_zone text not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plan_members(plan_id, user_id) on delete cascade,
  unique (plan_id, user_id)
);

create table public.guest_response_slots (
  response_id uuid not null references public.guest_responses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  primary key (response_id, starts_at),
  constraint response_slot_order check (ends_at > starts_at)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references public.plans(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  provider text not null default 'google',
  provider_event_id text,
  status public.booking_status not null default 'pending',
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_slot_order check (ends_at > starts_at),
  constraint booking_provider_supported check (provider in ('google')),
  constraint booking_created_has_event check (
    (status = 'created' and provider_event_id is not null)
    or status <> 'created'
  )
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  action text not null,
  request_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint audit_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index audit_log_plan_id_idx on public.audit_log(plan_id, created_at desc);
create index audit_log_actor_id_idx on public.audit_log(actor_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger plans_set_updated_at before update on public.plans
for each row execute function public.set_updated_at();
create trigger members_set_updated_at before update on public.plan_members
for each row execute function public.set_updated_at();
create trigger connections_set_updated_at before update on public.calendar_connections
for each row execute function public.set_updated_at();
create trigger preferences_set_updated_at before update on public.availability_preferences
for each row execute function public.set_updated_at();
create trigger responses_set_updated_at before update on public.guest_responses
for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  );
  return new;
end;
$$;

create trigger auth_user_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

create or replace function public.add_plan_host_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.plan_members(plan_id, user_id, role, status, joined_at)
  values (new.id, new.host_id, 'host', 'ready', now());
  return new;
end;
$$;

create trigger plans_add_host after insert on public.plans
for each row execute function public.add_plan_host_membership();

create or replace function public.is_plan_member(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plan_members
    where plan_id = target_plan_id
      and user_id = (select auth.uid())
      and status <> 'removed'
  );
$$;

create or replace function public.is_plan_host(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plan_members
    where plan_id = target_plan_id
      and user_id = (select auth.uid())
      and role = 'host'
      and status <> 'removed'
  );
$$;

revoke all on function public.is_plan_member(uuid) from public;
revoke all on function public.is_plan_host(uuid) from public;
grant execute on function public.is_plan_member(uuid) to authenticated;
grant execute on function public.is_plan_host(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.plan_members enable row level security;
alter table public.invitations enable row level security;
alter table public.oauth_states enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.selected_calendars enable row level security;
alter table public.availability_preferences enable row level security;
alter table public.guest_responses enable row level security;
alter table public.guest_response_slots enable row level security;
alter table public.bookings enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles_select_own" on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "plans_select_for_members" on public.plans
for select to authenticated using (public.is_plan_member(id));
create policy "plans_insert_by_host" on public.plans
for insert to authenticated with check (host_id = (select auth.uid()));
create policy "plans_update_by_host" on public.plans
for update to authenticated using (public.is_plan_host(id)) with check (host_id = (select auth.uid()));

create policy "members_select_same_plan" on public.plan_members
for select to authenticated using (public.is_plan_member(plan_id));
create policy "members_manage_by_host" on public.plan_members
for all to authenticated using (public.is_plan_host(plan_id)) with check (public.is_plan_host(plan_id));

create policy "invitations_manage_by_host" on public.invitations
for all to authenticated using (public.is_plan_host(plan_id)) with check (public.is_plan_host(plan_id));

create policy "connections_select_own" on public.calendar_connections
for select to authenticated using (user_id = (select auth.uid()));
create policy "connections_delete_own" on public.calendar_connections
for delete to authenticated using (user_id = (select auth.uid()));

create policy "selected_calendars_select_own" on public.selected_calendars
for select to authenticated using (
  exists (
    select 1 from public.calendar_connections
    where id = connection_id and user_id = (select auth.uid())
  )
);

create policy "preferences_select_own" on public.availability_preferences
for select to authenticated using (user_id = (select auth.uid()));
create policy "preferences_write_own" on public.availability_preferences
for all to authenticated using (
  user_id = (select auth.uid()) and public.is_plan_member(plan_id)
) with check (
  user_id = (select auth.uid()) and public.is_plan_member(plan_id)
);

create policy "responses_select_own" on public.guest_responses
for select to authenticated using (user_id = (select auth.uid()));
create policy "responses_write_own" on public.guest_responses
for all to authenticated using (
  user_id = (select auth.uid()) and public.is_plan_member(plan_id)
) with check (
  user_id = (select auth.uid()) and public.is_plan_member(plan_id)
);

create policy "response_slots_manage_own" on public.guest_response_slots
for all to authenticated using (
  exists (
    select 1 from public.guest_responses
    where id = response_id and user_id = (select auth.uid())
  )
) with check (
  exists (
    select 1 from public.guest_responses
    where id = response_id and user_id = (select auth.uid())
  )
);

create policy "bookings_select_for_members" on public.bookings
for select to authenticated using (public.is_plan_member(plan_id));

comment on table public.oauth_states is 'Stores only state hashes and Vault secret references; never OAuth codes or verifier plaintext.';
comment on table public.calendar_connections is 'Stores provider metadata and Vault secret references; refresh tokens never belong in this table.';
comment on table public.audit_log is 'Metadata must never contain OAuth codes, tokens, authorization headers, or provider payloads.';
