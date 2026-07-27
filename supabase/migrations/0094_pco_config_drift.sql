update public.clients
set pco_config = pco_config || jsonb_build_object('drift', jsonb_build_object(
  'kidsEventMatch', 'kids',
  'windowMonths', 10,
  'sundaysMissed', 3,
  'minEstablishedSundays', 8
))
where slug = 'focal-point-church';
