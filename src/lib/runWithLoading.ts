/**
 * Safety net for async handlers that toggle a loading ref.
 *
 * The pattern this prevents:
 *
 *   async function save() {
 *     saving.value = true
 *     await supabase.from(...).update(...)
 *     saving.value = false  // BUG: if the await throws, this never runs
 *   }
 *
 * Result: `saving` stays true forever, button is stuck "Saving…",
 * user has to refresh.
 *
 * The right pattern:
 *
 *   async function save() {
 *     return runWithLoading(saving, async () => {
 *       await supabase.from(...).update(...)
 *       return { ok: true }
 *     })
 *   }
 *
 * The helper guarantees:
 *   - Loading ref flips to true on entry
 *   - Loading ref flips to false on exit, in EVERY case (success, error,
 *     thrown promise)
 *   - Double-click protection: if the loading ref is already true,
 *     skip the operation entirely (returns undefined)
 *
 * Errors still propagate to the caller — this isn't a swallow-all
 * wrapper. The caller can catch + handle however they want. The helper
 * just promises that the loading ref always resolves.
 */
import type { Ref } from 'vue'

export async function runWithLoading<T>(
  loadingRef: Ref<boolean>,
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (loadingRef.value) return undefined
  loadingRef.value = true
  try {
    return await operation()
  } finally {
    loadingRef.value = false
  }
}
