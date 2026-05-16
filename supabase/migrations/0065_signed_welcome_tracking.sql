-- 0065: signed-welcome tracking on cs_customers
-- ---------------------------------------------------------------------------
-- The existing welcome_sent_at fields track the ACTIVATION email
-- (status='active', persona "I'm in" announcement to staff). This adds
-- parallel fields for the SIGNED-stage welcome — the warm "thanks for
-- saying yes, here's what happens next" email that fires the moment a
-- deal closes won. Separating the two lets us re-send either independently
-- without losing context.

ALTER TABLE cs_customers
  ADD COLUMN IF NOT EXISTS signed_welcome_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_welcome_subject text,
  ADD COLUMN IF NOT EXISTS signed_welcome_body text,
  ADD COLUMN IF NOT EXISTS signed_welcome_error text;

COMMENT ON COLUMN cs_customers.signed_welcome_sent_at IS
  'When the deal-won handoff fired its "thanks for saying yes" email. '
  'Null until the deal flips to closed_won and the handoff function runs.';
