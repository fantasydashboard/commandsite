-- CommandSite · Lead-sourcing campaigns
-- ---------------------------------------------------------------------------
-- One row = one configured "pull" target. The lead-sourcing-cron picks the
-- top pending+priority campaign that's currently 'active' and pulls leads
-- against its query until target_count is hit or Apollo returns nothing
-- new (dedupable against cs_leads). When done, the row flips to 'done'
-- and the next priority 'pending' campaign becomes 'active'.
--
-- One active campaign at a time (serial execution) — gives clean
-- per-campaign stats. To run two geos in parallel, create two campaigns
-- and set both to 'active' (the cron is fine with it; the per-tick
-- target_count constraint still applies).

create table public.cs_lead_campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  status          text not null default 'pending' check (status in (
    'pending',    -- queued, will be picked up
    'active',     -- the cron is pulling from this one
    'paused',     -- operator paused; cron skips
    'done'        -- target_count hit OR Apollo exhausted
  )),

  -- ── What to pull
  -- Geography. Free-form JSONB for now — the Apollo translator turns this
  -- into an actual API query. Common shape:
  --   { state: 'FL', cities: ['Tampa','St. Petersburg'], radius_mi: 30 }
  -- Or for state-level:
  --   { state: 'FL' }
  geo             jsonb not null default '{}'::jsonb,

  -- The Apollo search filter (titles, industries, headcount, etc.).
  -- Combined with geo when the cron hits the Apollo API.
  apollo_query    jsonb not null default '{}'::jsonb,

  -- How many leads to pull before flipping to 'done'.
  target_count    integer not null default 100 check (target_count > 0),

  -- ── Ordering / priority
  -- Lower number = higher priority. The cron picks the lowest-priority
  -- 'pending' campaign when activating the next one.
  priority        integer not null default 100,

  -- ── Aggregates (filled by the cron + downstream events)
  pulled_count    integer not null default 0,    -- how many cs_leads rows attributed
  replied_count   integer not null default 0,    -- how many replied (post-pull)
  qualified_count integer not null default 0,    -- pulled + scored above threshold

  -- ── Lifecycle timestamps
  started_at      timestamptz,    -- when status became 'active'
  ended_at        timestamptz,    -- when status became 'done'

  -- ── Notes
  -- Free-form. "Tampa+St-Pete HVAC owners, Apr push — high heat-pump intent."
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index cs_lead_campaigns_status_idx   on public.cs_lead_campaigns (status, priority);
create index cs_lead_campaigns_priority_idx on public.cs_lead_campaigns (priority);

-- Auto-updated_at
create or replace function public.cs_lead_campaigns_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cs_lead_campaigns_updated_at on public.cs_lead_campaigns;
create trigger cs_lead_campaigns_updated_at
  before update on public.cs_lead_campaigns
  for each row
  execute function public.cs_lead_campaigns_set_updated_at();

-- RLS — admin only, mirrors cs_leads
alter table public.cs_lead_campaigns enable row level security;

create policy "admins manage cs_lead_campaigns"
  on public.cs_lead_campaigns for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.role = 'admin'
    )
  );

create policy "service role manages cs_lead_campaigns"
  on public.cs_lead_campaigns for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');


-- ── Link cs_leads to the campaign that pulled them ────────────────────

alter table public.cs_leads
  add column if not exists source_campaign_id uuid references public.cs_lead_campaigns(id) on delete set null;

create index if not exists cs_leads_source_campaign_idx
  on public.cs_leads (source_campaign_id)
  where source_campaign_id is not null;

comment on column public.cs_leads.source_campaign_id is
  'When a lead is pulled by lead-sourcing-cron, this points at the campaign that sourced it. NULL for manually-imported leads (CSV, manual_entry, etc.).';


comment on table public.cs_lead_campaigns is
  'Lead-sourcing campaigns. Each row defines a geo + ICP filter; lead-sourcing-cron pulls one active campaign at a time. See supabase/functions/lead-sourcing-cron for the consumer.';
