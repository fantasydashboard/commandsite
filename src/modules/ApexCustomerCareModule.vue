<script setup lang="ts">
/**
 * Apex — Customer Care.
 * Ada's roles on this page: 💚 Customer Health + 🔁 Reactivation Engine + 🎯 Deal-Won Handoff.
 */
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import type { Client } from '@/types/database'
import { customers, customerStats, STAGE_META, type Customer, type FunnelStage } from '@/lib/clients/apex/customers'
import { reactivations, reactivationStats } from '@/lib/clients/apex/reactivation'
import { rolesOnTab, getRole } from '@/lib/clients/apex/roles'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'
import LiveActivityFeed from '@/components/ada/LiveActivityFeed.vue'
import RolesOnPage from '@/components/ada/RolesOnPage.vue'
import { useLiveActivity, seedEvent, type PoolEvent } from '@/composables/useLiveActivity'
import { money, fmtAgoCoarse } from '@/lib/format'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const cstats = computed(() => customerStats())
const rstats = computed(() => reactivationStats())

type Filter = FunnelStage | 'all' | 'at_risk' | 'active'
const filter = ref<Filter>('at_risk')
const showMoreStages = ref(false)

// 9 funnel stages, hidden behind "More stages" disclosure.
const stageOrder: FunnelStage[] = ['new_lead','engaged','quoted','booked','job_complete','review_requested','won','dormant','lost']
const ACTIVE_STAGES: FunnelStage[] = ['booked','job_complete','review_requested','won']

const counts = computed(() => ({
  all: customers.length,
  active: customers.filter((c) => ACTIVE_STAGES.includes(c.funnel_stage)).length,
  at_risk: customers.filter((c) => c.funnel_stage === 'dormant' || c.funnel_stage === 'lost').length,
  dormant: customers.filter((c) => c.funnel_stage === 'dormant').length,
}))

function stageCount(s: FunnelStage): number {
  return customers.filter((c) => c.funnel_stage === s).length
}

const isOnSpecificStage = computed(() =>
  filter.value !== 'all' && filter.value !== 'at_risk' && filter.value !== 'active',
)

const filtered = computed<Customer[]>(() => {
  return [...customers].filter((c) => {
    if (filter.value === 'all') return true
    if (filter.value === 'at_risk') return c.funnel_stage === 'dormant' || c.funnel_stage === 'lost'
    if (filter.value === 'active') return ACTIVE_STAGES.includes(c.funnel_stage)
    return c.funnel_stage === filter.value
  }).slice(0, 12)
})

function setStage(s: FunnelStage) {
  filter.value = s
  showMoreStages.value = false
}

// ── "More stages" disclosure a11y: Escape to close + click-outside ────
const moreStagesWrap = ref<HTMLElement | null>(null)
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && showMoreStages.value) {
    showMoreStages.value = false
  }
}
function onDocumentClick(e: MouseEvent) {
  if (!showMoreStages.value) return
  const target = e.target as Node | null
  if (target && moreStagesWrap.value && !moreStagesWrap.value.contains(target)) {
    showMoreStages.value = false
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onDocumentClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onDocumentClick)
})

const recentReactivations = computed(() => reactivations.slice(0, 6))

// ── Deal-Won Handoff (new section) ─────────────────────────────────────
// Customers Ada onboarded this week after their quote closed. Auto-welcome
// sent + calendar held. Shows the bridge from "deal closed" → "active customer".
interface Handoff {
  id: string
  customer: string
  closed_label: string
  welcome_status: 'sent' | 'opened' | 'replied'
  calendar_held: string
  ticket_cents: number
}
const recentHandoffs: Handoff[] = [
  { id: 'h1', customer: 'Patricia Andrews',  closed_label: 'today',      welcome_status: 'opened',  calendar_held: 'Thu 1–3 PM · Maintenance',          ticket_cents:  28_000 },
  { id: 'h2', customer: 'The Marshes',       closed_label: '2 days ago', welcome_status: 'replied', calendar_held: 'Tue 9 AM · Install (done)',         ticket_cents: 184_000 },
  { id: 'h3', customer: 'James Sullivan',    closed_label: '3 days ago', welcome_status: 'opened',  calendar_held: 'Fri 10 AM · Mini-split install',    ticket_cents:  85_000 },
  { id: 'h4', customer: 'Yvonne Castillo',   closed_label: '4 days ago', welcome_status: 'opened',  calendar_held: 'Mon 8 AM · Heat pump install',      ticket_cents: 120_000 },
  { id: 'h5', customer: 'Marcus Henley',     closed_label: '5 days ago', welcome_status: 'sent',    calendar_held: 'Wed 11 AM · Capacitor replacement', ticket_cents:  18_500 },
  { id: 'h6', customer: 'Greg Hammond',      closed_label: '6 days ago', welcome_status: 'replied', calendar_held: 'Thu 2 PM · Tune-up + filter swap',  ticket_cents:  22_000 },
]
const handoffStats = computed(() => {
  const opened = recentHandoffs.filter((h) => h.welcome_status === 'opened' || h.welcome_status === 'replied').length
  const replied = recentHandoffs.filter((h) => h.welcome_status === 'replied').length
  return {
    count: recentHandoffs.length,
    openRate: opened / recentHandoffs.length,
    replyRate: replied / recentHandoffs.length,
    totalCents: recentHandoffs.reduce((s, h) => s + h.ticket_cents, 0),
  }
})
function handoffStatusClass(s: Handoff['welcome_status']): string {
  if (s === 'replied') return 'bg-success/15 text-success'
  if (s === 'opened') return 'bg-brand/15 text-brand'
  return 'bg-ink-muted/10 text-ink-muted'
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
    role: 'reactivation',
    icon: 'reactivation',
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
    role: 'reactivation',
    icon: 'building',
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
    role: 'customer_health',
    icon: 'clock',
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
    role: 'reactivation',
    icon: 'reactivation',
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
    role: 'reactivation',
    icon: 'check-circle',
    badge: 'Win nurture',
    badgeClass: 'bg-success/15 text-success',
    title: 'Welcome-back note — recently reactivated customer',
    recipient: 'The Marshes · came back after 14mo · just had Tue install',
    preview: '"Hey Marsh family — wanted to send a quick note now that the install is done. Really glad you came back to us. As a small thank-you for sticking with Apex, I\'ve added you to our priority callback list — emergency calls from your number get bumped to top of queue. — Brett"',
    approved_response: "Sent. The priority-list framing builds loyalty cheaply. They've already left a 5★ review (logged separately).",
    ticker_after_approval: 'Welcome-back note sent to the Marshes',
  },
]

// ── Live activity (scoped to Customer Care) ───────────────────────────
const liveSeed = [
  seedEvent(8 * 60,    'reactivation', 'Reactivation reply — dormant customer wants tune-up',           'reactivation'),
  seedEvent(3 * 3600,  'alert-triangle',  'Late-payment threshold crossed — Mike Patel flagged',           'customer_health'),
  seedEvent(6 * 3600,  'check-circle', 'Won back — The Marshes booked install (after 14mo gap)',        'reactivation'),
  seedEvent(12 * 3600, 'performance_reporting', 'Customer health swept — 47 dormant, 23 in ready-to-send batch', 'customer_health'),
]
const livePool: PoolEvent[] = [
  { icon: 'reactivation', text: 'Reactivation message opened — dormant customer engaged',    role: 'reactivation' },
  { icon: 'check-circle', text: 'Tune-up booked from reactivation — $240 recovered',           role: 'reactivation' },
  { icon: 'alert-triangle',  text: 'New at-risk flag — recurring-service interval exceeded',     role: 'customer_health' },
  { icon: 'customer_health', text: 'Customer health score recomputed — 142 active, 47 dormant',  role: 'customer_health' },
  { icon: 'check-circle', text: 'Won-back conversion — dormant → booked',                     role: 'reactivation' },
  { icon: 'deal_won_handoff', text: 'Deal-Won Handoff — Yvonne Castillo onboarded · install Mon', role: 'deal_won_handoff' },
  { icon: 'email_marketing', text: 'Welcome message opened — new customer clicked calendar link', role: 'deal_won_handoff' },
]

const { events: liveEvents, fmtAgo: fmtLiveAgo, pushEvent } = useLiveActivity({
  seed: liveSeed,
  pool: livePool,
})

function onApproved(item: ApprovalQueueItem) {
  if (!item.ticker_after_approval) return
  const role = item.role ?? 'customer_health'
  pushEvent({ icon: item.icon, text: item.ticker_after_approval, role })
}

const pageRoles = rolesOnTab('customer-care')
</script>

<template>
  <div class="space-y-4">
    <RolesOnPage :roles="pageRoles" />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="7"
      assistant-name="Ada"
      :push-approved-to-chat="false"
      heading="Customer care"
      subtitle="Reactivations + at-risk outreach drafted by Ada. Co-sign to send."
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
    <section id="customer_health" class="card scroll-mt-24">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Customer Health · Directory</span>
          <span class="text-xs text-ink-muted">Ada's churn-risk watch</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5 mb-3">
        <button
          type="button"
          class="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          :class="filter === 'at_risk'
            ? 'bg-warn text-ink-inverse'
            : 'bg-warn/15 text-warn hover:bg-warn/25'"
          @click="filter = 'at_risk'"
        >At-risk + dormant ({{ counts.at_risk }})</button>
        <button
          type="button"
          class="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
          :class="filter === 'active'
            ? 'bg-success text-ink-inverse'
            : 'bg-success/15 text-success hover:bg-success/25'"
          @click="filter = 'active'"
        >Active ({{ counts.active }})</button>
        <button
          type="button"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
          :class="filter === 'all'
            ? 'bg-ink text-ink-inverse'
            : 'bg-surface-elevated text-ink-muted hover:text-ink'"
          @click="filter = 'all'"
        >All ({{ counts.all }})</button>

        <!-- Overflow disclosure for the 9 individual funnel stages -->
        <div ref="moreStagesWrap" class="relative">
          <button
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium border border-divider bg-surface-raised text-ink-muted hover:border-brand hover:text-brand transition-[transform,color,border-color] duration-150 ease-out-quart active:scale-[0.97] inline-flex items-center gap-1"
            :class="isOnSpecificStage ? 'border-brand text-brand' : ''"
            aria-haspopup="menu"
            :aria-expanded="showMoreStages"
            @click="showMoreStages = !showMoreStages"
          >
            <span>{{ isOnSpecificStage ? STAGE_META[filter as FunnelStage].label : 'More stages' }}</span>
            <span class="text-[10px]">{{ showMoreStages ? '▴' : '▾' }}</span>
          </button>
          <Transition
            enter-active-class="transition-[opacity,transform] duration-150 ease-out-quart"
            enter-from-class="opacity-0 scale-[0.97]"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition-[opacity,transform] duration-100 ease-out-quart"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-[0.97]"
          >
            <div
              v-if="showMoreStages"
              role="menu"
              class="absolute top-full left-0 mt-1 z-10 origin-top-left rounded-card border border-divider bg-surface-raised shadow-card p-2 flex flex-wrap gap-1 min-w-[20rem] max-w-md"
            >
              <button
                v-for="s in stageOrder"
                :key="s"
                type="button"
                class="rounded-full px-3 py-1 text-xs font-medium transition-[transform,opacity] duration-150 ease-out-quart active:scale-[0.97] text-ink-inverse"
                :style="filter === s
                  ? { backgroundColor: STAGE_META[s].color }
                  : { backgroundColor: STAGE_META[s].color + '22', color: STAGE_META[s].color }"
                @click="setStage(s)"
              >{{ STAGE_META[s].label }} ({{ stageCount(s) }})</button>
            </div>
          </Transition>
        </div>
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
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-inverse whitespace-nowrap"
                  :style="{ backgroundColor: STAGE_META[c.funnel_stage].color }"
                >{{ STAGE_META[c.funnel_stage].label }}</span>
              </td>
              <td class="px-2 py-2 text-[11px] text-ink-muted">{{ fmtAgoCoarse(c.last_touch_at) }}</td>
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
    <section id="reactivation" class="card scroll-mt-24">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Reactivation · Recent outreach</span>
          <span class="text-xs text-ink-muted">dormant customers Ada is pulling back</span>
        </div>
      </div>
      <ul class="space-y-2">
        <li
          v-for="r in recentReactivations"
          :key="r.id"
          class="rounded-md bg-surface-elevated/60 px-3 py-2 flex items-center gap-2 flex-wrap"
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

    <!-- Deal-Won Handoff (NEW) -->
    <section id="deal_won_handoff" class="card scroll-mt-24">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Deal-Won Handoff · Recent welcomes</span>
          <span class="text-xs text-ink-muted">Ada onboards every new customer the moment their quote closes</span>
        </div>
      </div>

      <!-- Handoff KPI row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div class="rounded-md bg-surface-elevated/60 px-3 py-2">
          <div class="kpi-label">Onboarded this week</div>
          <div class="mt-0.5 text-lg font-bold text-ink tabular-nums">{{ handoffStats.count }}</div>
        </div>
        <div class="rounded-md bg-surface-elevated/60 px-3 py-2">
          <div class="kpi-label">Welcome open rate</div>
          <div class="mt-0.5 text-lg font-bold text-success tabular-nums">{{ Math.round(handoffStats.openRate * 100) }}%</div>
        </div>
        <div class="rounded-md bg-surface-elevated/60 px-3 py-2">
          <div class="kpi-label">Replied</div>
          <div class="mt-0.5 text-lg font-bold text-brand tabular-nums">{{ Math.round(handoffStats.replyRate * 100) }}%</div>
        </div>
        <div class="rounded-md bg-surface-elevated/60 px-3 py-2">
          <div class="kpi-label">Onboarded $ value</div>
          <div class="mt-0.5 text-lg font-bold text-ink tabular-nums">{{ money(handoffStats.totalCents) }}</div>
        </div>
      </div>

      <!-- Handoff list -->
      <ul class="space-y-2">
        <li
          v-for="h in recentHandoffs"
          :key="h.id"
          class="rounded-md bg-surface-elevated/60 px-3 py-2 flex items-center gap-2 flex-wrap"
        >
          <span class="text-sm font-semibold text-ink min-w-0 truncate w-40">{{ h.customer }}</span>
          <span class="text-[11px] text-ink-muted truncate flex-1">closed {{ h.closed_label }} · {{ h.calendar_held }}</span>
          <span class="text-[10px] text-ink-disabled">{{ money(h.ticket_cents) }}</span>
          <span
            class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
            :class="handoffStatusClass(h.welcome_status)"
          >Welcome · {{ h.welcome_status }}</span>
        </li>
      </ul>
    </section>

    <LiveActivityFeed
      :events="liveEvents"
      :fmt-ago="fmtLiveAgo"
      :get-role="getRole"
      title="Customer care signals"
      subtitle="Reactivations, at-risk flags, won-backs · auto-updates"
    />
  </div>
</template>
