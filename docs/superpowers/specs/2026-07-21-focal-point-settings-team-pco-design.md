# Focal Point Settings: real Planning Center + team management + honest integrations

Date: 2026-07-21
Status: approved (design), pending spec review

## Goal

Turn the Focal Point (real client) Settings page from Cornerstone sample data
into a page that is honest and functional for a paying church, focused on three
things the user asked for:

1. **Planning Center integration working** — one real OAuth-driven connection, no
   contradictory fake card.
2. **Team + Permissions (real)** — an admin can adjust a user's permission level,
   invite a new user, and send a password-reset email.
3. **Integrations catalog** — keep showing the other tools, but as an aspirational
   "ask about adding" catalog rather than fake connections.

The Cornerstone public demo keeps its current rich sample data untouched (it is a
sales asset). All new behavior is gated to real churches via the existing
`PCO_CONNECT_CHURCHES` slug list in `CornerstoneSettingsModule.vue`.

## Non-goals (explicitly out of scope for this pass)

- Hard per-scope data enforcement (Finance sees giving, Comms sees messaging).
  Scope labels are stored + displayed + editable now; RLS/route enforcement of the
  finer scopes is a later pass.
- Wiring any integration other than Planning Center (email/SMS/social/Slack/giving
  are catalog-only "ask about adding").
- Service Times persistence and the Privacy toggles persistence (unchanged this pass).
- PCO end-to-end connectivity (that needs the 3 secrets + edge functions deployed
  per `docs/pco-oauth-setup.md` — a manual/config step, not code).

## Part A — Planning Center: one real integration

- The dedicated `PcoConnection.vue` panel remains the single Planning Center UI
  (it already does connect via OAuth, disconnect, and shows scopes / who authorized
  / last refresh). It is the source of truth for connection state.
- Remove the **fake** "Planning Center · connected" card from the integrations grid
  for real churches. In the grid's CHMS slot, render a **compact status chip** that
  reflects the real `pco_connections` state (Connected / Not connected) and links
  down to the `PcoConnection` panel. Exactly one real state, shown in two places
  that agree.
- "PC Services" (Planning Center Services) is folded into Planning Center — it is
  the same connection, not a separate integration.

## Part B — Team + Permissions (real)

### Permission model (security-critical)

- Church staff are ALWAYS `public.users.role = 'client'`, never platform `admin`.
  Platform `admin` sees every client across the whole product; handing it to a
  church staffer would leak all other clients. This must not happen.
- Add a new column `public.users.permission_scope` (text, nullable):
  `full` | `finance` | `comms` | `volunteers` | `pastoral_care` | `member`.
  - `full` = church admin (may manage team + settings for their church).
  - Others = scope labels, stored + displayed now, hard-enforced later.
- "Who may manage the team" (invite / change scope / reset) is enforced NOW:
  the actor must be a platform `admin` OR a `client` user of THIS tenant whose
  `permission_scope = 'full'`. Enforced server-side in the edge function.

### Team list

- Read `public.users` where `client_id` = this church: name/full_name, email, role,
  permission_scope. Render as the Team list (replacing sample data for real churches).
- Empty → "No team members yet" + Invite prompt.
- KPI strip "Team" count comes from this real list.

### Three actions

1. **Adjust permission level** — a per-row control to set `permission_scope`. Calls
   the edge function `church-user-admin` action `set-scope`. Admin-gated (see above).
2. **Invite user** — form (email + name + scope). Edge function `church-user-admin`
   action `invite`: calls `auth.admin.inviteUserByEmail(email, { redirectTo })`,
   then inserts the `public.users` row (`role='client'`, `client_id`, chosen
   `permission_scope`). Supabase sends the invite email. Idempotent-ish: if the
   email already exists, return a clear error.
3. **Send password reset** — per-row action. `supabase.auth.resetPasswordForEmail(
   email, { redirectTo })` from the browser (public method, no service role needed).

**Dependency:** both invite and reset emails redirect the user to a set-password /
update-password route. If the app has no such route today, the plan must add one
(e.g. `/set-password` that reads the recovery/invite token and calls
`supabase.auth.updateUser({ password })`). Verify during planning; do not assume it
exists.

### Edge function `church-user-admin`

- Service role. Auth: Bearer user JWT (verify_jwt=false; validates in-function).
- Authorizes the caller: platform admin OR full-scope client user for the target
  tenant. Rejects otherwise (403).
- Actions: `invite { tenant, email, name, scope }`, `set-scope { tenant, user_id, scope }`.
- Never returns tokens or other tenants' data.

### Schema migration

- `alter table public.users add column permission_scope text;` (nullable).
- Optional check constraint on the allowed values.
- No backfill required; existing rows read as `null` → shown as "Member".

## Part C — Integrations as an aspirational catalog

- Keep all tool cards visible for real churches, grouped by how they serve Grace.
- Each non-live tool shows a muted **"Ask about adding →"** affordance instead of a
  fake connection. Clicking opens a **prefilled email** to the CommandSite contact
  (mailto, subject/body naming the church + the requested integration). No new table.
- Planning Center is the only live/real one (Part A).

### Curated catalog (church-facing), grouped by Grace's jobs

- **Source of truth (live):** Planning Center (People, Check-Ins, Services, Groups).
- **How Grace's drafts go out (high-value next):** Email sender (Mailchimp / church
  email), SMS sender (Twilio). Catalog / ask-about-adding.
- **Staff coordination:** Slack (morning brief + escalations to a staff channel).
- **Outbound presence:** Instagram, Facebook (Grace drafts posts).
- **Giving (deliberately later, sensitive):** Tithe.ly / Planning Center Giving.
- **Low-priority / parked (kept in catalog, bottom):** ProPresenter, YouTube,
  Google Workspace.
- **Reframed:** Anthropic Claude is Grace's engine, not a church "connection" —
  shown as a quiet "Powered by Claude" line, not a connectable card.

## Components / files touched

- `supabase/migrations/00XX_users_permission_scope.sql` — new column.
- `supabase/functions/church-user-admin/index.ts` — new edge function.
- `src/lib/clients/church/team.ts` (new) — read team from `public.users`; helpers
  to invite / set-scope (calls edge fn) / reset (client-side).
- `src/components/cornerstone/TeamSettings.vue` (new) — real team list + actions,
  shown for real churches; demo keeps inline sample rendering.
- `src/components/cornerstone/IntegrationsCatalog.vue` (new or in-module) — the
  aspirational catalog with "Ask about adding" + the real Planning Center chip.
- `src/modules/CornerstoneSettingsModule.vue` — branch real-vs-demo per section;
  keep demo path intact.
- Permission-scope labels added alongside existing `PERMISSION_LABEL`.

## Success criteria

- On Focal Point's Settings: exactly one Planning Center state, driven by the real
  OAuth connection; no fake "connected" card.
- Team list reflects the church's real `public.users`; a full-scope/admin actor can
  change a user's scope, invite a new user (who receives an invite email), and send
  a password-reset email that arrives.
- A church staffer can never be granted platform-admin access.
- Non-live integrations show "Ask about adding" (prefilled email), never a fake
  connection.
- Cornerstone demo Settings is unchanged.
