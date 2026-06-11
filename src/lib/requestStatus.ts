/**
 * Global slow-request indicator.
 *
 * Any fetch wrapper that wants to surface "still working..." UX bumps
 * markRequestSlow() when a request crosses the 5-second threshold and
 * calls unmarkRequestSlow() when it completes (success OR error).
 *
 * The reactive count drives `SlowRequestIndicator.vue`, a small fixed
 * indicator that appears in the corner so users get visual confirmation
 * that something IS in flight, not just frozen.
 *
 * This decouples "did anything slow happen" tracking from any specific
 * fetch wrapper, so we can layer it on top of Supabase, raw fetch, or
 * any other async work the app does.
 */
import { ref, readonly } from 'vue'

const _slowRequestCount = ref(0)

/** Reactive: how many requests have been pending for >= 5s. */
export const slowRequestCount = readonly(_slowRequestCount)

/** Increment the slow-request counter. Called when a fetch crosses 5s. */
export function markRequestSlow(): void {
  _slowRequestCount.value++
}

/** Decrement the slow-request counter. Called when a slow fetch completes
 *  (regardless of success / error). Floor at 0 in case of double-call. */
export function unmarkRequestSlow(): void {
  _slowRequestCount.value = Math.max(0, _slowRequestCount.value - 1)
}
