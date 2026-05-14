-- CommandSite · Discovery brief auto-gen cron
-- ---------------------------------------------------------------------------
-- Hourly poll for upcoming demos that need a brief. Generates one
-- ~24h ahead so Josh always has prep ready when he sits down for it.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'discovery-brief-auto-gen-hourly') then
    perform cron.unschedule('discovery-brief-auto-gen-hourly');
  end if;
end $$;

select cron.schedule(
  'discovery-brief-auto-gen-hourly',
  '5 * * * *',  -- :05 every hour (offset from other crons)
  $$ select net.http_get('https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/discovery-brief-auto-gen') $$
);
