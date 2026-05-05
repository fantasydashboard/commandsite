<script setup lang="ts">
/**
 * UFD Redesign — Funnel module. Two funnels stacked:
 *   1. Activation (first 7 days)
 *   2. Conversion (trial → paid → renewed)
 *
 * Plus per-platform breakdown + drop-off insights with concrete
 * recommendations.
 */
import { computed } from 'vue'
import type { Client } from '@/types/database'
import {
  activationFunnel,
  conversionFunnel,
  platformBreakdown,
  dropoffInsights,
} from '@/lib/clients/ufd-redesign/funnel'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const activation = computed(() => activationFunnel())
const conversion = computed(() => conversionFunnel())

function pct(v: number): string { return `${(v * 100).toFixed(0)}%` }

function continueRate(steps: ReturnType<typeof activationFunnel>, i: number): number {
  if (i === 0) return 1
  return steps[i].count / steps[i - 1].count
}

function stepColor(i: number, total: number): string {
  if (i === 0) return 'rgb(var(--color-brand))'
  if (i === total - 1) return '#10B981'
  return 'rgb(var(--color-accent))'
}

function dropTone(pct: number): string {
  if (pct >= 0.40) return '#EF4444'
  if (pct >= 0.20) return '#F59E0B'
  return '#94A3B8'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Funnel</h2>
        <p class="text-sm text-ink-muted">
          Activation in the first 7 days drives every conversion downstream. Both funnels here so you can see the connection.
        </p>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Signups (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ activation[0].count }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Activation rate</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ pct(activation[3].count / activation[0].count) }}
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">signed up → made a card</div>
      </div>
      <div class="card">
        <div class="kpi-label">Share rate</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ pct(activation[4].count / activation[3].count) }}
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">card-makers → card-sharers</div>
      </div>
      <div class="card">
        <div class="kpi-label">Trial → Paid</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ pct(conversion[2].count / conversion[1].count) }}
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">completed trials that paid</div>
      </div>
    </div>

    <!-- Activation Funnel -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Activation Funnel</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">First 7 days</span>
        <span class="text-xs text-ink-muted ml-1">Cohort = signups in last 30 days</span>
      </div>
      <div class="space-y-2">
        <div
          v-for="(step, i) in activation"
          :key="step.stage"
        >
          <div class="flex items-baseline justify-between gap-2 mb-1">
            <div class="min-w-0">
              <span class="text-sm font-semibold text-ink">{{ step.stage }}</span>
              <span class="text-[11px] text-ink-muted ml-2">— {{ step.description }}</span>
            </div>
            <span class="text-xs text-ink-muted tabular-nums whitespace-nowrap">
              {{ step.count }}
              <span class="text-ink-disabled">· {{ pct(step.pct_of_top) }}</span>
            </span>
          </div>
          <div class="h-7 rounded-md bg-surface-elevated/60 overflow-hidden">
            <div
              class="h-full rounded-md transition-all"
              :style="{
                width: (step.pct_of_top * 100) + '%',
                backgroundColor: stepColor(i, activation.length),
              }"
            ></div>
          </div>
          <div
            v-if="i < activation.length - 1"
            class="text-[10px] text-ink-disabled mt-0.5 text-right"
          >
            ↓ {{ pct(continueRate(activation, i + 1)) }} continue
            <span v-if="step.count - activation[i + 1].count > 0" class="text-warn">
              ({{ step.count - activation[i + 1].count }} drop off)
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Conversion Funnel -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Conversion Funnel</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">Trial → Paid → Renewed</span>
        <span class="text-xs text-ink-muted ml-1">Cohort = signups 60+ days ago</span>
      </div>
      <div class="space-y-2">
        <div
          v-for="(step, i) in conversion"
          :key="step.stage"
        >
          <div class="flex items-baseline justify-between gap-2 mb-1">
            <div class="min-w-0">
              <span class="text-sm font-semibold text-ink">{{ step.stage }}</span>
              <span class="text-[11px] text-ink-muted ml-2">— {{ step.description }}</span>
            </div>
            <span class="text-xs text-ink-muted tabular-nums whitespace-nowrap">
              {{ step.count }}
              <span class="text-ink-disabled">· {{ pct(step.pct_of_top) }}</span>
            </span>
          </div>
          <div class="h-7 rounded-md bg-surface-elevated/60 overflow-hidden">
            <div
              class="h-full rounded-md transition-all"
              :style="{
                width: (step.pct_of_top * 100) + '%',
                backgroundColor: stepColor(i, conversion.length),
              }"
            ></div>
          </div>
          <div
            v-if="i < conversion.length - 1"
            class="text-[10px] text-ink-disabled mt-0.5 text-right"
          >
            ↓ {{ pct(continueRate(conversion, i + 1)) }} continue
            <span v-if="step.count - conversion[i + 1].count > 0" class="text-warn">
              ({{ step.count - conversion[i + 1].count }} drop off)
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Per-platform -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Per-Platform Conversion</span>
        <span class="text-xs text-ink-muted">Where signups come from + how they convert</span>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article
          v-for="p in platformBreakdown"
          :key="p.platform"
          class="rounded-md border border-divider p-3"
        >
          <div class="flex items-center justify-between gap-2 mb-2">
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              :style="{ backgroundColor: p.color }"
            >{{ p.platform }}</span>
            <span class="text-sm font-semibold text-ink tabular-nums">{{ p.signups }} signups</span>
          </div>
          <div class="space-y-1.5">
            <div>
              <div class="flex items-baseline justify-between text-[11px] mb-0.5">
                <span class="text-ink-muted">Connected league</span>
                <span class="text-ink tabular-nums font-semibold">{{ pct(p.connected_pct) }}</span>
              </div>
              <div class="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  class="h-full rounded-full"
                  :style="{ width: (p.connected_pct * 100) + '%', backgroundColor: p.color }"
                ></div>
              </div>
            </div>
            <div>
              <div class="flex items-baseline justify-between text-[11px] mb-0.5">
                <span class="text-ink-muted">Trial → Paid</span>
                <span class="text-ink tabular-nums font-semibold">{{ pct(p.trial_to_paid_pct) }}</span>
              </div>
              <div class="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  class="h-full rounded-full"
                  :style="{ width: (p.trial_to_paid_pct * 100) + '%', backgroundColor: p.color }"
                ></div>
              </div>
            </div>
          </div>
        </article>
      </div>
      <div class="mt-3 text-[11px] text-ink-disabled italic">
        Sleeper users convert highest (42%) — likely because they're younger + more native to data tools. Yahoo lags — investigate onboarding-flow friction.
      </div>
    </section>

    <!-- Drop-off insights -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Where users fall off — and what to do about it</span>
      </div>
      <div class="space-y-3">
        <article
          v-for="d in dropoffInsights"
          :key="d.stage_from + d.stage_to"
          class="rounded-md border border-divider p-3"
        >
          <div class="flex items-baseline justify-between gap-2 mb-1.5">
            <div class="text-sm font-semibold text-ink">
              {{ d.stage_from }}
              <span class="text-ink-disabled mx-1">→</span>
              {{ d.stage_to }}
            </div>
            <span class="text-base font-bold tabular-nums" :style="{ color: dropTone(d.drop_pct) }">
              −{{ pct(d.drop_pct) }} drop
            </span>
          </div>
          <p class="text-xs text-ink leading-relaxed mb-2">{{ d.insight }}</p>
          <div class="rounded-md bg-brand/5 border border-brand/20 p-2.5">
            <div class="text-[10px] uppercase tracking-wide font-semibold text-brand mb-0.5">Recommendation</div>
            <p class="text-xs text-ink leading-snug">{{ d.recommendation }}</p>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
