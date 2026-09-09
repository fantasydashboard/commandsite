-- Record EVERY household a person belongs to, not one guess per person.
--
-- 0108 keyed on (client_id, person_id), so the fetcher had to choose a single
-- household while writing. That choice cannot be made correctly there: a
-- person's households can land on different API pages, each page upserts as it
-- goes, and the last page silently wins. Hayden Drouillard belongs to both
-- "Nicolas Household" and "Drouillard Household", and which one he ended up
-- with decided whether he was grouped with his brother.
--
-- Staging tables should hold facts. The choice belongs in the transform, where
-- the child's surname is available and the decision is deterministic and
-- testable: prefer the household named after them, fall back to any.
alter table public.pco_households
  drop constraint if exists pco_households_pkey;

alter table public.pco_households
  add constraint pco_households_pkey primary key (client_id, person_id, household_id);

comment on table public.pco_households is
  'Planning Center household membership, one row per person per household. A person may belong to several; computeDrift picks the one matching the child''s surname so siblings group together. Lets family drift group by household rather than by surname string.';
