-- CommandSite · cs_customers (signed paying customers)
-- ---------------------------------------------------------------------------
-- One row per signed CommandSite customer (Ada for service business OR
-- Grace for church). Created when a cs_deal closes won and Josh
-- promotes it via the onboarding wizard. Holds everything needed to
-- actually deliver the persona for that customer: branding, contacts,
-- enabled roles, integrations, billing terms.
--
-- Per-customer dashboard routing (e.g., /dashboard/focal-point-church)
-- pulls config from this table at runtime.

create table public.cs_customers (
  id                          uuid primary key default gen_random_uuid(),

  -- ── Source linkage (where this customer came from)
  deal_id                     uuid references public.cs_deals(id) on delete set null,
  lead_id                     uuid references public.cs_leads(id) on delete set null,

  -- ── Identity
  org_name                    text not null,
  -- URL-safe slug, unique. Lowercase, dashes-only. e.g. "focal-point-church"
  slug                        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  -- Which persona this customer gets: 'ada' (service business) or 'grace' (church/ministry)
  persona_type                text not null check (persona_type in ('ada', 'grace')),
  industry                    text,
  city                        text,
  state                       text,
  timezone                    text default 'America/New_York',

  -- ── Plan + billing
  -- Tier: compact / standard / large / multi-congregation (church) OR similar for service
  tier                        text not null default 'standard',
  founding_partner            boolean not null default true,
  billing_period              text not null default 'monthly' check (billing_period in ('monthly', 'annual')),
  setup_fee_cents             integer not null default 0,
  monthly_rate_cents          integer not null default 0,
  -- Year-one terms snapshot — exact dollars Josh quoted
  year1_cost_cents            integer,
  signed_at                   timestamptz,
  billing_start_at            timestamptz,
  -- Lock period from founding-partner pricing (typically 12 months)
  founding_lock_until         date,
  status                      text not null default 'onboarding'
                              check (status in ('onboarding', 'active', 'paused', 'churned')),

  -- ── Branding (consumed by the per-customer dashboard theme)
  primary_color               text,           -- hex e.g. "#0EA5A0"
  wordmark_text               text,           -- override the persona's default wordmark
  logo_url                    text,

  -- ── Contacts (pastors / owner / staff)
  -- jsonb array: [{name, role, email, phone, primary: bool}]
  contacts                    jsonb not null default '[]'::jsonb,

  -- ── Persona config
  -- Which roles are active in week 1 (subset of the persona's full menu)
  enabled_roles               text[] not null default array[]::text[],
  -- Languages supported — important for multi-congregation churches
  languages                   text[] not null default array['English']::text[],
  -- Customer can override persona name (rare — most use "Ada" / "Grace")
  persona_name_override       text,
  greeting_override           text,

  -- ── Integrations (one slot per known integration; null when not connected)
  planning_center_org_id      text,
  twilio_phone_number         text,
  google_business_profile_id  text,
  -- Catch-all for future integrations
  integrations                jsonb not null default '{}'::jsonb,

  -- ── Onboarding tracking
  onboarding_step             integer not null default 0,
  onboarding_completed_at     timestamptz,
  -- Free-form notes — anything Josh wants to remember about this customer
  notes                       text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index cs_customers_slug_idx   on public.cs_customers (slug);
create index cs_customers_status_idx on public.cs_customers (status);
create index cs_customers_deal_idx   on public.cs_customers (deal_id);

alter table public.cs_customers enable row level security;

create policy "admins read customers"
  on public.cs_customers for select
  using (public.is_admin());

create policy "admins manage customers"
  on public.cs_customers for all
  using (public.is_admin())
  with check (public.is_admin());

-- updated_at trigger
create or replace function public.touch_cs_customers()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cs_customers_touch
  before update on public.cs_customers
  for each row execute function public.touch_cs_customers();
