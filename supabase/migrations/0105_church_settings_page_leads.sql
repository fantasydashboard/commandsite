-- Who owns each page.
--
-- The ownership model only works if it is visible on the page itself. A queue
-- everyone can see is a queue everyone assumes somebody else worked, so each
-- page carries one accountable name rather than being watched by a team.
--
-- Shape: { "front-desk-guests": { "name": "...", "cadence": "Tuesdays" }, ... }
-- Deliberately NOT seeded. An invented owner reads as real; an unset page
-- renders as "Unassigned", which is a prompt to decide rather than a claim.
alter table public.church_settings
  add column if not exists page_leads jsonb not null default '{}'::jsonb;

comment on column public.church_settings.page_leads is
  'Per-page accountable owner + cadence. Keyed by dashboard tab. Empty = unassigned, shown as a prompt in the UI.';
