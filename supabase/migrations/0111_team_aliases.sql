-- Vocals and Band are one team now: Worship.
--
-- Focal Point merged them recently. Planning Center keeps every historical
-- assignment under the name the team had at the time, so without a mapping the
-- merge reads as two teams that both went quiet, which is wrong twice over:
--
--   INFLATED SPREAD  computeBurnout flags anyone on two or more teams. A single
--   worship volunteer whose history straddles the rename counts as two, so
--   "serves on several teams" fires on people who serve on one.
--
--   FALSE DRIFT  everyone on the old Vocals team stopped being scheduled under
--   that name on the same weekend. dormantTeams() catches the whole team going
--   quiet at once, but only after the fact and only for the drift track.
--
-- Aliases are config rather than code so the next merge at the next church is a
-- row, not a deploy.
update public.clients
set pco_config = jsonb_set(
      pco_config,
      '{teamAliases}',
      '{"Vocals": "Worship", "Band": "Worship"}'::jsonb,
      true
    )
where slug = 'focal-point-church';
