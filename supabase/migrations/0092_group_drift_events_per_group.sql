-- Raise the group-drift event cap from the initial 12 to 45, based on the live
-- validation gate against Focal Point. Caching only the 12 most recent events per
-- group undercounted drift badly: group drift needs "attended 5+ times this
-- season," and 12 events left almost no one clearing that bar (flagged 10 vs a
-- baked ~169). 45 covers a full weekly program-year season. After this, the live
-- flagged count landed near the baked snapshot (120 over 48 in-season groups).
-- Follow-up (deferred): roll the groupDrift season window to the current program
-- year so groups that moved into the new season are captured too.
update public.clients
set pco_config = jsonb_set(pco_config, '{groupDrift,eventsPerGroup}', '45')
where slug = 'focal-point-church';
