-- 0077: per-touch send-day filter for follow-ups.
--
-- Adds followup_allowed_days to cs_settings.outreach_send_window so Touch
-- 2 + Touch 3 can be scheduled to fire ONLY on the research-backed peak
-- days (Tue/Wed/Thu), while Touch 1 stays on the wider allowed_days list
-- Josh prefers for volume.
--
-- Background: Smartlead's analysis of 250M+ cold emails, Apollo's 2024
-- benchmark, and Outreach.io's aggregated data all converge on the same
-- finding for owner-operator SMB targets:
--   * Tuesday: peak reply rate (100% baseline)
--   * Wednesday: 95-98%
--   * Thursday: 88-92%
--   * Monday: 70-78% (cold sequences get triaged out)
--   * Friday: 55-65% (mental checkout)
--   * Sat/Sun: high opens, low replies
-- Follow-ups (Touch 2/3) are especially hurt by Mon/Fri sends because
-- they depend on closure-pressure mechanics that dissipate over weekends.
-- Touch 1 survives wider days because there's no closure pressure to lose.
--
-- This migration:
--   1. Bumps the cs_settings.outreach_send_window default to include
--      followup_allowed_days = ['tue','wed','thu'].
--   2. Backfills existing rows where the key is absent, preserving any
--      explicit allowed_days overrides operators have already configured.
--
-- Behavior when followup_allowed_days is unset / empty / null: gmail-send
-- falls back to allowed_days for Touch 2/3 (pre-migration behavior).

alter table public.cs_settings
  alter column outreach_send_window set default jsonb_build_object(
    'tz_strategy',           'recipient_local',
    'weekday_hours',         jsonb_build_object('start', 8, 'end', 17),
    'allowed_days',          array['mon','tue','wed','thu','fri','sat']::text[],
    'blocked_dates',         array[]::text[],
    'max_per_day',           50,
    'jitter_minutes',        7,
    'followup_reserve_pct',  60,
    'followup_allowed_days', array['tue','wed','thu']::text[]
  );

update public.cs_settings
  set outreach_send_window = outreach_send_window || jsonb_build_object(
    'followup_allowed_days', array['tue','wed','thu']::text[]
  )
  where (outreach_send_window ? 'followup_allowed_days') = false;

comment on column public.cs_settings.outreach_send_window is
  'JSON shape: { tz_strategy, weekday_hours{start,end}, allowed_days[], blocked_dates[], max_per_day, jitter_minutes, followup_reserve_pct, followup_allowed_days[] }. followup_allowed_days narrows Touch 2/3 to peak reply-rate days (Tue/Wed/Thu by default) while allowed_days stays wider for Touch 1 volume.';
