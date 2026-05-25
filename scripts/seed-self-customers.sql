-- Seed Josh's own businesses as active cs_customers rows so they appear
-- in the Active Customers section on /admin and the click-through goes
-- straight to their dashboards.
--
-- These aren't paying customers in the traditional sense — they're Josh's
-- own operational dashboards. Treating them as active customers gives
-- one consistent navigation surface for everything.
--
-- Idempotent — re-running upserts without disturbing live fields.
-- Delete with: delete from cs_customers where slug in ('commandsite', 'ultimate-fantasy-dashboard', 'josh-personal');

-- ── 1. CommandSite-on-CommandSite (Josh's own AI employee for the business)

insert into public.cs_customers (
  org_name, slug, persona_type, industry, city, state, timezone,
  tier, founding_partner, billing_period, setup_fee_cents, monthly_rate_cents,
  signed_at, billing_start_at, status,
  primary_color, contacts, enabled_roles, languages,
  contract_status, contract_signed_at
)
values (
  'CommandSite',
  'commandsite',
  'ada',
  'AI / SaaS',
  null, null,
  'America/New_York',
  'internal', false, 'monthly', 0, 0,
  now() - interval '60 days',
  now() - interval '60 days',
  'active',
  '#3B82F6',
  jsonb_build_array(
    jsonb_build_object(
      'name', 'Josh Daniel', 'role', 'Founder',
      'email', 'josh@commandsite.io', 'phone', '', 'primary', true
    )
  ),
  array['email_marketing', 'review_engine', 'quote_followup']::text[],
  array['en']::text[],
  'signed',
  now() - interval '60 days'
)
on conflict (slug) do update set
  org_name = excluded.org_name,
  status = excluded.status,
  contacts = excluded.contacts;


-- ── 2. Ultimate Fantasy Dashboard (Josh's B2C product)

insert into public.cs_customers (
  org_name, slug, persona_type, industry, city, state, timezone,
  tier, founding_partner, billing_period, setup_fee_cents, monthly_rate_cents,
  signed_at, billing_start_at, status,
  primary_color, contacts, enabled_roles, languages,
  contract_status, contract_signed_at
)
values (
  'Ultimate Fantasy Dashboard',
  'ultimate-fantasy-dashboard',
  'ada',
  'B2C / SaaS',
  null, null,
  'America/New_York',
  'internal', false, 'monthly', 0, 0,
  now() - interval '120 days',
  now() - interval '120 days',
  'active',
  '#10B981',
  jsonb_build_array(
    jsonb_build_object(
      'name', 'Josh Daniel', 'role', 'Founder',
      'email', 'josh@getinthelimelight.com', 'phone', '', 'primary', true
    )
  ),
  array['email_marketing', 'customer_health']::text[],
  array['en']::text[],
  'signed',
  now() - interval '120 days'
)
on conflict (slug) do update set
  org_name = excluded.org_name,
  status = excluded.status,
  contacts = excluded.contacts;


-- ── 3. Josh Personal (the private personal dashboard, Sage-themed)

insert into public.cs_customers (
  org_name, slug, persona_type, industry, city, state, timezone,
  tier, founding_partner, billing_period, setup_fee_cents, monthly_rate_cents,
  signed_at, billing_start_at, status,
  primary_color, contacts, enabled_roles, languages,
  contract_status, contract_signed_at
)
values (
  'Josh Personal',
  'josh-personal',
  'ada',
  'Personal',
  null, null,
  'America/New_York',
  'internal', false, 'monthly', 0, 0,
  now() - interval '90 days',
  now() - interval '90 days',
  'active',
  '#A78BFA',
  jsonb_build_array(
    jsonb_build_object(
      'name', 'Josh Daniel', 'role', 'Owner',
      'email', 'josh@getinthelimelight.com', 'phone', '', 'primary', true
    )
  ),
  array['performance']::text[],
  array['en']::text[],
  'signed',
  now() - interval '90 days'
)
on conflict (slug) do update set
  org_name = excluded.org_name,
  status = excluded.status,
  contacts = excluded.contacts;


-- Sanity check
select org_name, slug, status, persona_type
from public.cs_customers
where slug in ('commandsite', 'ultimate-fantasy-dashboard', 'josh-personal')
order by slug;
