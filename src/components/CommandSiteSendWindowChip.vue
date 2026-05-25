<script setup lang="ts">
/**
 * Send-window status chip.
 *
 * Reads cs_settings.outreach_send_window + counts today's sends, computes
 * whether Ada is allowed to fire right now, and renders a compact status
 * pill: "Open · 12/50 today" or "Closed until 9:00 AM ET tomorrow".
 *
 * Mirrors the server-side gate logic in supabase/functions/gmail-send. If
 * you change one, change the other or the operator will see a UI/server
 * disagreement.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'

interface SendWindow {
  tz_strategy: 'recipient_local' | 'sender_local' | 'fixed_et'
  weekday_hours: { start: number; end: number }
  allowed_days: string[]
  blocked_dates: string[]
  max_per_day: number
  jitter_minutes: number
  followup_reserve_pct?: number
}

interface SendsSplit {
  total: number
  cold_t1: number
  followup: number
}

const TZ = 'America/New_York'

const window_ = ref<SendWindow | null>(null)
const split = ref<SendsSplit>({ total: 0, cold_t1: 0, followup: 0 })
const now = ref(new Date())
const loading = ref(true)
let nowTimer: ReturnType<typeof setInterval> | null = null

async function load() {
  const [settings, splitRes] = await Promise.all([
    supabase.from('cs_settings').select('outreach_send_window').eq('id', 1).maybeSingle(),
    supabase.rpc('cs_outreach_sends_today_split', { p_tz: TZ } as never),
  ])
  window_.value = (settings.data as { outreach_send_window?: SendWindow } | null)?.outreach_send_window ?? null
  // The RPC returns a single-row set; normalize to a scalar.
  const raw = Array.isArray(splitRes.data) ? splitRes.data[0] : splitRes.data
  split.value = {
    total: Number((raw as { total?: number } | null)?.total ?? 0),
    cold_t1: Number((raw as { cold_t1?: number } | null)?.cold_t1 ?? 0),
    followup: Number((raw as { followup?: number } | null)?.followup ?? 0),
  }
  loading.value = false
}

onMounted(() => {
  load()
  // Refresh time every 60s so the chip flips state without a page reload
  nowTimer = setInterval(() => { now.value = new Date() }, 60_000)
  // Re-fetch the count every 2 min so the cap progress stays current
  setInterval(load, 120_000)
})

onBeforeUnmount(() => {
  if (nowTimer) clearInterval(nowTimer)
})

interface Status {
  open: boolean
  reason: string
  hour: number
  weekday: string
}

const reserveBreakdown = computed(() => {
  if (!window_.value) return null
  const pct = Math.max(0, Math.min(100, window_.value.followup_reserve_pct ?? 0))
  const reserve = Math.floor(window_.value.max_per_day * pct / 100)
  const coldBudget = Math.max(0, window_.value.max_per_day - reserve)
  return { reserve, coldBudget, pct }
})

const status = computed<Status | null>(() => {
  if (!window_.value) return null
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit', hour12: false,
    weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = fmt.formatToParts(now.value).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})
  const hour = parseInt(parts.hour, 10)
  const weekday = parts.weekday.toLowerCase().slice(0, 3)
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`
  const w = window_.value
  const sendsToday = split.value.total

  if (sendsToday >= w.max_per_day) {
    return { open: false, reason: `Daily cap hit (${sendsToday}/${w.max_per_day})`, hour, weekday }
  }
  if (w.blocked_dates.includes(isoDate)) {
    return { open: false, reason: 'Blocked date (holiday/blackout)', hour, weekday }
  }
  if (!w.allowed_days.includes(weekday)) {
    return { open: false, reason: `${weekday.toUpperCase()} not allowed`, hour, weekday }
  }
  if (hour < w.weekday_hours.start) {
    return { open: false, reason: `Opens at ${w.weekday_hours.start}:00 ET`, hour, weekday }
  }
  if (hour >= w.weekday_hours.end) {
    return { open: false, reason: `Closed at ${w.weekday_hours.end}:00 ET`, hour, weekday }
  }
  return { open: true, reason: `${sendsToday}/${w.max_per_day} today`, hour, weekday }
})

const tooltip = computed(() => {
  if (!status.value || !reserveBreakdown.value) return ''
  const { coldBudget, reserve } = reserveBreakdown.value
  const lines = [
    status.value.open
      ? 'Ada can send right now. The cron + sign-off button will fire.'
      : 'Sends are blocked. Drafts queue up and fire when the window reopens.',
    '',
    `Cold T1: ${split.value.cold_t1}/${coldBudget} used`,
    `Follow-ups (T2/T3): ${split.value.followup}/${reserve}+ used`,
  ]
  return lines.join('\n')
})
</script>

<template>
  <div
    v-if="!loading && status"
    class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold"
    :class="status.open
      ? 'border-success/30 bg-success/10 text-success'
      : 'border-warn/30 bg-warn/10 text-warn'"
    :title="tooltip"
  >
    <span class="relative flex h-1.5 w-1.5">
      <span
        v-if="status.open"
        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"
      ></span>
      <span
        class="relative inline-flex rounded-full h-1.5 w-1.5"
        :class="status.open ? 'bg-success' : 'bg-warn'"
      ></span>
    </span>
    <span class="uppercase tracking-wider">
      {{ status.open ? 'Sends open' : 'Sends closed' }}
    </span>
    <span class="text-ink-muted font-normal normal-case tracking-normal">· {{ status.reason }}</span>
  </div>
</template>
