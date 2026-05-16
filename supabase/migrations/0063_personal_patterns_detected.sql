-- Josh Personal · pattern detection (Phase 3)
-- ---------------------------------------------------------------------------
-- A nightly job (detect-patterns) writes to this table when it finds
-- statistically meaningful divergences in Josh's data: sleep/HRV
-- recent vs baseline, weight-loss pace, sat-fat ceiling breaches,
-- adherence drift, BP threshold crossings, etc.
--
-- The Today page reads undismissed patterns and shows them as a
-- "Patterns Sage noticed" card. Tapping a pattern opens Sage chat
-- pre-filled to discuss it; from there Sage can call propose_experiment
-- to convert the pattern into a structured test.
--
-- Dedup: a unique partial index on (user_id, pattern_type, window_key)
-- so the same pattern detected on consecutive days doesn't pile up.
-- window_key is a discriminator like '2026-W19' or '2026-05' that the
-- detector chooses based on the pattern's natural granularity.

create table public.personal_patterns_detected (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,

  pattern_type       text not null check (pattern_type in (
    'sleep_deviation',
    'hrv_deviation',
    'weight_pace',
    'adherence_drift',
    'sat_fat_breach',
    'bp_threshold',
    'workout_gap',
    'water_chronic_under'
  )),

  -- A short, time-window discriminator so we don't re-flag the same
  -- pattern every night. e.g. '2026-W19' for week-level rules,
  -- '2026-05-15..2026-05-21' for explicit windows, '2026-05-15' for
  -- single-day events.
  window_key         text not null,

  title              text not null,            -- "Sleep down 1.5h vs 30d baseline"
  evidence_summary   text not null,            -- short prose, ≤180 chars
  evidence_data      jsonb not null default '{}'::jsonb,  -- raw numbers for Sage to cite

  severity           text not null check (severity in ('info', 'notable', 'concerning')),

  -- Optional sketch for the experiment Sage might propose. Free-form
  -- so the chat tool call can be richer; the UI doesn't render this.
  suggested_experiment jsonb,

  detected_at        timestamptz not null default now(),
  seen_at            timestamptz,                -- when user viewed it
  dismissed_at       timestamptz,                -- user explicitly dismissed
  -- When set, links the pattern to the experiment Sage proposed from it
  experiment_id      uuid references public.personal_experiments(id) on delete set null,

  created_at         timestamptz not null default now()
);

-- Active queries: undismissed patterns by recency
create index personal_patterns_user_active_idx
  on public.personal_patterns_detected (user_id, detected_at desc)
  where dismissed_at is null;

-- Dedup check
create unique index personal_patterns_dedupe_idx
  on public.personal_patterns_detected (user_id, pattern_type, window_key);

alter table public.personal_patterns_detected enable row level security;

create policy "admins read own patterns"
  on public.personal_patterns_detected for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own patterns"
  on public.personal_patterns_detected for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());


-- ── Cron: detect-patterns runs nightly at 04:00 UTC, after end-of-day
-- (03:00). Same vault-secret pattern as the other Phase 2 crons.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'josh-personal-detect-patterns') then
    perform cron.unschedule('josh-personal-detect-patterns');
  end if;
end $$;

select cron.schedule(
  'josh-personal-detect-patterns',
  '0 4 * * *',
  $cron$
  select net.http_post(
    url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/detect-patterns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'health_cron_secret')
    ),
    body := '{}'::jsonb
  )
  $cron$
);
