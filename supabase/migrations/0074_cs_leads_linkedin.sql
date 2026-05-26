-- CommandSite · Add LinkedIn outreach tracking to cs_leads
-- ---------------------------------------------------------------------------
-- Two columns to support the "LinkedIn Today" surface — a manual-but-AI-
-- assisted queue that surfaces top-ICP leads to send LinkedIn connection
-- requests to today, with drafted copy pre-written.
--
-- We DON'T build a full automation pipeline against LinkedIn's API because
-- it bans accounts that automate sends. Instead this layer drafts the
-- message + tracks state; the operator pastes into LinkedIn manually.
--
-- linkedin_url     — populated when known (manual entry or future scraper).
--                    When null, the UI falls back to a Google search shortcut
--                    "[company name] [city] site:linkedin.com".
-- linkedin_contacted_at — set when the operator marks "sent" in the LinkedIn
--                         Today UI. Used to dedupe so the same lead doesn't
--                         resurface in tomorrow's queue.
--
-- Idempotent — safe to re-apply.

alter table public.cs_leads
  add column if not exists linkedin_url text,
  add column if not exists linkedin_contacted_at timestamptz;

-- Partial index — the hot query is "leads with no LinkedIn touch yet,
-- ordered by ICP score." Partial keeps the index small.
create index if not exists cs_leads_linkedin_pending_idx
  on public.cs_leads (icp_score desc nulls last)
  where linkedin_contacted_at is null;

comment on column public.cs_leads.linkedin_url is
  'LinkedIn profile URL when known. Manual entry today; future automation could populate via search. When null, UI offers a Google search shortcut.';

comment on column public.cs_leads.linkedin_contacted_at is
  'When the operator sent a LinkedIn connection request for this lead. Marked manually in the LinkedIn Today UI. Used to dedupe the daily queue so the same lead doesn''t reappear tomorrow.';
