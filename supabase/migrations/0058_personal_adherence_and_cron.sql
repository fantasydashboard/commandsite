-- Josh Personal · daily adherence rollup table + cron schedules (Phase 2 cadence)
-- ---------------------------------------------------------------------------
-- Three daily/weekly mechanics get scheduled here:
--   1. end-of-day-adherence       — daily at 03:00 UTC (≈ 10pm ET previous day)
--   2. generate-morning-brief     — daily at 11:00 UTC (≈ 7am ET)
--   3. generate-weekly-plan       — weekly Sunday 22:00 UTC (≈ 6pm ET)
--
-- Each cron POSTs to the corresponding edge function with a shared
-- secret in the X-Cron-Secret header. Functions verify and bail out
-- if the secret doesn't match.
--
-- ⚠️ MANUAL SETUP REQUIRED — one-time, in the Supabase SQL editor.
-- The secret is stored in Supabase Vault rather than baked into version-
-- controlled SQL. Run this once with the actual value:
--
--    select vault.create_secret(
--      '<the cron-secret value>',
--      'health_cron_secret',
--      'Cron secret for Josh Personal health functions'
--    );
--
-- Where <the cron-secret value> matches the MORNING_BRIEF_CRON_SECRET
-- value set in Supabase Functions → Secrets. If the secret isn't set,
-- the crons fire but the functions reject the request (visible in
-- cron.job_run_details). To rotate later:
--
--    select vault.update_secret(
--      (select id from vault.secrets where name = 'health_cron_secret'),
--      '<new value>'
--    );
--
-- To inspect cron runs:
--   select * from cron.job_run_details order by start_time desc limit 30;
--
-- To manually unschedule any:
--   select cron.unschedule('josh-personal-morning-brief');
--   select cron.unschedule('josh-personal-end-of-day');
--   select cron.unschedule('josh-personal-weekly-plan');

-- ── personal_daily_adherence ────────────────────────────────────────
-- One row per (user, date). The end-of-day cron writes here; the next
-- morning's brief reads it as the "yesterday actuals" continuity layer.

create table public.personal_daily_adherence (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- The day this snapshot represents (the user's local date).
  adherence_date  date not null,

  -- Aggregated intake from personal_meal_log
  meals_logged    integer not null default 0,
  cal_total       numeric not null default 0,
  protein_g_total numeric not null default 0,
  fat_g_total     numeric not null default 0,
  sat_fat_g_total numeric not null default 0,
  carbs_g_total   numeric not null default 0,

  -- Aggregated activity / hydration from personal_metrics
  water_oz_total  numeric not null default 0,
  steps_total     numeric not null default 0,
  workout_count   integer not null default 0,
  sleep_hours     numeric,                       -- last_night sleep at end-of-day-cron tick
  hrv_avg_ms      numeric,                       -- the day's HRV average if any

  -- Simple adherence flags computed at write time vs. profile.computed_targets
  hit_cal         boolean,                        -- within ±10% of daily_cal_target
  hit_protein     boolean,                        -- ≥ 90% of protein_g target
  under_sat_fat   boolean,                        -- ≤ sat_fat_g_ceiling
  hit_water       boolean,                        -- within 10oz of water_oz target
  hit_steps       boolean,                        -- ≥ 10000 steps
  workout_done    boolean,                        -- workout_count > 0

  -- Sage's optional one-line summary (filled when present, null otherwise)
  summary         text,

  source          text not null default 'cron' check (source in ('cron', 'manual')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (user_id, adherence_date)
);

create index personal_daily_adherence_user_date_idx
  on public.personal_daily_adherence (user_id, adherence_date desc);

create or replace function public.personal_daily_adherence_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger personal_daily_adherence_updated_at
  before update on public.personal_daily_adherence
  for each row execute function public.personal_daily_adherence_set_updated_at();

alter table public.personal_daily_adherence enable row level security;

create policy "admins read own adherence"
  on public.personal_daily_adherence for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own adherence"
  on public.personal_daily_adherence for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());


-- ── pg_cron schedules ───────────────────────────────────────────────

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Idempotent install — drop existing jobs of the same name first.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'josh-personal-end-of-day') then
    perform cron.unschedule('josh-personal-end-of-day');
  end if;
  if exists (select 1 from cron.job where jobname = 'josh-personal-morning-brief') then
    perform cron.unschedule('josh-personal-morning-brief');
  end if;
  if exists (select 1 from cron.job where jobname = 'josh-personal-weekly-plan') then
    perform cron.unschedule('josh-personal-weekly-plan');
  end if;
end $$;

-- Daily 03:00 UTC — end-of-day adherence rollup for the day that just ended in ET.
-- (When fired at 03:00 UTC, ET is 22:00-23:00 the previous day, so we summarize
-- "yesterday from the user's perspective" using the local date the cron computes.)
select cron.schedule(
  'josh-personal-end-of-day',
  '0 3 * * *',
  $$ select net.http_post(
       url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/end-of-day-adherence',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'X-Cron-Secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'health_cron_secret'), '')
       ),
       body := '{}'::jsonb
     ) $$
);

-- Daily 11:00 UTC — morning brief.
select cron.schedule(
  'josh-personal-morning-brief',
  '0 11 * * *',
  $$ select net.http_post(
       url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/generate-morning-brief',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'X-Cron-Secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'health_cron_secret'), '')
       ),
       body := '{}'::jsonb
     ) $$
);

-- Sundays 22:00 UTC — auto-draft next week's plan for review.
select cron.schedule(
  'josh-personal-weekly-plan',
  '0 22 * * 0',
  $$ select net.http_post(
       url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/generate-weekly-plan',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'X-Cron-Secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'health_cron_secret'), '')
       ),
       body := '{}'::jsonb
     ) $$
);
