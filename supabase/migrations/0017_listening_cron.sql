-- Schedule social-listening-poll hourly via pg_cron + pg_net.
-- Mirrors the email-sequence-runner schedule pattern from migration 0010.
--
-- The function is deployed with --no-verify-jwt and the GET path is public
-- (no auth headers required from pg_net).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'social-listening-poll-hourly') then
    perform cron.unschedule('social-listening-poll-hourly');
  end if;
end $$;

select cron.schedule(
  'social-listening-poll-hourly',
  '15 * * * *',  -- every hour at :15 UTC (offset from email runner at :00)
  $$ select net.http_get('https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/social-listening-poll') $$
);
