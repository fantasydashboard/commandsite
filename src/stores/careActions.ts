import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { FlagDetail } from '@/lib/clients/focal-point/flags'

/**
 * Care actions: shared snooze / never-flag state for flagged people, plus the
 * currently open detail drawer.
 *
 * ── Why this is server-backed ─────────────────────────────────────────────
 * This used to be localStorage only, so every staff member had a private copy.
 * Invisible with one user; with four it diverges silently: the care lead
 * dismisses a family, the pastor still sees them, and they both call. Hiding is
 * a fact about the person ("this is staff", "they are travelling"), not a
 * preference of whoever is looking, so it belongs to the church.
 *
 * ── Contract, deliberately unchanged ──────────────────────────────────────
 * Thirteen components read `isHidden(id)` SYNCHRONOUSLY inside computeds. That
 * contract is preserved exactly: rows load once into a reactive map, reads stay
 * synchronous, and writes are optimistic with a background upsert. No call site
 * changed when this moved server-side, which is the only reason a rewrite of
 * something backing every pastoral list was safe to do at all.
 *
 * ── Failure behaviour ─────────────────────────────────────────────────────
 * Every failure falls back toward HIDING, never toward revealing. A failed load
 * keeps the local cache rather than showing everyone who was dismissed; a failed
 * write reverts the single row and surfaces an error. The worst outcome here is
 * a family that was deliberately hidden reappearing on a pastor's list, so the
 * defaults lean that way on purpose.
 */
interface Hidden { reason: 'dismissed' | 'snoozed'; until?: number; note?: string; at: number; by?: string }

const KEY = 'grace.careActions.v1'
/** Set once the browser's own entries have been pushed to the server, so the
 *  one-time migration cannot run twice and resurrect a hide someone restored. */
const MIGRATED_KEY = 'grace.careActions.migrated.v1'

// church tables are absent from the generated types (added after codegen).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

function loadLocal(): Record<string, Hidden> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}

export const useCareActions = defineStore('careActions', () => {
  // Seeded from the local cache so the first paint after a reload still hides
  // the right people, before the server round trip lands.
  const hidden = ref<Record<string, Hidden>>(loadLocal())
  const activeDetail = ref<FlagDetail | null>(null)
  const clientId = ref<string | null>(null)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  /** Local mirror is kept as a warm cache, not the source of truth. */
  function cache() { try { localStorage.setItem(KEY, JSON.stringify(hidden.value)) } catch { /* private mode */ } }

  const toMs = (t: string | null): number | undefined => (t ? Date.parse(t) : undefined)
  const toIso = (ms?: number): string | null => (ms ? new Date(ms).toISOString() : null)

  /**
   * Loads this church's hides. Called from careDataLoader so it lands with the
   * rest of the dashboard data: fetching separately produced a visible flash
   * where dismissed people appeared and then vanished.
   */
  async function load(id: string): Promise<void> {
    clientId.value = id
    try {
      const { data, error: err } = await sb
        .from('care_flag_hides')
        .select('flag_id, reason, until, note, created_by_name, created_at')
        .eq('client_id', id)
      if (err) throw new Error(err.message)

      const next: Record<string, Hidden> = {}
      for (const r of (data ?? []) as Record<string, string | null>[]) {
        next[r.flag_id as string] = {
          reason: r.reason as 'dismissed' | 'snoozed',
          until: toMs(r.until ?? null),
          note: r.note ?? undefined,
          at: Date.parse(r.created_at as string) || Date.now(),
          by: r.created_by_name ?? undefined,
        }
      }

      await migrateLocal(id, next)
      hidden.value = next
      loaded.value = true
      error.value = null
      cache()
    } catch (e) {
      // Keep whatever is cached. Showing everyone again because a fetch failed
      // is far worse than showing a slightly stale hide list.
      error.value = e instanceof Error ? e.message : String(e)
      loaded.value = false
    }
  }

  /**
   * One-time lift of whatever this browser accumulated before hides were shared.
   * Only writes ids the server does not already have, so it can never overwrite
   * a colleague's more recent decision, and never resurrects something that was
   * restored on another machine.
   */
  async function migrateLocal(id: string, server: Record<string, Hidden>): Promise<void> {
    if (localStorage.getItem(MIGRATED_KEY)) return
    const local = loadLocal()
    const rows = Object.entries(local)
      .filter(([flagId]) => !server[flagId])
      .map(([flagId, h]) => ({
        client_id: id,
        flag_id: flagId,
        reason: h.reason,
        until: toIso(h.until),
        note: h.note ?? null,
        created_by_name: 'migrated from this browser',
      }))
    try {
      if (rows.length) {
        const { error: err } = await sb.from('care_flag_hides').upsert(rows, { onConflict: 'client_id,flag_id' })
        if (err) throw new Error(err.message)
        for (const r of rows) server[r.flag_id] = { ...local[r.flag_id], by: r.created_by_name }
      }
      localStorage.setItem(MIGRATED_KEY, new Date().toISOString())
    } catch { /* retried on the next load; the local copy still hides them meanwhile */ }
  }

  async function write(id: string, h: Hidden): Promise<void> {
    const cid = clientId.value
    if (!cid) return // demo / unauthenticated: local-only, same as before
    // Resolved HERE rather than before apply(): the optimistic update must be
    // synchronous or the row lingers on screen for a round trip after the click.
    const by = h.by ?? (await displayName())
    if (by && hidden.value[id]) hidden.value = { ...hidden.value, [id]: { ...hidden.value[id], by } }
    const { data: auth } = await supabase.auth.getUser()
    const { error: err } = await sb.from('care_flag_hides').upsert({
      client_id: cid,
      flag_id: id,
      reason: h.reason,
      until: toIso(h.until),
      note: h.note ?? null,
      created_by: auth?.user?.id ?? null,
      created_by_name: by ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,flag_id' })
    if (err) throw new Error(err.message)
  }

  /** Optimistic apply, then persist. Reverts just this row on failure so the UI
   *  never claims a hide that did not save. */
  async function apply(id: string, h: Hidden | null) {
    const prev = hidden.value[id]
    const next = { ...hidden.value }
    if (h) next[id] = h; else delete next[id]
    hidden.value = next
    cache()
    error.value = null
    try {
      if (h) await write(id, h)
      else if (clientId.value) {
        const { error: err } = await sb.from('care_flag_hides').delete().eq('client_id', clientId.value).eq('flag_id', id)
        if (err) throw new Error(err.message)
      }
    } catch (e) {
      const revert = { ...hidden.value }
      if (prev) revert[id] = prev; else delete revert[id]
      hidden.value = revert
      cache()
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function displayName(): Promise<string | undefined> {
    try {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth?.user?.id
      if (!uid) return undefined
      // A user may always read their own row, which is all this needs.
      const { data } = await sb.from('users').select('full_name, email').eq('id', uid).maybeSingle()
      return (data?.full_name || data?.email || undefined) as string | undefined
    } catch { return undefined }
  }

  // No await before apply(): the list must update on click, not after a fetch.
  function dismiss(id: string, note?: string) {
    return apply(id, { reason: 'dismissed', note, at: Date.now() })
  }
  function snooze(id: string, weeks: number, note?: string) {
    return apply(id, { reason: 'snoozed', until: Date.now() + weeks * 7 * 864e5, note, at: Date.now() })
  }
  function restore(id: string) { return apply(id, null) }

  /** Every id is `signal:name` (see flags.ts flagId), so a hide is inherently
   *  scoped to ONE flag: dismissing someone from burnout leaves them visible on
   *  serving-lapse or family drift. Parsing the id rather than storing extra
   *  fields keeps entries saved before this existed readable. */
  function parseId(id: string): { signal: string; name: string } {
    const i = id.indexOf(':')
    return i < 0 ? { signal: 'other', name: id } : { signal: id.slice(0, i), name: id.slice(i + 1) }
  }

  /** Everything currently hidden, newest first, for the Settings review list.
   *  Expired snoozes are filtered out: they are no longer hiding anything. */
  function allHidden(): { id: string; signal: string; name: string; reason: 'dismissed' | 'snoozed'; until?: number; note?: string; at: number; by?: string }[] {
    return Object.entries(hidden.value)
      .filter(([id]) => isHidden(id))
      .map(([id, h]) => ({ id, ...parseId(id), ...h }))
      .sort((a, b) => b.at - a.at)
  }

  function status(id: string): Hidden | null {
    const h = hidden.value[id]
    if (!h) return null
    if (h.reason === 'snoozed' && h.until && h.until < Date.now()) return null // snooze expired
    return h
  }
  function isHidden(id: string): boolean { return status(id) !== null }
  function hiddenCount(): number { return Object.keys(hidden.value).filter((id) => isHidden(id)).length }

  function openDetail(d: FlagDetail) { activeDetail.value = d }
  function closeDetail() { activeDetail.value = null }

  return {
    hidden, activeDetail, loaded, error,
    load, dismiss, snooze, restore, status, isHidden, hiddenCount, openDetail, closeDetail, allHidden, parseId,
  }
})
