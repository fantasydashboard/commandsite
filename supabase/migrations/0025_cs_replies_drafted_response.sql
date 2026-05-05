-- CommandSite Phase 5 — auto-promote + drafted Calendly intro
-- ---------------------------------------------------------------------------
-- When a Smartlead reply scores `positive` ≥ cs_settings.pipeline_promote_threshold,
-- the smartlead-reply edge function:
--   1. Creates a cs_deals row (stage = 'replied')
--   2. Promotes the matching cs_leads row (status = 'promoted_to_pipeline')
--   3. Drafts a Calendly intro reply via Claude in your brand voice
--   4. Stores that draft here for one-click approval
--
-- Why a separate column (vs reusing auto_handled_action): drafts are
-- 200-400 words of pastoral/sales prose, not a one-liner audit.

alter table public.cs_replies
  add column if not exists drafted_response text,
  add column if not exists drafted_at        timestamptz,
  add column if not exists draft_approved    boolean not null default false,
  add column if not exists draft_approved_at timestamptz,
  add column if not exists draft_sent_at     timestamptz;

-- Index so the Outreach inbox can pull "drafts awaiting approval" fast
create index if not exists cs_replies_draft_pending_idx
  on public.cs_replies (drafted_at desc)
  where drafted_response is not null and draft_approved = false;
