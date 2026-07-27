// pco-fetch/index.ts
// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { makeDeadline } from '../_shared/pco-fetch/cursor.ts'
import { fetchScheduleChunk } from '../_shared/pco-fetch/fetchScheduleChunk.ts'
import { fetchGroupsChunk } from '../_shared/pco-fetch/fetchGroupsChunk.ts'
import { computeServingBurnout, computeGroups } from '../_shared/pco-fetch/computeFromCache.ts'
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

type Resource = 'schedule' | 'groups'
type Mode = 'backfill' | 'incremental'
// deno-lint-ignore no-explicit-any
type Db = any

interface SyncStateRow {
  phase: string
  cursor: unknown
  backfill_complete: boolean
  last_synced_date: string | null
}

const DEFAULT_TIME_BUDGET_SECONDS = 90
const DEFAULT_INCREMENTAL_WINDOW_DAYS = 21

// Advance one resource for one church: one time-budgeted chunk while backfilling,
// or one incremental tick once backfill has completed. Records progress and
// errors on pco_sync_state and returns a status word for the response. Never
// throws (the caller wraps it so one resource's failure cannot sink the batch).
async function syncResource(
  db: Db, clientId: string, tenant: string, cfg: PcoConfig, resource: Resource, mode: Mode,
): Promise<string> {
  const { data: existing, error: readErr } = await db.from('pco_sync_state')
    .select('phase, cursor, backfill_complete, last_synced_date')
    .eq('client_id', clientId).eq('resource', resource).maybeSingle()
  if (readErr) throw new Error(`read sync state: ${readErr.message}`)
  const row: SyncStateRow = existing ?? { phase: 'backfill', cursor: {}, backfill_complete: false, last_synced_date: null }

  // The rapid backfill cron polls every couple minutes to push newly-connected
  // churches through their initial pull. Once a resource has graduated to
  // 'incremental' it is idle on that cron; only the nightly incremental cron
  // (or a tenant-scoped manual refresh, which always runs incremental) touches
  // it again. This is what stops the rapid cron from re-fetching forever.
  if (mode === 'backfill' && row.phase === 'incremental') return 'idle'

  const now = new Date().toISOString()

  if (row.phase === 'backfill') {
    const isOver = makeDeadline(cfg.fetch?.timeBudgetSeconds ?? DEFAULT_TIME_BUDGET_SECONDS)
    if (resource === 'schedule') {
      const r = await fetchScheduleChunk(db, clientId, tenant, cfg.serving, (row.cursor ?? {}) as any, isOver)
      const { error } = await db.from('pco_sync_state').upsert({
        client_id: clientId, resource, cursor: r.cursor, backfill_complete: r.done,
        phase: r.done ? 'incremental' : 'backfill',
        last_synced_date: r.lastDate ?? row.last_synced_date,
        updated_at: now, error: null,
      }, { onConflict: 'client_id,resource' })
      if (error) throw new Error(`write sync state: ${error.message}`)
      if (r.done) await computeServingBurnout(db, clientId, cfg)
    } else {
      const r = await fetchGroupsChunk(db, clientId, tenant, cfg.groupDrift, (row.cursor ?? {}) as any, isOver)
      const { error } = await db.from('pco_sync_state').upsert({
        client_id: clientId, resource, cursor: r.cursor, backfill_complete: r.done,
        phase: r.done ? 'incremental' : 'backfill',
        last_synced_date: row.last_synced_date,
        updated_at: now, error: null,
      }, { onConflict: 'client_id,resource' })
      if (error) throw new Error(`write sync state: ${error.message}`)
      if (r.done) await computeGroups(db, clientId, cfg)
    }
    return 'backfill'
  }

  // Incremental (reached only when mode === 'incremental'): schedule re-fetches
  // just the recent window since last sync, then recomputes; groups recomputes
  // from cache only, since the season is fixed/complete and active-season
  // event fetching for groups is deferred.
  if (resource === 'schedule') {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - (cfg.fetch?.incrementalWindowDays ?? DEFAULT_INCREMENTAL_WINDOW_DAYS))
    const cutoff = d.toISOString().slice(0, 10)
    const isOver = makeDeadline(cfg.fetch?.timeBudgetSeconds ?? DEFAULT_TIME_BUDGET_SECONDS)
    const r = await fetchScheduleChunk(db, clientId, tenant, cfg.serving, {} as any, isOver, cutoff)
    await computeServingBurnout(db, clientId, cfg)
    const { error } = await db.from('pco_sync_state')
      .update({ last_synced_date: r.lastDate ?? row.last_synced_date, updated_at: now, error: null })
      .eq('client_id', clientId).eq('resource', resource)
    if (error) throw new Error(`write sync state: ${error.message}`)
  } else {
    await computeGroups(db, clientId, cfg)
    const { error } = await db.from('pco_sync_state')
      .update({ updated_at: now, error: null })
      .eq('client_id', clientId).eq('resource', resource)
    if (error) throw new Error(`write sync state: ${error.message}`)
  }
  return 'incremental'
}

// Wraps syncResource so a thrown error is recorded on pco_sync_state (error
// column only, cursor untouched) and reported as 'error' instead of aborting
// the church or the batch.
async function syncChurchResource(
  db: Db, clientId: string, tenant: string, cfg: PcoConfig, resource: Resource, mode: Mode,
): Promise<string> {
  try {
    return await syncResource(db, clientId, tenant, cfg, resource, mode)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`pco-fetch ${tenant}/${resource} failed: ${msg}`)
    try {
      const { error } = await db.from('pco_sync_state')
        .upsert({ client_id: clientId, resource, error: msg, updated_at: new Date().toISOString() }, { onConflict: 'client_id,resource' })
      if (error) console.error(`pco-fetch error-write ${tenant}/${resource} failed: ${error.message}`)
    } catch (writeError) {
      console.error(`pco-fetch error-write ${tenant}/${resource} threw: ${writeError instanceof Error ? writeError.message : String(writeError)}`)
    }
    return 'error'
  }
}

async function syncChurch(db: Db, clientId: string, tenant: string, cfg: PcoConfig, mode: Mode) {
  const results: Record<string, string> = {}
  for (const resource of ['schedule', 'groups'] as Resource[]) {
    results[resource] = await syncChurchResource(db, clientId, tenant, cfg, resource, mode)
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

  let body: { tenant?: string; mode?: Mode } = {}
  try { body = await req.json() } catch { /* empty body = cron all-churches */ }
  const db = svc()
  const isServiceRole = token === SERVICE_ROLE_KEY
  // A tenant-scoped manual call (the refresh-now button) always runs
  // incremental: it is a targeted, on-demand refresh, not the initial pull.
  const mode: Mode = body.tenant ? 'incremental' : (body.mode ?? 'backfill')

  // Tenant-scoped path: a specific church, either the cron/service role or an
  // admin / full-scope client user of that church (mirrors pco-sync).
  if (body.tenant) {
    const { data: client, error: clientErr } = await db.from('clients').select('id, pco_config').eq('slug', body.tenant).maybeSingle()
    if (clientErr) return json({ error: `lookup failed: ${clientErr.message}` }, 500)
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
      const results = await syncChurch(db, client.id, body.tenant, (client.pco_config ?? {}) as PcoConfig, mode)
      return json({ ok: true, mode, results: { [body.tenant]: results } })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }

  // Cron path: no tenant, every connected church. Requires the service role
  // or a valid cron secret. Each church is wrapped so one church's failure
  // cannot abort the batch (every later church still runs).
  if (!isServiceRole && !isCron) return json({ error: 'Full sync requires the service role or a valid cron secret' }, 403)
  const { data: conns, error: connsErr } = await db.from('pco_connections').select('tenant_key')
  if (connsErr) return json({ error: `connections lookup failed: ${connsErr.message}` }, 500)
  const all: Record<string, unknown> = {}
  for (const c of conns ?? []) {
    try {
      const { data: client } = await db.from('clients').select('id, pco_config').eq('slug', c.tenant_key).maybeSingle()
      if (!client) { all[c.tenant_key] = { error: 'no matching client row' }; continue }
      all[c.tenant_key] = await syncChurch(db, client.id, c.tenant_key, (client.pco_config ?? {}) as PcoConfig, mode)
    } catch (e) {
      all[c.tenant_key] = { error: e instanceof Error ? e.message : String(e) }
    }
  }
  return json({ ok: true, mode, results: all })
})
