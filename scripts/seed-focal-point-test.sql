-- Seed a Focal Point test client modeled after Cornerstone Community
-- Church. Used to walk through the Grace experience before the real
-- Focal Point pitch lands. Two rows get created:
--
--   1. cs_customers — so it shows up in /admin Active Customers and
--      can be navigated to as a test customer. Seeded in 'shadow' stage
--      with the contract + discovery already marked done, so you can
--      see what the late-stage onboarding drawer looks like AND walk
--      through to 'live' without redoing every step.
--   2. clients (legacy registry) — so the dashboards-registry section
--      lists it too, in case you want quick navigation from there.
--
-- Module config + theme are wired in code (src/config/clients.ts +
-- src/config/clientThemes.ts) under slug 'focal-point-test'.
--
-- Idempotent. Re-run to reset to a clean test state.
-- Delete with:
--   delete from cs_customers where slug = 'focal-point-test';
--   delete from clients where slug = 'focal-point-test';


-- ── 1. cs_customers row ─────────────────────────────────────────────

insert into public.cs_customers (
  org_name, slug, persona_type, industry, city, state, timezone,
  tier, founding_partner, billing_period, setup_fee_cents, monthly_rate_cents,
  signed_at, billing_start_at,
  status, onboarding_stage, stage_entered_at,
  primary_color, contacts, enabled_roles, languages,
  -- Pre-walk the early stages so the test starts in 'shadow' with
  -- everything before that already done. Lets you focus on testing the
  -- discovery/voice/shadow→live experience for the pitch.
  contract_status, contract_sent_at, contract_signed_at,
  payment_received_at, payment_method,
  kickoff_call_scheduled_at, kickoff_call_completed_at,
  discovery_brief_sent_at, discovery_brief_returned_at, discovery_brief_data,
  voice_profile_built_at, tenant_provisioned_at, shadow_started_at,
  shadow_drafts_approved_count, shadow_drafts_total_count
)
values (
  'Focal Point (TEST)',
  'focal-point-test',
  'grace',
  'Church',
  'Tampa', 'FL',
  'America/New_York',
  'founding', true, 'monthly', 0, 79900,
  now() - interval '21 days',
  now() - interval '14 days',
  'onboarding', 'shadow', now() - interval '5 days',
  '#3B82F6',
  jsonb_build_array(
    jsonb_build_object(
      'name', 'Pastor Test', 'role', 'Senior Pastor',
      'email', 'josh@getinthelimelight.com',
      'phone', '555-0199', 'primary', true
    ),
    jsonb_build_object(
      'name', 'Ops Director Test', 'role', 'Operations',
      'email', 'josh@getinthelimelight.com',
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
    'owner_tone', 'Warm, pastoral. We sign off with "Grace and peace,"',
    'congregation_size', '~280 across two services',
    'ministries_active', 'Sunday worship, kids ministry, youth, small groups, missions',
    'visitor_volume', '~6-10 first-time visitors per week',
    'care_team_size', '2 pastoral staff + 6 lay care volunteers',
    'existing_chms', 'Planning Center, MailChimp, Tithe.ly',
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

insert into public.clients (slug, name, tier, active)
values ('focal-point-test', 'Focal Point (TEST)', 'standard', true)
on conflict (slug) do update set
  name = excluded.name,
  tier = excluded.tier,
  active = excluded.active;


-- ── Verify ──────────────────────────────────────────────────────────

select 'cs_customers' as kind, org_name as label, status, onboarding_stage
from public.cs_customers where slug = 'focal-point-test'
union all
select 'clients (registry)' as kind, name as label, tier as status, null::text as onboarding_stage
from public.clients where slug = 'focal-point-test';
