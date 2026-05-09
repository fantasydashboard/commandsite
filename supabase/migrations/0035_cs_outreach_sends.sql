-- CommandSite-as-a-business · outreach send event log (cs_outreach_sends)
-- ---------------------------------------------------------------------------
-- One row per email actually sent to a lead. Audit trail for what went
-- out + when + via what channel. Lets us show a real "Sent" view on
-- the Outreach page without losing history when a draft gets edited.
--
-- For Phase 1 (manual paste-to-Gmail flow), Josh hits "Mark sent" in
-- the UI which inserts a row here AND updates the cached aggregates
-- on cs_leads. For Phase 3 (Smartlead automation), the smartlead-reply
-- webhook will also write rows here for outbound sends.
--
-- We DON'T move the draft itself out of cs_leads — keeps the drafter
-- ↔ outreach round-trip cheap.

create table public.cs_outreach_sends (
  id                       uuid primary key default gen_random_uuid(),
  lead_id                  uuid not null references public.cs_leads(id) on delete cascade,

  -- What went out
  subject                  text,
  body                     text,
  channel                  text not null default 'email' check (channel in ('email', 'linkedin', 'sms', 'phone')),

  -- How it went out
  source                   text not null default 'manual_gmail' check (source in (
    'manual_gmail',           -- Josh copy-pasted into Gmail
    'manual_other',           -- another manual mail client
    'smartlead',              -- Smartlead campaign
    'smartlead_reply',        -- reply to a prior touch via Smartlead
    'apollo',                 -- Apollo sequence
    'instantly',              -- Instantly sequence
    'other'
  )),
  sent_via_email_address   text,                   -- which inbox the send went FROM
  external_message_id      text,                   -- tracking ID from Smartlead/Apollo if available

  -- Sequence context (mostly null for Phase 1, populated when sequences land)
  sequence_step_number     integer,                -- 1 = first cold, 2 = follow-up, etc.
  sequence_id              uuid,                   -- future cs_sequences FK

  -- Provenance
  sent_at                  timestamptz not null default now(),
  sent_by                  uuid references auth.users(id),

  created_at               timestamptz not null default now()
);

create index cs_outreach_sends_lead_id_idx
  on public.cs_outreach_sends (lead_id, sent_at desc);
create index cs_outreach_sends_sent_at_idx
  on public.cs_outreach_sends (sent_at desc);

alter table public.cs_outreach_sends enable row level security;

create policy "admins read sends"
  on public.cs_outreach_sends for select
  using (public.is_admin());

create policy "admins manage sends"
  on public.cs_outreach_sends for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── cs_leads aggregates: cached counters for fast lookups
-- ---------------------------------------------------------------------------
-- contacted_at         — first time we sent ANY message to this lead
-- last_contacted_at    — most recent send
-- send_count           — total number of sends across all sequences/touches
--
-- These are cached so the Ready-to-Send view doesn't have to re-aggregate
-- cs_outreach_sends on every render. Maintained by the trigger below.

alter table public.cs_leads
  add column if not exists contacted_at        timestamptz,
  add column if not exists last_contacted_at   timestamptz,
  add column if not exists send_count          integer not null default 0;

-- Trigger: on insert into cs_outreach_sends, bump the lead's aggregates
-- + flip status to 'contacted' if it was still 'new' or 'queued'.
create or replace function public.cs_outreach_sends_update_lead()
returns trigger
language plpgsql
as $$
begin
  update public.cs_leads
  set
    contacted_at = coalesce(contacted_at, new.sent_at),
    last_contacted_at = new.sent_at,
    send_count = send_count + 1,
    -- Flip status to 'contacted' on first send if it was new or queued.
    -- Don't touch status if it's already further along (replied, etc.)
    status = case
      when status in ('new', 'queued') then 'contacted'
      else status
    end
  where id = new.lead_id;
  return new;
end;
$$;

create trigger cs_outreach_sends_after_insert
  after insert on public.cs_outreach_sends
  for each row
  execute function public.cs_outreach_sends_update_lead();
