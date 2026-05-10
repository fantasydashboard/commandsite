-- CommandSite · discovery-call infrastructure on cs_deals
-- ---------------------------------------------------------------------------
-- When a prospect books a discovery call via Calendly, our webhook
-- creates a cs_deals row with these new fields populated. Pre-call
-- briefs + post-call follow-ups are then drafted by Ada and stored
-- inline so the Demos view can render them without re-fetching from
-- the LLM every time.

alter table public.cs_deals
  -- Link back to the lead that became this deal (if applicable —
  -- direct inbound bookings without a prior cold-email cycle would
  -- have no lead_id)
  add column if not exists lead_id                       uuid references public.cs_leads(id) on delete set null,

  -- Calendly metadata (from the webhook payload)
  add column if not exists calendly_event_id             text,
  add column if not exists calendly_event_uri            text,
  add column if not exists calendly_invitee_uri          text,
  add column if not exists scheduled_at                  timestamptz,
  add column if not exists scheduled_call_duration_min   integer,

  -- Pre-call brief (Ada's pre-call doc)
  add column if not exists discovery_brief               text,
  add column if not exists discovery_brief_generated_at  timestamptz,
  add column if not exists discovery_demo_url            text,

  -- Post-call notes (Josh's quick form fields after the call)
  add column if not exists post_call_notes               jsonb,
  add column if not exists post_call_followup_draft      text,
  add column if not exists post_call_followup_drafted_at timestamptz,
  add column if not exists post_call_followup_sent_at    timestamptz;

-- Indexes for the Demos view
create index if not exists cs_deals_scheduled_at_idx on public.cs_deals (scheduled_at desc)
  where scheduled_at is not null;
create index if not exists cs_deals_calendly_event_idx on public.cs_deals (calendly_event_id)
  where calendly_event_id is not null;
create index if not exists cs_deals_lead_id_idx on public.cs_deals (lead_id)
  where lead_id is not null;
