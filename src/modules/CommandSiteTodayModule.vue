<script setup lang="ts">
/**
 * CommandSite Today — action queue. The "what should I work on right
 * now" answer for a solo SaaS founder. Mixes pipeline replies,
 * customer-health alerts, MRR changes, demos, expansion signals, and
 * tasks — sorted by priority.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  todayItems,
  todayStats,
  todayPulse,
  KIND_META,
  type TodayItem,
  type Priority,
} from '@/lib/clients/commandsite/today'
import {
  automations,
  automationStats,
  KIND_META as AUTO_KIND_META,
  STATUS_META as AUTO_STATUS_META,
} from '@/lib/clients/commandsite/automations'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => todayStats())
const pulse = computed(() => todayPulse())

// Local "addressed" state so the demo lets you check items off.
const addressed = ref<Set<string>>(new Set())
function markDone(id: string) { addressed.value.add(id) }
function unmark(id: string) { addressed.value.delete(id) }

const filterPriority = ref<Priority | 'all'>('all')

// Automations (the autopilot panel) — surfaces what ran without you
const autoStats = computed(() => automationStats())
const liveAutomations = computed(() => automations.filter((a) => a.status !== 'paused').slice(0, 6))

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
          What deserves your attention right now — pipeline replies, customer-health alerts, MRR changes, and demos.
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
        Live
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.new_replies }}</span>
        <span class="text-xs opacity-80">new replies</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.demos_today }}</span>
        <span class="text-xs opacity-80">demo today</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ money(pulse.mrr_change_cents) }}</span>
        <span class="text-xs opacity-80">MRR change</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums" :class="pulse.active_at_risk > 0 ? 'text-amber-200' : ''">{{ pulse.active_at_risk }}</span>
        <span class="text-xs opacity-80">at-risk</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.trial_signups_today }}</span>
        <span class="text-xs opacity-80">trial signup{{ pulse.trial_signups_today === 1 ? '' : 's' }}</span>
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
        <div class="kpi-label">Pipeline at stake</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(stats.pipeline_at_stake_cents) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">ARR across high-priority items</div>
      </div>
      <div class="card">
        <div class="kpi-label">MRR at risk</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="stats.mrr_at_stake_cents > 0 ? 'text-warn' : 'text-ink'">{{ money(stats.mrr_at_stake_cents) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">from at-risk customers</div>
      </div>
    </div>

    <!-- Running on autopilot — what ran while you were shipping product -->
    <section class="card border border-success/20 bg-success/[0.03]">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow text-success">🤖 Running on autopilot</span>
          <span class="chip !py-0.5 !px-2 !text-[10px] !bg-success/15 !text-success">{{ autoStats.active_count }} active</span>
        </div>
        <div class="text-xs text-ink-muted">
          <span class="text-success font-bold tabular-nums">{{ autoStats.auto_handled_7d }}</span> auto-handled · <span class="text-warn font-semibold tabular-nums">{{ autoStats.needed_review_7d }}</span> needed your eyes · <span class="text-ink font-semibold tabular-nums">~{{ autoStats.hours_saved_7d }}h</span> of your time saved (last 7 days)
        </div>
      </div>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <article
          v-for="a in liveAutomations"
          :key="a.id"
          class="rounded-md border border-divider bg-surface p-3"
        >
          <div class="flex items-start gap-2.5">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-base flex-shrink-0">
              {{ AUTO_KIND_META[a.kind].icon }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="text-sm font-semibold text-ink truncate">{{ a.name }}</span>
                <span
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap"
                  :class="a.status === 'active' ? 'bg-success/15 text-success' : 'bg-warn/15 text-warn'"
                >{{ AUTO_STATUS_META[a.status].label }}</span>
              </div>
              <p class="text-[11px] text-ink-muted leading-snug mt-0.5">{{ a.description }}</p>
              <div class="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] text-ink-disabled">
                <span class="text-success font-semibold">{{ a.auto_handled_7d }} auto</span>
                <span v-if="a.needed_review_7d > 0">· <span class="text-warn font-semibold">{{ a.needed_review_7d }} needed eyes</span></span>
                <span v-if="a.confidence_threshold">· threshold ≥ {{ Math.round(a.confidence_threshold * 100) }}%</span>
                <span v-if="a.schedule_label">· {{ a.schedule_label }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

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
        Nothing for that priority. Take a breath.
      </div>
    </div>
  </div>
</template>
