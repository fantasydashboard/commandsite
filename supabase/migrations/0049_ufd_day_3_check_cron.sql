-- CommandSite · UFD Day-3 stuck-check cron
-- ---------------------------------------------------------------------------
-- Every 30 min, scan trial users 2-4 days post-signup and send the
-- universal stuck-check email if they haven't received it yet.

select cron.schedule(
  'ufd-day-3-check-auto-send-30min',
  '*/30 * * * *',
  $$ select net.http_get('https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/ufd-day-3-check-auto-send') $$
);
