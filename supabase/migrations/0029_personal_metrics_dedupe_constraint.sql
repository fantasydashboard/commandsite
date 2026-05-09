-- Josh Personal · fix the dedupe constraint shape so upsert works
-- ---------------------------------------------------------------------------
-- The original 0028 migration used expression-based unique indexes
-- (coalesce(source, '')) so duplicate (metric_type, recorded_at) pairs
-- with a NULL source would still dedupe. But the supabase-js client's
-- ON CONFLICT spec requires the conflict target to be a plain column
-- list, not an expression. Result: every upsert errors with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" and zero rows insert.
--
-- Fix: drop the expression indexes, add proper unique constraints on
-- (metric_type, recorded_at, source). Apple Watch and HealthKit always
-- provide a source string (device name), so NULL sources are
-- effectively impossible — the loss of NULL-aware dedup doesn't matter
-- in practice.

drop index if exists public.personal_metrics_dedupe_idx;
drop index if exists public.personal_workouts_dedupe_idx;

alter table public.personal_metrics
  add constraint personal_metrics_dedupe_uq
  unique (metric_type, recorded_at, source);

alter table public.personal_workouts
  add constraint personal_workouts_dedupe_uq
  unique (workout_type, started_at, source);
