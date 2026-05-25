-- CommandSite · Full outreach-automation schedules
-- ---------------------------------------------------------------------------
-- Three pg_cron jobs that together let Ada run lead pulls + drafting + sends
-- without anyone opening the dashboard:
--
--   1. lead-sourcing-cron-daily       — once per weekday morning, pulls 25
--                                        new leads from Google Maps per
--                                        active campaign
--   2. draft-cold-email-hourly        — every hour on the :05, drafts cold
--                                        emails for any newly-enriched leads
--   3. auto-outreach-send-15min       — every 15 minutes, sends ready
--                                        drafts (follow-ups first, reserve
--                                        gate applied). No-op when auto-
--                                        approve is off or Gmail is not
--                                        connected.
--
-- The existing draft-followups-30min cron from migration 0061 stays as-is
-- (still runs every 30 min from its own schedule).
--
-- AUTH: all three jobs use the shared X-Cron-Secret value already stored in
--       vault as `followup_cron_secret`. No new secret is required — the
--       edge functions accept FOLLOWUP_CRON_SECRET as a fallback name.
--
-- Note on timezone: pg_cron schedules run in UTC. 14:00 UTC = 9:00 AM
-- America/New_York during EDT (Mar–Nov) and 10:00 AM during EST
-- (Nov–Mar). One hour of seasonal drift is acceptable for daily lead
-- sourcing; tighten to two jobs (one for each half of the year) if it
-- becomes a problem.
--
-- Manual ops:
--   select cron.unschedule('<jobname>');
--   select * from cron.job_run_details where jobname = '<jobname>'
--     order by start_time desc limit 20;
--   select jobname, schedule, active from cron.job order by jobname;

create extension if not exists pg_cron       with schema extensions;
create extension if not exists pg_net        with schema extensions;
create extension if not exists supabase_vault with schema vault;


-- ── Idempotent install: drop the jobs first if they already exist ─────

do $$
declare
  j text;
begin
  foreach j in array array[
    'lead-sourcing-cron-daily',
    'draft-cold-email-hourly',
    'auto-outreach-send-15min'
  ]
  loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;


-- ── 1. Lead sourcing — daily at 14:00 UTC (~9am ET) on weekdays ──────

select cron.schedule(
  'lead-sourcing-cron-daily',
  '0 14 * * 1-5',  -- 14:00 UTC, Mon–Fri
  $cron$
  select net.http_post(
    url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/lead-sourcing-cron',
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


-- ── 2. Cold-email drafting — every hour at :05 ───────────────────────
-- Offset 5 min after the hour so it never collides with the lead-sourcing
-- run at :00 — the drafter wants the new leads to already be inserted.

select cron.schedule(
  'draft-cold-email-hourly',
  '5 * * * *',  -- :05 of every hour
  $cron$
  select net.http_post(
    url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/draft-cold-email',
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


-- ── 3. Auto-signoff — every 15 minutes ───────────────────────────────
-- Fires sends for any drafts in ready_for_review. The function itself
-- gates on cs_settings.outreach_auto_approve (no-ops if off), so this
-- schedule is safe to leave running even when Josh wants to manually
-- review every draft. Flipping the toggle is the on/off switch.

select cron.schedule(
  'auto-outreach-send-15min',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/auto-outreach-send',
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
