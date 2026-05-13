-- CommandSite · Gmail OAuth for direct-send
-- ---------------------------------------------------------------------------
-- Stores the refresh token + connected account info so the gmail-send
-- edge function can mint short-lived access tokens on demand and POST
-- to Gmail's API. The OAuth client ID / secret stay in Supabase
-- secrets (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET) — not
-- in this table — because they're per-deployment, not per-user.
--
-- One refresh token per cs_settings row (singleton), so this is just
-- three more columns rather than a separate connections table. Easy
-- to revoke: set gmail_refresh_token = null.

alter table public.cs_settings
  add column if not exists gmail_refresh_token  text,
  add column if not exists gmail_account_email  text,
  add column if not exists gmail_connected_at   timestamptz;
