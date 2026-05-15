-- CommandSite · Follow-up draft cron (pg_cron)
-- ---------------------------------------------------------------------------
-- Schedules draft-followup-emails every 30 minutes via pg_cron. Replaces the
-- once-a-day Vercel cron (still wired in vercel.json as a safety net) so
-- leads that age into the Touch 2 / Touch 3 window get drafted within 30
-- minutes instead of having to wait up to 24 hours for the daily run.
--
-- The Vercel-style auth header (X-Cron-Secret) is read from Supabase Vault
-- so we don't commit the secret to git. ONE-TIME SETUP — run this in the
-- Supabase SQL editor before applying the migration:
--
--   SELECT vault.create_secret(
--     '<paste-your-FOLLOWUP_CRON_SECRET-value-here>',
--     'followup_cron_secret'
--   );
--
-- After that, the migration is fully self-installing and re-runnable.
--
-- Manual ops:
--   select cron.unschedule('draft-followups-30min');
--   select * from cron.job_run_details where jobname = 'draft-followups-30min'
--     order by start_time desc limit 20;

create extension if not exists pg_cron       with schema extensions;
create extension if not exists pg_net        with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Idempotent install
do $$
begin
  if exists (select 1 from cron.job where jobname = 'draft-followups-30min') then
    perform cron.unschedule('draft-followups-30min');
  end if;
end $$;

select cron.schedule(
  'draft-followups-30min',
  '*/30 * * * *',  -- every 30 minutes
  $cron$
  select net.http_post(
    url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/draft-followup-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'followup_cron_secret'
      )
    ),
    body := '{}'::jsonb
  )
  $cron$
);
