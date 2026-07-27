-- Step 1: Add the pco_config column to clients table
alter table public.clients add column if not exists pco_config jsonb not null default '{}'::jsonb;

-- Step 2: Seed Focal Point's config with staff names and service parameters
update public.clients
set pco_config = jsonb_build_object(
  'staffNames', '["Staci Daniel","Emily Bankole","Andrew Daniel","David Bunch","Anthony Velasquez","Kristen Wiggins","Christina Spoon","Vinny Costa","Cindy Salopek","FPC Developer","Ronaldo Almeida","Planning Center","Josh Daniel","Diana O''Dell","Kelly Sorensen","Alyssa Daniel","Receptionist Team","Fernanda Faleiros","Magdalis Bisson","Michel Moran-Claudio","Joanna Taylor","Aline Costa","Check In","Rachael Sclater","Nino Villanueva","Rob Serrano"]'::jsonb,
  'serving',    jsonb_build_object('regularMin', 4, 'gapWeeks', 6, 'lookbackMonths', 7),
  'burnout',    jsonb_build_object('seasonMonths', 6),
  'groupDrift', jsonb_build_object(
     'seasonStart', '2025-09-01', 'seasonEnd', '2026-05-31',
     'minEvents', 4, 'minAttendance', 5, 'minGapWeeks', 3, 'groupTypeMatch', 'growth group')
)
where slug = 'focal-point-church';
