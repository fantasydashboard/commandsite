<script setup lang="ts">
/**
 * CommandSite Support — three views: open tickets queue, active
 * onboardings (with checklist progress), and KB hot articles.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  tickets,
  onboardings,
  kbArticles,
  supportStats,
  SEVERITY_META,
  STATUS_META,
  ONBOARDING_STATUS_META,
  KB_CATEGORY_LABEL,
  type Ticket,
  type TicketStatus,
} from '@/lib/clients/commandsite/support'

defineProps<{ client: Client; config: Record<string, unknown> }>()

type View = 'tickets' | 'onboarding' | 'kb'
const view = ref<View>('tickets')
const stats = computed(() => supportStats())

// Tickets
type StatusFilter = TicketStatus | 'open' | 'all'
const statusFilter = ref<StatusFilter>('open')

const visibleTickets = computed<Ticket[]>(() => {
  return tickets
    .filter((t) => {
      if (statusFilter.value === 'all')  return true
      if (statusFilter.value === 'open') return t.status !== 'resolved'
      return t.status === statusFilter.value
    })
    .sort((a, b) => {
      const sevOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
      const sevDiff = sevOrder[a.severity] - sevOrder[b.severity]
      if (sevDiff !== 0) return sevDiff
      return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
    })
})

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
function fmtUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms < 0) return 'Overdue'
  const hr = Math.floor(ms / (60 * 60 * 1000))
  if (hr < 24) return `in ${hr}h`
  return `in ${Math.floor(hr / 24)}d`
}

// Onboarding helpers
function obProgress(checklist: { done: boolean }[]): number {
  if (checklist.length === 0) return 0
  return checklist.filter((c) => c.done).length / checklist.length
}
function pct(v: number): string { return `${(v * 100).toFixed(0)}%` }

// KB helpers
const sortedKb = computed(() =>
  [...kbArticles].sort((a, b) => b.views_30d - a.views_30d),
)
const refreshNeeded = computed(() => kbArticles.filter((a) => a.needs_refresh))

function num(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toLocaleString()
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Support</h2>
        <p class="text-sm text-ink-muted">
          Open tickets, active customer onboardings, and the KB articles doing the heaviest deflection work.
        </p>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Open Tickets</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.open_tickets }}</div>
        <div class="text-[11px] mt-0.5" :class="stats.urgent_tickets > 0 ? 'text-danger font-semibold' : 'text-ink-disabled'">
          {{ stats.urgent_tickets }} urgent
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Median Response</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.median_response_h }}h</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">first-touch on new tickets</div>
      </div>
      <div class="card">
        <div class="kpi-label">Active Onboardings</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.active_onboardings }}</div>
        <div class="text-[11px] mt-0.5" :class="stats.onboardings_at_risk > 0 ? 'text-warn font-semibold' : 'text-ink-disabled'">
          {{ stats.onboardings_at_risk }} at-risk
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">KB Views (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ num(stats.kb_views_30d) }}</div>
        <div class="text-[11px] mt-0.5" :class="stats.kb_articles_needing_refresh > 0 ? 'text-warn' : 'text-ink-disabled'">
          {{ stats.kb_articles_needing_refresh }} need refresh
        </div>
      </div>
    </div>

    <!-- View toggle -->
    <div class="card flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        class="chip"
        :class="view === 'tickets' ? 'chip-active' : ''"
        @click="view = 'tickets'"
      >
        Tickets ({{ stats.open_tickets }})
        <span v-if="stats.urgent_tickets > 0" class="ml-1 rounded-full bg-danger text-white px-1.5 text-[10px] font-bold">{{ stats.urgent_tickets }}</span>
      </button>
      <button
        type="button"
        class="chip"
        :class="view === 'onboarding' ? 'chip-active' : ''"
        @click="view = 'onboarding'"
      >Onboardings ({{ stats.active_onboardings }})</button>
      <button
        type="button"
        class="chip"
        :class="view === 'kb' ? 'chip-active' : ''"
        @click="view = 'kb'"
      >Knowledge Base ({{ kbArticles.length }})</button>
    </div>

    <!-- ═════════════ TICKETS ═════════════ -->
    <div v-if="view === 'tickets'" class="space-y-3">
      <!-- Status filter -->
      <div class="card">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="chip"
            :class="statusFilter === 'open' ? 'chip-active' : ''"
            @click="statusFilter = 'open'"
          >Open ({{ tickets.filter((t) => t.status !== 'resolved').length }})</button>
          <button
            v-for="(meta, k) in STATUS_META"
            :key="k"
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-white"
            :style="statusFilter === k
              ? { backgroundColor: meta.color }
              : { backgroundColor: meta.color + '22', color: meta.color }"
            @click="statusFilter = (k as TicketStatus)"
          >{{ meta.label }} ({{ tickets.filter((t) => t.status === k).length }})</button>
          <button
            type="button"
            class="chip"
            :class="statusFilter === 'all' ? 'chip-active' : ''"
            @click="statusFilter = 'all'"
          >All ({{ tickets.length }})</button>
        </div>
      </div>

      <article
        v-for="t in visibleTickets"
        :key="t.id"
        class="card"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                :style="{ backgroundColor: SEVERITY_META[t.severity].color }"
              >{{ SEVERITY_META[t.severity].label }}</span>
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                :style="{ backgroundColor: STATUS_META[t.status].color }"
              >{{ STATUS_META[t.status].label }}</span>
              <h3 class="text-sm font-semibold text-ink">{{ t.subject }}</h3>
            </div>
            <div class="text-[11px] text-ink-disabled flex flex-wrap items-center gap-x-2">
              <span class="font-semibold text-ink-muted">{{ t.customer_company }}</span>
              <span>· {{ t.reporter_name }}</span>
              <span>· via {{ t.channel }}</span>
              <span>· opened {{ fmtAgo(t.created_at) }}</span>
              <span>· last activity {{ fmtAgo(t.last_activity_at) }}</span>
            </div>
            <p class="mt-2 text-sm text-ink leading-relaxed">{{ t.body }}</p>
            <div v-if="t.suggested_kb" class="mt-2 inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[11px] font-semibold">
              📖 Suggested KB: {{ kbArticles.find((a) => a.id === t.suggested_kb)?.title }}
            </div>
          </div>
          <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
            <div class="text-right">
              <div class="text-[10px] uppercase tracking-wider text-ink-disabled">Assigned</div>
              <div class="text-xs font-semibold text-ink">{{ t.assignee }}</div>
            </div>
            <button
              type="button"
              class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 whitespace-nowrap"
            >Reply</button>
            <button
              type="button"
              class="text-[10px] text-ink-disabled hover:text-ink-muted"
            >Resolve</button>
          </div>
        </div>
      </article>

      <div
        v-if="visibleTickets.length === 0"
        class="card text-center text-sm text-ink-muted italic py-6"
      >
        Nothing here. Inbox zero is real.
      </div>
    </div>

    <!-- ═════════════ ONBOARDING ═════════════ -->
    <div v-if="view === 'onboarding'" class="space-y-3">
      <article
        v-for="o in onboardings"
        :key="o.id"
        class="card"
      >
        <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <h3 class="text-base font-semibold text-ink">{{ o.customer_company }}</h3>
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                :style="{ backgroundColor: ONBOARDING_STATUS_META[o.status].color }"
              >{{ ONBOARDING_STATUS_META[o.status].label }}</span>
              <span class="rounded-full bg-surface-elevated text-ink-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Day {{ o.day_of_14 }} of 14
              </span>
            </div>
            <div class="text-[11px] text-ink-disabled">
              {{ o.primary_contact_name }} · {{ o.primary_contact_email }} · signed {{ fmtAgo(o.signed_at) }}
            </div>
            <p class="mt-2 text-xs text-ink-muted italic">📝 {{ o.csm_notes }}</p>
          </div>
          <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
            <div class="text-right">
              <div class="text-2xl font-bold tabular-nums" :style="{ color: ONBOARDING_STATUS_META[o.status].color }">
                {{ pct(obProgress(o.checklist)) }}
              </div>
              <div class="text-[10px] uppercase tracking-wider text-ink-disabled">complete</div>
            </div>
            <div v-if="o.next_call_at" class="text-right">
              <div class="text-[10px] uppercase tracking-wider text-ink-disabled">Next call</div>
              <div class="text-xs font-semibold text-brand">{{ fmtUntil(o.next_call_at) }}</div>
            </div>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="h-2 rounded-full bg-surface-elevated/60 overflow-hidden mb-3">
          <div
            class="h-full rounded-full transition-all"
            :style="{
              width: (obProgress(o.checklist) * 100) + '%',
              backgroundColor: ONBOARDING_STATUS_META[o.status].color,
            }"
          ></div>
        </div>

        <!-- Checklist -->
        <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <li
            v-for="item in o.checklist"
            :key="item.key"
            class="flex items-center gap-2"
          >
            <span
              class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0"
              :class="item.done ? 'bg-success/15 text-success' : 'bg-surface-elevated text-ink-disabled'"
            >{{ item.done ? '✓' : '○' }}</span>
            <span :class="item.done ? 'text-ink-muted line-through' : 'text-ink'">{{ item.label }}</span>
          </li>
        </ul>
      </article>
    </div>

    <!-- ═════════════ KB ═════════════ -->
    <div v-if="view === 'kb'" class="space-y-3">
      <!-- Refresh-needed callout -->
      <section v-if="refreshNeeded.length > 0" class="card border border-warn/30 bg-warn/5">
        <div class="flex items-start gap-3">
          <span class="text-2xl">⏰</span>
          <div class="flex-1">
            <h3 class="text-sm font-semibold text-ink mb-1">{{ refreshNeeded.length }} article{{ refreshNeeded.length === 1 ? '' : 's' }} need a refresh</h3>
            <p class="text-xs text-ink-muted mb-2">Updated more than 90 days ago — content may have drifted out of date.</p>
            <ul class="space-y-1">
              <li
                v-for="a in refreshNeeded"
                :key="a.id"
                class="text-xs flex items-center gap-2"
              >
                <span class="text-warn">→</span>
                <span class="text-ink font-medium">{{ a.title }}</span>
                <span class="text-[10px] text-ink-disabled">· last updated {{ fmtAgo(a.last_updated_at) }}</span>
                <span class="text-[10px] text-ink-disabled">· {{ pct(a.ticket_deflection_rate) }} deflection</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- All articles, sorted by views -->
      <section class="card overflow-hidden">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Knowledge Base</span>
          <span class="text-xs text-ink-muted">Sorted by views (last 30 days)</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th class="px-3 py-2 font-medium">Article</th>
                <th class="px-3 py-2 font-medium">Category</th>
                <th class="px-3 py-2 font-medium text-right">Views (30d)</th>
                <th class="px-3 py-2 font-medium text-right">Deflection</th>
                <th class="px-3 py-2 font-medium text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="a in sortedKb"
                :key="a.id"
                class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
              >
                <td class="px-3 py-2.5">
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-ink">{{ a.title }}</span>
                    <span v-if="a.needs_refresh" class="rounded-full bg-warn/15 text-warn px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Needs refresh</span>
                  </div>
                </td>
                <td class="px-3 py-2.5 text-xs text-ink-muted">{{ KB_CATEGORY_LABEL[a.category] }}</td>
                <td class="px-3 py-2.5 text-right text-sm tabular-nums text-ink">{{ a.views_30d.toLocaleString() }}</td>
                <td class="px-3 py-2.5 text-right text-sm tabular-nums" :class="a.ticket_deflection_rate >= 0.4 ? 'text-success' : 'text-ink-muted'">
                  {{ pct(a.ticket_deflection_rate) }}
                </td>
                <td class="px-3 py-2.5 text-right text-xs text-ink-muted">{{ fmtAgo(a.last_updated_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mt-3 text-[11px] text-ink-disabled">
          <span class="font-semibold text-ink-muted">Deflection</span> = % of viewers who don't open a ticket within 24h after reading.
        </div>
      </section>
    </div>
  </div>
</template>
