<script setup lang="ts">
/**
 * Josh Personal — Trends tab.
 *
 * Time-series surfaces — weight, sleep, HRV, steps (with 10k goal
 * line), active calories, weekly workout count. Larger charts than
 * the Today tab's snapshot strip; this is where Josh comes for the
 * weekly review.
 */
import type { Client } from '@/types/database'
import {
  STEPS_DAILY_TARGET,
  trends,
  stepsSummary,
  buildSparklinePath,
  sparklineTargetY,
} from '@/lib/clients/josh-personal/health'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// Slightly larger chart canvas for the Trends tab vs. the small
// sparklines used in the snapshot strip.
const CHART_W = 400
const CHART_H = 80

function pathFor(values: number[]): string {
  return buildSparklinePath(values, CHART_W, CHART_H)
}

function targetYFor(values: number[], target: number): number {
  return sparklineTargetY(values, target, CHART_H)
}
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div>
      <h2 class="text-xl font-semibold text-ink">Trends</h2>
      <p class="text-xs text-ink-muted mt-0.5">
        Last 8 weeks across Apple Health + workout logs. Use this for your weekly review.
      </p>
    </div>

    <!-- Steps — featured at top with goal line + summary cards -->
    <section class="card p-4">
      <div class="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Steps</div>
          <div class="text-base font-semibold text-ink mt-0.5">{{ trends.steps.label }}</div>
          <p class="text-xs text-ink-muted mt-0.5">{{ trends.steps.summary }}</p>
        </div>
        <div class="flex items-center gap-2 text-[11px] text-ink-muted">
          <span class="inline-flex items-center gap-1">
            <span class="h-0.5 w-3 bg-brand inline-block" />
            <span>weekly avg</span>
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="h-0 w-3 border-t border-dashed border-warn inline-block" />
            <span>10k goal</span>
          </span>
        </div>
      </div>
      <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" class="h-20 w-full">
        <line
          :x1="0"
          :x2="CHART_W"
          :y1="targetYFor(trends.steps.values, STEPS_DAILY_TARGET)"
          :y2="targetYFor(trends.steps.values, STEPS_DAILY_TARGET)"
          stroke="rgb(var(--color-warn))"
          stroke-width="1"
          stroke-dasharray="3 3"
          opacity="0.6"
        />
        <path
          :d="pathFor(trends.steps.values)"
          fill="none"
          stroke="rgb(var(--color-brand))"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">7d avg</div>
          <div class="text-lg font-bold text-ink tabular-nums">{{ stepsSummary.weekAvg.toLocaleString() }}</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Hit goal</div>
          <div class="text-lg font-bold text-ink tabular-nums">{{ stepsSummary.daysHitGoal }}/{{ stepsSummary.daysInWeek }} days</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Longest streak</div>
          <div class="text-lg font-bold text-ink tabular-nums">{{ stepsSummary.longestStreak }} d</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Today so far</div>
          <div class="text-lg font-bold text-ink tabular-nums">{{ stepsSummary.todayProgress.toLocaleString() }}</div>
        </div>
      </div>
    </section>

    <!-- Weight + Sleep + HRV — stacked sparklines -->
    <div class="grid gap-4 md:grid-cols-2">
      <section class="card p-4">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Weight</div>
        <div class="text-base font-semibold text-ink mt-0.5">{{ trends.weight.label }}</div>
        <p class="text-xs text-ink-muted mt-0.5">{{ trends.weight.summary }}</p>
        <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" class="h-20 w-full mt-3">
          <path :d="pathFor(trends.weight.values)" fill="none" stroke="rgb(var(--color-brand))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </section>

      <section class="card p-4">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Sleep</div>
        <div class="text-base font-semibold text-ink mt-0.5">{{ trends.sleep.label }}</div>
        <p class="text-xs text-ink-muted mt-0.5">{{ trends.sleep.summary }}</p>
        <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" class="h-20 w-full mt-3">
          <path :d="pathFor(trends.sleep.values)" fill="none" stroke="rgb(var(--color-brand))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </section>

      <section class="card p-4">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">HRV</div>
        <div class="text-base font-semibold text-ink mt-0.5">{{ trends.hrv.label }}</div>
        <p class="text-xs text-ink-muted mt-0.5">{{ trends.hrv.summary }}</p>
        <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" class="h-20 w-full mt-3">
          <path :d="pathFor(trends.hrv.values)" fill="none" stroke="rgb(var(--color-brand))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </section>

      <section class="card p-4">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Active calories</div>
        <div class="text-base font-semibold text-ink mt-0.5">{{ trends.activeCal.label }}</div>
        <p class="text-xs text-ink-muted mt-0.5">{{ trends.activeCal.summary }}</p>
        <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" class="h-20 w-full mt-3">
          <path :d="pathFor(trends.activeCal.values)" fill="none" stroke="rgb(var(--color-brand))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </section>
    </div>

    <!-- Workouts/week — bar chart -->
    <section class="card p-4">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Workouts/week</div>
      <div class="text-base font-semibold text-ink mt-0.5">{{ trends.workouts.label }}</div>
      <p class="text-xs text-ink-muted mt-0.5">{{ trends.workouts.summary }}</p>
      <div class="flex items-end gap-2 h-24 mt-4">
        <div
          v-for="(c, i) in trends.workouts.weeklyCounts"
          :key="i"
          class="flex-1 bg-brand rounded-sm flex flex-col items-center justify-end relative group"
          :style="{ height: `${(c / 5) * 100}%` }"
          :title="`Week ${i + 1}: ${c} workouts`"
        >
          <span class="absolute -top-5 text-[10px] tabular-nums text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity">{{ c }}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 text-[10px] text-ink-muted mt-2">
        <span>← 8w ago</span>
        <span class="flex-1 border-b border-dashed border-divider"></span>
        <span>this wk →</span>
      </div>
    </section>
  </div>
</template>
