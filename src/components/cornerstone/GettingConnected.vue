<script setup lang="ts">
/**
 * Focal Point - "Getting Connected": the assimilation cohort. Of everyone who
 * first visited in the last 12 months, how far they have gotten, first visit,
 * Starting Point completed, Meet the Pastor, serving, in a group. Milestone bars
 * (not a strict funnel: a visitor can join a group without serving). Scopes by
 * congregation. Pairs with the Discipleship Pathway below (connect, then grow).
 */
import { computed } from 'vue'
import { assimilation } from '@/lib/clients/focal-point/assimilation'
import { useCongregationLens } from '@/stores/congregationLens'

const lens = useCongregationLens()
const m = computed(() => assimilation[lens.scope])
const pct = (n: number) => Math.round((n / Math.max(1, m.value.visited)) * 100)

const steps = computed(() => [
  { label: 'First-time visit', value: m.value.visited, sub: 'signed in at Starting Point', tone: 'brand' },
  { label: 'Completed Starting Point', value: m.value.completedSP, sub: 'finished the intro next-steps', tone: 'brand' },
  { label: 'Met the Pastor', value: m.value.metPastor, sub: 'came to a Meet the Pastor', tone: 'brand' },
  { label: 'Started serving', value: m.value.serving, sub: 'joined a team', tone: 'accent' },
  { label: 'Joined a Growth Group', value: m.value.group, sub: 'in a group now', tone: 'accent' },
] as const)

// The biggest single drop after the first visit, to point at the follow-up leak.
const biggestGap = computed(() => `${100 - pct(m.value.completedSP)}%`)
const scopeLabel = computed(() => (lens.scope === 'all' ? 'across the church' : `in the ${lens.scope} ministry`))
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Getting Connected</span>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Live from Planning Center · last 12 months
      </span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">How far your recent visitors have gotten</h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      Of the <span class="font-semibold text-ink">{{ m.visited }}</span> people who first visited in the last year {{ scopeLabel }}, how many have reached each step on the way to belonging.
    </p>

    <ul class="mt-4 space-y-3">
      <li v-for="(s, i) in steps" :key="s.label">
        <div class="mb-1 flex items-baseline justify-between gap-3">
          <span class="text-sm font-medium text-ink">{{ s.label }}</span>
          <span class="shrink-0 text-xs text-ink-muted">
            <span class="font-semibold text-ink tabular-nums">{{ s.value }}</span>
            <span v-if="i > 0" class="ml-1 tabular-nums">· {{ pct(s.value) }}%</span>
          </span>
        </div>
        <div class="h-3 overflow-hidden rounded-full bg-surface-elevated">
          <div
            class="h-full rounded-full transition-[width] duration-500 ease-out"
            :class="s.tone === 'accent' ? 'bg-accent' : 'bg-brand'"
            :style="{ width: Math.max(3, pct(s.value)) + '%' }"
          ></div>
        </div>
        <div class="mt-0.5 text-[11px] text-ink-disabled">{{ s.sub }}</div>
      </li>
    </ul>

    <div class="mt-4 rounded-lg border border-brand/20 bg-surface-elevated/60 px-4 py-3">
      <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Grace's read</span>
      <p class="mt-1 text-[13px] leading-relaxed text-ink">
        The biggest drop is right after the first visit: {{ biggestGap }} do not take the next step into Starting Point. That handoff is the highest-leverage place to follow up. About 1 in 8 recent visitors land in a group, and {{ pct(m.serving) }}% start serving.
      </p>
    </div>
    <p class="mt-2 text-[11px] text-ink-disabled">
      A snapshot of where recent visitors are now; the newest are still early in the journey, so the percentages climb as a cohort matures.
    </p>
  </section>
</template>
