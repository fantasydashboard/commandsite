-- Josh Personal · structured N=1 experiments
-- ---------------------------------------------------------------------------
-- The spine of the "decision lifecycle" loop:
--   monitor → hypothesize → decide → execute → measure → learn → adjust
--
-- Every Sage-proposed change that's testable lands here as an experiment
-- with: hypothesis, success criteria, primary metric to watch, baseline
-- snapshot at start, end snapshot at completion, and a verdict
-- (confirmed / partial / refuted / inconclusive).
--
-- target_change_id (nullable FK) links experiments to the audit row of
-- the underlying target/profile mutation when one exists. Some
-- experiments don't change a target — e.g. "try Mediterranean dinners
-- for 14 days" — those keep target_change_id null and rely on a free-
-- text decision_summary.
--
-- baseline_snapshot / end_snapshot are JSONB so we can stash any
-- combination of metrics at start/end (LDL, A1C, weight, HRV avg, etc.)
-- without per-metric column proliferation.

create table public.personal_experiments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,

  -- ── What & why
  title              text not null,            -- short label, e.g. "Lower sat fat to 14g"
  hypothesis         text not null,            -- "LDL will drop to ≤130 by next draw"
  category           text not null check (category in (
    'nutrition', 'sleep', 'activity', 'hydration', 'supplement', 'recovery', 'other'
  )),

  -- ── The decision being tested
  -- target_change_id links to the audit row when the experiment IS
  -- a target/profile change. May be null for lifestyle experiments
  -- ("try eating window 8am-6pm for 14 days").
  target_change_id   uuid references public.personal_target_changes(id) on delete set null,
  decision_summary   text not null,            -- "Set sat_fat_g_ceiling from 20g to 14g"

  -- ── Measurement window
  start_date         date not null default current_date,
  duration_days      integer not null check (duration_days between 1 and 365),
  end_date           date generated always as (start_date + duration_days) stored,

  -- ── Primary metric we're watching
  primary_metric     text not null,            -- 'ldl_mg_dl' | 'weight_body_mass' | 'hrv_14d_avg' | 'sleep_7d_avg' | ...
  baseline_value     numeric,
  baseline_snapshot  jsonb not null default '{}'::jsonb,
  success_criteria   text not null,            -- "LDL ≤130 mg/dL at next draw"

  -- ── Outcome
  status             text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  end_value          numeric,
  end_snapshot       jsonb,
  verdict            text check (verdict in ('confirmed', 'partial', 'refuted', 'inconclusive', 'pending')),
  verdict_notes      text,
  ended_at           timestamptz,

  -- ── Metadata
  source             text not null default 'sage' check (source in ('sage', 'manual')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index personal_experiments_user_status_idx
  on public.personal_experiments (user_id, status, end_date desc);

create index personal_experiments_user_end_date_idx
  on public.personal_experiments (user_id, end_date);

create or replace function public.personal_experiments_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger personal_experiments_updated_at
  before update on public.personal_experiments
  for each row execute function public.personal_experiments_set_updated_at();

alter table public.personal_experiments enable row level security;

create policy "admins read own experiments"
  on public.personal_experiments for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own experiments"
  on public.personal_experiments for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());
