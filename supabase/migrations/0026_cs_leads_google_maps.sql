-- CommandSite Phase 6 — Google Maps lead research
-- ---------------------------------------------------------------------------
-- Extends cs_leads to support leads researched directly via the Google
-- Places API. Adds 'google_maps' as a valid source value and tracks the
-- Place ID + enrichment timestamp for dedup and audit.
--
-- Why this matters: the Apex/Plumbing/Electrical cold-outreach campaign
-- starts with the lead-research engine pulling small service-business
-- listings from Maps. Without unique constraint on place_id, the same
-- shop showing up in two overlapping searches would create duplicates.

-- 1) Expand the source check constraint to include google_maps
alter table public.cs_leads
  drop constraint if exists cs_leads_source_check;

alter table public.cs_leads
  add constraint cs_leads_source_check check (source in (
    'manual_csv',
    'apollo_csv',
    'linkedin_export',
    'social_engager',
    'reddit_scrape',
    'manual_entry',
    'referral',
    'other',
    'google_maps'
  ));

-- 2) Track the Google Place ID and enrichment timestamp.
-- Place IDs are stable across queries — the same business returns the
-- same ID, which is exactly what we want for dedup.
alter table public.cs_leads
  add column if not exists google_maps_place_id    text,
  add column if not exists google_maps_enriched_at timestamptz;

-- 3) Unique index when place_id is present, so concurrent / overlapping
-- searches can't insert the same shop twice.
create unique index if not exists cs_leads_google_maps_place_id_uidx
  on public.cs_leads (google_maps_place_id)
  where google_maps_place_id is not null;
