<script setup lang="ts">
/**
 * Apex — Front Desk & Quotes (Ada's roles 1 + 2).
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import { calls, callStats } from '@/lib/clients/apex/calls'
import { quotes, quoteFollowupCounts } from '@/lib/clients/apex/quotes'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const cstats = computed(() => callStats())
const recentCalls = computed(() => calls.slice(0, 8))
const followupCounts = computed(() => quoteFollowupCounts())
const followupMax = computed(() => Math.max(1, ...followupCounts.value.map((d) => d.sent)))

const quoteStats = computed(() => {
  const all = quotes
  const open = all.filter((q) => q.stage !== 'booked' && q.stage !== 'opted_out').length
  const booked = all.filter((q) => q.stage === 'booked').length
  const optedOut = all.filter((q) => q.stage === 'opted_out').length
  const pipelineValue = all.filter((q) => q.stage !== 'booked' && q.stage !== 'opted_out')
    .reduce((s, q) => s + q.amount_cents, 0)
  const closeRate = booked + optedOut > 0 ? booked / (booked + optedOut) : 0
  return { open, booked, optedOut, pipelineValue, closeRate }
})

const topOpenQuotes = computed(() =>
  quotes.filter((q) => q.stage !== 'booked' && q.stage !== 'opted_out')
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, 5),
)

function money(cents: number): string {
  if (cents >= 100_000) return '$' + Math.round(cents / 100_000) + 'k'
  return '$' + Math.round(cents / 100).toLocaleString()
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function fmtDuration(s: number): string {
  if (s < 60) return s + 's'
  return Math.floor(s / 60) + 'm ' + (s % 60) + 's'
}

function outcomeClass(o: string): string {
  if (o === 'booked' || o === 'qualified_lead' || o === 'info_provided') return 'bg-success/15 text-success'
  if (o === 'emergency_dispatched') return 'bg-warn/15 text-warn'
  return 'bg-accent/15 text-accent'
}

function stageClass(s: string): string {
  if (s === 'booked') return 'bg-success/15 text-success'
  if (s === 'opted_out') return 'bg-danger/10 text-danger'
  if (s === 'new') return 'bg-accent/15 text-accent'
  return 'bg-warn/15 text-warn'
}

// ── Approval queue: quote follow-ups + after-hours triage ────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'fd-riverpoint',
    icon: '💬',
    badge: 'Quote · stale',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Day-11 nudge — Riverpoint Condos ($14,800)',
    recipient: 'Commercial RTU replace · opened twice · soft tone',
    preview: '"Hey Tom — circling back on the proposal we sent for the rooftop unit. Saw it got opened a couple times so I figured I\'d check in. Happy to walk through the line items, swap parts for budget options, or just answer questions. — Brett, Apex Heating & Air"',
    approved_response: "Sent. If Tom doesn't bite by Wednesday I'll surface the deal as cooled and we'll talk price drop or close-out.",
    ticker_after_approval: 'Riverpoint nudge sent — $14,800 RTU pipeline',
  },
  {
    id: 'fd-patterson',
    icon: '💬',
    badge: 'Quote · day 7',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Day-7 follow-up — Patterson residential ($2,400)',
    recipient: 'Furnace replace · sent 7d ago · 1 click on link',
    preview: '"Hi Sarah — Brett with Apex. Wanted to check in on the furnace quote we sent last week. The financing options I mentioned (24mo no-interest) are still good through end of month if it helps. Otherwise totally fine to take your time — just here when you\'re ready. — Brett"',
    approved_response: "Sent. The financing line tends to convert ~30% of stalled residential quotes — Sarah's clicked the link once which is a buying signal.",
    ticker_after_approval: 'Patterson day-7 nudge sent — $2,400 furnace quote',
  },
  {
    id: 'fd-batch-day7',
    icon: '📋',
    badge: 'Quote · batch',
    badgeClass: 'bg-accent/15 text-accent',
    title: 'Day-7 batch nudge — 5 small residential quotes',
    recipient: '$800-$2,400 range · scheduled for tomorrow 9 AM auto-send',
    preview: 'Scheduled batch — each personalized using the customer\'s service address + the specific quote line items. None require your eyes individually but you can scrub the list if you want.',
    approved_response: "Confirmed — auto-send at 9 AM tomorrow. I'll surface any reply that lands within the day for your eyes.",
    ticker_after_approval: '5 day-7 quote nudges scheduled for 9 AM tomorrow',
  },
  {
    id: 'fd-emergency-callback',
    icon: '🚨',
    badge: 'After-hours',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'After-hours emergency callback — Lisa Reyes',
    recipient: 'Called 11 PM last night · no cooling · house at 87°F · escalated to Marcus',
    preview: 'Marcus dispatched at 11:18 PM, arrived at 11:54 PM. Issue resolved (capacitor swap, $340). Want me to send Lisa a follow-up text this morning checking in + offering a free spring tune-up as a thank-you?',
    approved_response: "Sent. The free-tune-up offer on emergencies converts to recurring customers ~70% of the time — Lisa's exactly the customer you want to keep.",
    ticker_after_approval: 'After-hours follow-up sent to Lisa Reyes',
  },
  {
    id: 'fd-rodriguez',
    icon: '📅',
    badge: 'Booking confirm',
    badgeClass: 'bg-success/15 text-success',
    title: 'Rodriguez wants to schedule — confirm window',
    recipient: 'Replied to quote follow-up · prefers Sat AM',
    preview: '"Hey Carlos — great, glad we connected. Looks like Sat 9 AM works on our end. Tony would be your tech (he was the one who came out for the original estimate). Fair warning, Sat appointments run a $40 weekend surcharge — totally optional, can do Mon AM at no extra. Your call. — Brett"',
    approved_response: "Sent. The transparent surcharge framing is the right call — most customers pick weekday, but giving them the option without forcing the conversation builds trust.",
    ticker_after_approval: 'Rodriguez Sat AM booking confirmation sent',
  },
]

const tickerSeed = [
  { icon: '📞', text: 'Caught a call — service times question, info text sent', ageSec: 4 * 60 },
  { icon: '✅', text: 'Quote opened — Patterson clicked the financing link', ageSec: 21 * 60 },
  { icon: '🚐', text: 'Marcus en-route to no-cooling emergency, ETA 18 min', ageSec: 47 * 60 },
  { icon: '💬', text: 'Quote follow-up reply — Rodriguez wants to schedule Sat', ageSec: 2 * 3600 },
]
const tickerPool = [
  { icon: '📞', text: 'Caught a call — booking inquiry, scheduled for Thu' },
  { icon: '📋', text: 'New quote sent — residential AC replace, $4,200' },
  { icon: '✅', text: 'Quote opened — link clicked from email' },
  { icon: '💬', text: 'Day-3 follow-up landed — open rate 71%' },
  { icon: '⏰', text: 'After-hours line caught a call — escalated to on-call' },
  { icon: '🎯', text: 'Quote closed — $3,800 ductwork repair booked' },
  { icon: '📞', text: 'Caught a call — voicemail captured, transcript sent to Brett' },
]

const tickerRef = ref<InstanceType<typeof GraceLiveTicker> | null>(null)

function onApproved(item: ApprovalQueueItem) {
  if (item.ticker_after_approval) {
    tickerRef.value?.pushEvent({ icon: item.icon, text: item.ticker_after_approval })
  }
}
</script>

<template>
  <div class="space-y-4">
    <GraceLiveTicker
      ref="tickerRef"
      :seed="tickerSeed"
      :pool="tickerPool"
      subtitle="Front desk + quotes activity — auto-updates"
    />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="9"
      heading="Front desk + quotes queue"
      subtitle="Quote follow-ups + after-hours triage drafted by Ada. Approve to send."
      @approved="onApproved"
    />

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Calls handled (7d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ cstats.total }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ cstats.ai_handled }} by Ada · {{ cstats.after_hours }} after-hours</div>
      </div>
      <div class="card">
        <div class="kpi-label">Service appts booked</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ cstats.booked }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">from inbound calls</div>
      </div>
      <div class="card">
        <div class="kpi-label">Open quotes</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ quoteStats.open }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ money(quoteStats.pipelineValue) }} in pipeline</div>
      </div>
      <div class="card">
        <div class="kpi-label">Close rate</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ Math.round(quoteStats.closeRate * 100) }}%</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ quoteStats.booked }} booked · {{ quoteStats.optedOut }} opted out</div>
      </div>
    </div>

    <!-- Front Desk: recent calls -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">📞 Front Desk · Recent calls</span>
          <span class="text-xs text-ink-muted">— what Ada handled at the phone</span>
        </div>
      </div>
      <ul class="space-y-2">
        <li
          v-for="c in recentCalls"
          :key="c.id"
          class="flex items-start gap-3 rounded-md bg-canvas/50 px-3 py-2"
        >
          <span class="text-[10px] text-ink-disabled flex-shrink-0 mt-0.5 w-14">{{ fmtAgo(c.time) }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ c.caller }}</span>
              <span v-if="c.job_type" class="text-[11px] text-ink-muted">— {{ c.job_type }}</span>
              <span class="text-[10px] text-ink-disabled">· {{ fmtDuration(c.duration) }}</span>
            </div>
            <p v-if="c.transcript" class="text-[11px] text-ink-muted mt-0.5 line-clamp-1 italic">"{{ c.transcript.slice(0, 120) }}…"</p>
          </div>
          <span
            class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
            :class="outcomeClass(c.outcome)"
          >{{ c.outcome.replace('_', ' ') }}</span>
        </li>
      </ul>
    </section>

    <!-- Quote follow-ups -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">📋 Quote Follow-Up · Pipeline</span>
          <span class="text-xs text-ink-muted">— Ada's 7-day SMS sequence in your voice</span>
        </div>
      </div>

      <!-- Mini follow-up sends bar -->
      <div class="mb-4">
        <div class="flex items-baseline justify-between mb-2">
          <div class="kpi-label">Follow-ups sent (last 7 days)</div>
          <div class="text-[10px] text-ink-disabled">total: {{ followupCounts.reduce((s, d) => s + d.sent, 0) }}</div>
        </div>
        <div class="flex items-end gap-1 h-16 overflow-hidden">
          <div
            v-for="(d, i) in followupCounts"
            :key="i"
            class="flex-1 bg-brand/30 rounded-t-sm relative min-w-0"
            :style="{ height: Math.max(8, (d.sent / followupMax) * 100) + '%' }"
            :title="`${d.day}: ${d.sent} sent`"
          >
            <span class="absolute -top-4 left-0 right-0 text-center text-[10px] text-ink-disabled tabular-nums">{{ d.sent }}</span>
          </div>
        </div>
        <div class="mt-1 flex gap-1">
          <span v-for="(d, i) in followupCounts" :key="i" class="flex-1 text-center text-[10px] text-ink-disabled">{{ d.day }}</span>
        </div>
      </div>

      <!-- Top open quotes by value -->
      <div>
        <div class="kpi-label mb-2">Top open quotes by value</div>
        <ul class="space-y-1.5">
          <li
            v-for="q in topOpenQuotes"
            :key="q.id"
            class="flex items-center gap-2 text-xs"
          >
            <span class="font-semibold text-ink truncate flex-1">{{ q.customer }}</span>
            <span class="text-ink-muted text-[11px] truncate flex-1">{{ q.job_type }}</span>
            <span class="text-[10px] text-ink-disabled w-12">{{ q.days_in_stage }}d</span>
            <span
              class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
              :class="stageClass(q.stage)"
            >{{ q.stage.replace('followup_day_', 'D') }}</span>
            <span class="font-bold text-ink tabular-nums w-20 text-right">{{ money(q.amount_cents) }}</span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
