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
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL (optional, defaults commandsite.io)

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
const APP_URL = Deno.env.get('APP_URL') ?? 'https://commandsite.io'
const SCOPES = ['full', 'pastoral_care', 'finance', 'volunteers', 'comms_only', 'member']
const CONGREGATIONS = ['all', 'english', 'brazilian']

function svc() { return createClient(SUPABASE_URL, SERVICE_ROLE_KEY) }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing Authorization' }, 401)

  let body: { action?: string; tenant?: string; email?: string; name?: string; scope?: string; user_id?: string; congregation?: string; password?: string; tabs?: string[] } = {}
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
  let callerId: string | null = null
  if (!isServiceRole) {
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ error: 'Invalid auth token' }, 401)
    callerId = userData.user.id
    const { data: me } = await db.from('users').select('role, client_id, permission_scope').eq('id', userData.user.id).maybeSingle()
    const role = (me as { role?: string } | null)?.role
    const myClient = (me as { client_id?: string } | null)?.client_id
    const myScope = (me as { permission_scope?: string } | null)?.permission_scope
    const allowed = role === 'admin' || (role === 'client' && myClient === clientId && myScope === 'full')
    if (!allowed) return json({ error: "You do not have permission to manage this church's team." }, 403)
  }

  // ── list
  if (action === 'list') {
    const { data, error } = await db.from('users')
      .select('id, email, full_name, permission_scope, congregation_scope, allowed_tabs, created_at')
      .eq('client_id', clientId).order('created_at', { ascending: true })
    if (error) return json({ error: error.message }, 500)
    return json({ members: data ?? [] })
  }

  // ── set-scope
  if (action === 'set-scope') {
    const userId = (body.user_id ?? '').trim()
    const scope = (body.scope ?? '').trim()
    if (!userId || !SCOPES.includes(scope)) return json({ error: 'user_id and a valid scope required' }, 400)
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
    // Church admins (full) implicitly see every congregation.
    const congregation = scope === 'full' ? 'all' : (body.congregation ?? 'all').trim()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'A valid email is required' }, 400)
    if (!SCOPES.includes(scope)) return json({ error: 'Invalid scope' }, 400)
    if (!CONGREGATIONS.includes(congregation)) return json({ error: 'Invalid congregation' }, 400)

    // Optional starting password. Without one the only way in is an emailed
    // recovery link, which expires quickly and lands in church spam filters, so
    // provisioning several staff at once reliably produced dead links by the
    // time anyone clicked. An admin-set starting credential does not expire and
    // can be read out loud or pasted into a welcome email.
    // Generated by the caller so the admin sees the exact value once; it is
    // returned below for that purpose and never stored in plaintext by us.
    const password = typeof body.password === 'string' && body.password.length >= 8
      ? body.password
      : undefined

    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name },
      ...(password ? { password } : {}),
    })
    if (createErr) {
      const msg = createErr.message || 'Could not create user'
      const status = /already|registered|exists/i.test(msg) ? 409 : 500
      return json({ error: msg }, status)
    }
    const newId = created?.user?.id
    if (!newId) return json({ error: 'Create returned no user id' }, 500)
    // allowed_tabs null means "fall back to the scope bundle", which is what an
    // invite without an explicit page list should do.
    const tabs = Array.isArray(body.tabs) && body.tabs.length ? body.tabs : null
    const { error: rowErr } = await db.from('users').insert({
      id: newId, email, full_name: name || null, role: 'client', client_id: clientId, permission_scope: scope, congregation_scope: congregation,
      allowed_tabs: tabs,
    })
    if (rowErr) return json({ error: `Created but profile insert failed: ${rowErr.message}` }, 500)
    // `password_set` lets the caller decide whether to still send a reset email.
    return json({ ok: true, user_id: newId, password_set: !!password })
  }

  // ── set-tabs: which pages this member may see. An empty array clears back to
  // the scope bundle rather than locking someone out of everything.
  if (action === 'set-tabs') {
    const userId = (body.user_id ?? '').trim()
    if (!userId) return json({ error: 'user_id is required' }, 400)
    const tabs = Array.isArray(body.tabs) && body.tabs.length ? body.tabs : null
    const { error } = await db.from('users').update({ allowed_tabs: tabs }).eq('id', userId).eq('client_id', clientId)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // ── remove: delete the login and the profile row.
  //
  // Guards, in order of how badly each would hurt:
  //   - never yourself: a church admin removing their own account locks the
  //     church out of the only screen that can create new ones.
  //   - never a CommandSite admin, and never someone from another church: the
  //     client_id check means a church admin can only ever touch their own team.
  //
  // The auth user is deleted last. If the profile delete fails we stop, because
  // a login with no profile row is a user who can sign in and see nothing,
  // which is harder to diagnose than a failed removal.
  if (action === 'remove') {
    const userId = (body.user_id ?? '').trim()
    if (!userId) return json({ error: 'user_id is required' }, 400)
    if (callerId && userId === callerId) {
      return json({ error: 'You cannot remove your own account.' }, 400)
    }
    const { data: target } = await db.from('users').select('role, client_id, email').eq('id', userId).maybeSingle()
    if (!target) return json({ error: 'That person is not on this team.' }, 404)
    const t = target as { role?: string; client_id?: string; email?: string }
    if (t.client_id !== clientId) return json({ error: 'That person is not on this team.' }, 404)
    if (t.role === 'admin') return json({ error: 'Admin accounts cannot be removed here.' }, 403)

    const { error: rowErr } = await db.from('users').delete().eq('id', userId).eq('client_id', clientId)
    if (rowErr) return json({ error: `Could not remove profile: ${rowErr.message}` }, 500)
    const { error: authErr } = await db.auth.admin.deleteUser(userId)
    // Profile is already gone, so they can no longer reach anything. Report the
    // partial state rather than claiming a clean removal.
    if (authErr) return json({ ok: true, warning: `Access removed, but the login could not be deleted: ${authErr.message}` })
    return json({ ok: true, removed: t.email ?? userId })
  }

  // ── set-congregation
  if (action === 'set-congregation') {
    const userId = (body.user_id ?? '').trim()
    const congregation = (body.congregation ?? '').trim()
    if (!userId || !CONGREGATIONS.includes(congregation)) return json({ error: 'user_id and a valid congregation required' }, 400)
    const { data: target } = await db.from('users').select('id, client_id, role').eq('id', userId).maybeSingle()
    const t = target as { client_id?: string; role?: string } | null
    if (!t || t.client_id !== clientId) return json({ error: 'User not found in this church' }, 404)
    if (t.role !== 'client') return json({ error: 'Cannot change congregation of a non-client user' }, 400)
    const { error } = await db.from('users').update({ congregation_scope: congregation }).eq('id', userId)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  return json({ error: `Unknown action "${action}"` }, 400)
})
