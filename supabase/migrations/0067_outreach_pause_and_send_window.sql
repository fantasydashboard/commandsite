-- CommandSite · Outreach pause + send-window constraints
-- ---------------------------------------------------------------------------
-- Two related capabilities, one migration:
--
-- 1. STOP-ON-RESPONSE. Adds `outreach_paused` to cs_leads. When a reply lands
--    (cs_replies insert), a trigger auto-flips the linked lead to
--    outreach_paused=true so the followup + auto-draft crons stop sending.
--    Owner handles the reply personally; sequence resumes only if the owner
--    explicitly unflags the lead.
--
-- 2. SEND-WINDOW + DAILY CAP. Adds `outreach_send_window` JSONB to cs_settings
--    so every client can configure (a) recipient-local send hours,
--    (b) allowed weekdays, (c) blocked dates (holidays), (d) a hard
--    daily-send cap, (e) jitter to spread sends within the hour.
--
-- The cron functions (draft-followup-emails, gmail-send) read these on every
-- run and skip work that falls outside the window or breaches the cap. Cadence
-- becomes "wait at least N days AND fire on the next allowed send slot."
--
-- Idempotent — safe to re-apply.

-- ── 1. outreach_paused on cs_leads ────────────────────────────────────

alter table public.cs_leads
  add column if not exists outreach_paused boolean not null default false;

alter table public.cs_leads
  add column if not exists outreach_paused_reason text;

alter table public.cs_leads
  add column if not exists outreach_paused_at timestamptz;

create index if not exists cs_leads_outreach_paused_idx
  on public.cs_leads (outreach_paused)
  where outreach_paused = false;  -- partial: only un-paused rows; the cron's hot path

comment on column public.cs_leads.outreach_paused is
  'When true, auto-draft + followup crons skip this lead. Set automatically by the cs_replies_pause_lead trigger when an inbound reply lands.';

comment on column public.cs_leads.outreach_paused_reason is
  'Free-text: why outreach is paused. Set by the trigger to "Reply received" or by the operator to a custom note (e.g., "Bad timing, retry Q3").';

comment on column public.cs_leads.outreach_paused_at is
  'When the pause was set. Lets the operator see "paused 2d ago" in the lead detail.';

-- Backfill: any lead already in status='replied' should be paused. The trigger
-- handles new replies going forward; this catches the historical ones.
update public.cs_leads
  set outreach_paused = true,
      outreach_paused_reason = 'Reply received',
      outreach_paused_at = updated_at
  where status = 'replied'
    and outreach_paused = false;


-- ── 2. Auto-pause trigger on cs_replies insert ────────────────────────

create or replace function public.cs_leads_pause_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is not null then
    update public.cs_leads
      set outreach_paused = true,
          outreach_paused_reason = coalesce(outreach_paused_reason, 'Reply received'),
          outreach_paused_at = coalesce(outreach_paused_at, now())
      where id = new.lead_id
        and outreach_paused = false;
  end if;
  return new;
end;
$$;

drop trigger if exists cs_replies_pause_lead on public.cs_replies;
create trigger cs_replies_pause_lead
  after insert on public.cs_replies
  for each row
  execute function public.cs_leads_pause_on_reply();


-- ── 3. outreach_send_window on cs_settings ────────────────────────────

-- Default window picked for B2B SMB owners reachable Mon-Fri during work hours.
-- Each client can override on the Settings page.
alter table public.cs_settings
  add column if not exists outreach_send_window jsonb not null default jsonb_build_object(
    'tz_strategy',    'recipient_local',
    'weekday_hours',  jsonb_build_object('start', 9, 'end', 16),
    'allowed_days',   array['mon','tue','wed','thu','fri']::text[],
    'blocked_dates',  array[]::text[],
    'max_per_day',    50,
    'jitter_minutes', 90
  );

comment on column public.cs_settings.outreach_send_window is
  'Cadence + rate-limit constraints for outbound sends.
   Shape:
     tz_strategy: "recipient_local" | "sender_local" | "fixed_et"
     weekday_hours: { start: int (0-23), end: int (0-23) }
     allowed_days: array of "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"
     blocked_dates: array of ISO yyyy-mm-dd strings (holidays, blackouts)
     max_per_day: hard ceiling on cs_outreach_sends rows per client per day
     jitter_minutes: spread sends across this many minutes per cron tick
                     (avoids "everything fires at :00")
   The cron functions read this on every tick; changes apply immediately.';


-- ── 4. Daily-send-count helper (used by the cap check) ────────────────

-- Counts outbound sends on the current calendar day in the sender's wall-clock
-- time (defaults to America/New_York; override per call). cs_outreach_sends
-- is single-tenant today (no client_id) — when we add multi-tenant, this
-- becomes a per-client query.
create or replace function public.cs_outreach_sends_today_count(
  p_tz text default 'America/New_York'
)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.cs_outreach_sends os
  where (os.sent_at at time zone p_tz)::date = (now() at time zone p_tz)::date
$$;

comment on function public.cs_outreach_sends_today_count is
  'Returns the count of cs_outreach_sends rows on the current calendar day. Used by gmail-send to enforce outreach_send_window.max_per_day.';
