<script setup lang="ts">
/**
 * Refresh-now for live churches.
 *
 * It used to fire the sync and immediately say "Syncing in the background,
 * updates shortly", which was the last thing it ever told you. No completion,
 * no failure, no way to know except reloading and reading a relative timestamp.
 * Over one day of deploying against Focal Point that cost roughly an hour of
 * looking at stale data and drawing wrong conclusions from it, and it would
 * cost the same on every church onboarded after.
 *
 * Now it waits. The sync itself still runs detached, because it outlasts a
 * browser fetch timeout, but the button polls until a computed_at actually
 * moves and then says so. A sync still running after 90s reports that honestly
 * rather than claiming success: a first backfill genuinely takes longer, and
 * pressing again resumes it.
 */
import { ref, onBeforeUnmount } from 'vue'
import { refreshAndWait } from '@/lib/clients/church/careDataLoader'

const props = defineProps<{ slug: string }>()

/** Resource keys are internal; staff read page names. */
const NAMES: Record<string, string> = {
  drift: 'families',
  serving: 'serving',
  burnout: 'serving load',
  groupDrift: 'groups',
  guestPipeline: 'guests',
  roster: 'the Sunday roster',
  rosterForward: 'the schedule',
  duplicates: 'duplicates',
  congregation: 'congregations',
  activity: 'check-in history',
  serveCandidates: 'serve suggestions',
}
function label(keys: string[]): string {
  const names = keys.map((k) => NAMES[k] ?? k)
  if (names.length <= 1) return names[0] ?? 'nothing'
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

type State = 'idle' | 'working' | 'done' | 'slow' | 'error'
const state = ref<State>('idle')
const message = ref<string | null>(null)
const elapsed = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null

function stopTicker() {
  if (ticker) { clearInterval(ticker); ticker = null }
}
onBeforeUnmount(stopTicker)

async function run() {
  if (state.value === 'working') return
  state.value = 'working'
  message.value = null
  elapsed.value = 0
  // A visible second count, so a long sync reads as progress rather than as a
  // page that has quietly given up.
  ticker = setInterval(() => { elapsed.value += 1 }, 1000)
  try {
    const r = await refreshAndWait(props.slug)
    // Name what actually moved. "Updated just now" fired when ANY resource
    // changed, which put a green tick above a panel still reading nine hours
    // old because the resource behind that panel had not run.
    if (r.catchingUp) {
      state.value = 'slow'
      message.value = r.changed.length
        ? `Updated ${label(r.changed)}. Still catching up on the rest, press again.`
        : 'Still catching up with Planning Center, press again in a minute.'
    } else if (r.status === 'updated') {
      state.value = 'done'
      message.value = `Updated ${label(r.changed)}`
    } else {
      state.value = 'slow'
      message.value = 'Still syncing. Press again in a minute.'
    }
  } catch (e) {
    state.value = 'error'
    message.value = e instanceof Error ? e.message : 'Refresh failed'
  } finally {
    stopTicker()
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <button
      type="button"
      :disabled="state === 'working'"
      class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand disabled:opacity-50"
      @click="run"
    >
      {{ state === 'working' ? 'Refreshing...' : 'Refresh now' }}
    </button>

    <span v-if="state === 'working'" class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
      <span class="h-1.5 w-1.5 rounded-full bg-warn"></span>
      Pulling from Planning Center, {{ elapsed }}s
    </span>

    <span v-else-if="state === 'done'" class="inline-flex items-center gap-1.5 text-[11px] text-success">
      <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
      {{ message }}
    </span>

    <span v-else-if="state === 'slow'" class="inline-flex items-center gap-1.5 text-[11px] text-warn">
      <span class="h-1.5 w-1.5 rounded-full bg-warn"></span>
      {{ message }}
    </span>

    <span v-else-if="state === 'error'" class="text-[11px] text-danger">{{ message }}</span>
  </div>
</template>
