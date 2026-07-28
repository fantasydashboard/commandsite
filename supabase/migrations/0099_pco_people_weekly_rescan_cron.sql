-- Weekly full re-scan of the People roster for duplicate detection. Resets the
-- 'people' sync-state to backfill so the rapid-backfill cron performs a fresh
-- full scan (Sunday 03:00 UTC). Duplicates change slowly and a full re-scan
-- clears clusters the church has merged in Planning Center.
select cron.schedule('pco-people-weekly-rescan', '0 3 * * 0', $cron$
  update public.pco_sync_state
  set phase = 'backfill', backfill_complete = false, cursor = '{}'::jsonb, updated_at = now()
  where resource = 'people';
$cron$);
