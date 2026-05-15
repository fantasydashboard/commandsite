-- 0055: surface NeverBounce verification status per lead + unblock stuck rows
-- ----------------------------------------------------------------------------
-- Context: the old enrich-lead-emails policy threw away any email that
-- NeverBounce couldn't confirm as `valid`. That silently dropped most Gmail
-- and small-business addresses (NB returns `unknown` for those because
-- Google's SMTP doesn't reveal whether individual accounts exist). Tag
-- `email_unverifiable` was set instead of saving the address.
--
-- New policy in the edge function: save what we found, store the
-- verification status in a new column, surface as a badge in the UI.
-- Only `invalid` / `disposable` results get dropped — those are
-- confirmed bad.
--
-- This migration adds the column and clears the rejection tags from leads
-- that have no contact_email so they become eligible for re-enrichment
-- under the new policy.

ALTER TABLE cs_leads
  ADD COLUMN IF NOT EXISTS email_verification_status text;

-- Document the allowed values for human readers (no enum constraint so we
-- can evolve without migration overhead).
COMMENT ON COLUMN cs_leads.email_verification_status IS
  'Last verification verdict for contact_email. One of: valid (NB confirmed), '
  'catchall (NB couldn''t test individual address), unknown (NB indeterminate), '
  'unverified (NB unavailable / not run), invalid (NB confirmed bad — should not '
  'appear since we no longer save invalids), null (no email saved or never run).';

-- One-time cleanup: re-eligible leads that the old strict policy stranded.
-- We strip the rejection tags from leads that still have no contact_email
-- so the "Find Emails" button picks them up again. We keep `email_invalid`
-- on rows where NB confirmed bad — re-running won't change that outcome.
UPDATE cs_leads
SET tags = COALESCE(
  (
    SELECT array_agg(t ORDER BY t)
    FROM unnest(tags) AS t
    WHERE t NOT IN (
      'email_not_found',
      'email_fetch_error',
      'email_unverifiable',
      'email_unverified',
      'email_catch_all'
    )
  ),
  ARRAY[]::text[]
)
WHERE contact_email IS NULL
  AND status NOT IN ('replied', 'disqualified', 'archived', 'promoted_to_pipeline')
  AND tags && ARRAY['email_not_found', 'email_fetch_error', 'email_unverifiable', 'email_unverified', 'email_catch_all'];
