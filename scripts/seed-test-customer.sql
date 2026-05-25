-- Seed a test customer in the 'signed' onboarding stage so you can walk
-- the full automation before Focal Point lands.
--
-- Contact email is set to josh@getinthelimelight.com so every customer-
-- facing email the system fires (welcome, discovery brief, kickoff
-- confirmation, etc.) lands in your inbox. To test as a different
-- recipient, change the email in the contacts JSONB below before running.
--
-- Run from Supabase SQL Editor or psql. Idempotent — re-running overwrites.
-- Delete with: delete from cs_customers where slug = 'test-acme-hvac';

insert into public.cs_customers (
  org_name,
  slug,
  persona_type,
  industry,
  city,
  state,
  timezone,
  tier,
  founding_partner,
  billing_period,
  setup_fee_cents,
  monthly_rate_cents,
  signed_at,
  status,
  onboarding_stage,
  stage_entered_at,
  primary_color,
  contacts,
  enabled_roles,
  languages,
  contract_status
)
values (
  'Acme HVAC (TEST)',
  'test-acme-hvac',
  'ada',
  'HVAC',
  'Miami',
  'FL',
  'America/New_York',
  'founding',
  true,
  'monthly',
  0,
  99900,                       -- $999/mo
  now(),
  'onboarding',
  'signed',
  now(),
  '#3B82F6',
  jsonb_build_array(
    jsonb_build_object(
      'name',    'Sarah Test',
      'role',    'Owner',
      'email',   'josh@getinthelimelight.com',  -- emails route to you
      'phone',   '555-0123',
      'primary', true
    )
  ),
  array['front_desk', 'quote_followup', 'review_engine']::text[],
  array['en']::text[],
  'pending'
)
on conflict (slug) do update set
  org_name             = excluded.org_name,
  status               = excluded.status,
  onboarding_stage     = excluded.onboarding_stage,
  stage_entered_at     = excluded.stage_entered_at,
  contacts             = excluded.contacts,        -- keep email pointed at you
  contract_status      = excluded.contract_status,
  contract_sent_at     = null,
  contract_signed_at   = null,
  contract_url         = null,
  payment_received_at  = null,
  welcome_sent_at      = null,                     -- so the "Send welcome" button reappears
  welcome_email_subject = null,
  welcome_email_body   = null,
  discovery_brief_sent_at    = null,
  discovery_brief_returned_at = null,
  discovery_brief_data = null,
  discovery_brief_token = null,
  kickoff_call_scheduled_at = null,
  kickoff_call_completed_at = null,
  voice_profile_built_at    = null,
  tenant_provisioned_at     = null,
  shadow_started_at         = null,
  live_started_at           = null;

-- Sanity check: should return one row with the right state.
select org_name, onboarding_stage, contract_status, stage_entered_at
from public.cs_customers
where slug = 'test-acme-hvac';
