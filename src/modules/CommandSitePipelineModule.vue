<script setup lang="ts">
/**
 * CommandSite Pipeline — sales kanban for prospects.
 * Stages: Cold → Researched → Contacted → Replied → Demo Booked →
 * Demo Done → Proposal → Closed-Won. Closed-Lost sits as a separate
 * collapsed column at the end.
 *
 * Each card shows the next action + due date so the page reads as
 * "what to do next" rather than just a deal directory.
 */
import { computed, ref } from 'vue'
import type { Client, CsDealStage } from '@/types/database'
import {
  STAGE_META,
  SOURCE_LABEL,
  type Deal,
  type PipelineStage,
} from '@/lib/clients/commandsite/pipeline'
import { useDeals, type CreateDealInput } from '@/lib/clients/commandsite/dealsApi'
import CommandSiteAddDealModal from '@/components/CommandSiteAddDealModal.vue'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'
import { useRouter } from 'vue-router'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// Live data layer — falls back to fixture when DB is empty
const { deals, loading, error, usingFixture, createDeal, updateStage } = useDeals()

// Pipeline stats — recomputes when deals change
const stats = computed(() => {
  const openStagesArr: PipelineStage[] = ['cold','researched','contacted','replied','demo_booked','demo_done','proposal']
  const open = deals.value.filter((d) => openStagesArr.includes(d.stage))
  const won = deals.value.filter((d) => d.stage === 'closed_won')
  const lost = deals.value.filter((d) => d.stage === 'closed_lost')
  const by_stage = Object.keys(STAGE_META).reduce<Record<PipelineStage, number>>((acc, s) => {
    acc[s as PipelineStage] = deals.value.filter((d) => d.stage === s).length
    return acc
  }, {} as Record<PipelineStage, number>)
  return {
    total_open: open.length,
    total_open_arr_cents: open.reduce((s, d) => s + d.estimated_arr_cents, 0),
    closed_won_30d: won.length,
    closed_won_30d_arr_cents: won.reduce((s, d) => s + d.estimated_arr_cents, 0),
    closed_lost_30d: lost.length,
    win_rate_30d: (won.length + lost.length) > 0 ? won.length / (won.length + lost.length) : 0,
    by_stage,
  }
})

// Modal state
const modalOpen = ref(false)
const submitError = ref<string | null>(null)
async function handleCreate(input: CreateDealInput) {
  submitError.value = null
  try {
    await createDeal(input)
  } catch (e: unknown) {
    submitError.value = e instanceof Error ? e.message : 'Failed to add deal'
  }
}

// Stage change dropdown state
const stageMenuFor = ref<string | null>(null)
async function changeStage(dealId: string, newStage: CsDealStage) {
  stageMenuFor.value = null
  try {
    await updateStage(dealId, newStage)
  } catch (e: unknown) {
    submitError.value = e instanceof Error ? e.message : 'Failed to update stage'
  }
}

const openStages: PipelineStage[] = [
  'cold','researched','contacted','replied','demo_booked','demo_done','proposal','closed_won',
]

function dealsIn(stage: PipelineStage): Deal[] {
  return deals.value
    .filter((d) => d.stage === stage)
    .sort((a, b) => b.estimated_arr_cents - a.estimated_arr_cents)
}

function stageValue(stage: PipelineStage): number {
  return dealsIn(stage).reduce((s, d) => s + d.estimated_arr_cents, 0)
}

function money(cents: number, opts: { compact?: boolean } = {}): string {
  // Compact mode: only for deals >= $10k. Below that, the precision matters
  // more than the brevity (a $7,188 church deal reads better as "$7,188"
  // than "$7k", and the old threshold of cents >= 100_000 also had a unit
  // bug that divided by 1000 instead of 100_000, so $7,188 displayed as
  // $719k).
  if (opts.compact && cents >= 1_000_000) {
    return '$' + Math.round(cents / 100_000) + 'k'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtDueIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms < 0) {
    const overdueDays = Math.floor(Math.abs(ms) / (24 * 60 * 60 * 1000))
    if (overdueDays === 0) return 'Overdue today'
    return `Overdue ${overdueDays}d`
  }
  const hr = Math.floor(ms / (60 * 60 * 1000))
  if (hr < 24) return `In ${hr}h`
  const day = Math.floor(hr / 24)
  return day === 1 ? 'Tomorrow' : `In ${day}d`
}

function dueColor(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms < 0) return '#EF4444'
  if (ms < 24 * 60 * 60 * 1000) return '#F59E0B'
  return '#94A3B8'
}

function lastTouchLabel(d: Deal): string {
  switch (d.last_touch_kind) {
    case 'email': return 'Email'
    case 'call': return 'Call'
    case 'meeting': return 'Meeting'
    case 'linkedin': return 'LinkedIn'
    default: return 'Note'
  }
}

function fmtDays(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1d in stage'
  return `${days}d in stage`
}

const lostDeals = computed(() => dealsIn('closed_lost'))

// ── Live ticker + stale-deal queue ────────────────────────────────────
const router = useRouter()

const staleQueue = computed<ApprovalQueueItem[]>(() => {
  const STAGE_THRESHOLDS: Record<string, number> = {
    cold: 14, researched: 7, contacted: 4, replied: 3,
    demo_booked: 1, demo_done: 3, proposal: 5,
  }
  const items: ApprovalQueueItem[] = []
  for (const d of deals.value) {
    if (d.stage === 'closed_won' || d.stage === 'closed_lost') continue
    const threshold = STAGE_THRESHOLDS[d.stage] ?? 7
    const days = d.days_in_stage ?? 0
    if (days < threshold) continue

    const stageMeta = STAGE_META[d.stage as PipelineStage]
    items.push({
      id: `pipe-stale-${d.id}`,
      icon: 'clock',
      badge: 'Stale deal',
      badgeClass: 'bg-warn/15 text-warn',
      title: `${d.company_name} — ${days}d in ${stageMeta?.label ?? d.stage}`,
      recipient: `${d.contact_name ?? ''} · ${d.estimated_arr_cents > 0 ? '$' + Math.round(d.estimated_arr_cents / 100).toLocaleString() + ' ARR' : 'no ARR set'}`,
      preview: nudgePreviewFor(d.stage, d.company_name),
      approved_response: `Routing to the deal card. Update next-action + due, or use Ada's drafted nudge if there is one.`,
      ticker_after_approval: `Surfaced ${d.company_name} for next-step decision`,
    })
    if (items.length >= 5) break
  }
  return items
})

function nudgePreviewFor(stage: string, company: string): string {
  if (stage === 'replied' || stage === 'contacted') {
    return `Reply landed but no demo booked. Suggested: Ada drafts a "want to grab 30 min this week?" nudge with your Calendly link. Approve to open ${company}'s deal card.`
  }
  if (stage === 'demo_booked') {
    return `Demo on the calendar but no pre-call brief generated yet. Approve to open the deal card and click "Generate brief" before the call.`
  }
  if (stage === 'demo_done') {
    return `Demo finished, no post-call follow-up sent. Suggested: fill in the post-call form so Ada can draft the recap email.`
  }
  if (stage === 'proposal') {
    return `Proposal sent but no movement. Suggested: Ada drafts a "soft check-in" nudge — typically lifts response 18%. Approve to open ${company}'s deal card.`
  }
  return `${company} hasn't moved recently. Open the deal card to update next-action or change stage.`
}

const tickerSeed = computed(() => {
  const events: { icon: string; text: string; ageSec: number }[] = []
  for (const d of deals.value.slice(0, 6)) {
    const days = d.days_in_stage ?? 0
    const ageSec = days * 86400
    const stageMap: Record<string, string> = {
      cold:        'Added to pipeline',
      researched:  'Researched',
      contacted:   'First touch sent',
      replied:     'Replied',
      demo_booked: 'Demo booked',
      demo_done:   'Demo complete',
      proposal:    'Proposal sent',
      closed_won:  'Closed won',
      closed_lost: 'Closed lost',
    }
    const label = stageMap[d.stage] ?? d.stage
    const stageIcon =
      d.stage === 'cold'        ? 'referral_hunter' :
      d.stage === 'researched'  ? 'flask' :
      d.stage === 'contacted'   ? 'email_marketing' :
      d.stage === 'replied'     ? 'qa_assistant' :
      d.stage === 'demo_booked' ? 'calendar' :
      d.stage === 'demo_done'   ? 'check-circle' :
      d.stage === 'proposal'    ? 'quote_followup' :
      d.stage === 'closed_won'  ? 'trending-up' :
      d.stage === 'closed_lost' ? 'alert-triangle' :
      'shuffle'
    events.push({ icon: stageIcon, text: `${d.company_name} · ${label}`, ageSec })
  }
  if (events.length === 0) {
    return [{ icon: 'flask', text: 'Pipeline ready · promote leads from Outreach replies, or add deals manually', ageSec: 0 }]
  }
  return events.sort((a, b) => a.ageSec - b.ageSec).slice(0, 5)
})

const tickerPool = [
  { icon: 'calendar',        text: 'Calendly fired · deal auto-promoted to demo_booked' },
  { icon: 'check-circle',    text: 'Demo complete · stage advanced to demo_done' },
  { icon: 'email_marketing', text: 'Proposal sent · stage advanced to proposal' },
  { icon: 'trending-up',     text: 'Deal closed won · first MRR pending' },
  { icon: 'clock',           text: 'Stale-deal sweep · N deals flagged for action' },
  { icon: 'qa_assistant',    text: 'Reply landed on a pipeline deal · surfaced to top' },
]

const pipelineTicker = ref<InstanceType<typeof GraceLiveTicker> | null>(null)

function onPipelineApproved(item: ApprovalQueueItem) {
  if (item.ticker_after_approval) {
    pipelineTicker.value?.pushEvent({ icon: item.icon, text: item.ticker_after_approval })
  }
  // Route to the pipeline page (we're already on it — could scroll to deal card or open detail later)
  router.push({ name: 'dashboard.tab', params: { slug: 'commandsite', tab: 'pipeline' } }).catch(() => { /* ignore */ })
}
</script>

<template>
  <div class="space-y-4">
    <GraceLiveTicker
      ref="pipelineTicker"
      :seed="tickerSeed"
      :pool="tickerPool"
      subtitle="Pipeline activity — stage transitions, Calendly bookings, brief generations"
    />

    <GraceApprovalQueue
      v-if="staleQueue.length > 0"
      :items="staleQueue"
      :initial-resolved="0"
      heading="Stale deals — Ada flagged"
      subtitle="Each deal stuck longer than its stage threshold. Approve to surface the deal card and decide next move."
      resolved-label="Acted on this week"
      @approved="onPipelineApproved"
    />

    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Pipeline</h2>
        <p class="text-sm text-ink-muted">
          Open deals from cold lead to signed customer. Each card has the next action + due date — work the high-value ones first.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span
          v-if="usingFixture"
          class="inline-flex items-center gap-1.5 rounded-full bg-warn/15 text-warn px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          title="No real deals yet — showing the demo fixture. Add your first deal to flip to live data."
        >
          Demo data · add a deal to go live
        </span>
        <span
          v-else-if="!loading"
          class="inline-flex items-center gap-1.5 rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
          Live · {{ deals.length }} deals
        </span>
        <button
          type="button"
          class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90"
          @click="modalOpen = true"
        >+ Add deal</button>
      </div>
    </div>

    <!-- Errors -->
    <div v-if="error || submitError" class="card border border-danger/30 bg-danger/5">
      <p class="text-sm text-danger">⚠ {{ error || submitError }}</p>
      <p v-if="error?.includes('cs_deals')" class="text-xs text-ink-muted mt-1">
        Looks like the <code class="font-mono">cs_deals</code> table doesn't exist yet. Run migration <code class="font-mono">supabase/migrations/0021_cs_deals.sql</code> in your Supabase SQL editor.
      </p>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Open Deals</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.total_open }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Open Pipeline ARR</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(stats.total_open_arr_cents) }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Won (30d)</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ stats.closed_won_30d }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ money(stats.closed_won_30d_arr_cents) }} ARR added</div>
      </div>
      <div class="card">
        <div class="kpi-label">Win Rate (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ (stats.win_rate_30d * 100).toFixed(0) }}%
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">
          {{ stats.closed_won_30d }} won · {{ stats.closed_lost_30d }} lost
        </div>
      </div>
    </div>

    <!-- Kanban scroller -->
    <div class="overflow-x-auto">
      <div class="flex gap-3 min-w-fit pb-2">
        <div
          v-for="stage in openStages"
          :key="stage"
          class="w-[320px] flex-shrink-0"
        >
          <!-- Column header -->
          <div
            class="rounded-t-card px-3 py-2.5 flex items-center justify-between gap-2 text-ink-inverse"
            :style="{ backgroundColor: STAGE_META[stage].color }"
          >
            <div class="min-w-0">
              <div class="text-sm font-semibold truncate">{{ STAGE_META[stage].label }}</div>
              <div class="text-[10px] opacity-90 truncate">{{ STAGE_META[stage].sub }}</div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-base font-bold tabular-nums leading-none">{{ dealsIn(stage).length }}</div>
              <div class="text-[10px] opacity-90 tabular-nums">{{ money(stageValue(stage), { compact: true }) }}</div>
            </div>
          </div>

          <!-- Cards -->
          <div class="rounded-b-card bg-surface-elevated/40 p-2 space-y-2 min-h-[160px]">
            <article
              v-for="d in dealsIn(stage)"
              :key="d.id"
              class="card !p-3 !shadow-none border border-divider hover:border-brand/40 transition-colors"
            >
              <!-- Card header: company + ARR -->
              <div class="flex items-start justify-between gap-2 mb-1.5">
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-semibold text-ink truncate">{{ d.company_name }}</div>
                  <div class="text-[11px] text-ink-muted truncate">
                    {{ d.contact_name }} · {{ d.contact_title }}
                  </div>
                </div>
                <div class="text-sm font-bold text-brand tabular-nums whitespace-nowrap">
                  {{ money(d.estimated_arr_cents, { compact: true }) }}
                </div>
              </div>

              <!-- Meta -->
              <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-ink-muted mb-2">
                <span>{{ d.industry }}</span>
                <span>·</span>
                <span>{{ d.city }}, {{ d.state }}</span>
                <span>·</span>
                <span>{{ d.team_size }} techs</span>
                <span>·</span>
                <span>{{ SOURCE_LABEL[d.source] }}</span>
              </div>

              <!-- Next action -->
              <div class="rounded-md bg-surface-elevated/60 border border-divider/60 p-2">
                <div class="flex items-center justify-between gap-2 mb-0.5">
                  <span class="text-[9px] font-bold uppercase tracking-wide text-ink-disabled">Next action</span>
                  <span
                    class="text-[10px] font-semibold tabular-nums"
                    :style="{ color: dueColor(d.next_action_due_at) }"
                  >{{ fmtDueIn(d.next_action_due_at) }}</span>
                </div>
                <p class="text-[11px] text-ink leading-snug">{{ d.next_action }}</p>
              </div>

              <!-- Footer -->
              <div class="mt-2 flex items-center justify-between gap-2 text-[10px] text-ink-disabled">
                <span>{{ fmtDays(d.days_in_stage) }}</span>
                <div class="flex items-center gap-2">
                  <span>Last: {{ lastTouchLabel(d) }}</span>
                  <!-- Stage-change menu (only on real DB-backed deals) -->
                  <div v-if="!usingFixture" class="relative">
                    <button
                      type="button"
                      class="text-ink-disabled hover:text-brand font-semibold"
                      @click.stop="stageMenuFor = stageMenuFor === d.id ? null : d.id"
                      :aria-label="'Move ' + d.company_name"
                    >Move ▾</button>
                    <div
                      v-if="stageMenuFor === d.id"
                      class="absolute right-0 bottom-full mb-1 z-10 w-44 rounded-md bg-surface border border-divider shadow-lg py-1"
                      @click.stop
                    >
                      <button
                        v-for="s in (Object.keys(STAGE_META) as PipelineStage[])"
                        :key="s"
                        type="button"
                        class="w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-elevated transition-colors"
                        :class="d.stage === s ? 'text-ink-disabled cursor-default' : 'text-ink'"
                        :disabled="d.stage === s"
                        @click="changeStage(d.id, s as CsDealStage)"
                      >
                        <span
                          class="inline-block h-2 w-2 rounded-full mr-1.5 align-middle"
                          :style="{ backgroundColor: STAGE_META[s].color }"
                        ></span>
                        {{ STAGE_META[s].label }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <div
              v-if="dealsIn(stage).length === 0"
              class="px-3 py-6 text-center text-[11px] text-ink-disabled italic"
            >
              No deals in this stage.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Closed Lost (collapsed list) -->
    <details class="card">
      <summary class="cursor-pointer flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Closed Lost</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">{{ lostDeals.length }} deals</span>
        </div>
        <span class="text-[11px] text-ink-disabled">Click to expand</span>
      </summary>
      <div class="mt-3 space-y-1.5">
        <div
          v-for="d in lostDeals"
          :key="d.id"
          class="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-elevated/40 transition-colors"
        >
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-ink">{{ d.company_name }}</div>
            <div class="text-[11px] text-ink-muted">{{ d.contact_name }} · {{ d.industry }} · {{ d.city }}</div>
          </div>
          <div class="text-xs text-ink-muted italic flex-1 text-right truncate">{{ d.notes }}</div>
          <div class="text-sm tabular-nums text-ink-disabled w-20 text-right">{{ money(d.estimated_arr_cents, { compact: true }) }}</div>
        </div>
      </div>
    </details>

    <!-- Add Deal modal -->
    <CommandSiteAddDealModal
      :open="modalOpen"
      @close="modalOpen = false"
      @created="handleCreate"
    />
  </div>
</template>
