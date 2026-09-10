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
    const result = await refreshAndWait(props.slug)
    state.value = result === 'updated' ? 'done' : 'slow'
    message.value = result === 'updated'
      ? 'Updated just now'
      : 'Still syncing. Planning Center is slow on a first pull, press again in a minute.'
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
