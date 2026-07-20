import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FlagDetail } from '@/lib/clients/focal-point/flags'

/**
 * Care actions: dismiss / snooze state for flagged people, plus the currently
 * open detail drawer. Persisted to localStorage so it survives a refresh (a
 * frontend stand-in for the Supabase case-state that ships in the week-one
 * build). "dismissed" hides someone permanently (wrong person / should not be
 * flagged); "snoozed" hides them until a date (traveling, a hard season).
 */
interface Hidden { reason: 'dismissed' | 'snoozed'; until?: number; note?: string; at: number }

const KEY = 'grace.careActions.v1'

function load(): Record<string, Hidden> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}

export const useCareActions = defineStore('careActions', () => {
  const hidden = ref<Record<string, Hidden>>(load())
  const activeDetail = ref<FlagDetail | null>(null)

  function persist() { localStorage.setItem(KEY, JSON.stringify(hidden.value)) }

  function dismiss(id: string, note?: string) {
    hidden.value = { ...hidden.value, [id]: { reason: 'dismissed', note, at: Date.now() } }
    persist()
  }
  function snooze(id: string, weeks: number, note?: string) {
    hidden.value = { ...hidden.value, [id]: { reason: 'snoozed', until: Date.now() + weeks * 7 * 864e5, note, at: Date.now() } }
    persist()
  }
  function restore(id: string) {
    const next = { ...hidden.value }
    delete next[id]
    hidden.value = next
    persist()
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

  return { hidden, activeDetail, dismiss, snooze, restore, status, isHidden, hiddenCount, openDetail, closeDetail }
})
