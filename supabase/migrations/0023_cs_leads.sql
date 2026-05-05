-- CommandSite-as-a-business · lead enrichment table (cs_leads)
-- ---------------------------------------------------------------------------
-- Pre-pipeline prospects. Imported from CSVs (Apollo, scraped lists,
-- LinkedIn exports, manual research) before they've been contacted.
--
-- Lifecycle: new → queued (added to a sequence) → contacted →
--             replied → promoted_to_pipeline (becomes a cs_deals row)
-- Or:        archived (saved-for-later) | disqualified (auto-skip pile)
--
-- Phase 3 of "make CommandSite-for-CommandSite real."

create table public.cs_leads (
  id                          uuid primary key default gen_random_uuid(),

  -- ── Source provenance
  source                      text not null check (source in (
    'manual_csv',
    'apollo_csv',
    'linkedin_export',
    'social_engager',
    'reddit_scrape',
    'manual_entry',
    'referral',
    'other'
  )),
  -- All rows imported in the same paste share a batch_id so you can
  -- "undo this import" or "re-score this batch" later.
  imported_batch_id           uuid,
  imported_batch_label        text,

  -- ── Contact + company
  company_name                text not null,
  contact_name                text,
  contact_email               text,
  contact_title               text,
  contact_phone               text,
  linkedin_url                text,
  company_url                 text,

  -- ── Firmographic context (drives scoring)
  industry                    text,
  city                        text,
  state                       text,
  country                     text default 'US',
  team_size                   integer,
  annual_revenue_estimate     bigint,

  -- ── ICP score (0-100, computed from cs_settings.icp_*)
  icp_score                   integer check (icp_score between 0 and 100),
  -- Plain-English explanation of why we scored this way.
  -- Lets you sanity-check the scorer without re-running it.
  icp_score_reason            text,

  -- ── Workflow status
  status                      text not null default 'new' check (status in (
    'new',
    'queued',
    'contacted',
    'replied',
    'promoted_to_pipeline',
    'archived',
    'disqualified'
  )),

  -- ── Notes + tags
  notes                       text,
  tags                        text[] not null default array[]::text[],

  -- ── Linkage
  -- Once promoted, points at the cs_deals row so you can trace lineage.
  promoted_deal_id            uuid references public.cs_deals(id) on delete set null,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Indexes for the filters the Leads module hits constantly
create index cs_leads_status_idx          on public.cs_leads (status);
create index cs_leads_score_idx           on public.cs_leads (icp_score desc nulls last);
create index cs_leads_batch_idx           on public.cs_leads (imported_batch_id);
create index cs_leads_created_at_idx      on public.cs_leads (created_at desc);
-- Email is nullable but should be unique when present (avoid dupe imports).
create unique index cs_leads_contact_email_unique
  on public.cs_leads (lower(contact_email))
  where contact_email is not null;

-- Auto-update updated_at
create or replace function public.cs_leads_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cs_leads_updated_at
  before update on public.cs_leads
  for each row
  execute function public.cs_leads_set_updated_at();

-- RLS: admin only
alter table public.cs_leads enable row level security;

create policy "admins manage cs_leads"
  on public.cs_leads for all
  using (public.is_admin())
  with check (public.is_admin());
