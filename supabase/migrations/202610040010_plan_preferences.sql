alter table public.plans
add column allowed_dayparts text[] not null default '{}'
  check (allowed_dayparts <@ array['morning', 'afternoon', 'evening']::text[]),
add column require_all boolean not null default true;
