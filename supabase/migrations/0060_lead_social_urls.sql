-- 0056: capture social media profile URLs on cs_leads
-- ----------------------------------------------------------------------------
-- Context: small service businesses often hide their email behind a contact
-- form on the website, but list it openly on their Facebook business page
-- under "Contact Info." Same goes for Instagram bios, LinkedIn pages, and
-- Yelp business profiles. Scraping those sites directly is hostile turf
-- (login walls, IP bans, ToS) but the operator can click through in seconds
-- if we surface the link.
--
-- enrich-lead-emails will now extract social profile URLs from the homepage
-- HTML and persist them here so the Lead Detail panel can render
-- "Check Facebook ↗" / "Check Instagram ↗" / etc. buttons.

ALTER TABLE cs_leads
  ADD COLUMN IF NOT EXISTS social_urls jsonb;

COMMENT ON COLUMN cs_leads.social_urls IS
  'Map of platform → canonical profile URL extracted from the lead''s '
  'company website. Keys: facebook, instagram, linkedin, twitter, youtube, '
  'tiktok, yelp. Null until the scraper runs; values overwritten on re-scrape.';
