-- Turn the Insights page on: config, a nightly job, and two backfills.
--
-- APPLY AFTER THE FUNCTION DEPLOYS. `insights` is not a resource the deployed
-- function knows about yet, so the cron job below would be a no-op at best.

-- ── config ────────────────────────────────────────────────────────────────
-- Meet the Pastor is matched by NAME, not id. Focal Point dates the workflow
-- title ("Meet the Pastor 7/21/26"), so a new one appears each time they run
-- the event; a hardcoded id would silently stop counting the moment they did.
-- The other two are stable workflows and are named by id.
update public.clients
set pco_config = pco_config || jsonb_build_object('insights', jsonb_build_object(
  'metPastorMatch',    'meet the pastor',
  'newMemberClassId',  '169808',
  'baptismClassId',    '169782'
))
where slug = 'focal-point-church';

-- First-time visitors charts Starting Point cards by year, but card retention
-- was 24 months, so 2024 would have been a partial year rendered as a whole
-- one. The entire Starting Point history is about 2,500 cards, so keeping all
-- of it costs nothing and the by-year chart becomes true.
update public.clients
set pco_config = jsonb_set(pco_config, '{guests,windowMonths}', '120'::jsonb)
where slug = 'focal-point-church'
  and pco_config -> 'guests' is not null;

-- ── backfills for the new columns (0115) ──────────────────────────────────
-- guests: re-pull under the wider window so the by-year chart has real history.
-- people: the people resource has NO incremental work by design (a weekly
--   rescan cron resets it), so birthdate would stay null until that fired.
-- groups is deliberately absent: its incremental pass re-upserts every
--   membership row, so group_type and role populate on the next nightly run.
update public.pco_sync_state
set phase = 'backfill', backfill_complete = false, cursor = '{}'::jsonb,
    updated_at = now(), error = null
where resource in ('guests', 'people')
  and client_id in (select id from public.clients where slug = 'focal-point-church');

-- ── nightly job ───────────────────────────────────────────────────────────
-- Last in the sequence, at 5:10, because it reads what every other resource
-- stages. It also guards itself: if groups, guests or people have not finished
-- their backfill it defers rather than computing a page from half-filled
-- tables.
select cron.schedule(
  'pco-fetch-nightly-insights',
  '10 5 * * *',
  $cron$
  select net.http_post(
    url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/pco-fetch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'health_cron_secret')),
    body := '{"mode":"incremental","resources":["insights"]}'::jsonb,
    timeout_milliseconds := 120000);
  $cron$
);
