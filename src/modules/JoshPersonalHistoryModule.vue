<script setup lang="ts">
/**
 * Josh Personal — History tab.
 *
 * Replaces the old Goals tab. The artifact: every decision Sage and
 * Josh have made + what came of it. Three cards:
 *   1. Sage's 30-day recap (cached, refresh button)
 *   2. Sage's persistent observations about Josh
 *   3. Decisions timeline — experiments + target changes interleaved
 */
import { computed } from 'vue'
import type { Client } from '@/types/database'
import AssistantMark from '@/components/AssistantMark.vue'
import {
  useSageSummary,
  useSageObservations,
  useDecisionTimeline,
  type DecisionEntry,
} from '@/lib/clients/josh-personal/historyApi'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const { state: summary, refreshing: summaryRefreshing, refresh: refreshSummary, refreshedAgo: summaryRefreshedAgo } = useSageSummary()
const { observations, archive: archiveObservation } = useSageObservations()
const { entries: timelineEntries, loading: timelineLoading } = useDecisionTimeline(90)

// ── Helpers ─────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 60) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

const HIGHLIGHT_KIND_TONE: Record<string, string> = {
  experiment_completed: 'bg-success/15 text-success',
  experiment_active:    'bg-brand/10 text-brand',
  target_change:        'bg-warn/15 text-warn',
  adherence:            'bg-success/10 text-success',
  weight:               'bg-brand/10 text-brand',
  workout:              'bg-brand/10 text-brand',
  pattern:              'bg-warn/10 text-warn',
}

const CONFIDENCE_TONE: Record<string, string> = {
  hunch:     'bg-canvas text-ink-muted border border-divider',
  pattern:   'bg-brand/10 text-brand',
  confirmed: 'bg-success/15 text-success',
}

const CATEGORY_ICON: Record<string, string> = {
  nutrition: '🍳', sleep: '🌙', activity: '🏋️', hydration: '💧',
  supplement: '💊', recovery: '🧊', other: '🧪',
}

const VERDICT_TONE: Record<string, { label: string; cls: string }> = {
  confirmed:    { label: 'Confirmed',    cls: 'bg-success/15 text-success' },
  partial:      { label: 'Partial',      cls: 'bg-brand/15 text-brand' },
  refuted:      { label: 'Refuted',      cls: 'bg-danger/15 text-danger' },
  inconclusive: { label: 'Inconclusive', cls: 'bg-canvas text-ink-muted border border-divider' },
  pending:      { label: 'Pending',      cls: 'bg-canvas text-ink-muted border border-divider' },
}

function decisionTitle(e: DecisionEntry): string {
  if (e.kind === 'experiment') return e.title ?? '(experiment)'
  return `${e.scope === 'target' ? 'Target' : 'Profile'} · ${e.field_key}`
}

function decisionSubtitle(e: DecisionEntry): string {
  if (e.kind === 'experiment') return e.hypothesis ?? ''
  const o = JSON.stringify(e.old_value)
  const n = JSON.stringify(e.new_value)
  return `${o} → ${n}`
}

function deltaText(e: DecisionEntry): string | null {
  if (e.kind !== 'experiment') return null
  if (e.baseline_value == null || e.end_value == null) return null
  const diff = e.end_value - e.baseline_value
  const sign = diff > 0 ? '+' : ''
  return `${e.primary_metric}: ${e.baseline_value} → ${e.end_value} (${sign}${diff.toFixed(1)})`
}

const hasAnyDecisions = computed(() => timelineEntries.value.length > 0)
const hasObservations = computed(() => observations.value.length > 0)
</script>

<template>
  <div class="space-y-5">
    <!-- ── Header ─────────────────────────────────────────────────── -->
    <div>
      <h2 class="text-xl font-semibold text-ink">History</h2>
      <p class="text-xs text-ink-muted mt-0.5">
        Every decision, experiment, and observation — with what came of it.
      </p>
    </div>

    <!-- ── Sage's 30-day recap ────────────────────────────────────── -->
    <section class="rounded-card border-2 border-brand/40 bg-brand/5 overflow-hidden">
      <header class="px-5 py-3 border-b border-brand/20 bg-brand/10 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <AssistantMark class="h-5 w-5 text-brand" />
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
            Sage's 30-day recap
            <span v-if="summary" class="text-ink-muted font-normal normal-case ml-1">· refreshed {{ summaryRefreshedAgo }}</span>
          </span>
        </div>
        <button
          type="button"
          class="text-[11px] text-brand font-semibold hover:underline disabled:opacity-50"
          :disabled="summaryRefreshing"
          @click="refreshSummary"
        >
          <span v-if="summaryRefreshing">Sage is summarizing…</span>
          <span v-else>Refresh</span>
        </button>
      </header>
      <div v-if="!summary" class="px-5 py-4">
        <p class="text-sm text-ink-muted">
          No recap yet. Tap refresh and Sage will pull the last 30 days — experiments, target changes, adherence, weight pace — and write you the story.
        </p>
      </div>
      <div v-else class="px-5 py-4">
        <p class="text-sm text-ink leading-relaxed">{{ summary.body }}</p>
        <div v-if="summary.highlights.length > 0" class="flex flex-wrap gap-2 mt-3">
          <span
            v-for="(h, i) in summary.highlights"
            :key="i"
            class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            :class="HIGHLIGHT_KIND_TONE[h.kind] ?? 'bg-canvas text-ink-muted'"
          >{{ h.label }}</span>
        </div>
        <div class="text-[10px] text-ink-disabled mt-3">
          Window {{ fmtDate(summary.window_start) }} → {{ fmtDate(summary.window_end) }}
        </div>
      </div>
    </section>

    <!-- ── Sage's persistent observations ─────────────────────────── -->
    <section class="card p-0 overflow-hidden">
      <header class="px-4 py-3 border-b border-divider bg-surface-elevated">
        <div class="flex items-center gap-2">
          <AssistantMark class="h-4 w-4 text-brand" />
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Sage's observations about you</span>
        </div>
        <div class="text-[11px] text-ink-muted mt-0.5">
          <template v-if="hasObservations">
            {{ observations.length }} long-term {{ observations.length === 1 ? 'note' : 'notes' }} Sage has logged across sessions
          </template>
          <template v-else>
            Sage hasn't logged any long-term notes yet. They'll start appearing as patterns hold across weeks.
          </template>
        </div>
      </header>
      <ul v-if="hasObservations" class="divide-y divide-divider">
        <li v-for="o in observations" :key="o.id" class="px-4 py-3 group">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span
                  class="text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5"
                  :class="CONFIDENCE_TONE[o.confidence] ?? CONFIDENCE_TONE.pattern"
                >{{ o.confidence }}</span>
                <span v-for="t in o.tags" :key="t" class="text-[10px] bg-canvas border border-divider rounded-full px-2 py-0.5 text-ink-muted">{{ t }}</span>
                <span class="text-[10px] text-ink-disabled ml-auto">{{ fmtRelative(o.set_at) }}</span>
              </div>
              <p class="text-sm text-ink leading-snug">{{ o.body }}</p>
            </div>
            <button
              type="button"
              class="text-[11px] text-ink-disabled hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              title="Archive — Sage will stop using this"
              @click="archiveObservation(o.id)"
            >Archive</button>
          </div>
        </li>
      </ul>
    </section>

    <!-- ── Decisions timeline ─────────────────────────────────────── -->
    <section class="card p-0 overflow-hidden">
      <header class="px-4 py-3 border-b border-divider bg-surface-elevated">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Decisions timeline · last 90 days</div>
        <div class="text-[11px] text-ink-muted mt-0.5">
          <template v-if="timelineLoading">Loading…</template>
          <template v-else-if="hasAnyDecisions">{{ timelineEntries.length }} {{ timelineEntries.length === 1 ? 'entry' : 'entries' }} — newest first</template>
          <template v-else>No decisions in the last 90 days. Once you and Sage start running experiments or adjusting targets, they show up here.</template>
        </div>
      </header>
      <ul v-if="hasAnyDecisions" class="divide-y divide-divider">
        <li v-for="e in timelineEntries" :key="`${e.kind}-${e.id}`" class="px-4 py-3">
          <div class="flex items-start gap-3">
            <span class="text-base shrink-0 leading-none mt-0.5">
              <template v-if="e.kind === 'experiment'">{{ CATEGORY_ICON[e.category ?? 'other'] ?? '🧪' }}</template>
              <template v-else>🔧</template>
            </span>
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline justify-between gap-2 flex-wrap">
                <span class="text-sm font-semibold text-ink">{{ decisionTitle(e) }}</span>
                <div class="flex items-center gap-2 shrink-0">
                  <span
                    v-if="e.kind === 'experiment' && e.status === 'completed' && e.verdict"
                    class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                    :class="(VERDICT_TONE[e.verdict] ?? VERDICT_TONE.inconclusive).cls"
                  >{{ (VERDICT_TONE[e.verdict] ?? VERDICT_TONE.inconclusive).label }}</span>
                  <span
                    v-else-if="e.kind === 'experiment' && e.status === 'active'"
                    class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-brand/15 text-brand"
                  >Active</span>
                  <span
                    v-else-if="e.kind === 'experiment' && e.status === 'abandoned'"
                    class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-canvas text-ink-disabled border border-divider"
                  >Abandoned</span>
                  <span
                    v-else-if="e.kind === 'target_change'"
                    class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-warn/10 text-warn"
                  >{{ e.source === 'sage' ? 'Sage edit' : 'Manual' }}</span>
                  <span class="text-[10px] text-ink-disabled tabular-nums">{{ fmtRelative(e.occurred_at) }}</span>
                </div>
              </div>
              <p class="text-[12px] text-ink-muted leading-snug mt-0.5">{{ decisionSubtitle(e) }}</p>
              <div v-if="deltaText(e)" class="text-[11px] text-ink mt-1 tabular-nums">{{ deltaText(e) }}</div>
              <p v-if="e.kind === 'experiment' && e.verdict_notes" class="text-[11px] text-ink-muted italic leading-snug mt-1">
                "{{ e.verdict_notes }}"
              </p>
              <p v-if="e.kind === 'target_change' && e.reason" class="text-[11px] text-ink-muted italic leading-snug mt-1">
                {{ e.reason }}
              </p>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
