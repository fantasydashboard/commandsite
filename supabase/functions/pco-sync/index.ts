// pco-sync/index.ts
// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { fetchServingSchedule } from '../_shared/pco-transforms/fetchSchedule.ts'
import { fetchGroupInputs } from '../_shared/pco-transforms/fetchGroups.ts'
import { computeServing, computeBurnout } from '../_shared/pco-transforms/serving.ts'
import { computeGroupDrift } from '../_shared/pco-transforms/groupDrift.ts'
import type { PcoConfig } from '../_shared/pco-transforms/types.ts'

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
const svc = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const todayUtc = () => new Date().toISOString().slice(0, 10)

// Compute one church. Each unit is isolated so one failure does not sink others.
async function syncChurch(db: any, slug: string, clientId: string, cfg: PcoConfig, modules?: string[]) {
  const staff = new Set(cfg.staffNames ?? [])
  const today = todayUtc()
  const want = (k: string) => !modules || modules.includes(k)
  const results: Record<string, string> = {}

  async function writeOk(moduleKey: string, payload: unknown, freshness: string) {
    await db.from('church_dashboard_data').upsert({
      client_id: clientId, module_key: moduleKey, payload, status: 'ok', error: null,
      computed_at: new Date().toISOString(), source_freshness: freshness, synced_attempt_at: new Date().toISOString(),
    }, { onConflict: 'client_id,module_key' })
    results[moduleKey] = 'ok'
  }
  async function writeErr(moduleKey: string, e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // Preserve last-good payload: update status/error only.
    await db.from('church_dashboard_data').update({ status: 'error', error: msg, synced_attempt_at: new Date().toISOString() })
      .eq('client_id', clientId).eq('module_key', moduleKey)
    results[moduleKey] = 'error'
  }

  // Unit 1: serving + burnout share one schedule pull.
  if (want('serving') || want('burnout')) {
    try {
      const byPerson = await fetchServingSchedule(slug, cfg.serving, today)
      if (want('serving')) await writeOk('serving', computeServing(byPerson, staff, cfg.serving, today), today)
      if (want('burnout')) await writeOk('burnout', computeBurnout(byPerson, staff, cfg.burnout, today), today)
    } catch (e) {
      if (want('serving')) await writeErr('serving', e)
      if (want('burnout')) await writeErr('burnout', e)
    }
  }
  // Unit 2: group drift.
  if (want('groupDrift')) {
    try {
      const groups = await fetchGroupInputs(slug, cfg.groupDrift)
      await writeOk('groupDrift', computeGroupDrift(groups, cfg.groupDrift), today)
    } catch (e) { await writeErr('groupDrift', e) }
  }
  return results
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing Authorization' }, 401)

  let body: { tenant?: string; modules?: string[] } = {}
  try { body = await req.json() } catch { /* empty body = cron all-churches */ }
  const db = svc()
  const isServiceRole = token === SERVICE_ROLE_KEY

  // Resolve target churches: a tenant given => that one (with authz); none => all connected (service role only).
  if (body.tenant) {
    const { data: client } = await db.from('clients').select('id, pco_config').eq('slug', body.tenant).maybeSingle()
    if (!client) return json({ error: `Unknown tenant "${body.tenant}"` }, 404)
    if (!isServiceRole) {
      const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
      const { data: userData } = await userClient.auth.getUser()
      if (!userData?.user) return json({ error: 'Invalid auth token' }, 401)
      const { data: me } = await db.from('users').select('role, client_id, permission_scope').eq('id', userData.user.id).maybeSingle()
      const ok = me?.role === 'admin' || (me?.role === 'client' && me?.client_id === client.id && me?.permission_scope === 'full')
      if (!ok) return json({ error: 'You do not have permission to refresh this church.' }, 403)
    }
    const results = await syncChurch(db, body.tenant, client.id, (client.pco_config ?? {}) as PcoConfig, body.modules)
    return json({ ok: true, results })
  }

  // Cron path: no tenant. Service role only. Sync every church that has a PCO connection.
  if (!isServiceRole) return json({ error: 'Full sync requires the service role' }, 403)
  const { data: conns } = await db.from('pco_connections').select('tenant_key')
  const all: Record<string, unknown> = {}
  for (const c of conns ?? []) {
    const { data: client } = await db.from('clients').select('id, pco_config').eq('slug', c.tenant_key).maybeSingle()
    if (!client) continue
    all[c.tenant_key] = await syncChurch(db, c.tenant_key, client.id, (client.pco_config ?? {}) as PcoConfig, body.modules)
  }
  return json({ ok: true, results: all })
})
