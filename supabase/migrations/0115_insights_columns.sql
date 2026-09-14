-- Three columns, so the Insights page can compute nightly instead of being
-- pasted in from a laptop.
--
-- Four panels on Insights are still snapshots: Getting Connected, Discipleship
-- Pathway, First-time visitors and Growth Groups carry a Sep 11 date, Body
-- Health and Age Profile a Jul 12 one. Everything they need is already synced
-- except these three fields.
--
--   birthdate    Age Profile bands the committed core by age. pco_people
--                stores membership but not birthdate, so the whole panel had
--                to come from a manual pull.
--   group_type   Growth Groups breaks down by Planning Center's own group
--                types. The members table carries the group NAME but not its
--                type, so the rows could not be rebuilt.
--   role         "Group leaders" counts people leading an active group. That
--                number has been coming from a People list last refreshed in
--                August 2024.
--
-- All nullable, all additive. Existing rows read as unknown until their
-- resource next runs, and 0116 restarts those two backfills.

alter table public.pco_people
  add column if not exists birthdate date;

alter table public.pco_group_members
  add column if not exists group_type text,
  add column if not exists role text;

create index if not exists pco_group_members_client_type_idx
  on public.pco_group_members (client_id, group_type);
