-- AI Social module — multi-tenant tables for the AI-driven social media
-- planner/writer/analyst. All client-scoped via client_id; RLS enforces
-- that each client only sees their own rows. Admin (role='admin') sees
-- everything via the existing public.is_admin() helper.

-- ---------------------------------------------------------------------------
-- client_brand_profiles
-- One row per client. The "memory" of the AI employee — voice, audience,
-- goals, topics, dos/donts. Shape is mostly JSONB so we can iterate the
-- schema without migrations as the agent learns what fields are useful.
-- ---------------------------------------------------------------------------
create table public.client_brand_profiles (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null unique references public.clients(id) on delete cascade,
  business_name   text,
  description     text,                                 -- elevator pitch
  voice           text,                                 -- free-form tone/voice description
  audience        text,                                 -- target persona description
  goals           jsonb not null default '{}'::jsonb,   -- {primary, secondary[], cadence}
  topics          text[] not null default '{}'::text[],
  dos             text[] not null default '{}'::text[],
  donts           text[] not null default '{}'::text[],
  sample_posts    jsonb not null default '[]'::jsonb,   -- [{platform, body, performance?}]
  lessons_learned jsonb not null default '[]'::jsonb,   -- managed by Analyst agent
  preferences     jsonb not null default '{}'::jsonb,   -- catch-all for future fields
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- client_social_connections
-- Where the Ayrshare User Profile key + per-client posting config lives.
-- Admin populates ayrshare_profile_key when provisioning the workspace.
-- ---------------------------------------------------------------------------
create table public.client_social_connections (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null unique references public.clients(id) on delete cascade,
  ayrshare_profile_key  text,
  platforms_enabled     text[] not null default '{}'::text[],  -- {'twitter','linkedin',...}
  raw                   jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- social_post_drafts
-- The AI-generated work queue. status cycles draft → approved → scheduled
-- → posted. variants is an array of platform-specific bodies because the
-- same idea may need different framings for X vs. LinkedIn.
-- ---------------------------------------------------------------------------
create table public.social_post_drafts (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  topic             text,
  variants          jsonb not null default '[]'::jsonb,  -- [{platform, body, hashtags, link, image_url?}]
  status            text not null default 'draft'
                      check (status in ('draft','approved','scheduled','posted','failed','rejected')),
  ai_meta           jsonb,                                -- {model, tokens_in, tokens_out, prompt_summary}
  approved_by       uuid references public.users(id),
  approved_at       timestamptz,
  scheduled_for     timestamptz,
  posted_at         timestamptz,
  ayrshare_post_id  text,
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index social_post_drafts_client_status_idx on public.social_post_drafts (client_id, status, created_at desc);
create index social_post_drafts_scheduled_idx on public.social_post_drafts (scheduled_for) where scheduled_for is not null;

-- ---------------------------------------------------------------------------
-- social_post_metrics
-- Time-series engagement snapshots per post per platform. We record
-- snapshots rather than current state so we can chart growth + spot
-- viral inflection points.
-- ---------------------------------------------------------------------------
create table public.social_post_metrics (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.social_post_drafts(id) on delete cascade,
  platform     text not null,
  snapshot_at  timestamptz not null default now(),
  likes        int not null default 0,
  comments     int not null default 0,
  shares       int not null default 0,
  impressions  int not null default 0,
  clicks       int not null default 0,
  saves        int not null default 0,
  raw          jsonb,
  unique (post_id, platform, snapshot_at)
);
create index social_post_metrics_post_idx on public.social_post_metrics (post_id, snapshot_at desc);

-- ---------------------------------------------------------------------------
-- social_strategy_runs
-- Audit trail of every Strategist/Analyst agent run. Kept for transparency
-- ("why did the AI suggest this?") and for the learning loop.
-- ---------------------------------------------------------------------------
create table public.social_strategy_runs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  run_type    text not null check (run_type in ('strategist','analyst','generator')),
  input       jsonb,
  output      jsonb,
  ai_meta     jsonb,
  created_at  timestamptz not null default now()
);
create index social_strategy_runs_client_idx on public.social_strategy_runs (client_id, run_type, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers (mirrors existing convention)
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger client_brand_profiles_touch
  before update on public.client_brand_profiles
  for each row execute function public.touch_updated_at();
create trigger client_social_connections_touch
  before update on public.client_social_connections
  for each row execute function public.touch_updated_at();
create trigger social_post_drafts_touch
  before update on public.social_post_drafts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — admin can do anything; clients can read/upsert their own brand
-- profile + read their drafts/metrics. Writes to drafts/connections go
-- through Edge Functions (service role) so we don't need broad write RLS
-- for the client_user role.
-- ---------------------------------------------------------------------------
alter table public.client_brand_profiles     enable row level security;
alter table public.client_social_connections enable row level security;
alter table public.social_post_drafts        enable row level security;
alter table public.social_post_metrics       enable row level security;
alter table public.social_strategy_runs      enable row level security;

-- Admin: full access on everything.
create policy "admins manage brand profiles" on public.client_brand_profiles
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage social connections" on public.client_social_connections
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage post drafts" on public.social_post_drafts
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage post metrics" on public.social_post_metrics
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage strategy runs" on public.social_strategy_runs
  for all using (public.is_admin()) with check (public.is_admin());

-- Client users: read + insert + update their own brand profile (so the
-- in-app form works without an Edge Function), read connections, and
-- read drafts/metrics/runs scoped to their client.
create policy "client reads own brand profile" on public.client_brand_profiles
  for select using (client_id = public.current_client_id());
create policy "client inserts own brand profile" on public.client_brand_profiles
  for insert with check (client_id = public.current_client_id());
create policy "client updates own brand profile" on public.client_brand_profiles
  for update using (client_id = public.current_client_id())
                with check (client_id = public.current_client_id());

create policy "client reads own social connection" on public.client_social_connections
  for select using (client_id = public.current_client_id());

create policy "client reads own post drafts" on public.social_post_drafts
  for select using (client_id = public.current_client_id());
create policy "client updates own post drafts" on public.social_post_drafts
  for update using (client_id = public.current_client_id())
                with check (client_id = public.current_client_id());

create policy "client reads own metrics" on public.social_post_metrics
  for select using (
    exists (
      select 1 from public.social_post_drafts d
      where d.id = social_post_metrics.post_id
      and d.client_id = public.current_client_id()
    )
  );

create policy "client reads own strategy runs" on public.social_strategy_runs
  for select using (client_id = public.current_client_id());
