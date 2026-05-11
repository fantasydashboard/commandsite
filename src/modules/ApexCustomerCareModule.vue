<script setup lang="ts">
/**
 * Apex — Customer Care (Ada's roles 3 + 4).
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import { customers, customerStats, STAGE_META, type Customer, type FunnelStage } from '@/lib/clients/apex/customers'
import { reactivations, reactivationStats } from '@/lib/clients/apex/reactivation'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const cstats = computed(() => customerStats())
const rstats = computed(() => reactivationStats())

type Filter = FunnelStage | 'all' | 'at_risk'
const filter = ref<Filter>('at_risk')

const stageOrder: FunnelStage[] = ['new_lead','engaged','quoted','booked','job_complete','review_requested','won','dormant','lost']

// Compute "active" + "at-risk" + "dormant" from funnel_stage
const counts = computed(() => {
  return {
    active: customers.filter((c) => ['booked','job_complete','review_requested','won'].includes(c.funnel_stage)).length,
    at_risk: customers.filter((c) => c.funnel_stage === 'dormant').length,
    dormant: customers.filter((c) => c.funnel_stage === 'dormant').length,
    won: customers.filter((c) => c.funnel_stage === 'won').length,
  }
})

const filtered = computed<Customer[]>(() => {
  return [...customers].filter((c) => {
    if (filter.value === 'all') return true
    if (filter.value === 'at_risk') return c.funnel_stage === 'dormant' || c.funnel_stage === 'lost'
    return c.funnel_stage === filter.value
  }).slice(0, 12)
})

const recentReactivations = computed(() => reactivations.slice(0, 6))

function money(cents: number): string {
  if (cents >= 100_000) return '$' + Math.round(cents / 100_000) + 'k'
  return '$' + Math.round(cents / 100).toLocaleString()
}

function fmtAgo(iso?: string): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'today'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${(days / 365).toFixed(1)}yr ago`
}

function reactStatusClass(s: string): string {
  if (s === 'won_back' || s === 'booked') return 'bg-success/15 text-success'
  if (s === 'engaged') return 'bg-brand/15 text-brand'
  if (s === 'contacted') return 'bg-warn/15 text-warn'
  return 'bg-ink-muted/10 text-ink-muted'
}

// ── Approval queue: reactivation + at-risk outreach ─────────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'cc-hendersons',
    icon: '🔁',
    badge: 'Reactivation',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Tune-up reminder — The Hendersons',
    recipient: 'Recurring AC tune-up overdue 6 wks · 4-yr customer',
    preview: '"Hi Henderson Family — Ada here from Apex. Your spring AC tune-up usually lands in March and we hadn\'t heard from you yet — wanted to flag it before the heat really hits. Want me to grab you a slot this week? I have Tue and Thu morning open. — Ada (for Brett at Apex)"',
    approved_response: "Sent. The Hendersons are in the easy-yes tier — they've booked every spring + fall tune-up for 4 years. Watching for response.",
    ticker_after_approval: 'Tune-up reminder sent to the Hendersons',
  },
  {
    id: 'cc-coronado',
    icon: '🏢',
    badge: 'Replace job',
    badgeClass: 'bg-success/15 text-success',
    title: 'Replace-job opportunity — Coronado Property Mgmt',
    recipient: '3 service calls in 60d · Tony noted "system at end of life"',
    preview: '"Hey Marcus — Brett at Apex. Saw the recent service tickets on the building 2 unit and Tony\'s notes flagged it as nearing end of life. Before another emergency call eats your weekend, want to grab 30 min and walk through replacement options? No obligation — just want to give you the budget picture. — Brett"',
    approved_response: "Sent. Property managers usually bite on the budget framing. I'll route his reply to your calendar within the hour.",
    ticker_after_approval: 'Replace-job outreach sent to Coronado Property',
  },
  {
    id: 'cc-patel',
    icon: '⏰',
    badge: 'Late payment',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Friendly nudge — Mike Patel',
    recipient: 'Last invoice 31d out · paid late twice prior · still active',
    preview: '"Hey Mike — Brett at Apex. Just a friendly heads-up that your invoice from last month is still showing open on our end — figured I\'d ask before our system starts auto-reminders. If something\'s up, just hit reply, no judgment. Otherwise here\'s the payment link. — Brett"',
    approved_response: "Sent. Personal nudges from owners get paid 2.4× faster than system reminders. If he doesn't respond by Wed I'll surface for a phone call instead.",
    ticker_after_approval: 'Friendly payment nudge sent to Mike Patel',
  },
  {
    id: 'cc-batch-dormant',
    icon: '🔁',
    badge: 'Reactivation · batch',
    badgeClass: 'bg-accent/15 text-accent',
    title: 'Next dormant batch — 23 customers',
    recipient: '23 dormant >365d · ICP-scored + sequenced · ready to send',
    preview: 'Each one personalized to their last service date, system type, and any seasonal trigger (AC tune-up before summer, furnace check before winter). Won-back rate on the first batch was 21% — $6,840 in recovered revenue.',
    approved_response: "Confirmed. Batch will go out tomorrow morning at 7 AM in tranches of 5 (paced so any reply gets a fast human response). Surface any positive replies within 30 min.",
    ticker_after_approval: '23-customer reactivation batch scheduled for 7 AM tomorrow',
  },
  {
    id: 'cc-recently-won',
    icon: '🎉',
    badge: 'Win nurture',
    badgeClass: 'bg-success/15 text-success',
    title: 'Welcome-back note — recently reactivated customer',
    recipient: 'The Marshes · came back after 14mo · just had Tue install',
    preview: '"Hey Marsh family — wanted to send a quick note now that the install is done. Really glad you came back to us. As a small thank-you for sticking with Apex, I\'ve added you to our priority callback list — emergency calls from your number get bumped to top of queue. — Brett"',
    approved_response: "Sent. The priority-list framing builds loyalty cheaply. They've already left a 5★ review (logged separately).",
    ticker_after_approval: 'Welcome-back note sent to the Marshes',
  },
]

const tickerSeed = [
  { icon: '🔁', text: 'Reactivation reply — dormant customer wants tune-up', ageSec: 8 * 60 },
  { icon: '⚠', text: 'Late-payment threshold crossed — Mike Patel flagged', ageSec: 3 * 3600 },
  { icon: '🎉', text: 'Won back — The Marshes booked install (after 14mo gap)', ageSec: 6 * 3600 },
  { icon: '📊', text: 'Customer health swept — 47 dormant, 23 in ready-to-send batch', ageSec: 12 * 3600 },
]
const tickerPool = [
  { icon: '🔁', text: 'Reactivation message opened — dormant customer engaged' },
  { icon: '✅', text: 'Tune-up booked from reactivation — $240 recovered' },
  { icon: '⚠', text: 'New at-risk flag — recurring-service interval exceeded' },
  { icon: '💚', text: 'Customer health score recomputed — 142 active, 47 dormant' },
  { icon: '🎉', text: 'Won-back conversion — dormant → booked' },
  { icon: '📞', text: 'Reactivation reply — dormant customer asked for callback' },
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
      subtitle="Customer care signals — reactivations, at-risk flags, won-backs"
    />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="7"
      heading="Customer care queue"
      subtitle="Reactivations + at-risk outreach drafted by Ada. Approve to send."
      @approved="onApproved"
    />

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Active customers</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ counts.active }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ cstats.total }} total in CRM</div>
      </div>
      <div class="card">
        <div class="kpi-label">Dormant pool</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="counts.dormant > 0 ? 'text-warn' : 'text-ink'">{{ counts.dormant }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">last service > 365d</div>
      </div>
      <div class="card">
        <div class="kpi-label">In reactivation</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ rstats.contacted }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ rstats.engaged }} replied · {{ rstats.booked }} booked</div>
      </div>
      <div class="card">
        <div class="kpi-label">Recovered (lifetime)</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ money(rstats.recovered_value_cents) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">from {{ rstats.won_back }} won-back customers</div>
      </div>
    </div>

    <!-- Customer health: at-risk + dormant directory -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">💚 Customer Health · Directory</span>
          <span class="text-xs text-ink-muted">— Ada's churn-risk watch</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5 mb-3">
        <button type="button" class="chip" :class="filter === 'all' ? 'chip-active' : ''" @click="filter = 'all'">All ({{ customers.length }})</button>
        <button
          type="button"
          class="rounded-full px-3 py-1 text-xs font-semibold transition-colors text-white"
          :style="filter === 'at_risk'
            ? { backgroundColor: '#F59E0B' }
            : { backgroundColor: '#F59E0B22', color: '#F59E0B' }"
          @click="filter = 'at_risk'"
        >⚠ At-risk + dormant ({{ customers.filter((c) => c.funnel_stage === 'dormant' || c.funnel_stage === 'lost').length }})</button>
        <button
          v-for="s in stageOrder"
          :key="s"
          type="button"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-white"
          :style="filter === s
            ? { backgroundColor: STAGE_META[s].color }
            : { backgroundColor: STAGE_META[s].color + '22', color: STAGE_META[s].color }"
          @click="filter = s"
        >{{ STAGE_META[s].label }}</button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-2 py-2 font-medium">Customer</th>
              <th class="px-2 py-2 font-medium">Stage</th>
              <th class="px-2 py-2 font-medium">Last touch</th>
              <th class="px-2 py-2 font-medium text-right">LTV</th>
              <th class="px-2 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in filtered" :key="c.id" class="border-b border-divider/60">
              <td class="px-2 py-2">
                <div class="text-sm font-semibold text-ink">{{ c.name }}</div>
                <div class="text-[10px] text-ink-muted">{{ c.address }}</div>
              </td>
              <td class="px-2 py-2">
                <span
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white whitespace-nowrap"
                  :style="{ backgroundColor: STAGE_META[c.funnel_stage].color }"
                >{{ STAGE_META[c.funnel_stage].label }}</span>
              </td>
              <td class="px-2 py-2 text-[11px] text-ink-muted">{{ fmtAgo(c.last_touch_at) }}</td>
              <td class="px-2 py-2 text-right font-semibold text-ink tabular-nums">{{ money(c.lifetime_value_cents) }}</td>
              <td class="px-2 py-2 text-[11px] text-ink-muted truncate max-w-[300px]">{{ c.notes ?? '—' }}</td>
            </tr>
            <tr v-if="filtered.length === 0">
              <td colspan="5" class="text-center py-4 text-xs text-ink-disabled italic">No customers match this filter.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Reactivation activity -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">🔁 Reactivation · Recent outreach</span>
          <span class="text-xs text-ink-muted">— dormant customers Ada is pulling back</span>
        </div>
      </div>
      <ul class="space-y-2">
        <li
          v-for="r in recentReactivations"
          :key="r.id"
          class="rounded-md bg-canvas/50 px-3 py-2 flex items-center gap-2 flex-wrap"
        >
          <span class="text-sm font-semibold text-ink min-w-0 truncate w-40">{{ r.customer }}</span>
          <span class="text-[11px] text-ink-muted truncate flex-1">last service: {{ r.last_service }} · {{ r.contact_attempts }} touches</span>
          <span class="text-[10px] text-ink-disabled">est. {{ money(r.estimated_value_cents) }}</span>
          <span
            class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
            :class="reactStatusClass(r.status)"
          >{{ r.status.replace('_', ' ') }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
