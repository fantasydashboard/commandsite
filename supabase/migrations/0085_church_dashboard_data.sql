-- Per-church computed dashboard datasets, sourced live from PCO by the pco-sync
-- edge function. One row per (church, module). The dashboard reads these and
-- falls back to baked .ts when a row is absent.
create table if not exists public.church_dashboard_data (
  client_id         uuid not null references public.clients(id) on delete cascade,
  module_key        text not null,
  payload           jsonb not null,
  computed_at       timestamptz not null default now(),
  source_freshness  date,
  status            text not null default 'ok',
  error             text,
  synced_attempt_at timestamptz,
  primary key (client_id, module_key)
);

alter table public.church_dashboard_data enable row level security;

-- A church user reads only their own church's computed data.
create policy "clients read own dashboard data"
  on public.church_dashboard_data for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.client_id = church_dashboard_data.client_id
    )
  );

-- Admins read everything.
create policy "admins read all dashboard data"
  on public.church_dashboard_data for select
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- Writes are service-role only (pco-sync). No insert/update/delete policy for
-- anon/authenticated means only the service role (which bypasses RLS) can write.
