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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const svc = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const todayUtc = () => new Date().toISOString().slice(0, 10)

// Compute one church. Each module write is isolated so one failure does not sink
// the others, and every DB write result is checked so a failed write is never
// reported as success.
async function syncChurch(db: any, slug: string, clientId: string, cfg: PcoConfig, modules?: string[]) {
  const staff = new Set(Array.isArray(cfg.staffNames) ? cfg.staffNames : [])
  const today = todayUtc()
  const want = (k: string) => !modules || modules.includes(k)
  const results: Record<string, string> = {}

  // Success write: full upsert including the fresh payload. Checks the write
  // result so a silent PostgREST error is not mislabeled 'ok'.
  async function writeOk(moduleKey: string, payload: unknown, freshness: string) {
    try {
      const { error } = await db.from('church_dashboard_data').upsert({
        client_id: clientId, module_key: moduleKey, payload, status: 'ok', error: null,
        computed_at: new Date().toISOString(), source_freshness: freshness, synced_attempt_at: new Date().toISOString(),
      }, { onConflict: 'client_id,module_key' })
      if (error) { results[moduleKey] = 'error'; console.error(`pco-sync write ${slug}/${moduleKey} failed: ${error.message}`); return }
      results[moduleKey] = 'ok'
    } catch (e) {
      results[moduleKey] = 'error'
      console.error(`pco-sync write ${slug}/${moduleKey} threw: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Failure write: preserve the last-good payload (UPDATE status/error only). If
  // no row exists yet (first sync for this module), insert a visible error row
  // with an empty payload so the failure shows in the table, not just the HTTP
  // response. Never throws (its own DB errors are logged and swallowed).
  async function writeErr(moduleKey: string, e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    results[moduleKey] = 'error'
    try {
      const { data: existing } = await db.from('church_dashboard_data')
        .select('module_key').eq('client_id', clientId).eq('module_key', moduleKey).maybeSingle()
      const stamp = new Date().toISOString()
      if (existing) {
        const { error } = await db.from('church_dashboard_data')
          .update({ status: 'error', error: msg, synced_attempt_at: stamp })
          .eq('client_id', clientId).eq('module_key', moduleKey)
        if (error) console.error(`pco-sync error-write ${slug}/${moduleKey} failed: ${error.message}`)
      } else {
        const { error } = await db.from('church_dashboard_data')
          .insert({ client_id: clientId, module_key: moduleKey, payload: {}, status: 'error', error: msg, synced_attempt_at: stamp })
        if (error) console.error(`pco-sync error-insert ${slug}/${moduleKey} failed: ${error.message}`)
      }
    } catch (writeError) {
      console.error(`pco-sync writeErr ${slug}/${moduleKey} threw: ${writeError instanceof Error ? writeError.message : String(writeError)}`)
    }
  }

  // Unit 1: serving + burnout share one schedule pull. A pull failure marks both
  // error; otherwise each module computes and writes independently so a burnout
  // failure cannot clobber a successful serving write (and vice versa).
  if (want('serving') || want('burnout')) {
    let byPerson: Awaited<ReturnType<typeof fetchServingSchedule>> | null = null
    try {
      byPerson = await fetchServingSchedule(slug, cfg.serving, today)
    } catch (e) {
      if (want('serving')) await writeErr('serving', e)
      if (want('burnout')) await writeErr('burnout', e)
    }
    if (byPerson) {
      if (want('serving')) {
        try { await writeOk('serving', computeServing(byPerson, staff, cfg.serving, today), today) }
        catch (e) { await writeErr('serving', e) }
      }
      if (want('burnout')) {
        try { await writeOk('burnout', computeBurnout(byPerson, staff, cfg.burnout, today), today) }
        catch (e) { await writeErr('burnout', e) }
      }
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
  // pg_cron's net.http_post sends only Content-Type and X-Cron-Secret, no
  // Authorization header, so the cron secret must be checked before the
  // "missing Authorization" gate, not after it (the gate would otherwise
  // 401 the cron before it ever reaches the cron path below).
  const cronSecret = req.headers.get('X-Cron-Secret') ?? req.headers.get('x-cron-secret') ?? ''
  const expectedCron = Deno.env.get('PCO_SYNC_CRON_SECRET') ?? ''
  const isCron = !!expectedCron && cronSecret === expectedCron
  if (!token && !isCron) return json({ error: 'Missing Authorization' }, 401)

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
    try {
      const results = await syncChurch(db, body.tenant, client.id, (client.pco_config ?? {}) as PcoConfig, body.modules)
      return json({ ok: true, results })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }

  // Cron path: no tenant. Accept the pg_cron trigger (shared X-Cron-Secret header,
  // checked above) or a direct service-role call. Sync every church that has a
  // PCO connection. Each church is wrapped so one church's failure cannot abort
  // the batch (every later church still runs).
  if (!isServiceRole && !isCron) return json({ error: 'Full sync requires the service role or a valid cron secret' }, 403)
  const { data: conns } = await db.from('pco_connections').select('tenant_key')
  const all: Record<string, unknown> = {}
  for (const c of conns ?? []) {
    try {
      const { data: client } = await db.from('clients').select('id, pco_config').eq('slug', c.tenant_key).maybeSingle()
      if (!client) { all[c.tenant_key] = { error: 'no matching client row' }; continue }
      all[c.tenant_key] = await syncChurch(db, c.tenant_key, client.id, (client.pco_config ?? {}) as PcoConfig, body.modules)
    } catch (e) {
      all[c.tenant_key] = { error: e instanceof Error ? e.message : String(e) }
    }
  }
  return json({ ok: true, results: all })
})
