-- CommandSite-as-a-business · inbound reply log (cs_replies)
-- ---------------------------------------------------------------------------
-- Every reply Smartlead pushes via webhook lands here. Each row is
-- classified by Claude (positive / objection / interested / oof /
-- unsubscribe / negative) with a confidence score 0-1.
--
-- If confidence >= cs_settings.reply_classifier_auto_threshold AND
-- the classification is auto-handleable (oof, unsubscribe, clear
-- negative), the function flips auto_handled = true and records the
-- action it took. Anything else surfaces in the Outreach inbox.
--
-- Phase 4 of "make CommandSite-for-CommandSite real."

create table public.cs_replies (
  id                          uuid primary key default gen_random_uuid(),

  -- ── Lineage
  -- Reply is matched to lead by email. Both can be null if we
  -- received a reply from someone we don't have on file (rare).
  lead_id                     uuid references public.cs_leads(id) on delete set null,
  deal_id                     uuid references public.cs_deals(id) on delete set null,

  -- ── Smartlead identifiers (raw — for cross-referencing in their UI)
  smartlead_campaign_id       text,
  smartlead_sequence_id       text,
  smartlead_message_id        text,
  smartlead_thread_id         text,

  -- ── Reply content
  from_email                  text not null,
  from_name                   text,
  subject                     text,
  body                        text not null,
  received_at                 timestamptz not null default now(),

  -- ── Classification
  classification              text check (classification in (
    'positive',        -- "interested, send more info / book a call"
    'objection',       -- "too expensive / not a priority / wrong time" — winnable
    'interested',      -- "tell me more" — softer than positive
    'oof',             -- out of office auto-reply
    'unsubscribe',     -- "remove me / stop emailing"
    'negative',        -- "not interested / no thanks / wrong person"
    'unclassified'     -- claude failed or hasn't run yet
  )),
  classification_confidence   real check (classification_confidence between 0 and 1),
  classification_reason       text,
  classification_model        text default 'claude-opus-4-7',
  classified_at               timestamptz,

  -- ── Auto-handling
  -- True when confidence cleared the threshold AND the action was
  -- auto-takeable. Always paired with auto_handled_action telling
  -- you what we did so you can audit + reverse.
  auto_handled                boolean not null default false,
  auto_handled_action         text,  -- e.g. "marked unsubscribed in suppression list"
  auto_handled_at             timestamptz,

  -- ── Manual handling
  needs_review                boolean not null default true,
  reviewed_by                 uuid,  -- references auth.users
  reviewed_at                 timestamptz,

  -- ── Raw payload (debug / audit)
  raw_payload                 jsonb,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Indexes for the inbox queries the Outreach module hits
create index cs_replies_received_at_idx     on public.cs_replies (received_at desc);
create index cs_replies_classification_idx  on public.cs_replies (classification);
create index cs_replies_needs_review_idx    on public.cs_replies (needs_review) where needs_review = true;
create index cs_replies_lead_id_idx         on public.cs_replies (lead_id);
create index cs_replies_deal_id_idx         on public.cs_replies (deal_id);
create index cs_replies_smartlead_msg_idx   on public.cs_replies (smartlead_message_id);

-- updated_at trigger
create or replace function public.cs_replies_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cs_replies_updated_at
  before update on public.cs_replies
  for each row
  execute function public.cs_replies_set_updated_at();

-- RLS: admin only
alter table public.cs_replies enable row level security;

create policy "admins manage cs_replies"
  on public.cs_replies for all
  using (public.is_admin())
  with check (public.is_admin());

-- Edge function (Service Role) bypasses RLS — no policy needed for it.
