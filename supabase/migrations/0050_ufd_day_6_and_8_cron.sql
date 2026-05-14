-- CommandSite · UFD Day-6 expiring + Day-8 winback crons
-- ---------------------------------------------------------------------------
-- Two more cron jobs in the lifecycle chain. Both fire every 30 min;
-- both are no-op when their windows are empty.

select cron.schedule(
  'ufd-day-6-expiring-auto-send-30min',
  '*/30 * * * *',
  $$ select net.http_get('https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/ufd-day-6-expiring-auto-send') $$
);

select cron.schedule(
  'ufd-day-8-winback-auto-send-30min',
  '*/30 * * * *',
  $$ select net.http_get('https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/ufd-day-8-winback-auto-send') $$
);
