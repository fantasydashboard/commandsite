-- CommandSite-as-a-business · sales pipeline (cs_deals)
-- ---------------------------------------------------------------------------
-- Sales pipeline for Josh's outreach to acquire CommandSite customers.
-- Mirrors the shape of src/lib/clients/commandsite/pipeline.ts so the
-- Pipeline module can swap fixture for live data without changing
-- component contracts.
--
-- Phase 1 of "make CommandSite-for-CommandSite real."

create table public.cs_deals (
  id                    uuid primary key default gen_random_uuid(),

  -- The contact + company
  company_name          text not null,
  contact_name          text not null,
  contact_email         text,
  contact_title         text,
  industry              text,
  city                  text,
  state                 text,
  team_size             integer,

  -- Pipeline state
  stage                 text not null default 'cold'
    check (stage in (
      'cold','researched','contacted','replied','demo_booked',
      'demo_done','proposal','closed_won','closed_lost'
    )),
  source                text not null default 'manual'
    check (source in (
      'manual','cold_email','cold_call','linkedin_dm','inbound_demo',
      'referral','event','reddit','apollo','social_engager','other'
    )),

  -- Money + actions
  estimated_arr_cents   integer not null default 0,
  next_action           text,
  next_action_due_at    timestamptz,
  notes                 text,

  -- Touch tracking
  last_touch_at         timestamptz not null default now(),
  last_touch_kind       text
    check (last_touch_kind in ('email','call','meeting','linkedin','note')),

  -- Stage timing (drives "X days in stage")
  stage_entered_at      timestamptz not null default now(),

  -- Standard tracking
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null
);

-- Indexes — kanban filters by stage, lists sort by recency
create index cs_deals_stage_idx       on public.cs_deals (stage);
create index cs_deals_created_at_idx  on public.cs_deals (created_at desc);
create index cs_deals_due_at_idx      on public.cs_deals (next_action_due_at)
  where next_action_due_at is not null;

-- Auto-update updated_at on every UPDATE
create or replace function public.cs_deals_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  -- If the stage changed, reset stage_entered_at so "days in stage" stays accurate
  if new.stage is distinct from old.stage then
    new.stage_entered_at = now();
  end if;
  return new;
end;
$$;

create trigger cs_deals_updated_at
  before update on public.cs_deals
  for each row
  execute function public.cs_deals_set_updated_at();

-- RLS: only admins (Josh) can read/write. Clients should never see this table.
alter table public.cs_deals enable row level security;

create policy "admins manage cs_deals"
  on public.cs_deals for all
  using (public.is_admin())
  with check (public.is_admin());
