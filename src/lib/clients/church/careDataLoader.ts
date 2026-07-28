// careDataLoader.ts
// Fetches live per-church dashboard datasets (church_dashboard_data) and falls
// back to the baked snapshots when a row is absent. Reactive so components that
// read the getters re-render when live data lands.
import { reactive } from 'vue'
import { supabase } from '@/lib/supabase'
import { focalPointServing } from '@/lib/clients/focal-point/serving'
import { focalPointBurnout } from '@/lib/clients/focal-point/burnout'
import { focalPointGroupDrift } from '@/lib/clients/focal-point/groupDrift'
import { focalPointDrift } from '@/lib/clients/focal-point/drift'
import { guestPipeline as focalPointGuestPipeline } from '@/lib/clients/focal-point/guestPipeline'

export interface CareMeta { computedAt: string | null; sourceFreshness: string | null; status: string; error: string | null }
export interface SyncStateRow { resource: string; phase: string | null; backfill_complete: boolean }
const store = reactive({
  loaded: false,
  serving: null as typeof focalPointServing | null,
  burnout: null as typeof focalPointBurnout | null,
  groupDrift: null as typeof focalPointGroupDrift | null,
  drift: null as typeof focalPointDrift | null,
  guestPipeline: null as typeof focalPointGuestPipeline | null,
  meta: {} as Record<string, CareMeta>,
  syncStates: [] as SyncStateRow[],
})

export const careData = store
export const servingData = () => store.serving ?? focalPointServing
export const burnoutData = () => store.burnout ?? focalPointBurnout
export const groupDriftData = () => store.groupDrift ?? focalPointGroupDrift
export const driftData = () => store.drift ?? focalPointDrift
export const guestPipelineData = () => store.guestPipeline ?? focalPointGuestPipeline
export const careMeta = (moduleKey: string): CareMeta | null => store.meta[moduleKey] ?? null
// True when at least one PCO resource is still in its initial backfill (has
// not yet reached backfill_complete). Drives the "catching up" badge state.
export const careSyncing = (): boolean => store.syncStates.some((s) => s.backfill_complete === false)

// church_dashboard_data is not in the generated Database types (added after
// codegen), so query it through an untyped handle, mirroring privacy.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export async function loadCareData(slug: string): Promise<void> {
  // Reset first so navigating between churches never leaks one church's live
  // data into another (the store is a module-level singleton). A church with no
  // live 'ok' row then correctly falls back to the baked snapshot.
  store.serving = null
  store.burnout = null
  store.groupDrift = null
  store.drift = null
  store.guestPipeline = null
  store.meta = {}
  store.syncStates = []
  store.loaded = false

  const { data: client, error: clientErr } = await sb.from('clients').select('id').eq('slug', slug).maybeSingle()
  if (clientErr) { console.error(`careDataLoader: client lookup failed for ${slug}: ${clientErr.message}`); return }
  if (!client) return
  // Sync-state read is best-effort: a failure here should never block the
  // dashboard from loading, so errors are logged and swallowed rather than
  // thrown.
  try {
    const { data: states, error: statesErr } = await sb.from('pco_sync_state')
      .select('resource,phase,backfill_complete')
      .eq('client_id', client.id)
    if (statesErr) console.error(`careDataLoader: sync-state lookup failed for ${slug}: ${statesErr.message}`)
    else store.syncStates = (states as SyncStateRow[]) ?? []
  } catch (e) {
    console.error(`careDataLoader: sync-state lookup threw for ${slug}: ${e instanceof Error ? e.message : String(e)}`)
  }
  const { data, error } = await sb.from('church_dashboard_data')
    .select('module_key, payload, computed_at, source_freshness, status, error')
    .eq('client_id', client.id)
    .in('module_key', ['serving', 'burnout', 'groupDrift', 'drift', 'guestPipeline'])
  if (error || !data) return
  for (const row of data as any[]) {
    store.meta[row.module_key] = { computedAt: row.computed_at, sourceFreshness: row.source_freshness, status: row.status, error: row.error }
    if (row.status !== 'ok') continue
    if (row.module_key === 'serving') store.serving = row.payload
    else if (row.module_key === 'burnout') store.burnout = row.payload
    else if (row.module_key === 'groupDrift') store.groupDrift = row.payload
    else if (row.module_key === 'drift') store.drift = row.payload
    else if (row.module_key === 'guestPipeline') store.guestPipeline = row.payload
  }
  store.loaded = true
}

// Triggers a live PCO sync in the BACKGROUND. The incremental sync re-pulls the
// schedule and can run longer than the browser fetch timeout, so we do not block
// the button on it: fire it, reload whatever data is current now, and the sync's
// result lands on a later load (the nightly cron is the safety net). Errors are
// swallowed here so a slow or failed sync can never hang the button.
export async function refreshCareData(slug: string): Promise<void> {
  void supabase.functions.invoke('pco-fetch', { body: { tenant: slug } }).catch(() => {})
  await loadCareData(slug)
}
