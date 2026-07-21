import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Congregation lens: the All / English / Brazilian scope that reframes Focal
 * Point's dashboard for the Brazilian ministry. Shared across pages (flip it on
 * Insights and Care & Drift follows) and persisted so it survives a refresh.
 * A person is scoped by growth-group membership (see focal-point/congregation.ts);
 * people we cannot place stay visible only in the 'all' scope.
 */
export type CongregationScope = 'all' | 'english' | 'brazilian'

const KEY = 'grace.congregationLens.v1'

function load(): CongregationScope {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'english' || v === 'brazilian' ? v : 'all'
  } catch {
    return 'all'
  }
}

export const useCongregationLens = defineStore('congregationLens', () => {
  const scope = ref<CongregationScope>(load())
  // When a user is scoped to one congregation, the lens locks to it: it can't be
  // switched, and the picker shows only that congregation. Null = unlocked (admins
  // and 'all'-scope users). Set from the dashboard shell via the auth profile.
  const locked = ref<CongregationScope | null>(null)

  function set(next: CongregationScope) {
    if (locked.value) return // scoped users cannot switch congregations
    scope.value = next
    try { localStorage.setItem(KEY, next) } catch { /* ignore */ }
  }

  function lockTo(c: string | null | undefined) {
    locked.value = c === 'english' || c === 'brazilian' ? c : null
    if (locked.value) scope.value = locked.value
  }

  return { scope, set, locked, lockTo }
})
