<script setup lang="ts">
/**
 * Cornerstone — Small Groups (community health, metrics-only).
 * Group health snapshots — attendance trend sparklines, capacity %,
 * leader notes — without the launch-pipeline workflow (that lives in
 * Planning Center / ChMS where the actual matching happens).
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  smallGroups,
  groupStats,
  attendanceTrend,
  HEALTH_META,
  KIND_LABEL,
  type SmallGroup,
  type GroupHealth,
} from '@/lib/clients/cornerstone/groups'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => groupStats())
const healthFilter = ref<GroupHealth | 'all'>('all')

const filteredGroups = computed<SmallGroup[]>(() => {
  return [...smallGroups]
    .filter((g) => healthFilter.value === 'all' || g.health === healthFilter.value)
    .sort((a, b) => {
      const order: Record<GroupHealth, number> = { struggling: 0, watch: 1, healthy: 2 }
      return order[a.health] - order[b.health]
    })
})

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const day = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (day === 0) return 'today'
  if (day < 30) return `${day}d ago`
  if (day < 365) return `${Math.floor(day / 30)}mo ago`
  return `${Math.floor(day / 365)}yr ago`
}

function trendArrow(t: 'up' | 'flat' | 'down'): { icon: string; color: string } {
  if (t === 'up') return { icon: '↑', color: '#10B981' }
  if (t === 'down') return { icon: '↓', color: '#EF4444' }
  return { icon: '→', color: '#94A3B8' }
}

function avgAttendance(g: SmallGroup): number {
  const arr = g.attendance_last_8.filter((n) => n > 0)
  if (arr.length === 0) return 0
  return arr.reduce((s, n) => s + n, 0) / arr.length
}

function capacityPct(g: SmallGroup): number {
  return g.capacity > 0 ? g.members_count / g.capacity : 0
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Small Groups</h2>
        <p class="text-sm text-ink-muted">
          Group health at-a-glance. Attendance trends, capacity, leader signals — the matching + onboarding workflow lives in your ChMS.
        </p>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Active groups</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.total_groups }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ stats.healthy }} healthy · {{ stats.watch }} watch · {{ stats.struggling }} struggling</div>
      </div>
      <div class="card">
        <div class="kpi-label">People in groups</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ stats.total_members }} <span class="text-base text-ink-muted">/ {{ stats.total_capacity }}</span>
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ Math.round(stats.total_members / stats.total_capacity * 100) }}% of capacity</div>
      </div>
      <div class="card">
        <div class="kpi-label">Open for new members</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ stats.open_for_new_members }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">groups with room</div>
      </div>
      <div class="card">
        <div class="kpi-label">Integrated last 30d</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.integrated_30d }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ stats.pending_launches }} still in launch flow</div>
      </div>
    </div>

    <!-- Health filter -->
    <div class="card flex flex-wrap items-center gap-1.5">
      <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mr-1">Health:</span>
      <button
        type="button"
        class="chip"
        :class="healthFilter === 'all' ? 'chip-active' : ''"
        @click="healthFilter = 'all'"
      >All</button>
      <button
        v-for="(meta, h) in HEALTH_META"
        :key="h"
        type="button"
        class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-white"
        :style="healthFilter === h
          ? { backgroundColor: meta.color }
          : { backgroundColor: meta.color + '22', color: meta.color }"
        @click="healthFilter = (h as GroupHealth)"
      >{{ meta.label }} ({{ smallGroups.filter((g) => g.health === h).length }})</button>
    </div>

    <!-- Group cards -->
    <article
      v-for="g in filteredGroups"
      :key="g.id"
      class="card"
    >
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <h3 class="text-base font-semibold text-ink">{{ g.name }}</h3>
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white whitespace-nowrap"
              :style="{ backgroundColor: HEALTH_META[g.health].color }"
            >{{ HEALTH_META[g.health].label }}</span>
            <span class="rounded-full bg-surface-elevated text-ink-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{{ KIND_LABEL[g.kind] }}</span>
            <span v-if="!g.open" class="rounded-full bg-warn/15 text-warn px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Closed</span>
          </div>
          <div class="text-[11px] text-ink-disabled flex flex-wrap items-center gap-x-2">
            <span><span class="font-semibold text-ink">{{ g.leader_name }}</span><span v-if="g.co_leaders.length"> + {{ g.co_leaders.join(', ') }}</span></span>
            <span>·</span>
            <span>{{ g.meeting_day }} {{ g.meeting_time }}</span>
            <span>·</span>
            <span>{{ g.location }}</span>
            <span>·</span>
            <span>launched {{ fmtAgo(g.launched_at) }}</span>
          </div>
          <div class="text-[11px] text-ink-muted mt-1">
            <span class="font-medium">Currently studying:</span> {{ g.current_study }}
          </div>
        </div>
      </div>

      <!-- Stats row + sparkline -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2 pt-2 border-t border-divider">
        <div>
          <div class="kpi-label">Members</div>
          <div class="mt-0.5 text-base font-semibold text-ink tabular-nums">
            {{ g.members_count }} <span class="text-xs text-ink-muted">/ {{ g.capacity }}</span>
          </div>
          <div class="h-1.5 mt-1 rounded-full bg-surface-elevated overflow-hidden">
            <div
              class="h-full rounded-full"
              :style="{
                width: (capacityPct(g) * 100) + '%',
                backgroundColor: capacityPct(g) >= 0.85 ? '#F59E0B' : '#10B981',
              }"
            ></div>
          </div>
        </div>
        <div>
          <div class="kpi-label">Avg attendance</div>
          <div class="mt-0.5 flex items-baseline gap-1">
            <span class="text-base font-semibold text-ink tabular-nums">{{ avgAttendance(g).toFixed(1) }}</span>
            <span class="text-sm" :style="{ color: trendArrow(attendanceTrend(g)).color }">{{ trendArrow(attendanceTrend(g)).icon }}</span>
          </div>
          <div class="text-[10px] text-ink-disabled mt-0.5">last 8 weeks</div>
        </div>
        <div class="col-span-2">
          <div class="kpi-label">Attendance trend</div>
          <div class="mt-1 flex items-end gap-0.5 h-8">
            <div
              v-for="(n, i) in g.attendance_last_8"
              :key="i"
              class="flex-1 rounded-sm"
              :style="{
                height: n > 0 ? (n / g.capacity * 100) + '%' : '4px',
                backgroundColor: n > 0 ? HEALTH_META[g.health].color : '#E5E7EB',
                opacity: n > 0 ? 1 : 0.4,
              }"
              :title="n > 0 ? `Week ${i + 1}: ${n} attended` : `Week ${i + 1}: didn\'t meet`"
            ></div>
          </div>
        </div>
      </div>

      <!-- Pastoral note -->
      <div v-if="g.pastoral_note" class="rounded-md bg-warn/5 border border-warn/30 p-2.5">
        <div class="text-[10px] uppercase tracking-wide font-semibold text-warn mb-0.5">📝 Leader / staff note</div>
        <p class="text-xs text-ink leading-snug italic">{{ g.pastoral_note }}</p>
      </div>
    </article>
  </div>
</template>
