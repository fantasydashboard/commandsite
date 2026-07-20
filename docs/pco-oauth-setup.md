# Planning Center OAuth: go-live runbook

Replaces the single Personal Access Token (PCO_PAT in .env.local) with per-church
OAuth. Each church authorizes CommandSite on Planning Center's own consent screen;
we store one encrypted token pair per church in `pco_connections`. You are never an
admin on the church's PCO account, and onboarding becomes a button.

Everything below is a step only you can run (external registration + secrets +
deploy). The code is already written and committed on `focal-point-grace-build`.

## What already exists in the repo

- `supabase/migrations/0081_pco_connections.sql` - per-church encrypted token store (RLS: admin + service role only)
- `supabase/functions/_shared/crypto.ts` - AES-256-GCM encrypt/decrypt (key = `TOKEN_ENC_KEY`)
- `supabase/functions/_shared/pco-auth.ts` - `getPcoAccessToken(tenant)` / `pcoFetch(tenant, path)` with refresh-token rotation
- `supabase/functions/pco-oauth-start/` - returns the PCO consent URL (admin only)
- `supabase/functions/pco-oauth-callback/` - exchanges the code, encrypts, upserts the row
- `src/lib/pco/connect.ts` + `PcoConnection.vue` - Settings UI (connect / disconnect / status)

## Step 1 - Register the OAuth app on Planning Center

1. Go to https://api.planningcenteronline.com/oauth/applications
2. Click "New Application" (the OAuth Applications section, NOT the Personal Access Tokens tab)
3. Fill in:
   - Name: `CommandSite` (or `Grace by CommandSite`)
   - Redirect URI: `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/pco-oauth-callback`
     (this must match `<SUPABASE_URL>/functions/v1/pco-oauth-callback` exactly)
4. Save. Copy the **Client ID** and **Client Secret**.

Note: the redirect URI is exact-match. If your Supabase URL changes, update it here too.

## Step 2 - Set the three Edge Function secrets

Generate the encryption key first:

    openssl rand -base64 32

Then set all three (Supabase CLI, linked project):

    supabase secrets set PCO_OAUTH_CLIENT_ID=<client id from step 1>
    supabase secrets set PCO_OAUTH_CLIENT_SECRET=<client secret from step 1>
    supabase secrets set TOKEN_ENC_KEY=<the openssl output>

`TOKEN_ENC_KEY` is load-bearing: if it is ever lost or rotated, every stored token
becomes unreadable and each church has to reconnect. Keep a copy somewhere safe
(password manager), out of git.

## Step 3 - Run the migration

    supabase db push --linked

Confirms `public.pco_connections` exists with RLS enabled.

## Step 4 - Deploy the functions

    supabase functions deploy pco-oauth-start
    supabase functions deploy pco-oauth-callback
    supabase functions deploy pco-proxy

(`pco-proxy` is redeployed because it now also resolves a connected church's token
server-side, so the admin sandbox can run calls as a tenant with no PAT.)

## Step 5 - Connect Focal Point

The connect flow is self-serve: either you (admin, any church) OR the church's own
admin user (their own church only) can start it from Settings. The gate is enforced
in `pco-oauth-start` - a client user can never target another church's slug.

1. Open the Focal Point dashboard Settings (the Planning Center connection card).
2. Click "Connect Planning Center".
3. On PCO's consent screen, a staffer with BROAD Planning Center access (Org
   Administrator, or full People / Check-Ins / Services / Groups access) logs in and
   approves. The token is scoped to that person's permissions, so a low-permission
   approver means Grace sees less. Pick the right person to click Authorize.
4. The callback tab shows "connected" and closes. A `pco_connections` row now exists
   for `tenant_key = 'focal-point-church'`, and the Settings card flips to connected.

To onboard a new church later, add its slug to `PCO_CONNECT_CHURCHES` in
`CornerstoneSettingsModule.vue` so the connection card appears on its Settings.

## Step 6 - Verify (no PAT needed)

Go to `/admin/pco-test`, switch the auth mode to "Connected church", enter the slug
`focal-point-church`, and run the Connection check (`GET /people/v2/me`). A 200 with
the church's account confirms the OAuth store is live and rotating tokens on its own.

## Scopes granted

The consent request asks for `people check_ins services groups`. It deliberately
does NOT request `giving` until giving is actually built, so the highest-sensitivity
data never sits in the token store before it is needed. To add a scope later, widen
`DEFAULT_SCOPE` in `pco-oauth-start` and have the church reconnect.

## Still on the PAT (follow-ups, not blockers)

- `scripts/pull-focal-point.mjs` and the other `scripts/pull-*.mjs` bulk-pull scripts
  still read `PCO_PAT` from `.env.local`. They run locally on your machine and feed the
  baked dashboard data, so they are not user-facing. Migrate them to the OAuth path
  (call `pco-proxy` with `{ tenant, path }`, service-role auth) when convenient.
- The OAuth `state` nonce is not yet stored server-side. The exchange still requires our
  client secret, but a full nonce round-trip is a CSRF hardening follow-up.
