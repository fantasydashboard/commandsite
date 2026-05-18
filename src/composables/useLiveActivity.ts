/**
 * useLiveActivity — shared drift / visibility / aging composable for the
 * auto-updating activity feeds on Today + every sub-tab.
 *
 * Pattern: seed with a few static events (already-aged), then drift a
 * fresh pool event in every N seconds. Pauses when the tab is hidden.
 * Exposes a reactive `events` ref + `fmtAgo` that updates on a minute
 * tick so "just now → 1m ago → 2m ago" feels alive without polling.
 *
 * On real deployments this gets replaced with a Supabase Realtime sub —
 * the drift simulation is what the demo sees. Same interface either way.
 */
import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'
import { fmtAgo as sharedFmtAgo } from '@/lib/format'

export interface LiveEvent {
  id: string
  /** ISO timestamp */
  at: string
  /** Display emoji */
  icon: string
  /** One-line event description */
  text: string
  /** Which Ada role produced this — key from adaRoles. Surfaces as a chip. */
  role?: string
}

export interface PoolEvent {
  icon: string
  text: string
  role?: string
}

export interface UseLiveActivityOptions {
  /** Initial events. Use ages-relative-to-now timestamps. */
  seed: LiveEvent[]
  /** Pool of fresh events drifted in periodically. Cycles round-robin. */
  pool: PoolEvent[]
  /** Drift interval ms (default 15000). */
  driftMs?: number
  /** Max events kept (default 20). */
  cap?: number
}

export interface UseLiveActivityReturn {
  events: Ref<LiveEvent[]>
  /** Format an ISO timestamp as "just now / Nm ago / Nh ago / Nd ago". Reactive on minute tick. */
  fmtAgo: (iso: string) => string
  /** Manually push an event (e.g. when an Approval Queue item is approved). */
  pushEvent: (e: PoolEvent) => void
}

let _idCounter = 0
function newId(): string {
  _idCounter++
  return `live-${Date.now()}-${_idCounter}`
}

export function useLiveActivity(opts: UseLiveActivityOptions): UseLiveActivityReturn {
  const driftMs = opts.driftMs ?? 15_000
  const cap = opts.cap ?? 20

  const events = ref<LiveEvent[]>([...opts.seed])
  const nowTick = ref(0)

  let nextPoolIndex = 0
  let driftInterval: ReturnType<typeof setInterval> | null = null
  let tickInterval: ReturnType<typeof setInterval> | null = null

  function pushEvent(p: PoolEvent) {
    const event: LiveEvent = {
      id: newId(),
      at: new Date().toISOString(),
      icon: p.icon,
      text: p.text,
      role: p.role,
    }
    events.value = [event, ...events.value].slice(0, cap)
  }

  function startDrift() {
    if (driftInterval) return
    driftInterval = setInterval(() => {
      if (opts.pool.length === 0) return
      const next = opts.pool[nextPoolIndex % opts.pool.length]
      nextPoolIndex++
      pushEvent(next)
    }, driftMs)
  }

  function stopDrift() {
    if (driftInterval) {
      clearInterval(driftInterval)
      driftInterval = null
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') startDrift()
    else stopDrift()
  }

  function fmtAgo(iso: string): string {
    // Touch nowTick so Vue re-renders this when the tick changes; delegate
    // the actual formatting to the shared util so consumers get identical
    // output to non-reactive call sites.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    nowTick.value
    return sharedFmtAgo(iso)
  }

  onMounted(() => {
    startDrift()
    document.addEventListener('visibilitychange', onVisibility)
    tickInterval = setInterval(() => { nowTick.value++ }, 60_000)
  })

  onBeforeUnmount(() => {
    stopDrift()
    document.removeEventListener('visibilitychange', onVisibility)
    if (tickInterval) clearInterval(tickInterval)
  })

  return { events, fmtAgo, pushEvent }
}

/** Helper to build a seed event with an aged timestamp (`ageSec` seconds ago). */
export function seedEvent(ageSec: number, icon: string, text: string, role?: string): LiveEvent {
  return {
    id: newId(),
    at: new Date(Date.now() - ageSec * 1000).toISOString(),
    icon,
    text,
    role,
  }
}
