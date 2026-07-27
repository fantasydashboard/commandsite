-- Rapid backfill and nightly incremental cron drivers for pco-fetch.
-- Replaces the Layer 1 single-shot nightly job (pco-sync-nightly).
-- The backfill job runs every 2 minutes to catch up churches still in the backfill phase.
-- The nightly job runs at 04:00 UTC for incremental refresh of all connected churches.
-- Both jobs POST to the pco-fetch function with hardcoded URL and X-Cron-Secret header.
-- The pco-fetch orchestrator reads body.mode to decide behavior (backfill vs. incremental).

-- Retire the Layer 1 single-shot nightly sync.
select cron.unschedule('pco-sync-nightly');

-- Rapid backfill driver: advance any church still catching up. Cheap no-op once
-- all resources are in the incremental phase.
select cron.schedule('pco-fetch-backfill', '*/2 * * * *', $cron$
  select net.http_post(
    url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/pco-fetch',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'health_cron_secret')),
    body := '{"mode":"backfill"}'::jsonb, timeout_milliseconds := 120000);
$cron$);

-- Nightly incremental refresh for all connected churches.
select cron.schedule('pco-fetch-nightly', '0 4 * * *', $cron$
  select net.http_post(
    url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/pco-fetch',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'health_cron_secret')),
    body := '{"mode":"incremental"}'::jsonb, timeout_milliseconds := 120000);
$cron$);
