-- Schedule the email-sequence-runner Edge Function to fire hourly via
-- pg_cron + pg_net. Mirrors UFD's existing Vercel cron schedule (hourly).
--
-- The function is deployed with --no-verify-jwt and the GET path is
-- intentionally public (no auth headers required). pg_net dispatches the
-- HTTP call asynchronously — this just enqueues the request.
--
-- To remove the schedule manually:
--   select cron.unschedule('email-sequence-runner-hourly');
-- To inspect runs:
--   select * from cron.job_run_details order by start_time desc limit 20;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Idempotent install: if a job with this name already exists from a
-- prior run, drop it first so we get the latest URL/schedule.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'email-sequence-runner-hourly') then
    perform cron.unschedule('email-sequence-runner-hourly');
  end if;
end $$;

select cron.schedule(
  'email-sequence-runner-hourly',
  '0 * * * *',  -- every hour at :00 UTC
  $$ select net.http_get('https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/email-sequence-runner') $$
);
