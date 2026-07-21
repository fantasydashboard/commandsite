# Focal Point Settings: Planning Center + Team Management + Honest Integrations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Focal Point's Settings page real — one working Planning Center OAuth connection, real team management (adjust permission, invite, password reset), and an honest "ask about adding" integrations catalog — while leaving the Cornerstone demo untouched.

**Architecture:** Gate all new behavior to real churches via the existing `PCO_CONNECT_CHURCHES` slug list in `CornerstoneSettingsModule.vue`. Admin user-management operations (list/invite/set-scope) run through one service-role edge function `church-user-admin` (a church user can only read their own row under RLS, so listing must be server-side). Password reset uses Supabase's public `resetPasswordForEmail`. A new `/set-password` route handles the invite + recovery token landing. Frontend real-church sections are extracted into focused components so the demo path in `CornerstoneSettingsModule.vue` stays intact.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Pinia, Vue Router, Supabase (Auth + Postgres + RLS), Supabase Edge Functions (Deno), Tailwind (design tokens). Vercel deploy.

## Global Constraints

- Compose colors only through Tailwind design tokens (`bg-brand`, `text-ink`, `border-divider`, etc.). No hardcoded hex, no `#000`/`#fff`. (CLAUDE.md)
- No em dashes in UI labels/buttons/microcopy. Use commas/periods/parens. (user rule)
- Brand-register eyebrows use the full utility chain `text-[10px] font-semibold uppercase tracking-[0.18em] text-brand`; product surfaces may use the `eyebrow` class. This is a product surface — `eyebrow` class is fine.
- Church staff are ALWAYS `public.users.role = 'client'`, never platform `admin`. Platform admin sees every client; granting it to church staff leaks other clients. This is a hard security rule.
- No unit-test runner exists in this repo, and CLAUDE.md forbids fabricating test/lint scripts. Verification = `npm run typecheck` (filter to touched files; pre-existing `src/modules` Supabase-generic noise is not your error), `npm run build`, and manual browser verification on the Vite dev server.
- Edge functions cannot be `deno check`ed locally (no deno installed); they are validated at `supabase functions deploy`. Match the existing pattern in `supabase/functions/pco-oauth-start/index.ts` exactly (imports, CORS, auth).
- Commit after each task. Do NOT push to `main` or merge. Work on the current branch.
- `permission_scope` values reuse the existing enum from `src/lib/clients/cornerstone/settings.ts`: `full | pastoral_care | finance | volunteers | comms_only`, plus `member` for users with no scope set. `full` = church admin.

---

### Task 1: Add `permission_scope` column to `public.users`

**Files:**
- Create: `supabase/migrations/0082_users_permission_scope.sql`

**Interfaces:**
- Produces: `public.users.permission_scope text` (nullable), constrained to the allowed values or null. Read/written by Task 2's edge function.

- [ ] **Step 1: Write the migration**

```sql
-- Adds a church-level permission scope to users. This is DISTINCT from the
-- platform-level `role` (admin|client): every church staffer stays role='client';
-- permission_scope describes what they can do WITHIN their church. 'full' = church
-- admin (may manage the church's team + settings). Null reads as 'member'.
-- Hard per-scope data enforcement is a later pass; this column is managed + shown now.
alter table public.users
  add column if not exists permission_scope text
  check (permission_scope is null or permission_scope in
    ('full', 'pastoral_care', 'finance', 'volunteers', 'comms_only', 'member'));

comment on column public.users.permission_scope is
  'Church-level scope (full|pastoral_care|finance|volunteers|comms_only|member). NOT platform access; role stays client. full = church admin.';
```

- [ ] **Step 2: Apply locally/remotely**

Run: `supabase db push --linked`
Expected: applies `0082_users_permission_scope.sql`; no error. (If the user prefers to run DB changes themselves, hand them the SQL and mark this step done on their confirmation.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0082_users_permission_scope.sql
git commit -m "Add permission_scope column to public.users (church-level scope)"
```

---

### Task 2: `church-user-admin` edge function (list / invite / set-scope)

**Files:**
- Create: `supabase/functions/church-user-admin/index.ts`
- Modify: `supabase/config.toml` (register the function with `verify_jwt = false`, matching the pco-oauth-start entry)

**Interfaces:**
- Consumes: `public.users` (+ `permission_scope` from Task 1), `public.clients` (slug -> id).
- Produces: POST endpoint. Body `{ action, tenant, ... }`. Actions:
  - `list { tenant }` -> `{ members: Array<{ id, email, full_name, permission_scope, created_at }> }`
  - `invite { tenant, email, name, scope }` -> `{ ok: true, user_id }` (sends Supabase invite email)
  - `set-scope { tenant, user_id, scope }` -> `{ ok: true }`
  - Errors: `{ error: string }` with 400/401/403/409/500.
- Authorization (every action): caller must be platform `admin` OR a `client` user whose `client_id` maps to `tenant` AND `permission_scope = 'full'`. Uses the caller's JWT to identify them, service role for all reads/writes.

- [ ] **Step 1: Write the function**

```ts
// CommandSite church-user-admin Edge Function
// ---------------------------------------------------------------------------
// Server-gated team management for a church's Settings page. A church user can
// only read their OWN users row under RLS, so listing/managing the team must run
// service-side. Every action authorizes the caller as either a platform admin or
// a 'full'-scope client user of the target tenant. Church staff are never granted
// platform admin; they are role='client' with a permission_scope.
//
// Auth:   Bearer user JWT (verify_jwt=false; validated here). Service role bypasses.
// Body:   { action: 'list'|'invite'|'set-scope', tenant: string, ... }
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SCOPES = ['full', 'pastoral_care', 'finance', 'volunteers', 'comms_only', 'member']

function svc() { return createClient(SUPABASE_URL, SERVICE_ROLE_KEY) }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing Authorization' }, 401)

  let body: { action?: string; tenant?: string; email?: string; name?: string; scope?: string; user_id?: string } = {}
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  const action = body.action ?? ''
  const tenant = (body.tenant ?? '').trim()
  if (!tenant || !/^[a-z0-9][a-z0-9_-]*$/.test(tenant)) return json({ error: 'Valid tenant (church slug) required' }, 400)

  const db = svc()

  // Resolve tenant -> client_id
  const { data: clientRow } = await db.from('clients').select('id').eq('slug', tenant).maybeSingle()
  const clientId = (clientRow as { id?: string } | null)?.id
  if (!clientId) return json({ error: `Unknown tenant "${tenant}"` }, 404)

  // Identify + authorize caller (service role bypasses)
  const isServiceRole = token === SERVICE_ROLE_KEY
  if (!isServiceRole) {
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ error: 'Invalid auth token' }, 401)
    const { data: me } = await db.from('users').select('role, client_id, permission_scope').eq('id', userData.user.id).maybeSingle()
    const role = (me as { role?: string } | null)?.role
    const myClient = (me as { client_id?: string } | null)?.client_id
    const myScope = (me as { permission_scope?: string } | null)?.permission_scope
    const allowed = role === 'admin' || (role === 'client' && myClient === clientId && myScope === 'full')
    if (!allowed) return json({ error: 'You do not have permission to manage this church\'s team.' }, 403)
  }

  // ── list
  if (action === 'list') {
    const { data, error } = await db.from('users')
      .select('id, email, full_name, permission_scope, created_at')
      .eq('client_id', clientId).order('created_at', { ascending: true })
    if (error) return json({ error: error.message }, 500)
    return json({ members: data ?? [] })
  }

  // ── set-scope
  if (action === 'set-scope') {
    const userId = (body.user_id ?? '').trim()
    const scope = (body.scope ?? '').trim()
    if (!userId || !SCOPES.includes(scope)) return json({ error: 'user_id and a valid scope required' }, 400)
    // Only touch a user who belongs to this tenant.
    const { data: target } = await db.from('users').select('id, client_id, role').eq('id', userId).maybeSingle()
    const t = target as { client_id?: string; role?: string } | null
    if (!t || t.client_id !== clientId) return json({ error: 'User not found in this church' }, 404)
    if (t.role !== 'client') return json({ error: 'Cannot change scope of a non-client user' }, 400)
    const { error } = await db.from('users').update({ permission_scope: scope }).eq('id', userId)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // ── invite
  if (action === 'invite') {
    const email = (body.email ?? '').trim().toLowerCase()
    const name = (body.name ?? '').trim()
    const scope = (body.scope ?? 'member').trim()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'A valid email is required' }, 400)
    if (!SCOPES.includes(scope)) return json({ error: 'Invalid scope' }, 400)

    const redirectTo = `${new URL(req.url).origin.replace(/\/functions\/v1.*$/, '')}` // placeholder; overridden below
    const siteRedirect = `${SUPABASE_URL.replace('.supabase.co', '')}` // not used; see note
    // Invite via Supabase Auth (creates auth user + emails an invite link).
    const { data: invited, error: inviteErr } = await db.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${Deno.env.get('APP_URL') ?? 'https://commandsite.io'}/set-password`,
      data: { full_name: name },
    })
    if (inviteErr) {
      const msg = inviteErr.message || 'Invite failed'
      const status = /already been registered|already exists/i.test(msg) ? 409 : 500
      return json({ error: msg }, status)
    }
    const newId = invited?.user?.id
    if (!newId) return json({ error: 'Invite returned no user id' }, 500)
    // Create the public.users row (role=client, tied to this church).
    const { error: rowErr } = await db.from('users').insert({
      id: newId, email, full_name: name || null, role: 'client', client_id: clientId, permission_scope: scope,
    })
    if (rowErr) return json({ error: `Invited but profile insert failed: ${rowErr.message}` }, 500)
    return json({ ok: true, user_id: newId })
  }

  return json({ error: `Unknown action "${action}"` }, 400)
})
```

> Note for implementer: delete the two unused `redirectTo`/`siteRedirect` scratch lines above — the real redirect is the `inviteUserByEmail` `redirectTo` using `APP_URL` (add `APP_URL=https://commandsite.io` as an edge secret, or it defaults to commandsite.io). Keep the function tidy; those two lines are illustrative of the wrong approach and must not ship.

- [ ] **Step 2: Register in config.toml**

Add after the existing `[functions.pco-oauth-start]` block in `supabase/config.toml`:

```toml
[functions.church-user-admin]
verify_jwt = false
```

- [ ] **Step 3: Deploy (or hand to user)**

Run: `supabase functions deploy church-user-admin`
Expected: deploy succeeds (this is where Deno type/bundle validation happens). If the user handles deploys, mark done on their confirmation.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/church-user-admin/index.ts supabase/config.toml
git commit -m "Add church-user-admin edge function (list/invite/set-scope, admin-gated)"
```

---

### Task 3: `/set-password` route + page (invite + recovery landing)

**Files:**
- Create: `src/pages/SetPasswordPage.vue`
- Modify: `src/router/index.ts` (add the public route)

**Interfaces:**
- Produces: route `{ path: '/set-password', name: 'set-password', meta: { public: true } }`. Handles the Supabase recovery/invite session (Supabase sets a session from the URL hash), lets the user set a password via `supabase.auth.updateUser({ password })`, then routes to their dashboard.

- [ ] **Step 1: Add the route**

In `src/router/index.ts`, add to the routes array (near the `/login` entry). Mark it `public` so the guard (`to.matched.some(r => r.meta.public === true)`) lets it through:

```ts
  {
    path: '/set-password',
    name: 'set-password',
    component: () => import('@/pages/SetPasswordPage.vue'),
    meta: { public: true },
  },
```

Verify the `/login` route (or another public route) already uses `meta: { public: true }`; if the guard uses a different mechanism, match it. (The guard at `router:157` checks `r.meta.public === true`.)

- [ ] **Step 2: Write the page**

```vue
<script setup lang="ts">
/**
 * Set-password landing for Supabase invite + password-recovery links. Supabase
 * parses the URL hash and establishes a session on load; we then let the user set
 * a password and send them to their dashboard (or /login if no session).
 */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const ready = ref(false)
const hasSession = ref(false)
const password = ref('')
const confirm = ref('')
const error = ref<string | null>(null)
const saving = ref(false)

onMounted(async () => {
  // Supabase auto-detects the session from the URL hash. Give it a tick, then check.
  const { data } = await supabase.auth.getSession()
  hasSession.value = !!data.session
  ready.value = true
})

async function submit() {
  error.value = null
  if (password.value.length < 8) { error.value = 'Use at least 8 characters.'; return }
  if (password.value !== confirm.value) { error.value = 'Passwords do not match.'; return }
  saving.value = true
  try {
    const { error: err } = await supabase.auth.updateUser({ password: password.value })
    if (err) { error.value = err.message; return }
    await auth.init()
    router.replace(auth.redirectPath)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-elevated px-4">
    <div class="w-full max-w-sm card">
      <h1 class="text-lg font-semibold text-ink">Set your password</h1>
      <p v-if="ready && !hasSession" class="mt-2 text-sm text-ink-muted">
        This link is expired or already used. <RouterLink to="/login" class="text-brand hover:underline">Go to sign in</RouterLink>.
      </p>
      <form v-else-if="ready" class="mt-4 space-y-3" @submit.prevent="submit">
        <input v-model="password" type="password" placeholder="New password" autocomplete="new-password"
          class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
        <input v-model="confirm" type="password" placeholder="Confirm password" autocomplete="new-password"
          class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
        <p v-if="error" class="text-xs text-danger">{{ error }}</p>
        <button type="submit" :disabled="saving"
          class="w-full rounded-md bg-brand text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:opacity-90">
          {{ saving ? 'Saving...' : 'Set password' }}
        </button>
      </form>
      <p v-else class="mt-2 text-sm text-ink-muted">Loading...</p>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck 2>&1 | grep -iE "SetPasswordPage|router/index" || echo clean`
Expected: `clean` (no new errors). Confirm `auth.redirectPath` and `auth.init` exist in `src/stores/auth.ts` (they do — used by LoginPage).

- [ ] **Step 4: Commit**

```bash
git add src/pages/SetPasswordPage.vue src/router/index.ts
git commit -m "Add /set-password route for invite + recovery links"
```

---

### Task 4: Church team lib (`src/lib/clients/church/team.ts`)

**Files:**
- Create: `src/lib/clients/church/team.ts`

**Interfaces:**
- Consumes: `supabase` client; the `church-user-admin` edge function (Task 2); `resetPasswordForEmail`.
- Produces:
  - `interface ChurchTeamMember { id: string; email: string; full_name: string | null; permission_scope: string | null; created_at: string }`
  - `PERMISSION_SCOPES: { key: string; label: string }[]` (full, pastoral_care, finance, volunteers, comms_only, member)
  - `scopeLabel(scope: string | null): string`
  - `listTeam(tenant: string): Promise<ChurchTeamMember[]>`
  - `inviteMember(tenant, email, name, scope): Promise<void>`
  - `setScope(tenant, userId, scope): Promise<void>`
  - `sendReset(email: string): Promise<void>`

- [ ] **Step 1: Write the lib**

```ts
// Real church team management. All admin ops go through the church-user-admin
// edge function (a church user can only read their own users row under RLS).
// Password reset uses Supabase's public reset flow directly.
import { supabase } from '@/lib/supabase'

export interface ChurchTeamMember {
  id: string
  email: string
  full_name: string | null
  permission_scope: string | null
  created_at: string
}

export const PERMISSION_SCOPES: { key: string; label: string }[] = [
  { key: 'full', label: 'Full access (church admin)' },
  { key: 'pastoral_care', label: 'Pastoral care' },
  { key: 'finance', label: 'Finance' },
  { key: 'volunteers', label: 'Volunteers' },
  { key: 'comms_only', label: 'Comms only' },
  { key: 'member', label: 'Member' },
]

export function scopeLabel(scope: string | null): string {
  return PERMISSION_SCOPES.find((s) => s.key === scope)?.label ?? 'Member'
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('church-user-admin', { body })
  if (error) throw new Error(error.message ?? 'Request failed')
  const res = data as { error?: string } & T
  if (res?.error) throw new Error(res.error)
  return res
}

export async function listTeam(tenant: string): Promise<ChurchTeamMember[]> {
  const res = await invoke<{ members: ChurchTeamMember[] }>({ action: 'list', tenant })
  return res.members ?? []
}

export async function inviteMember(tenant: string, email: string, name: string, scope: string): Promise<void> {
  await invoke({ action: 'invite', tenant, email, name, scope })
}

export async function setScope(tenant: string, userId: string, scope: string): Promise<void> {
  await invoke({ action: 'set-scope', tenant, user_id: userId, scope })
}

export async function sendReset(email: string): Promise<void> {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://commandsite.io'
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/set-password` })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck 2>&1 | grep -i "church/team" || echo clean`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/clients/church/team.ts
git commit -m "Add church team lib (list/invite/set-scope/reset)"
```

---

### Task 5: `TeamSettings.vue` — real team list + actions

**Files:**
- Create: `src/components/cornerstone/TeamSettings.vue`

**Interfaces:**
- Consumes: Task 4 lib (`listTeam`, `inviteMember`, `setScope`, `sendReset`, `scopeLabel`, `PERMISSION_SCOPES`, `ChurchTeamMember`). Props `{ tenant: string }`.
- Produces: a self-contained team-management card. Emits nothing; manages its own state.

- [ ] **Step 1: Write the component**

Follow the visual pattern of the existing Team section in `CornerstoneSettingsModule.vue:118-155` (avatar initials, name/email, scope pill, `card`/`eyebrow`/token classes). Script:

```vue
<script setup lang="ts">
/**
 * Real team management for a live church (Focal Point). Reads the church's actual
 * CommandSite users via the church-user-admin edge function and lets an admin
 * adjust scope, invite, and send a password reset. Gated to real churches by the
 * parent module; the Cornerstone demo keeps its inline sample rendering.
 */
import { onMounted, ref } from 'vue'
import { listTeam, inviteMember, setScope, sendReset, scopeLabel, PERMISSION_SCOPES, type ChurchTeamMember } from '@/lib/clients/church/team'

const props = defineProps<{ tenant: string }>()

const members = ref<ChurchTeamMember[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const showInvite = ref(false)
const inviteEmail = ref('')
const inviteName = ref('')
const inviteScope = ref('member')
const working = ref(false)

async function refresh() {
  loading.value = true; error.value = null
  try { members.value = await listTeam(props.tenant) }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { loading.value = false }
}

async function changeScope(m: ChurchTeamMember, scope: string) {
  const prev = m.permission_scope
  m.permission_scope = scope
  try { await setScope(props.tenant, m.id, scope); flash(`Updated ${m.email}`) }
  catch (e) { m.permission_scope = prev; error.value = e instanceof Error ? e.message : String(e) }
}

async function submitInvite() {
  working.value = true; error.value = null
  try {
    await inviteMember(props.tenant, inviteEmail.value.trim(), inviteName.value.trim(), inviteScope.value)
    flash(`Invite sent to ${inviteEmail.value.trim()}`)
    inviteEmail.value = ''; inviteName.value = ''; inviteScope.value = 'member'; showInvite.value = false
    await refresh()
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { working.value = false }
}

async function reset(m: ChurchTeamMember) {
  try { await sendReset(m.email); flash(`Password reset sent to ${m.email}`) }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}

function flash(msg: string) { notice.value = msg; setTimeout(() => { notice.value = null }, 4000) }
function initials(m: ChurchTeamMember) { return (m.full_name || m.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') }

onMounted(refresh)
</script>
```

Template (key structure — full token-based styling, matching the existing Team section):

```vue
<template>
  <section class="card">
    <div class="mb-3 flex items-center justify-between">
      <span class="eyebrow">Team + Permissions</span>
      <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand" @click="showInvite = !showInvite">+ Invite</button>
    </div>

    <p v-if="notice" class="mb-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">{{ notice }}</p>
    <p v-if="error" class="mb-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">{{ error }}</p>

    <div v-if="showInvite" class="mb-3 rounded-md border border-divider p-3 space-y-2">
      <div class="flex flex-wrap gap-2">
        <input v-model="inviteEmail" type="email" placeholder="email@church.org" class="flex-1 min-w-[200px] rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm" />
        <input v-model="inviteName" type="text" placeholder="Full name" class="flex-1 min-w-[160px] rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm" />
        <select v-model="inviteScope" class="rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm">
          <option v-for="s in PERMISSION_SCOPES" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
        <button type="button" class="rounded-md bg-brand text-white px-4 py-1.5 text-sm font-semibold disabled:opacity-50" :disabled="working || !inviteEmail" @click="submitInvite">{{ working ? 'Sending...' : 'Send invite' }}</button>
      </div>
      <p class="text-[11px] text-ink-disabled">They get an email to set a password. New members join as role client, scoped to this church.</p>
    </div>

    <div v-if="loading" class="rounded-md border border-divider p-4 text-xs text-ink-muted">Loading team...</div>
    <div v-else-if="!members.length" class="rounded-md border border-divider p-4 text-sm text-ink-muted">No team members yet. Use Invite to add your first staff login.</div>
    <div v-else class="space-y-2">
      <article v-for="m in members" :key="m.id" class="flex flex-wrap items-center gap-3 rounded-md border border-divider p-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-brand text-sm font-bold">{{ initials(m) }}</div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold text-ink">{{ m.full_name || m.email }}</div>
          <div class="text-[11px] text-ink-muted">{{ m.email }}</div>
        </div>
        <select :value="m.permission_scope ?? 'member'" @change="changeScope(m, ($event.target as HTMLSelectElement).value)"
          class="rounded-md border border-divider bg-surface-raised px-2 py-1 text-xs text-ink">
          <option v-for="s in PERMISSION_SCOPES" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
        <button type="button" class="text-xs text-ink-muted hover:text-brand hover:underline" @click="reset(m)">Send reset</button>
      </article>
    </div>
  </section>
</template>
```

- [ ] **Step 2: Verify (typecheck)**

Run: `npm run typecheck 2>&1 | grep -i "TeamSettings" || echo clean`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/components/cornerstone/TeamSettings.vue
git commit -m "Add TeamSettings component (real team list + invite/scope/reset)"
```

---

### Task 6: Real-church integrations catalog + Planning Center chip

**Files:**
- Create: `src/lib/clients/church/integrationsCatalog.ts`
- Create: `src/components/cornerstone/IntegrationsCatalog.vue`

**Interfaces:**
- Consumes: `getPcoConnection` from `@/lib/pco/connect` (real PCO state); the catalog data. Props `{ tenant: string; label: string }`.
- Produces: the aspirational integrations grid. Planning Center row reflects real connection state (chip) and links to the `PcoConnection` panel below (via an anchor id). Every other tool shows "Ask about adding" (prefilled mailto).

- [ ] **Step 1: Write the catalog data**

```ts
// Church-facing integrations catalog, curated to how Grace actually works.
// Planning Center is the only LIVE integration; everything else is aspirational
// ("ask about adding"). No fake "connected" states on a real client.
export interface CatalogItem {
  key: string
  label: string
  category: string        // display group
  description: string
  live?: boolean          // true only for Planning Center (state comes from OAuth)
  note?: string           // e.g. sensitivity / roadmap note
}

export const INTEGRATION_GROUPS: { key: string; label: string }[] = [
  { key: 'chms', label: 'Source of truth' },
  { key: 'comms', label: 'How Grace reaches people' },
  { key: 'coordination', label: 'Staff coordination' },
  { key: 'social', label: 'Outbound presence' },
  { key: 'giving', label: 'Giving' },
  { key: 'other', label: 'More on the roadmap' },
]

export const CATALOG: CatalogItem[] = [
  { key: 'planning_center', label: 'Planning Center', category: 'chms', description: 'People, Check-Ins, Services, Groups. The church\'s source of truth.', live: true },
  { key: 'email', label: 'Email sending', category: 'comms', description: 'Send Grace\'s drafted welcome + care emails from your church address.' },
  { key: 'sms', label: 'Text messaging', category: 'comms', description: 'Send opt-in texts to guests and volunteers.' },
  { key: 'slack', label: 'Slack', category: 'coordination', description: 'Grace posts the morning brief and escalations to a staff channel.' },
  { key: 'instagram', label: 'Instagram', category: 'social', description: 'Grace drafts Sunday + event posts.' },
  { key: 'facebook', label: 'Facebook', category: 'social', description: 'Long-form posts and sermon clips.' },
  { key: 'giving', label: 'Giving (Tithe.ly / Planning Center)', category: 'giving', description: 'Aggregate giving trends, handled carefully.', note: 'Sensitive. We turn this on deliberately, with your privacy rules.' },
  { key: 'propresenter', label: 'ProPresenter', category: 'other', description: 'Sunday slides and lyrics.' },
  { key: 'youtube', label: 'YouTube', category: 'other', description: 'Sermon livestream and archive.' },
  { key: 'google_workspace', label: 'Google Workspace', category: 'other', description: 'Staff calendar and shared docs.' },
]

export function askEmailHref(churchLabel: string, item: CatalogItem): string {
  const subject = encodeURIComponent(`Integration request: ${item.label} (${churchLabel})`)
  const bodyText = `Hi, we'd like to explore adding the ${item.label} integration for ${churchLabel}.`
  const body = encodeURIComponent(bodyText)
  return `mailto:josh@commandsite.io?subject=${subject}&body=${body}`
}
```

- [ ] **Step 2: Write the component**

Group `CATALOG` by `category` in `INTEGRATION_GROUPS` order. For `live` items, load real state via `getPcoConnection(tenant)` on mount and show a chip: connected -> `bg-success/15 text-success "Connected"`, else `bg-surface-elevated text-ink-muted "Not connected"`, plus an anchor link `#planning-center` to the panel. For non-live items, render "Ask about adding" as `<a :href="askEmailHref(label, item)">`. Reuse the card/token styling from `CornerstoneSettingsModule.vue:200-224`. Include an "AI · Powered by Claude" quiet footer line (not a card). Full script:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CATALOG, INTEGRATION_GROUPS, askEmailHref, type CatalogItem } from '@/lib/clients/church/integrationsCatalog'
import { getPcoConnection } from '@/lib/pco/connect'

const props = defineProps<{ tenant: string; label: string }>()
const pcoConnected = ref(false)

const groups = computed(() =>
  INTEGRATION_GROUPS
    .map((g) => ({ ...g, items: CATALOG.filter((c) => c.category === g.key) }))
    .filter((g) => g.items.length),
)

onMounted(async () => { pcoConnected.value = !!(await getPcoConnection(props.tenant)) })
function href(item: CatalogItem) { return askEmailHref(props.label, item) }
</script>

<template>
  <section class="card">
    <div class="mb-3 flex items-center gap-2">
      <span class="eyebrow">Integrations</span>
      <span class="text-xs text-ink-muted">Planning Center is live. Ask us about the rest.</span>
    </div>
    <div class="space-y-4">
      <div v-for="g in groups" :key="g.key">
        <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mb-2">{{ g.label }}</div>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div v-for="i in g.items" :key="i.key" class="flex items-start gap-3 rounded-md border border-divider bg-surface p-3">
            <span class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
              :class="i.live && pcoConnected ? 'bg-success/15 text-success' : 'bg-surface-elevated text-ink-disabled'">{{ i.live && pcoConnected ? '✓' : '·' }}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-semibold text-ink">{{ i.label }}</span>
                <a v-if="i.live" href="#planning-center" class="text-xs font-medium hover:underline"
                  :class="pcoConnected ? 'text-success' : 'text-brand'">{{ pcoConnected ? 'Connected' : 'Set up below' }}</a>
                <a v-else :href="href(i)" class="text-xs font-medium text-brand hover:underline">Ask about adding →</a>
              </div>
              <div class="text-xs text-ink-muted">{{ i.description }}</div>
              <div v-if="i.note" class="mt-1 text-[11px] text-ink-disabled">{{ i.note }}</div>
            </div>
          </div>
        </div>
      </div>
      <p class="text-[11px] text-ink-disabled">Grace is powered by Anthropic Claude.</p>
    </div>
  </section>
</template>
```

- [ ] **Step 3: Verify (typecheck)**

Run: `npm run typecheck 2>&1 | grep -iE "IntegrationsCatalog|integrationsCatalog" || echo clean`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/clients/church/integrationsCatalog.ts src/components/cornerstone/IntegrationsCatalog.vue
git commit -m "Add real-church integrations catalog (ask-about-adding + live PCO chip)"
```

---

### Task 7: Wire the Settings module (branch real-vs-demo) + PCO anchor

**Files:**
- Modify: `src/modules/CornerstoneSettingsModule.vue`

**Interfaces:**
- Consumes: `TeamSettings.vue` (Task 5), `IntegrationsCatalog.vue` (Task 6), existing `showPcoConnect`/`PCO_CONNECT_CHURCHES`.
- Produces: for real churches, render `TeamSettings` instead of the sample Team section, `IntegrationsCatalog` instead of the sample integrations grid, and give `PcoConnection` an `id="planning-center"` anchor. Demo path unchanged.

- [ ] **Step 1: Import + reuse the real-church flag**

In `<script setup>`, add imports and reuse `showPcoConnect` as the real-church signal (rename intent, same list):

```ts
import TeamSettings from '@/components/cornerstone/TeamSettings.vue'
import IntegrationsCatalog from '@/components/cornerstone/IntegrationsCatalog.vue'
// showPcoConnect (PCO_CONNECT_CHURCHES) already marks "real church". Reuse it:
const isRealChurch = showPcoConnect
```

- [ ] **Step 2: Branch the Team section**

Replace the Team `<section>` (`CornerstoneSettingsModule.vue:118-155`) with a conditional:

```vue
    <!-- Team: real for live churches, sample for the demo -->
    <TeamSettings v-if="isRealChurch" :tenant="client.slug" />
    <section v-else class="card">
      <!-- ...existing sample Team section markup unchanged... -->
    </section>
```

(Keep the entire existing sample `<section>` as the `v-else`.)

- [ ] **Step 3: Branch the Integrations section**

Replace the Integrations `<section>` (`CornerstoneSettingsModule.vue:186-227`) similarly:

```vue
    <IntegrationsCatalog v-if="isRealChurch" :tenant="client.slug" :label="client.name" />
    <section v-else class="card">
      <!-- ...existing sample Integrations grid unchanged... -->
    </section>
```

- [ ] **Step 4: Anchor the PcoConnection panel**

Wrap the existing `<PcoConnection>` with an anchor target so the catalog "Set up below / Connected" link scrolls to it:

```vue
    <div id="planning-center">
      <PcoConnection v-if="showPcoConnect" :tenant="client.slug" :label="client.name" />
    </div>
```

- [ ] **Step 5: Fix the KPI strip for real churches**

The `stats` KPIs (`CornerstoneSettingsModule.vue:91-116`) come from sample `settingsStats()`. For real churches those numbers lie. Simplest honest fix: hide the Team and Integrations KPI tiles for real churches (keep Service times + Privacy which are still sample/unchanged), OR compute Team from the real list. Minimal approach — hide the two now-real tiles for real churches:

```vue
      <div v-if="!isRealChurch" class="card"><!-- Team KPI (sample) --></div>
      <div v-if="!isRealChurch" class="card"><!-- Integrations KPI (sample) --></div>
```

Leave Service times + Privacy KPI tiles as-is. (A later pass can compute real counts.)

- [ ] **Step 6: Verify (browser)**

Run the dev server against real data and confirm both paths render with no console errors:

```bash
VITE_SUPABASE_URL=$(grep VITE_SUPABASE_URL .env | cut -d= -f2) VITE_SUPABASE_ANON_KEY=$(grep VITE_SUPABASE_ANON_KEY .env | cut -d= -f2) npm run dev
```

Temporarily add `focal-point-church` to `PUBLIC_DEMO_SLUGS` in `src/router/index.ts` for local viewing ONLY (revert before commit — it must not ship). Load `/dashboard/focal-point-church/settings`:
- Team section shows real users (or "No team members yet") — not `@cornerstonecc.com` sample.
- Integrations shows the catalog with "Ask about adding" links + Planning Center chip.
- `/dashboard/cornerstone-church/settings` (demo) is unchanged (sample data intact).
Then revert the `PUBLIC_DEMO_SLUGS` change.

Also run: `npm run typecheck 2>&1 | grep -i "CornerstoneSettingsModule" || echo clean` (expect `clean`) and `npm run build` (expect success).

- [ ] **Step 7: Commit**

```bash
git add src/modules/CornerstoneSettingsModule.vue
git commit -m "Settings: real Team + integrations catalog for live churches; PCO anchor"
```

---

## Self-Review

**Spec coverage:**
- Part A (Planning Center one real integration): Task 6 (catalog chip + removes fake card by replacing the sample grid) + Task 7 (anchor). Fake "Planning Center connected" card is gone for real churches because the whole sample grid is replaced by `IntegrationsCatalog`. ✓
- Part B (team: adjust permission, invite, reset; permission model; edge function; migration; set-password dependency): Tasks 1, 2, 3, 4, 5, 7. ✓
- Part C (aspirational catalog, curated list, Claude reframed, ask-about-adding = mailto): Task 6. ✓
- Security rule (church staff never platform admin): enforced in Task 2 (invite inserts `role='client'`; set-scope rejects non-client) and stated in Task 1 comment. ✓
- Non-goals respected: no finer per-scope enforcement, no non-PCO wiring, service-times/privacy untouched. ✓

**Placeholder scan:** Task 2 contains two intentionally-illustrative scratch lines (`redirectTo`/`siteRedirect`) with an explicit instruction to delete them — flagged, not shipped. No other TODO/TBD. The migration number `0082` is confirmed next (latest is 0081).

**Type consistency:** `permission_scope` values identical across Task 1 (SQL check), Task 2 (`SCOPES`), Task 4 (`PERMISSION_SCOPES`). `ChurchTeamMember` shape from Task 4 matches Task 2's `list` return and Task 5's usage. `getPcoConnection(tenant)` returns `PcoConnectionStatus | null`; Task 6 coerces with `!!`. `askEmailHref(label, item)` signature consistent between lib and component.

**Open dependency:** Task 2 references an optional `APP_URL` edge secret (defaults to `https://commandsite.io`) for the invite redirect. If not set, the default is correct for production. Note in execution.
