-- CommandSite · Auto-draft cron
-- ---------------------------------------------------------------------------
-- Schedule outreach-auto-draft every 5 minutes via pg_cron + pg_net.
-- This is the off-page backbone of the chain: when Josh isn't watching
-- the Outreach page, the chain still runs and the Approval Queue is
-- populated for whenever he comes back.
--
-- Manual ops:
--   select cron.unschedule('outreach-auto-draft-5min');
--   select * from cron.job_run_details where jobname = 'outreach-auto-draft-5min' order by start_time desc limit 20;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Idempotent install
do $$
begin
  if exists (select 1 from cron.job where jobname = 'outreach-auto-draft-5min') then
    perform cron.unschedule('outreach-auto-draft-5min');
  end if;
end $$;

select cron.schedule(
  'outreach-auto-draft-5min',
  '*/5 * * * *',  -- every 5 minutes
  $$ select net.http_get('https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/outreach-auto-draft') $$
);
