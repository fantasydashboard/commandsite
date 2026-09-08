-- Household membership, so family drift groups by HOUSEHOLD instead of surname.
--
-- THE BUG THIS FIXES
-- familyDrift grouped children by their last-name string:
--     const surname = (r.last ?? '').trim()
--     byFam[surname] ??= ...
-- Planning Center knows households; we were throwing that away and re-deriving
-- family identity from a text field. Two failures, both live on Focal Point:
--
--   SPLIT  "The Farmer family" (Layla) and "The Farmer jr family" (Marcus jr)
--          rendered as two flagged families, both 21 Sundays, both last seen
--          Aug 9. Planning Center has ONE Farmer Household containing Dana,
--          Layla and Marcus. Same for "Merino" and "Merino III", which sat in
--          the escalated call list twice with identical stats. The pastor calls
--          one household twice, and because the Sundays are split across two
--          rows, tenure is understated and the ranking is wrong.
--
--   MERGE  Two unrelated households sharing a surname become one family, and
--          the drafted note then names another family's child. This is the
--          worse direction and it is structurally possible today.
--
-- Kept as its own staging table rather than a column on pco_kids_checkins so
-- the household map can refresh independently of the check-in backfill: the
-- People and Check-Ins APIs are different resources with different windows, and
-- re-pulling two years of check-ins to attach a household id would be absurd.
--
-- A person can belong to several households in PCO. We store one, the first the
-- API returns, because family drift only needs a stable grouping key and a
-- child in two households is rare enough to not be worth the ambiguity.
create table if not exists public.pco_households (
  client_id      uuid not null references public.clients(id) on delete cascade,
  person_id      text not null,
  household_id   text not null,
  household_name text not null,
  primary key (client_id, person_id)
);

create index if not exists pco_households_client_hh_idx
  on public.pco_households (client_id, household_id);

alter table public.pco_households enable row level security;

create policy "admins read households" on public.pco_households
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

comment on table public.pco_households is
  'Planning Center household membership, person_id -> household. Lets family drift group by household instead of by surname string, which split "Farmer" from "Farmer jr" and would merge two unrelated families sharing a name.';
