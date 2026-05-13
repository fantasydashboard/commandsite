-- CommandSite · Gmail inbox poll cron
-- ---------------------------------------------------------------------------
-- Run gmail-inbox-poll every 10 minutes so replies + bounces flow into
-- cs_replies and cs_leads.bounced_at without anyone clicking.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'gmail-inbox-poll-10min') then
    perform cron.unschedule('gmail-inbox-poll-10min');
  end if;
end $$;

select cron.schedule(
  'gmail-inbox-poll-10min',
  '*/10 * * * *',
  $$ select net.http_get('https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/gmail-inbox-poll') $$
);
