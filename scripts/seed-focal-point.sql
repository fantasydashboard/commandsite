-- Focal Point Church — the real Grace customer #1 (slug 'focal-point-church').
-- ---------------------------------------------------------------------------
-- Reconciles the database with the code. Every code path for Focal Point
-- (theme in src/config/clientThemes.ts, module config in src/config/clients.ts,
-- church data in src/lib/clients/church/dataset.ts, the Planning Center connect
-- card, ~19 references) is keyed to slug 'focal-point-church'. This script
-- creates the matching DB rows AND retires the old 'focal-point-test' seed that
-- predated the real pitch, so /admin and login routing line up with the code.
--
-- Two rows get created (both keyed to 'focal-point-church'):
--   1. cs_customers — shows in /admin Active Customers + the onboarding drawer.
--   2. clients (legacy registry) — powers the dashboards registry + the slug
--      that /dashboard/:slug and post-login routing resolve to.
--
-- NOTE: the onboarding stage + timeline fields below are a seed baseline, not a
-- record of Focal Point's actual onboarding. Adjust them (or drive them from the
-- onboarding UI) to reflect reality.
--
-- Idempotent. Run once in the Supabase SQL editor (or psql) against the linked
-- project. Re-running is safe.
--
-- Remove entirely with:
--   delete from cs_customers where slug = 'focal-point-church';
--   delete from clients      where slug = 'focal-point-church';


-- ── 1. cs_customers row ─────────────────────────────────────────────

insert into public.cs_customers (
  org_name, slug, persona_type, industry, city, state, timezone,
  tier, founding_partner, billing_period, setup_fee_cents, monthly_rate_cents,
  signed_at, billing_start_at,
  status, onboarding_stage, stage_entered_at,
  primary_color, contacts, enabled_roles, languages,
  contract_status, contract_sent_at, contract_signed_at,
  payment_received_at, payment_method,
  kickoff_call_scheduled_at, kickoff_call_completed_at,
  discovery_brief_sent_at, discovery_brief_returned_at, discovery_brief_data,
  voice_profile_built_at, tenant_provisioned_at, shadow_started_at,
  shadow_drafts_approved_count, shadow_drafts_total_count
)
values (
  'Focal Point Church',
  'focal-point-church',
  'grace',
  'Church',
  'Orlando', 'FL',
  'America/New_York',
  'founding', true, 'monthly', 0, 79900,
  now() - interval '21 days',
  now() - interval '14 days',
  'onboarding', 'shadow', now() - interval '5 days',
  '#3B82F6',
  jsonb_build_array(
    jsonb_build_object(
      'name', 'Pastor Mark', 'role', 'Senior Pastor',
      'email', 'TODO@focalpointchurch.com',
      'phone', '', 'primary', true
    ),
    jsonb_build_object(
      'name', 'Christina', 'role', 'Operations',
      'email', 'TODO@focalpointchurch.com',
      'phone', '', 'primary', false
    )
  ),
  array['front_desk_guests', 'care_drift', 'sundays_comms', 'giving']::text[],
  array['en']::text[],
  'signed',     now() - interval '20 days', now() - interval '18 days',
  now() - interval '14 days', 'invoice',
  now() - interval '12 days', now() - interval '12 days',
  now() - interval '11 days', now() - interval '10 days',
  jsonb_build_object(
    'submitted_at', (now() - interval '10 days')::text,
    'owner_tone', 'Warm, pastoral.',
    'congregation_size', '~1000 across services',
    'ministries_active', 'Sunday worship, kids ministry, youth, small groups, missions',
    'visitor_volume', '~6-10 first-time visitors per week',
    'care_team_size', 'pastoral staff + lay care volunteers',
    'existing_chms', 'Planning Center',
    'grace_roles', array['front_desk_guests', 'care_drift', 'sundays_comms', 'giving']
  ),
  now() - interval '8 days', now() - interval '6 days', now() - interval '5 days',
  4, 12
)
on conflict (slug) do update set
  org_name              = excluded.org_name,
  status                = excluded.status,
  onboarding_stage      = excluded.onboarding_stage,
  stage_entered_at      = excluded.stage_entered_at,
  contacts              = excluded.contacts,
  contract_status       = excluded.contract_status,
  contract_sent_at      = excluded.contract_sent_at,
  contract_signed_at    = excluded.contract_signed_at,
  payment_received_at   = excluded.payment_received_at,
  payment_method        = excluded.payment_method,
  kickoff_call_scheduled_at = excluded.kickoff_call_scheduled_at,
  kickoff_call_completed_at = excluded.kickoff_call_completed_at,
  discovery_brief_sent_at = excluded.discovery_brief_sent_at,
  discovery_brief_returned_at = excluded.discovery_brief_returned_at,
  discovery_brief_data  = excluded.discovery_brief_data,
  voice_profile_built_at = excluded.voice_profile_built_at,
  tenant_provisioned_at = excluded.tenant_provisioned_at,
  shadow_started_at     = excluded.shadow_started_at,
  shadow_drafts_approved_count = excluded.shadow_drafts_approved_count,
  shadow_drafts_total_count = excluded.shadow_drafts_total_count,
  live_started_at       = null;


-- ── 2. Legacy clients (dashboards registry) row ─────────────────────
-- This is the row login routing + the admin registry resolve. Slug MUST match
-- the code ('focal-point-church').

insert into public.clients (slug, name, tier, active)
values ('focal-point-church', 'Focal Point Church', 'standard', true)
on conflict (slug) do update set
  name = excluded.name,
  tier = excluded.tier,
  active = excluded.active;


-- ── 3. Retire the old TEST identity ('focal-point-test') ────────────
-- Move any login users off the test client onto the real one (so nobody is
-- orphaned by on-delete-set-null), then drop the test rows. No-op if the test
-- client was never created.

update public.users u
  set client_id = (select id from public.clients where slug = 'focal-point-church')
  where u.client_id = (select id from public.clients where slug = 'focal-point-test');

delete from public.cs_customers where slug = 'focal-point-test';
delete from public.clients      where slug = 'focal-point-test';


-- ── Verify ──────────────────────────────────────────────────────────

select 'cs_customers' as kind, org_name as label, status, onboarding_stage
from public.cs_customers where slug = 'focal-point-church'
union all
select 'clients (registry)' as kind, name as label, tier as status, null::text as onboarding_stage
from public.clients where slug = 'focal-point-church'
union all
select 'leftover test rows' as kind, slug as label, null, null
from public.clients where slug = 'focal-point-test';
