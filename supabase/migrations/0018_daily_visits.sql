-- daily_visits: per-day page-view totals for a client's website,
-- pulled from external analytics (Vercel Web Analytics for v1).
-- Powers the New Users + Website Visits dual-line chart on Metrics.
--
-- Source column lets us add other providers later (PostHog, Plausible)
-- without colliding on the unique index.

create table if not exists public.daily_visits (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  date             date not null,
  views            integer not null default 0,
  unique_visitors  integer,
  source           text not null default 'vercel',
  fetched_at       timestamptz not null default now(),
  unique (client_id, source, date)
);

create index if not exists daily_visits_client_date_idx
  on public.daily_visits (client_id, date desc);

alter table public.daily_visits enable row level security;

create policy "admins manage daily visits" on public.daily_visits
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients read own daily visits" on public.daily_visits
  for select using (client_id = public.current_client_id());
