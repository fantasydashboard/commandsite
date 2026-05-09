-- Josh Personal · Apple Health time-series ingestion (Phase 0)
-- ---------------------------------------------------------------------------
-- Wide / flexible schema. Apple Health has 100+ metric types and we'll
-- discover what's useful as Josh uses it; per-metric typed tables would
-- mean a migration every time he wants to track something new. This
-- shape lets the Health Auto Export webhook insert anything HealthKit
-- exposes without code changes.
--
-- Each row = one observation. Multi-value records (sleep stages, HRV
-- min/max/avg) get split into separate rows by the webhook so queries
-- like "give me Avg HRV last 30 days" stay simple SQL aggregates.
--
-- Idempotency: Health Auto Export can re-send the same record (manual
-- "send now" + scheduled push catching the same data). The unique
-- index on (metric_type, recorded_at, source) makes upserts safe.

create table public.personal_metrics (
  id            uuid primary key default gen_random_uuid(),

  -- ── Apple Health metric type, normalized.
  -- Examples: 'step_count', 'heart_rate', 'heart_rate_variability_avg',
  -- 'sleep_asleep', 'sleep_deep', 'sleep_rem', 'body_mass',
  -- 'active_energy_burned', 'walking_running_distance', 'apple_exercise_time'.
  metric_type   text not null,

  -- ── Primary numeric value.
  -- For composite metrics (sleep, HRV) the webhook splits and stores
  -- each component as its own row. value is always the single number
  -- you'd graph or aggregate.
  value         numeric not null,

  -- ── Unit string from HealthKit ('count', 'ms', 'h', 'lbs', 'kcal',
  --     'mi', 'bpm', etc.). Stored verbatim; conversion happens at
  --     read time so we don't lose precision.
  unit          text,

  -- ── Apple Health observation timestamp (when the measurement
  --     happened, NOT when we received it).
  recorded_at   timestamptz not null,

  -- ── Device source ('Apple Watch', 'iPhone', 'Withings Body+', etc.).
  --     Useful for resolving conflicts (Apple Watch vs iPhone steps).
  source        text,

  -- ── Full original payload from Health Auto Export so we can re-parse
  --     later if our extraction logic gets smarter, without re-fetching
  --     from the iPhone.
  raw_payload   jsonb,

  -- ── Receipt timestamps
  received_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- Time-series queries: "last 30 days of weight" / "today's HRV"
create index personal_metrics_metric_recorded_at_idx
  on public.personal_metrics (metric_type, recorded_at desc);

-- Source-aware queries: "Apple Watch steps only"
create index personal_metrics_source_idx
  on public.personal_metrics (source)
  where source is not null;

-- Idempotency — same metric, same instant, same device = same row.
-- ON CONFLICT DO NOTHING on insert lets the webhook safely re-process
-- payloads it's seen before (Health Auto Export occasionally re-sends).
create unique index personal_metrics_dedupe_idx
  on public.personal_metrics (metric_type, recorded_at, coalesce(source, ''));

-- ── RLS: admin only. This is Josh's private data; even a logged-in
-- non-admin user must not see his weight / HRV / sleep. Edge Function
-- writes via service-role key so it bypasses RLS.
alter table public.personal_metrics enable row level security;

create policy "admins read personal_metrics"
  on public.personal_metrics for select
  using (public.is_admin());

create policy "admins manage personal_metrics"
  on public.personal_metrics for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── personal_workouts: separate table because Apple Health workouts
-- have richer structure (duration + distance + calories + start/end
-- + workout type). Storing them as flat metrics would lose info.
create table public.personal_workouts (
  id                  uuid primary key default gen_random_uuid(),

  workout_type        text not null,        -- 'running', 'strength_training', 'cycling', etc.
  started_at          timestamptz not null,
  ended_at            timestamptz not null,
  duration_seconds    integer,              -- redundant with start/end but easier to aggregate
  active_energy_kcal  numeric,
  distance_mi         numeric,
  avg_heart_rate      numeric,
  max_heart_rate      numeric,
  source              text,                 -- 'Apple Watch', 'Manual', etc.
  raw_payload         jsonb,

  received_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index personal_workouts_started_at_idx
  on public.personal_workouts (started_at desc);

create index personal_workouts_type_idx
  on public.personal_workouts (workout_type);

-- Idempotency: same workout type at the same instant from the same
-- device = same workout. Apple's UUIDs aren't always exposed in the
-- export, so we use start time + type + source as the natural key.
create unique index personal_workouts_dedupe_idx
  on public.personal_workouts (workout_type, started_at, coalesce(source, ''));

alter table public.personal_workouts enable row level security;

create policy "admins read personal_workouts"
  on public.personal_workouts for select
  using (public.is_admin());

create policy "admins manage personal_workouts"
  on public.personal_workouts for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── Webhook receipt log: keep a history of every incoming payload
-- for debugging when Health Auto Export sends something the parser
-- doesn't expect. Truncate to last 30 days via a future cron.
create table public.personal_health_webhook_log (
  id              uuid primary key default gen_random_uuid(),
  received_at     timestamptz not null default now(),
  status          text not null,            -- 'ok' | 'error' | 'partial'
  metrics_count   integer not null default 0,
  workouts_count  integer not null default 0,
  errors          jsonb,                    -- array of error strings if any
  raw_size_bytes  integer
);

create index personal_health_webhook_log_received_at_idx
  on public.personal_health_webhook_log (received_at desc);

alter table public.personal_health_webhook_log enable row level security;

create policy "admins read webhook log"
  on public.personal_health_webhook_log for select
  using (public.is_admin());

create policy "admins manage webhook log"
  on public.personal_health_webhook_log for all
  using (public.is_admin())
  with check (public.is_admin());
