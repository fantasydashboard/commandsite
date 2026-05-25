<script setup lang="ts">
/**
 * Grace live ticker — auto-advancing activity strip.
 *
 * Seeded with initial events. Periodically drops a fresh event from
 * the pool at the front and ages everything by 1s. Parent can push
 * its own event via `pushEvent({ icon, text })` (exposed via defineExpose).
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import AdaIcon from '@/components/ada/AdaIcon.vue'

interface TickerEvent { id: number; icon: string; text: string; ageSec: number }
interface PoolEvent { icon: string; text: string }

const props = defineProps<{
  /** Initial events shown in the strip (already-aged) */
  seed: { icon: string; text: string; ageSec: number }[]
  /** Pool of fresh events that cycle in periodically */
  pool: PoolEvent[]
  /** Optional label for the ticker header (defaults to 'Grace's activity stream — auto-updates') */
  subtitle?: string
  /** Drift interval ms between fresh-event drops (default 9000) */
  driftIntervalMs?: number
  /** Max number of items shown (default 5) */
  maxItems?: number
}>()

let idCounter = 0
function newId() { return ++idCounter }

const ticker = ref<TickerEvent[]>(
  props.seed.map((s) => ({ id: newId(), icon: s.icon, text: s.text, ageSec: s.ageSec })),
)

let nextFreshIndex = 0
let agingInterval: ReturnType<typeof setInterval> | null = null
let driftInterval: ReturnType<typeof setInterval> | null = null

function ageString(sec: number): string {
  if (sec < 60) return 'just now'
  if (sec < 60 * 60) return `${Math.floor(sec / 60)}m ago`
  if (sec < 60 * 60 * 24) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function pushEvent(ev: PoolEvent) {
  const max = props.maxItems ?? 5
  ticker.value.unshift({ id: newId(), icon: ev.icon, text: ev.text, ageSec: 0 })
  if (ticker.value.length > max + 1) ticker.value.pop()
}

defineExpose({ pushEvent })

onMounted(() => {
  agingInterval = setInterval(() => {
    for (const t of ticker.value) t.ageSec += 1
  }, 1000)
  const drift = props.driftIntervalMs ?? 9000
  driftInterval = setInterval(() => {
    if (props.pool.length === 0) return
    const fresh = props.pool[nextFreshIndex % props.pool.length]
    nextFreshIndex++
    pushEvent(fresh)
  }, drift)
})

onBeforeUnmount(() => {
  if (agingInterval) clearInterval(agingInterval)
  if (driftInterval) clearInterval(driftInterval)
})
</script>

<template>
  <section class="rounded-card border border-brand/20 bg-surface-raised overflow-hidden">
    <div class="flex items-center gap-3 px-4 py-2.5 border-b border-divider/60 bg-gradient-to-r from-brand/5 to-transparent">
      <div class="flex items-center gap-1.5">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
        </span>
        <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Live</span>
      </div>
      <span class="text-[11px] text-ink-muted">{{ subtitle ?? "Grace's activity stream · auto-updating" }}</span>
    </div>
    <ul class="divide-y divide-divider/40">
      <TransitionGroup
        tag="div"
        enter-active-class="transition-[opacity,transform,background-color] duration-[400ms] ease-out-quart"
        enter-from-class="opacity-0 -translate-y-3 bg-success/10"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-opacity duration-200 ease-out-quart"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <li
          v-for="(ev, idx) in ticker.slice(0, maxItems ?? 5)"
          :key="ev.id"
          class="flex items-center gap-3 px-4 py-2"
          :class="idx === 0 && ev.ageSec < 5 ? 'bg-success/5' : ''"
        >
          <AdaIcon :name="ev.icon" class="h-4 w-4 text-ink-muted flex-shrink-0" />
          <span class="flex-1 text-sm text-ink truncate">{{ ev.text }}</span>
          <span
            class="text-[10px] font-mono tabular-nums flex-shrink-0"
            :class="ev.ageSec < 5 ? 'text-success font-bold' : 'text-ink-disabled'"
          >{{ ageString(ev.ageSec) }}</span>
        </li>
      </TransitionGroup>
    </ul>
  </section>
</template>
