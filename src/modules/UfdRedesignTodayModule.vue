<script setup lang="ts">
/**
 * UFD Redesign — Today action queue. The B2C/viral parallel to
 * CommandSite's Today: trial conversion signals, viral spikes,
 * payment dunning, churn saves, season events.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  todayItems,
  todayStats,
  todayPulse,
  KIND_META,
  type Priority,
  type TodayItem,
} from '@/lib/clients/ufd-redesign/today'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => todayStats())
const pulse = computed(() => todayPulse())

const addressed = ref<Set<string>>(new Set())
function markDone(id: string) { addressed.value.add(id) }
function unmark(id: string) { addressed.value.delete(id) }

const filterPriority = ref<Priority | 'all'>('all')

const visibleItems = computed<TodayItem[]>(() => {
  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
  return [...todayItems]
    .filter((t) => filterPriority.value === 'all' || t.priority === filterPriority.value)
    .sort((a, b) => order[a.priority] - order[b.priority])
})

const unaddressedCount = computed(() => todayItems.filter((t) => !addressed.value.has(t.id)).length)

function priorityColor(p: Priority): string {
  if (p === 'high') return '#EF4444'
  if (p === 'medium') return '#F59E0B'
  return '#94A3B8'
}
function priorityLabel(p: Priority): string {
  if (p === 'high') return 'High'
  if (p === 'medium') return 'Medium'
  return 'Low'
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Today</h2>
        <p class="text-sm text-ink-muted">
          What needs your attention right now — trial conversions, viral spikes, payment issues, churn saves, season prep.
        </p>
      </div>
      <div class="text-xs text-ink-muted">
        <span class="font-semibold text-ink">{{ unaddressedCount }}</span> still to address
      </div>
    </div>

    <!-- Pulse strip -->
    <div class="rounded-card bg-brand text-ink-inverse px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div class="flex items-center gap-2 text-xs uppercase tracking-wide font-semibold opacity-90">
        <span class="h-2 w-2 rounded-full bg-success animate-pulse"></span>
        Today
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.trials_today }}</span>
        <span class="text-xs opacity-80">new trials</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.conversions_today }}</span>
        <span class="text-xs opacity-80">paid conv</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ money(pulse.mrr_change_cents) }}</span>
        <span class="text-xs opacity-80">MRR change</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.viral_referrals_24h }}</span>
        <span class="text-xs opacity-80">viral referrals</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums" :class="pulse.churns_today > 0 ? 'text-amber-200' : ''">{{ pulse.churns_today }}</span>
        <span class="text-xs opacity-80">churns</span>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">High priority</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="stats.high_count > 0 ? 'text-danger' : 'text-ink'">{{ stats.high_count }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Medium</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.medium_count }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">MRR at risk</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="stats.pipeline_at_risk_cents > 0 ? 'text-warn' : 'text-ink'">{{ money(stats.pipeline_at_risk_cents) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">from failed payments + churn risk</div>
      </div>
      <div class="card">
        <div class="kpi-label">Viral signups (24h)</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ stats.viral_signups_today }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">attributed to power-user shares</div>
      </div>
    </div>

    <!-- Priority filter -->
    <div class="card">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="p in (['all', 'high', 'medium', 'low'] as (Priority | 'all')[])"
          :key="p"
          type="button"
          class="chip"
          :class="filterPriority === p ? 'chip-active' : ''"
          @click="filterPriority = p"
        >
          {{ p === 'all' ? 'All' : priorityLabel(p as Priority) }}
        </button>
      </div>
    </div>

    <!-- Action items -->
    <div class="space-y-2">
      <article
        v-for="item in visibleItems"
        :key="item.id"
        class="card transition-opacity"
        :class="addressed.has(item.id) ? 'opacity-50' : ''"
      >
        <div class="flex items-start gap-3">
          <!-- Priority + kind icon -->
          <div class="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-full text-base"
              :style="{ backgroundColor: KIND_META[item.kind].color + '22' }"
            >
              {{ KIND_META[item.kind].icon }}
            </div>
            <span
              class="text-[9px] font-bold uppercase tracking-wider"
              :style="{ color: priorityColor(item.priority) }"
            >{{ priorityLabel(item.priority) }}</span>
          </div>

          <!-- Body -->
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <h3 class="text-sm font-semibold text-ink">{{ item.title }}</h3>
              <span
                class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                :style="{ backgroundColor: KIND_META[item.kind].color }"
              >{{ KIND_META[item.kind].label }}</span>
              <span class="text-[10px] text-ink-disabled">· {{ fmtAgo(item.created_at) }}</span>
            </div>
            <p class="mt-0.5 text-xs text-ink-muted leading-relaxed">{{ item.detail }}</p>
          </div>

          <!-- Actions -->
          <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
            <button
              v-if="!addressed.has(item.id)"
              type="button"
              class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 whitespace-nowrap"
              @click="markDone(item.id)"
            >{{ item.cta }}</button>
            <button
              v-else
              type="button"
              class="rounded-md bg-success/15 text-success px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
              @click="unmark(item.id)"
            >✓ Done · undo</button>
            <button
              type="button"
              class="text-[10px] text-ink-disabled hover:text-ink-muted"
            >Snooze</button>
          </div>
        </div>
      </article>

      <div
        v-if="visibleItems.length === 0"
        class="card text-center text-sm text-ink-muted italic py-6"
      >
        Nothing here. Inbox zero.
      </div>
    </div>
  </div>
</template>
