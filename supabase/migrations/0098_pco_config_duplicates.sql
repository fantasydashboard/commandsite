update public.clients
set pco_config = pco_config || jsonb_build_object('duplicates', jsonb_build_object(
  'keepTopClusters', 120,
  'minNameLen', 3
))
where slug = 'focal-point-church';
