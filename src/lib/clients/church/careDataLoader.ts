// careDataLoader.ts
// Fetches live per-church dashboard datasets (church_dashboard_data) and falls
// back to the baked snapshots when a row is absent. Reactive so components that
// read the getters re-render when live data lands.
import { reactive } from 'vue'
import { supabase } from '@/lib/supabase'
import { focalPointServing } from '@/lib/clients/focal-point/serving'
import { focalPointBurnout } from '@/lib/clients/focal-point/burnout'
import { focalPointGroupDrift } from '@/lib/clients/focal-point/groupDrift'

export interface CareMeta { computedAt: string | null; sourceFreshness: string | null; status: string; error: string | null }
const store = reactive({
  loaded: false,
  serving: null as typeof focalPointServing | null,
  burnout: null as typeof focalPointBurnout | null,
  groupDrift: null as typeof focalPointGroupDrift | null,
  meta: {} as Record<string, CareMeta>,
})

export const careData = store
export const servingData = () => store.serving ?? focalPointServing
export const burnoutData = () => store.burnout ?? focalPointBurnout
export const groupDriftData = () => store.groupDrift ?? focalPointGroupDrift
export const careMeta = (moduleKey: string): CareMeta | null => store.meta[moduleKey] ?? null

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
  store.meta = {}
  store.loaded = false

  const { data: client, error: clientErr } = await sb.from('clients').select('id').eq('slug', slug).maybeSingle()
  if (clientErr) { console.error(`careDataLoader: client lookup failed for ${slug}: ${clientErr.message}`); return }
  if (!client) return
  const { data, error } = await sb.from('church_dashboard_data')
    .select('module_key, payload, computed_at, source_freshness, status, error')
    .eq('client_id', client.id)
    .in('module_key', ['serving', 'burnout', 'groupDrift'])
  if (error || !data) return
  for (const row of data as any[]) {
    store.meta[row.module_key] = { computedAt: row.computed_at, sourceFreshness: row.source_freshness, status: row.status, error: row.error }
    if (row.status !== 'ok') continue
    if (row.module_key === 'serving') store.serving = row.payload
    else if (row.module_key === 'burnout') store.burnout = row.payload
    else if (row.module_key === 'groupDrift') store.groupDrift = row.payload
  }
  store.loaded = true
}

// Triggers a live PCO sync, then reloads. Used by the refresh-now button.
export async function refreshCareData(slug: string): Promise<void> {
  const { error } = await supabase.functions.invoke('pco-sync', { body: { tenant: slug } })
  if (error) throw new Error(error.message ?? 'Refresh failed')
  await loadCareData(slug)
}
