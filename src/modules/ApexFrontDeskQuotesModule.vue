<script setup lang="ts">
/**
 * Apex — Front Desk & Quotes (Ada's roles 1 + 2).
 */
import { computed } from 'vue'
import type { Client } from '@/types/database'
import { calls, callStats } from '@/lib/clients/apex/calls'
import { quotes, quoteFollowupCounts } from '@/lib/clients/apex/quotes'
import ApexAdaActivityStrip from '@/components/ApexAdaActivityStrip.vue'

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
</script>

<template>
  <div class="space-y-4">
    <ApexAdaActivityStrip
      tab-key="front-desk-quotes"
      summary="Ada catches every call your shop misses + chases every quote you send. Two of the highest-leverage things she does — first-touch revenue and estimate close rate."
      :activity="[
        { icon: '📞', label: `Caught ${cstats.total} calls this week`, detail: `${cstats.booked} booked service appts · ${cstats.emergency_dispatched} emergencies escalated to you`, ago: 'rolling' },
        { icon: '📋', label: `${quoteStats.open} quotes in active follow-up`, detail: `${money(quoteStats.pipelineValue)} pipeline · 7-day SMS sequence in your voice`, ago: 'live' },
        { icon: '✏', label: 'Drafted 1 soft check-in', detail: 'Largest open quote — opened twice, no response', ago: '2h ago' },
      ]"
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
