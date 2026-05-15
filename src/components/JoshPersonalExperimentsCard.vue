<script setup lang="ts">
/**
 * Josh Personal — experiments card.
 *
 * Shows active N=1 experiments (hypothesis, primary metric, baseline,
 * days remaining, progress bar) and a collapsible "recently completed"
 * list with verdict and outcome.
 *
 * Read-only UI; Sage writes via chat tools (propose_experiment /
 * complete_experiment / abandon_experiment).
 */
import { ref } from 'vue'
import AssistantMark from '@/components/AssistantMark.vue'
import type { Experiment } from '@/lib/clients/josh-personal/experimentsApi'

const props = defineProps<{
  active: Experiment[]
  recentlyCompleted: Experiment[]
  daysRemaining: (e: Experiment) => number
  progressPct: (e: Experiment) => number
}>()

const showCompleted = ref(false)
// Reference the prop so TS doesn't flag it as unused when only the
// template uses it via destructure-helpers. (No-op at runtime.)
void props

const VERDICT_TONE: Record<string, { label: string; cls: string }> = {
  confirmed:    { label: 'Confirmed',    cls: 'bg-success/15 text-success' },
  partial:      { label: 'Partial',      cls: 'bg-brand/15 text-brand' },
  refuted:      { label: 'Refuted',      cls: 'bg-danger/15 text-danger' },
  inconclusive: { label: 'Inconclusive', cls: 'bg-canvas text-ink-muted border border-divider' },
  pending:      { label: 'Pending',      cls: 'bg-canvas text-ink-muted border border-divider' },
}

const CATEGORY_ICON: Record<string, string> = {
  nutrition:  '🍳',
  sleep:      '🌙',
  activity:   '🏋️',
  hydration:  '💧',
  supplement: '💊',
  recovery:   '🧊',
  other:      '🧪',
}

function readyForVerdict(e: Experiment): boolean {
  return props.daysRemaining(e) <= 0
}

function fmtRange(e: Experiment): string {
  const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(e.start_date)} → ${fmt(e.end_date)}`
}

function fmtDelta(e: Experiment): string | null {
  if (e.baseline_value == null || e.end_value == null) return null
  const diff = e.end_value - e.baseline_value
  const sign = diff > 0 ? '+' : ''
  return `${e.baseline_value} → ${e.end_value} (${sign}${diff.toFixed(1)})`
}
</script>

<template>
  <section class="card p-0 overflow-hidden">
    <header class="flex items-center justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Experiments</div>
        <div class="text-xs text-ink-muted mt-0.5">
          <template v-if="active.length > 0">
            {{ active.length }} active {{ active.length === 1 ? 'experiment' : 'experiments' }}
            <span class="text-ink-disabled">· Sage proposes these from chat</span>
          </template>
          <template v-else>
            Track decisions and outcomes — Sage's N=1 hypothesis tester
          </template>
        </div>
      </div>
      <button
        v-if="recentlyCompleted.length > 0"
        type="button"
        class="text-[11px] text-brand font-semibold hover:underline"
        @click="showCompleted = !showCompleted"
      >{{ showCompleted ? 'Hide' : 'Show' }} past {{ recentlyCompleted.length }}</button>
    </header>

    <!-- Empty state (no active, no completed) — make the surface
         discoverable so Josh knows what it does + how to start one. -->
    <div v-if="active.length === 0 && recentlyCompleted.length === 0" class="px-4 py-4">
      <div class="flex items-start gap-3">
        <AssistantMark class="h-5 w-5 text-brand mt-0.5 shrink-0" />
        <div class="flex-1 text-[12px] text-ink-muted leading-relaxed">
          When Sage proposes a target change worth testing — or when you want to try something for a fixed window — it lands here as an experiment with a hypothesis, baseline, and an end date. After it ends, you and Sage review the outcome and lock in what worked.
          <div class="mt-2 text-[11px] text-ink-disabled">
            Try in chat: <code class="font-mono text-ink">"My LDL is 148. Want to propose an experiment to lower it?"</code>
          </div>
        </div>
      </div>
    </div>

    <!-- Active experiments -->
    <ul v-if="active.length > 0" class="divide-y divide-divider">
      <li v-for="e in active" :key="e.id" class="px-4 py-3">
        <div class="flex items-start gap-3">
          <span class="text-base shrink-0 leading-none mt-0.5">{{ CATEGORY_ICON[e.category] ?? '🧪' }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ e.title }}</span>
              <span
                class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                :class="readyForVerdict(e) ? 'bg-warn/15 text-warn' : 'bg-brand/10 text-brand'"
              >
                <template v-if="readyForVerdict(e)">Ready for verdict</template>
                <template v-else>{{ daysRemaining(e) }}d left</template>
              </span>
            </div>
            <p class="text-[12px] text-ink-muted leading-snug mt-0.5">{{ e.hypothesis }}</p>
            <div class="text-[11px] text-ink-disabled mt-1 tabular-nums">
              <span class="text-ink-muted">Watching {{ e.primary_metric }}</span>
              <span v-if="e.baseline_value !== null" class="ml-1">· baseline {{ e.baseline_value }}</span>
              <span class="ml-1">· goal: {{ e.success_criteria }}</span>
            </div>
            <div class="mt-1.5 h-1 w-full bg-brand/15 rounded-full overflow-hidden">
              <div class="h-full bg-brand rounded-full transition-all" :style="{ width: `${progressPct(e)}%` }" />
            </div>
            <div class="text-[10px] text-ink-disabled mt-1">{{ fmtRange(e) }}</div>
          </div>
        </div>
      </li>
    </ul>

    <!-- Recently completed (collapsed) -->
    <ul v-if="showCompleted && recentlyCompleted.length > 0" class="divide-y divide-divider bg-canvas/40">
      <li v-for="e in recentlyCompleted" :key="e.id" class="px-4 py-3">
        <div class="flex items-start gap-3">
          <span class="text-base shrink-0 leading-none mt-0.5">{{ CATEGORY_ICON[e.category] ?? '🧪' }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ e.title }}</span>
              <span
                v-if="e.status === 'completed' && e.verdict"
                class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                :class="(VERDICT_TONE[e.verdict] ?? VERDICT_TONE.inconclusive).cls"
              >{{ (VERDICT_TONE[e.verdict] ?? VERDICT_TONE.inconclusive).label }}</span>
              <span
                v-else-if="e.status === 'abandoned'"
                class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-canvas text-ink-disabled border border-divider"
              >Abandoned</span>
            </div>
            <p class="text-[12px] text-ink-muted leading-snug mt-0.5">{{ e.hypothesis }}</p>
            <div v-if="fmtDelta(e)" class="text-[11px] text-ink mt-1 tabular-nums">
              <span class="text-ink-muted">{{ e.primary_metric }}:</span> {{ fmtDelta(e) }}
            </div>
            <p v-if="e.verdict_notes" class="text-[11px] text-ink-muted italic leading-snug mt-1">
              "{{ e.verdict_notes }}"
            </p>
            <div class="text-[10px] text-ink-disabled mt-1">
              {{ fmtRange(e) }}<span v-if="e.ended_at"> · ended {{ new Date(e.ended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}</span>
            </div>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
