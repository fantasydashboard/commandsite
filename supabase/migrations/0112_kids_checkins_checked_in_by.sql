-- Store WHO checked the child in, so "Who to ask" can stop being a snapshot.
--
-- Who to ask ranks people by the two signals that predict a yes: in a Growth
-- Group, and dropping kids off. The second needs the ADULT, and
-- pco_kids_checkins stores only the child, which is why that list has run as a
-- pair of hand-executed scripts since it was built. It was last pulled Aug 27,
-- it goes stale silently, and because the local script never applied the
-- church's staff list it was putting staff in front of the church as people to
-- ask.
--
-- Planning Center gives the adult on every check-in as `checked_in_by`, a real
-- person record. One column and one include, and the whole list computes from
-- tables the nightly sync already fills.
--
-- Nullable on purpose: self check-in and kiosk rows legitimately have no adult,
-- and every row already stored has none. A row without it is simply not a
-- drop-off signal.
--
-- SAFE TO APPLY BEFORE THE FUNCTION DEPLOYS. Adding a column nothing writes yet
-- is inert. The reverse is not true, which is why the cursor reset that
-- backfills this column lives in its own migration, to be applied after.

alter table public.pco_kids_checkins
  add column if not exists checked_in_by text;

create index if not exists pco_kids_checkins_client_by_idx
  on public.pco_kids_checkins (client_id, checked_in_by)
  where checked_in_by is not null;
