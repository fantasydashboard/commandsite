-- Widen the guest-card sync window from 5 months to 24.
--
-- pco_workflow_cards is bounded by pco_config.guests.windowMonths (see
-- fetchGuestCardsChunk). At 5 it held roughly 198 cards, which was fine for a
-- worklist but far too short for the monthly pulse: five points is not a trend,
-- and it can never show a same-month-last-year comparison, which is the only
-- honest way to read a church's numbers given how hard Easter, Christmas, the
-- summer dip and back-to-school swing the volume.
--
-- 24 months gives two full cycles. The cost is a one-off larger backfill; the
-- fetcher is already chunked and cursor-driven, so it pages rather than trying
-- to pull it in a single call.
update public.clients
set pco_config = jsonb_set(pco_config, '{guests,windowMonths}', '24'::jsonb)
where slug = 'focal-point-church'
  and pco_config -> 'guests' is not null;

-- Force a guests backfill so the widened window is actually pulled. Without
-- this the resource stays "backfill_complete" against the OLD cutoff and the
-- extra 19 months never arrive.
-- cursor is NOT NULL, so it resets to '{}' rather than null. Matches the
-- weekly people-rescan reset in 0099.
update public.pco_sync_state
set phase = 'backfill', backfill_complete = false, cursor = '{}'::jsonb, updated_at = now(), error = null
where resource = 'guests'
  and client_id in (select id from public.clients where slug = 'focal-point-church');
