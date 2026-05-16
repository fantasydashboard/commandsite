-- 0062: customer onboarding pipeline
-- ---------------------------------------------------------------------------
-- Augments cs_customers with the named-stage pipeline used by the Customers
-- admin page (kanban view). The existing `status` enum stays the source of
-- truth for "is this customer paying us right now"; `onboarding_stage` is
-- the finer-grained "where are they in the post-yes onboarding flow."
--
-- Pipeline stages (all sub-states of status='onboarding'):
--   signed       → verbal yes, contract / first email out, awaiting payment
--   paid         → Stripe webhook hit, ready for kickoff
--   discovery    → kickoff call done, Grace/Ada is interviewing them
--   provisioned  → tenant, theme, modules, OAuth — technical setup done
--   shadow       → Grace/Ada drafting only, staff reviewing before send
--   live         → drafts auto-sending; verified working for ~2 weeks
-- Then status flips → 'active' and onboarding_stage becomes null.
--
-- `stage_entered_at` lets the kanban show days-in-stage and surface stalled
-- accounts (yellow at 3 days, red at 7).
--
-- `last_customer_action_at` is the timestamp of the most recent automated
-- action the system did on their behalf (email drafted, response sent,
-- guest followed up, etc.). Drives the active-customer health pill.

ALTER TABLE cs_customers
  ADD COLUMN IF NOT EXISTS onboarding_stage text
    CHECK (onboarding_stage IS NULL OR onboarding_stage IN (
      'signed', 'paid', 'discovery', 'provisioned', 'shadow', 'live'
    )),
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_customer_action_at timestamptz;

COMMENT ON COLUMN cs_customers.onboarding_stage IS
  'Onboarding pipeline stage (kanban): signed → paid → discovery → '
  'provisioned → shadow → live. Null when status=''active''.';

COMMENT ON COLUMN cs_customers.stage_entered_at IS
  'When the customer entered the current onboarding_stage. Used by the '
  'kanban to show days-in-stage and surface stalled accounts.';

COMMENT ON COLUMN cs_customers.last_customer_action_at IS
  'Most recent automated action the system did on this customer''s '
  'behalf. Drives the active-customer health pill in the admin table.';

-- Backfill existing onboarding rows so they show up in the kanban
-- with a sensible starting stage. Best-guess mapping from the legacy
-- onboarding_step integer:
UPDATE cs_customers
SET
  onboarding_stage = CASE
    WHEN onboarding_step >= 6 THEN 'live'
    WHEN onboarding_step >= 4 THEN 'provisioned'
    WHEN onboarding_step >= 2 THEN 'discovery'
    WHEN signed_at IS NOT NULL THEN 'paid'
    ELSE 'signed'
  END,
  stage_entered_at = COALESCE(signed_at, created_at)
WHERE status = 'onboarding'
  AND onboarding_stage IS NULL;
