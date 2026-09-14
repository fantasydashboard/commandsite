-- Backfill checked_in_by across the window "Who to ask" actually reads.
--
-- 0112 added the column; rows written before it have none, and the incremental
-- pass only revisits the last 21 days, so it would never reach the rest. Who to
-- ask runs on a 120 day window, so without this the drop-off counts would climb
-- slowly over four months and be wrong the whole time.
--
-- Resetting the cursor puts kids back into backfill. The every-two-minutes job
-- resumes it and gets there on its own.
--
-- APPLY AFTER THE FUNCTION DEPLOYS, and only then. If the old function picks up
-- this reset it will happily re-pull the whole window without the new column
-- and consume the backfill, and it would all have to be reset again.
--
-- Safe while it runs: computeDrift and computeServeCandidates only write on a
-- completed pass, so Care & Drift and Serving keep serving their last good
-- payloads until it finishes.

update public.pco_sync_state
set phase = 'backfill', backfill_complete = false, cursor = '{}'::jsonb,
    updated_at = now(), error = null
where resource = 'kids'
  and client_id in (select id from public.clients where slug = 'focal-point-church');
