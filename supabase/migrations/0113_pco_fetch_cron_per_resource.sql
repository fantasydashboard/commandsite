-- One nightly job per resource, instead of one job that walks all seven.
--
-- THE BUG THIS FIXES
-- pco-fetch walked households, schedule, roster, groups, kids, guests, people
-- in a single invocation, each with a 90 second budget. That is up to ~565
-- seconds of requested work inside one invocation the platform kills long
-- before it gets there, so the tail of the list simply did not run. It has
-- surfaced three times, each diagnosed at the time as a different bug:
--
--   households ran first with a full budget and starved everything behind it
--   roster ran seventh and read six hours older than the page showing it
--   guests ran sixth, so Front Desk never recomputed no matter how many times
--     anyone pressed Refresh
--
-- Each was fixed by reordering, or by scoping one page's button, which moves
-- the starvation rather than removing it. With seven resources and room for
-- three or four, the next thing to fall off the end is whichever page nobody
-- is looking at that week.
--
-- One job per resource means one wall clock per resource. Ten minutes apart
-- against a 90 second cap is deliberate headroom: the church can grow a long
-- way before anything collides.
--
-- ORDER IS NOT COSMETIC. Two dependencies have to hold:
--   roster reads the serving assignments that `schedule` stages, so it runs
--     after schedule
--   people (duplicate detection) defers itself until schedule's backfill is
--     complete, so it runs last
--
-- The every-two-minutes backfill job is deliberately left alone. It also walks
-- all seven, but it fires 720 times a day and every resource resumes from its
-- cursor, so it always gets there in the end. That is precisely why new
-- churches finish their initial pull while the nightly incremental lost its
-- tail: seven hundred passes versus one.
--
-- APPLY AFTER THE FUNCTION DEPLOYS. `resources` on the cron path only exists in
-- the new function; an older one ignores it and each of these seven jobs would
-- walk all seven resources.

select cron.unschedule('pco-fetch-nightly')
where exists (select 1 from cron.job where jobname = 'pco-fetch-nightly');

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('households', '0 4 * * *'),
      ('schedule',   '10 4 * * *'),
      ('roster',     '20 4 * * *'),   -- needs schedule's staged assignments
      ('groups',     '30 4 * * *'),
      ('kids',       '40 4 * * *'),
      ('guests',     '50 4 * * *'),
      ('people',     '0 5 * * *')     -- waits on schedule being complete
    ) as t(resource, sched)
  loop
    perform cron.schedule(
      'pco-fetch-nightly-' || r.resource,
      r.sched,
      format(
        $cron$
        select net.http_post(
          url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/pco-fetch',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'health_cron_secret')),
          body := '{"mode":"incremental","resources":["%s"]}'::jsonb,
          timeout_milliseconds := 120000);
        $cron$, r.resource)
    );
  end loop;
end $$;
