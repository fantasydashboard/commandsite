-- CommandSite · UFD welcome auto-send cron
-- ---------------------------------------------------------------------------
-- Fire ufd-welcome-auto-send every 5 minutes. Each tick is a no-op
-- when there are no new signups to welcome (cheap select on ufd-users
-- + dedup against ufd_welcome_log). Fast enough that a brand-new
-- trial signup gets the founder email within 5 minutes of signing up.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ufd-welcome-auto-send-5min') then
    perform cron.unschedule('ufd-welcome-auto-send-5min');
  end if;
end $$;

select cron.schedule(
  'ufd-welcome-auto-send-5min',
  '*/5 * * * *',
  $$ select net.http_get('https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/ufd-welcome-auto-send') $$
);
