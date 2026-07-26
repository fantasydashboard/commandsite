-- Add fetch/chunking config, merged into the existing pco_config for the live church.
update public.clients
set pco_config = pco_config
  || jsonb_build_object('fetch', jsonb_build_object('timeBudgetSeconds', 90, 'incrementalWindowDays', 21))
  || jsonb_build_object('groupDrift', (coalesce(pco_config->'groupDrift','{}'::jsonb) || jsonb_build_object('eventsPerGroup', 12)))
where slug = 'focal-point-church';
