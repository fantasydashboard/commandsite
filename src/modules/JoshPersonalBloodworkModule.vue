<script setup lang="ts">
/**
 * Josh Personal — Bloodwork tab.
 *
 * Quarterly-ish reference surface. Active concerns get the prominent
 * placement here (since this IS where you go to check what's flagged);
 * full marker table with sparklines below; Sage's panel-level read
 * spelling out the strategy that drove this week's plan; upload UI
 * for the next draw; history of past panels for context.
 */
import type { Client } from '@/types/database'
import AssistantMark from '@/components/AssistantMark.vue'
import {
  activeConcerns,
  bloodwork,
  buildSparklinePath,
  statusClass,
  statusIcon,
} from '@/lib/clients/josh-personal/health'

defineProps<{ client: Client; config: Record<string, unknown> }>()
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-xl font-semibold text-ink">Bloodwork</h2>
        <p class="text-xs text-ink-muted mt-0.5">
          Lab panels + active concerns. Concerns become hard constraints in your weekly meal plan.
        </p>
      </div>
      <button class="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-semibold hover:opacity-90">
        + Upload new panel
      </button>
    </div>

    <!-- ── Active concerns (the most important thing here) ────────── -->
    <section class="card p-0 overflow-hidden border-warn/30">
      <header class="flex items-center justify-between gap-3 px-4 py-3 bg-warn/10 border-b border-warn/20">
        <div class="flex items-center gap-2">
          <span class="text-base">⚠️</span>
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-warn">
            Active concerns · {{ activeConcerns.length }}
          </span>
        </div>
        <span class="text-[11px] text-ink-muted">From {{ bloodwork.drawnAt }}</span>
      </header>
      <ul class="divide-y divide-divider">
        <li v-for="c in activeConcerns" :key="c.label" class="px-4 py-3 flex items-start gap-3">
          <span class="inline-flex items-center rounded-full bg-warn/15 text-warn px-2 py-0.5 text-[11px] font-bold tabular-nums shrink-0">
            {{ c.value }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold text-ink">{{ c.label }} <span class="text-ink-muted font-normal text-xs">· target {{ c.target }}</span></div>
            <div class="text-[12px] text-ink-muted mt-0.5">
              <strong class="text-ink">Sage's constraint applied to your plan:</strong> {{ c.constraint }}
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- ── Sage's panel-level read ─────────────────────────────────── -->
    <section class="card p-4 border-brand/20">
      <div class="flex items-start gap-2">
        <AssistantMark class="h-4 w-4 text-brand mt-0.5 shrink-0" />
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-1">
            Sage's read on the {{ bloodwork.drawnAt }} panel
          </div>
          <p class="text-sm text-ink leading-relaxed">{{ bloodwork.sageRead }}</p>
        </div>
      </div>
    </section>

    <!-- ── Full marker table ──────────────────────────────────────── -->
    <section class="card p-0 overflow-hidden">
      <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Full panel</div>
          <div class="font-semibold text-ink mt-0.5">Last drawn {{ bloodwork.drawnAt }}</div>
          <div class="text-[11px] text-ink-muted mt-0.5">via {{ bloodwork.drawnBy }}</div>
        </div>
      </header>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-canvas text-[10px] font-semibold text-ink-muted uppercase tracking-wide">
            <tr>
              <th class="px-4 py-2 text-left">Marker</th>
              <th class="px-4 py-2 text-left">Latest</th>
              <th class="px-4 py-2 text-left">Range</th>
              <th class="px-4 py-2 text-left">Last 4 panels</th>
              <th class="px-4 py-2 text-left">Trend</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-divider">
            <tr v-for="m in bloodwork.markers" :key="m.name" class="hover:bg-canvas/50">
              <td class="px-4 py-2 font-medium text-ink">{{ m.name }}</td>
              <td class="px-4 py-2">
                <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums" :class="statusClass(m.status)">
                  <span>{{ statusIcon(m.status) }}</span>
                  <span>{{ m.latest }}</span>
                </span>
                <span class="ml-1.5 text-[11px] text-ink-muted">{{ m.unit }}</span>
              </td>
              <td class="px-4 py-2 text-xs text-ink-muted font-mono">{{ m.range }}</td>
              <td class="px-4 py-2">
                <svg :viewBox="`0 0 200 40`" class="h-6 w-32 text-brand">
                  <path :d="buildSparklinePath(m.history)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <div class="text-[10px] text-ink-disabled font-mono mt-0.5">{{ m.history.join(' → ') }}</div>
              </td>
              <td class="px-4 py-2 text-[11px] text-ink-muted">{{ m.trendNote }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Upload panel + past draws ───────────────────────────────── -->
    <div class="grid gap-4 md:grid-cols-2">
      <section class="card p-4">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-2">Upload your next panel</div>
        <div class="border-2 border-dashed border-divider rounded-card p-6 text-center hover:border-brand/40 transition-colors cursor-pointer">
          <div class="text-2xl mb-1">📄</div>
          <div class="text-sm font-semibold text-ink mb-1">Drop a Quest or LabCorp PDF here</div>
          <div class="text-xs text-ink-muted">Sage will extract markers + flag concerns + update your plan automatically.</div>
        </div>
      </section>

      <section class="card p-0 overflow-hidden">
        <header class="px-4 py-3 border-b border-divider bg-surface-elevated">
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Past draws</div>
          <div class="font-semibold text-ink mt-0.5">{{ bloodwork.pastDraws.length }} panels on file</div>
        </header>
        <ul class="divide-y divide-divider">
          <li v-for="(d, i) in bloodwork.pastDraws" :key="i" class="px-4 py-2.5 flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-medium text-ink">{{ d.date }}</div>
              <div class="text-[11px] text-ink-muted">{{ d.notes }}</div>
            </div>
            <button class="text-xs text-brand font-medium hover:underline">View</button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
