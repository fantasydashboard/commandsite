update public.clients
set pco_config = pco_config || jsonb_build_object('guests', jsonb_build_object(
  'englishWorkflowId', '113763',
  'brazilianWorkflowId', '599785',
  'windowMonths', 5
))
where slug = 'focal-point-church';
