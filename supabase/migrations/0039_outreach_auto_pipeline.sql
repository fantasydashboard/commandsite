-- CommandSite · Outreach auto-pipeline (Approval Queue era)
-- ---------------------------------------------------------------------------
-- Adds the state needed to run the cold-email pipeline as a chain:
--   1. Lead enters cs_leads
--   2. Score lands (icp_score)
--   3. Draft generated → cs_leads.draft_cold_email_* + draft_state = 'ready_for_review'
--   4. Josh approves in the queue → opens Gmail compose + logs send → draft_state = 'sent'
--      OR he flips outreach_auto_approve = true and step 4 happens with no click
--
-- `draft_state` is the queue lifecycle separate from `status` (which is
-- the marketing-funnel state: new → contacted → replied → disqualified).
-- They're orthogonal: draft_state tracks the draft itself, status tracks
-- the lead's relationship to the funnel.

alter table public.cs_leads
  add column if not exists draft_state text
    check (draft_state in ('drafting', 'ready_for_review', 'approved', 'sent', 'rejected'));

create index if not exists cs_leads_draft_state_idx
  on public.cs_leads (draft_state)
  where draft_state is not null;

-- ── Settings: auto-approve master switch + threshold
-- When outreach_auto_approve = true, the chain skips the queue and
-- immediately marks drafts as sent (with whatever delivery mechanism
-- is wired). Defaults to false so the human-in-the-loop is the
-- starting state.
alter table public.cs_settings
  add column if not exists outreach_auto_approve         boolean not null default false,
  add column if not exists outreach_auto_draft_min_score integer not null default 65
    check (outreach_auto_draft_min_score between 0 and 100);

-- Backfill: every previously-drafted lead is treated as "ready for
-- review" so existing drafts appear in the queue on first load.
update public.cs_leads
   set draft_state = 'ready_for_review'
 where draft_cold_email_subject is not null
   and draft_cold_email_body    is not null
   and send_count               = 0
   and draft_state              is null;

-- And every previously-sent lead is marked 'sent' for the queue's sake.
update public.cs_leads
   set draft_state = 'sent'
 where send_count > 0
   and draft_state is null;

-- ── Extend cs_outreach_sends.source so the chain can record an
-- auto-approved send as distinct from a manual copy-paste send.
alter table public.cs_outreach_sends
  drop constraint if exists cs_outreach_sends_source_check;

alter table public.cs_outreach_sends
  add constraint cs_outreach_sends_source_check
  check (source in (
    'manual_gmail',
    'manual_other',
    'smartlead',
    'smartlead_reply',
    'apollo',
    'instantly',
    'auto_approve',
    'other'
  ));
