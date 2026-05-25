-- CommandSite · Follow-up reserve + touch_number tracking
-- ---------------------------------------------------------------------------
-- Two coordinated additions for the "follow-ups get cap priority" mechanic:
--
-- 1. followup_reserve_pct (JSONB key on outreach_send_window).
--    Reserves N% of max_per_day for Touch 2/3. With reserve_pct=60 +
--    max_per_day=50, cold T1 sends cap at 20/day; follow-ups can use any of
--    the remaining 30 (or the whole 50 if T1 is quiet). Stops a heavy
--    cold-outreach day from starving the follow-up cadence.
--
-- 2. touch_number column on cs_outreach_sends.
--    Stamps each send with which touch it represented (1=cold, 2=first
--    follow-up, 3=breakup). The reserve gate needs to count cold sends
--    separately from follow-ups to decide whether the T1 budget is full.
--    Historical rows backfill to 1.
--
-- A new RPC, cs_outreach_sends_today_split, returns today's count broken
-- down by touch so gmail-send can apply the reserve in one query.
--
-- Idempotent — safe to re-apply.


-- ── 1. followup_reserve_pct default on outreach_send_window ───────────

alter table public.cs_settings
  alter column outreach_send_window set default jsonb_build_object(
    'tz_strategy',          'recipient_local',
    'weekday_hours',        jsonb_build_object('start', 9, 'end', 16),
    'allowed_days',         array['mon','tue','wed','thu','fri']::text[],
    'blocked_dates',        array[]::text[],
    'max_per_day',          50,
    'jitter_minutes',       90,
    'followup_reserve_pct', 60
  );

-- Patch existing row(s) so the key exists without overwriting customizations.
update public.cs_settings
  set outreach_send_window = outreach_send_window || jsonb_build_object('followup_reserve_pct', 60)
  where (outreach_send_window ? 'followup_reserve_pct') = false;


-- ── 2. touch_number on cs_outreach_sends ──────────────────────────────

alter table public.cs_outreach_sends
  add column if not exists touch_number smallint;

comment on column public.cs_outreach_sends.touch_number is
  'Which touch in the sequence this send was: 1=cold (T1), 2=first follow-up, 3=breakup. Set at insert by gmail-send + the followup cron. The reserve gate in gmail-send uses this to count cold vs follow-up sends separately so T1 volume cannot squeeze out follow-ups when the cap is tight.';

-- Backfill historical rows: assume touch 1. Wrong for the small number of
-- pre-migration follow-ups but the cost is just a stale historical count;
-- the live gate operates on today's rows only.
update public.cs_outreach_sends
  set touch_number = 1
  where touch_number is null;

-- Partial index — the hot query is "count touch=1 sends sent today".
create index if not exists cs_outreach_sends_touch_today_idx
  on public.cs_outreach_sends (sent_at, touch_number);


-- ── 3. Split-by-touch count helper ────────────────────────────────────

create or replace function public.cs_outreach_sends_today_split(
  p_tz text default 'America/New_York'
)
returns table (
  total integer,
  cold_t1 integer,
  followup integer
)
language sql
stable
as $$
  select
    count(*)::integer                                                    as total,
    count(*) filter (where coalesce(touch_number, 1) = 1)::integer       as cold_t1,
    count(*) filter (where coalesce(touch_number, 1) > 1)::integer       as followup
  from public.cs_outreach_sends
  where (sent_at at time zone p_tz)::date = (now() at time zone p_tz)::date
$$;

comment on function public.cs_outreach_sends_today_split is
  'Returns today''s send count split into cold (touch_number=1) vs follow-up (touch_number>1). Used by gmail-send to enforce the followup_reserve_pct budget split and by the SendWindowChip to display the breakdown.';
