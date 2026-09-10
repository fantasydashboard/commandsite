-- Let the group-drift season run to today instead of ending last May.
--
-- seasonEnd was pinned to 2026-05-31 when the config was seeded, and 0092
-- already noted rolling it as a follow-up. It never happened, so when groups
-- came back for the fall the window still stopped at the end of the spring
-- program year and every meeting since was discarded before the transform saw
-- it: 101 group meetings between Aug 25 and Sep 9 alone.
--
-- Two consequences, both live on Focal Point:
--
--   RETURNERS STAYED FLAGGED  The transform drops anyone who attended one of
--   their group's last three meetings, which is exactly the "they came back"
--   test. With the window closed in May, the last three meetings were spring
--   meetings, so someone who walked back in last Tuesday was still on the list
--   and their group leader would have chased them.
--
--   THE WEEK COUNT WAS NOT WEEKS AGO  weeksSince is measured from the group's
--   last meeting IN THE WINDOW. Closed in May, "quiet 7w" meant seven weeks
--   before the last spring meeting, so around mid-April. A leader reads that as
--   last month. It was nearly five months.
--
-- Removing the key rather than setting a new date, because a date is what went
-- stale. Absent now means "the season is still running", so the window follows
-- the calendar and this cannot rot again next spring.
--
-- seasonStart stays at 2025-09-01 on purpose. Two weeks of fall attendance
-- cannot establish who was a regular; the previous program year can. So spring
-- decides who counts as a regular, and fall decides who has come back, which is
-- the actual question at a fall restart.
update public.clients
set pco_config = jsonb_set(
      pco_config,
      '{groupDrift}',
      (pco_config -> 'groupDrift') - 'seasonEnd'
    )
where slug = 'focal-point-church'
  and pco_config -> 'groupDrift' is not null;
