-- Local mirror of the PCO data the Care & Drift transforms need, filled in
-- resumable chunks by pco-fetch and read by compute-over-cache. Service role
-- writes; admins read. Church users never read staging (they read
-- church_dashboard_data).

create table if not exists public.pco_serving_assignments (
  client_id uuid not null references public.clients(id) on delete cascade,
  person_id text not null,
  name      text not null,
  date      date not null,
  team      text not null,
  status    text not null,
  primary key (client_id, person_id, date, team)
);
create index if not exists pco_serving_assignments_client_date_idx
  on public.pco_serving_assignments (client_id, date);

create table if not exists public.pco_group_attendance (
  client_id  uuid not null references public.clients(id) on delete cascade,
  group_id   text not null,
  group_name text not null,
  event_id   text not null,
  event_date date not null,
  person_id  text not null,
  name       text not null,
  primary key (client_id, group_id, event_id, person_id)
);
create index if not exists pco_group_attendance_client_group_idx
  on public.pco_group_attendance (client_id, group_id);

create table if not exists public.pco_group_members (
  client_id  uuid not null references public.clients(id) on delete cascade,
  group_id   text not null,
  group_name text not null,
  person_id  text not null,
  name       text not null,
  primary key (client_id, group_id, person_id)
);

create table if not exists public.pco_sync_state (
  client_id         uuid not null references public.clients(id) on delete cascade,
  resource          text not null,
  phase             text not null default 'backfill',
  cursor            jsonb not null default '{}'::jsonb,
  last_synced_date  date,
  backfill_complete boolean not null default false,
  updated_at        timestamptz not null default now(),
  error             text,
  primary key (client_id, resource)
);

alter table public.pco_serving_assignments enable row level security;
alter table public.pco_group_attendance   enable row level security;
alter table public.pco_group_members       enable row level security;
alter table public.pco_sync_state          enable row level security;

-- Admins read all; service role bypasses RLS for writes. No policy for
-- anon/authenticated non-admins.
create policy "admins read serving assignments" on public.pco_serving_assignments
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "admins read group attendance" on public.pco_group_attendance
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "admins read group members" on public.pco_group_members
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "admins read sync state" on public.pco_sync_state
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
