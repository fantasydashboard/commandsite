<script setup lang="ts">
/**
 * Cornerstone — Care & Drift.
 *
 * Combined home for Grace's pastoral care roles: Drift Detection
 * (the three-flag household directory), Re-engagement (dormant-
 * member outreach), and Care Triage (urgent cases + drafted
 * check-ins). Pulls from the existing people + care fixtures.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  households, people, peopleStats, peopleInHousehold,
  STAGE_META, FLAG_META, totalFlagCount,
  type Household, type HouseholdStage,
} from '@/lib/clients/cornerstone/people'
import { careCases, careStats, KIND_META as CARE_KIND_META, URGENCY_META, type CareCase } from '@/lib/clients/cornerstone/care'
import CornerstoneGraceActivityStrip from '@/components/CornerstoneGraceActivityStrip.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => peopleStats())
const care = computed(() => careStats())

type StageFilter = HouseholdStage | 'all' | 'at_risk' | 'young_kids'
const stageFilter = ref<StageFilter>('at_risk')

const stageOrder: HouseholdStage[] = ['pillar','member','returning','connected','visitor','drifting']

function householdHasYoungKids(h: Household): boolean {
  return people.some((p) => p.household_id === h.id && p.age_group !== 'adult' && p.age <= 7)
}

const filtered = computed<Household[]>(() => {
  return [...households]
    .filter((h) => {
      if (stageFilter.value === 'all') return true
      if (stageFilter.value === 'at_risk') return totalFlagCount(h) >= 1
      if (stageFilter.value === 'young_kids') return householdHasYoungKids(h)
      return h.stage === stageFilter.value
    })
    .sort((a, b) => totalFlagCount(b) - totalFlagCount(a))
})

const openCareCases = computed<CareCase[]>(() =>
  careCases
    .filter((c) => c.status !== 'resolved')
    .sort((a, b) => {
      const order: Record<string, number> = { urgent: 0, this_week: 1, soon: 2 }
      return (order[a.urgency] ?? 9) - (order[b.urgency] ?? 9)
    }),
)

function flagDot(state: string): string {
  return FLAG_META[state as keyof typeof FLAG_META]?.color ?? '#94A3B8'
}

function memberSummary(h: Household): string {
  const ppl = peopleInHousehold(h.id)
  const adults = ppl.filter((p) => p.age_group === 'adult').length
  const kids = ppl.filter((p) => p.age_group !== 'adult').length
  const parts: string[] = []
  if (adults > 0) parts.push(`${adults} adult${adults === 1 ? '' : 's'}`)
  if (kids > 0)   parts.push(`${kids} kid${kids === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

function fmtAgo(iso?: string): string {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  const day = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (day === 0) return 'today'
  if (day < 30) return `${day}d ago`
  if (day < 365) return `${Math.floor(day / 30)}mo ago`
  return `${(day / 365).toFixed(1)}yr ago`
}
</script>

<template>
  <div class="space-y-4">
    <!-- Grace activity strip -->
    <CornerstoneGraceActivityStrip
      tab-key="care-drift"
      summary="Grace watches the three flags on every household, drafts pastoral check-ins for at-risk families, and re-engages members who've quietly drifted past 60 days."
      :activity="[
        { icon: '⚠', label: 'Escalated 1 household past 2-flag threshold', detail: 'The Sullivan Family — paged you', ago: '4d' },
        { icon: '🤝', label: 'Drafted 3 pastoral check-ins', detail: 'Whitakers, Castellanos, Foster — awaiting your review', ago: 'this week' },
        { icon: '🏡', label: 'Sent 1 re-engagement check-in', detail: 'The Reyes Family — back after 4-month gap', ago: '5d' },
      ]"
    />

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">2+ flag households</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="stats.at_risk_two_plus_flags > 0 ? 'text-danger' : 'text-ink'">{{ stats.at_risk_two_plus_flags }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">need pastoral attention</div>
      </div>
      <div class="card">
        <div class="kpi-label">Urgent care cases</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="care.urgent_cases > 0 ? 'text-warn' : 'text-ink'">{{ care.urgent_cases }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ care.open_cases }} total open</div>
      </div>
      <div class="card">
        <div class="kpi-label">Drafts waiting review</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ care.drafts_pending }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">Grace queued for you</div>
      </div>
      <div class="card">
        <div class="kpi-label">Cases closed (30d)</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ care.resolved_30d }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">trending healthy</div>
      </div>
    </div>

    <!-- Care queue (urgent cases + Grace's drafts) -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">🤝 Care Triage · Open cases</span>
          <span class="text-xs text-ink-muted">— sorted by urgency</span>
        </div>
        <span class="text-[11px] text-ink-disabled">{{ openCareCases.length }} open · {{ care.drafts_pending }} drafted</span>
      </div>
      <ul class="space-y-2">
        <li
          v-for="c in openCareCases.slice(0, 5)"
          :key="c.id"
          class="rounded-md border border-divider bg-canvas/40 px-3 py-2"
        >
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="text-base flex-shrink-0">{{ CARE_KIND_META[c.kind].icon }}</span>
            <span class="text-sm font-semibold text-ink">{{ c.household_name }}</span>
            <span
              class="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
              :style="{ backgroundColor: URGENCY_META[c.urgency].color }"
            >{{ URGENCY_META[c.urgency].label }}</span>
            <span class="text-[10px] text-ink-disabled">· {{ c.days_open }}d open</span>
          </div>
          <p class="text-[11px] text-ink-muted">{{ c.trigger_summary }}</p>
        </li>
        <li v-if="openCareCases.length === 0" class="text-center text-xs text-ink-disabled italic py-2">
          No open care cases.
        </li>
      </ul>
    </section>

    <!-- Drift detection — household directory (filtered to at-risk by default) -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">⚠ Drift Detection · Household directory</span>
          <span class="text-xs text-ink-muted">— three-flag system, sorted by risk</span>
        </div>
      </div>

      <!-- Filter chips -->
      <div class="flex flex-wrap items-center gap-1.5 mb-3">
        <button type="button" class="chip" :class="stageFilter === 'all' ? 'chip-active' : ''" @click="stageFilter = 'all'">All ({{ households.length }})</button>
        <button
          type="button"
          class="rounded-full px-3 py-1 text-xs font-semibold transition-colors text-white"
          :style="stageFilter === 'at_risk'
            ? { backgroundColor: '#EF4444' }
            : { backgroundColor: '#EF444422', color: '#EF4444' }"
          @click="stageFilter = 'at_risk'"
        >⚠ At-risk ({{ stats.at_risk_one_flag + stats.at_risk_two_plus_flags }})</button>
        <button
          v-for="s in stageOrder"
          :key="s"
          type="button"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-white"
          :style="stageFilter === s
            ? { backgroundColor: STAGE_META[s].color }
            : { backgroundColor: STAGE_META[s].color + '22', color: STAGE_META[s].color }"
          @click="stageFilter = s"
        >{{ STAGE_META[s].label }}</button>
      </div>

      <!-- Compact household table -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-2 py-2 font-medium">Household</th>
              <th class="px-2 py-2 font-medium">Stage</th>
              <th class="px-2 py-2 font-medium text-center">Kids</th>
              <th class="px-2 py-2 font-medium text-center">Giving</th>
              <th class="px-2 py-2 font-medium text-center">Serving</th>
              <th class="px-2 py-2 font-medium text-center">Flags</th>
              <th class="px-2 py-2 font-medium">Last touch</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="h in filtered.slice(0, 12)"
              :key="h.id"
              class="border-b border-divider/60"
            >
              <td class="px-2 py-2">
                <div class="text-sm font-semibold text-ink">{{ h.household_name }}</div>
                <div class="text-[10px] text-ink-muted">{{ memberSummary(h) }}</div>
              </td>
              <td class="px-2 py-2">
                <span
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white whitespace-nowrap"
                  :style="{ backgroundColor: STAGE_META[h.stage].color }"
                >{{ STAGE_META[h.stage].label }}</span>
              </td>
              <td class="px-2 py-2 text-center"><span class="inline-block h-3 w-3 rounded-full" :style="{ backgroundColor: flagDot(h.kids_attendance_flag) }"></span></td>
              <td class="px-2 py-2 text-center"><span class="inline-block h-3 w-3 rounded-full" :style="{ backgroundColor: flagDot(h.giving_flag) }"></span></td>
              <td class="px-2 py-2 text-center"><span class="inline-block h-3 w-3 rounded-full" :style="{ backgroundColor: flagDot(h.serving_flag) }"></span></td>
              <td class="px-2 py-2 text-center">
                <span
                  class="text-base font-bold tabular-nums"
                  :style="{ color: totalFlagCount(h) >= 2 ? '#EF4444' : totalFlagCount(h) === 1 ? '#F59E0B' : '#10B981' }"
                >{{ totalFlagCount(h) }}</span>
              </td>
              <td class="px-2 py-2 text-[11px] text-ink-muted">{{ fmtAgo(h.last_personal_touch_at) }}</td>
            </tr>
            <tr v-if="filtered.length === 0">
              <td colspan="7" class="text-center py-4 text-xs text-ink-disabled italic">No households match this filter.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="filtered.length > 12" class="mt-2 text-[11px] text-ink-disabled italic">
        Showing top 12 of {{ filtered.length }} — sorted by flag count.
      </p>
    </section>
  </div>
</template>
