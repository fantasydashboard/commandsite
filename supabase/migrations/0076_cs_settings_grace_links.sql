-- Migration 0076 — Grace-specific link columns on cs_settings
-- ----------------------------------------------------------------------------
-- Grace's email sequence references two URLs:
--   - calendly_link_grace: the church-specific Calendly walkthrough URL
--     (currently calendly.com/josh-commandsite/30-min-discovery-church-walkthrough).
--     Distinct from cs_settings.calendly_link, which targets Ada's
--     home-services prospects.
--   - research_link: the public URL for the 48h-followup research the
--     Touch 3 email cites (The Effective Church Group or equivalent).
--     Verifiable third-party research — pastors WILL click through.
--
-- Both columns are nullable. If empty, the Grace followup drafter falls
-- back gracefully (skips the calendar line OR omits the research URL line
-- but keeps the prose).

alter table public.cs_settings
  add column if not exists calendly_link_grace text;

alter table public.cs_settings
  add column if not exists research_link text;

comment on column public.cs_settings.calendly_link_grace is
  'Church-specific Calendly walkthrough URL. Grace drafters use this in Touch 2. Falls back to calendly_link if null.';

comment on column public.cs_settings.research_link is
  'Public research URL for the 48h-followup statistic Touch 3 cites. Falls back to omitting the link line if null.';
