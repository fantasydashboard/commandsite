-- CommandSite · UFD inbox poll cron
-- ---------------------------------------------------------------------------
-- Poll the UFD support inbox (support@ultimatefantasydashboard.com)
-- every 10 minutes. Replies to lifecycle emails land in ufd_replies
-- and Bones drafts a response. Josh approves via the UFD Reply
-- Approval Queue on UFD Today.

select cron.schedule(
  'ufd-inbox-poll-10min',
  '*/10 * * * *',
  $$ select net.http_get('https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/ufd-inbox-poll') $$
);
