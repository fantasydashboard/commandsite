-- CommandSite cs_leads · source material + cold email draft columns
-- ---------------------------------------------------------------------------
-- Phase 3 of the lead engine. We've stopped throwing away Ada's source
-- material so the cold-email drafter can write a personalized opener
-- per lead. Also persists the drafts themselves so Josh can review,
-- edit, and approve in the UI without re-running the model.
--
-- Backwards compatible: every column is nullable + additive. The 14
-- leads imported before this migration drafted fine using just
-- icp_score_reason + notes (which already contain Ada's reasoning
-- + signals from the score-leads-ada step).

alter table public.cs_leads
  -- Source material captured during research / enrichment so the
  -- drafter doesn't have to re-fetch from Google Places or re-scrape
  -- the website every time.
  add column if not exists review_excerpts          jsonb,
  add column if not exists website_extract          text,

  -- Drafted cold email — one per lead, latest wins. We keep rationale
  -- + signal alongside so the UI can show *why* Ada wrote this opener
  -- (Josh QAs better when he can see the reasoning).
  add column if not exists draft_cold_email_subject     text,
  add column if not exists draft_cold_email_body        text,
  add column if not exists draft_cold_email_rationale   text,
  add column if not exists draft_cold_email_signal      text,
  add column if not exists draft_cold_email_at          timestamptz,
  add column if not exists draft_cold_email_model       text;

-- review_excerpts shape: jsonb array of
--   { text: string, rating: number|null, relative_time: string|null }
-- So a partial example:
--   [{"text": "Mike came out same day...", "rating": 5, "relative_time": "2 months ago"}]

-- Index for the leads-page filter "leads ready to draft" — those that
-- have a verified email but no draft yet. Partial index keeps it small.
create index if not exists cs_leads_ready_to_draft_idx
  on public.cs_leads (id)
  where contact_email is not null
    and draft_cold_email_body is null;
