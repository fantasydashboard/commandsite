-- Josh Personal · cached 8-week Trends recap
-- ---------------------------------------------------------------------------
-- One row per user. Sage writes here from the generate-trends-summary
-- edge function (on-demand via a Refresh button on the Trends tab).
-- Same shape as personal_sage_summary but kept separate because the
-- two recaps cover different windows + framings:
--
--   personal_sage_summary    — 30 days of decisions (History tab)
--   personal_trends_summary  — 8 weeks of metric movement (Trends tab)

create table public.personal_trends_summary (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  body            text not null,
  highlights      jsonb not null default '[]'::jsonb,
  window_start    date not null,
  window_end      date not null,
  generated_at    timestamptz not null default now(),
  model           text default 'claude-sonnet-4-6',
  context_snapshot jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create or replace function public.personal_trends_summary_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger personal_trends_summary_updated_at
  before update on public.personal_trends_summary
  for each row execute function public.personal_trends_summary_set_updated_at();

alter table public.personal_trends_summary enable row level security;

create policy "admins read own trends summary"
  on public.personal_trends_summary for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own trends summary"
  on public.personal_trends_summary for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());
