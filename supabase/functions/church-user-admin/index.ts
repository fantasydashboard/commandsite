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

  let body: { action?: string; tenant?: string; email?: string; name?: string; scope?: string; user_id?: string; congregation?: string } = {}
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
    if (!allowed) return json({ error: "You do not have permission to manage this church's team." }, 403)
  }

  // ── list
  if (action === 'list') {
    const { data, error } = await db.from('users')
      .select('id, email, full_name, permission_scope, congregation_scope, created_at')
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

    // Create the user directly (no email dependency, so this never stalls on
    // Supabase's built-in email / rate limits).
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name },
    })
    if (createErr) {
      const msg = createErr.message || 'Could not create user'
      const status = /already|registered|exists/i.test(msg) ? 409 : 500
      return json({ error: msg }, status)
    }
    const newId = created?.user?.id
    if (!newId) return json({ error: 'Create returned no user id' }, 500)
    const { error: rowErr } = await db.from('users').insert({
      id: newId, email, full_name: name || null, role: 'client', client_id: clientId, permission_scope: scope, congregation_scope: congregation,
    })
    if (rowErr) return json({ error: `Created but profile insert failed: ${rowErr.message}` }, 500)

    // Generate a set-password link and RETURN it to the admin to share. No
    // dependency on email delivery. (Wire SMTP later to also email it.)
    let inviteLink: string | null = null
    try {
      const { data: linkData } = await db.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${APP_URL}/set-password` },
      })
      // deno-lint-ignore no-explicit-any
      inviteLink = (linkData as any)?.properties?.action_link ?? null
    } catch { /* link is best-effort; the user already exists either way */ }

    return json({ ok: true, user_id: newId, invite_link: inviteLink })
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

  // ── reset-link: generate a fresh set-password link for an existing church
  //    user, returned to the admin to share (no email dependency).
  if (action === 'reset-link') {
    const userId = (body.user_id ?? '').trim()
    if (!userId) return json({ error: 'user_id required' }, 400)
    const { data: target } = await db.from('users').select('id, email, client_id').eq('id', userId).maybeSingle()
    const t = target as { email?: string; client_id?: string } | null
    if (!t || t.client_id !== clientId || !t.email) return json({ error: 'User not found in this church' }, 404)
    let link: string | null = null
    try {
      const { data: linkData } = await db.auth.admin.generateLink({
        type: 'recovery',
        email: t.email,
        options: { redirectTo: `${APP_URL}/set-password` },
      })
      // deno-lint-ignore no-explicit-any
      link = (linkData as any)?.properties?.action_link ?? null
    } catch { /* fall through to error below */ }
    if (!link) return json({ error: 'Could not generate a link' }, 500)
    return json({ ok: true, reset_link: link })
  }

  return json({ error: `Unknown action "${action}"` }, 400)
})
