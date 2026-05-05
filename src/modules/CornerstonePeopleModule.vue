<script setup lang="ts">
/**
 * Cornerstone — household-aware People directory.
 * Each row = a household (the unit of pastoral care). Three at-risk
 * flags (kids attendance · giving · serving) drive the at-risk surface.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  households,
  people,
  peopleStats,
  peopleInHousehold,
  STAGE_META,
  FLAG_META,
  SERVING_LABEL,
  type Household,
  type HouseholdStage,
  totalFlagCount,
} from '@/lib/clients/cornerstone/people'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => peopleStats())

type SortKey = 'name' | 'risk' | 'stage' | 'last_touch'
const sortBy = ref<SortKey>('risk')
const sortDir = ref<'asc' | 'desc'>('desc')
const stageFilter = ref<HouseholdStage | 'all' | 'at_risk' | 'young_kids'>('all')

// ── Young-families cohort (kids ages 0-7 = nursery + preschool + young elementary) ─
function householdHasYoungKids(h: Household): boolean {
  return people.some((p) =>
    p.household_id === h.id && p.age_group !== 'adult' && p.age <= 7,
  )
}

const youngFamilyMetrics = computed(() => {
  const withYoungKids = households.filter(householdHasYoungKids)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const newFamilyPipeline = withYoungKids.filter((h) =>
    new Date(h.first_contact_at).getTime() >= thirtyDaysAgo,
  )
  // Where in the journey are these families
  const memberPlus = withYoungKids.filter((h) =>
    h.stage === 'member' || h.stage === 'pillar' || h.stage === 'returning',
  ).length
  const visitorOrConnected = withYoungKids.filter((h) =>
    h.stage === 'visitor' || h.stage === 'connected',
  ).length
  const drifting = withYoungKids.filter((h) => h.stage === 'drifting').length
  return {
    total: withYoungKids.length,
    pct_of_all: households.length > 0 ? withYoungKids.length / households.length : 0,
    new_pipeline: newFamilyPipeline,
    member_plus: memberPlus,
    visitor_or_connected: visitorOrConnected,
    drifting,
  }
})

const stageOrder: HouseholdStage[] = ['pillar','member','returning','connected','visitor','drifting']

const filtered = computed<Household[]>(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...households]
    .filter((h) => {
      if (stageFilter.value === 'all') return true
      if (stageFilter.value === 'at_risk') return totalFlagCount(h) >= 1
      if (stageFilter.value === 'young_kids') return householdHasYoungKids(h)
      return h.stage === stageFilter.value
    })
    .sort((a, b) => {
      if (sortBy.value === 'name')   return a.household_name.localeCompare(b.household_name) * dir
      if (sortBy.value === 'risk')   return (totalFlagCount(a) - totalFlagCount(b)) * dir
      if (sortBy.value === 'stage')  return (stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage)) * dir
      const aT = a.last_personal_touch_at ? new Date(a.last_personal_touch_at).getTime() : 0
      const bT = b.last_personal_touch_at ? new Date(b.last_personal_touch_at).getTime() : 0
      return (aT - bT) * dir
    })
})

function toggleSort(k: SortKey) {
  if (sortBy.value === k) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortBy.value = k; sortDir.value = k === 'name' ? 'asc' : 'desc' }
}
function sortInd(k: SortKey): string {
  if (sortBy.value !== k) return ''
  return sortDir.value === 'asc' ? '↑' : '↓'
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

function fmtSinceFirst(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const day = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (day < 30) return `${day}d`
  if (day < 365) return `${Math.floor(day / 30)}mo`
  return `${Math.floor(day / 365)}yr`
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

function adultsLine(h: Household): string {
  return peopleInHousehold(h.id).filter((p) => p.age_group === 'adult').map((p) => p.first_name).join(' + ')
}

function kidsLine(h: Household): string {
  return peopleInHousehold(h.id)
    .filter((p) => p.age_group !== 'adult')
    .map((p) => `${p.first_name} (${p.age})`)
    .join(' · ') || ''
}

function servingRolesForHousehold(h: Household): string[] {
  const roles = new Set<string>()
  for (const p of peopleInHousehold(h.id)) {
    for (const r of p.serving_roles) roles.add(SERVING_LABEL[r])
  }
  return Array.from(roles)
}

function flagDot(state: string): string {
  return FLAG_META[state as keyof typeof FLAG_META]?.color ?? '#94A3B8'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">People</h2>
        <p class="text-sm text-ink-muted">
          The household-aware directory. Three flags per household — kids attendance, giving, serving — surface drift early.
        </p>
      </div>
      <button
        type="button"
        class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"
      >+ Add household</button>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Households</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.total_households }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ stats.total_people }} people · {{ stats.households_with_kids }} with kids</div>
      </div>
      <div class="card">
        <div class="kpi-label">Members</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.members }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">+ {{ stats.visitors_active }} visitors active</div>
      </div>
      <div class="card">
        <div class="kpi-label">At-risk households</div>
        <div class="mt-1 text-2xl font-bold tabular-nums">
          <span :class="stats.at_risk_two_plus_flags > 0 ? 'text-danger' : 'text-warn'">{{ stats.at_risk_two_plus_flags }}</span>
          <span class="text-base text-ink-muted"> / {{ stats.at_risk_one_flag + stats.at_risk_two_plus_flags }}</span>
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">2+ flags / any flag</div>
      </div>
      <div class="card">
        <div class="kpi-label">Active volunteers</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ stats.active_volunteers }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">across all roles</div>
      </div>
    </div>

    <!-- Young families cohort highlight -->
    <section class="card border border-purple-200 bg-purple-50/40">
      <div class="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow text-purple-700">👶 Young families (kids 0-7)</span>
          <span class="text-[11px] text-ink-muted">— the growth engine for most churches</span>
        </div>
        <button
          type="button"
          class="text-[11px] text-purple-700 font-semibold hover:underline"
          @click="stageFilter = 'young_kids'"
        >View all {{ youngFamilyMetrics.total }} →</button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <div class="kpi-label">Total</div>
          <div class="mt-0.5 text-xl font-bold text-ink tabular-nums">{{ youngFamilyMetrics.total }}</div>
          <div class="text-[10px] text-ink-disabled">{{ Math.round(youngFamilyMetrics.pct_of_all * 100) }}% of all households</div>
        </div>
        <div>
          <div class="kpi-label">New (≤30d)</div>
          <div class="mt-0.5 text-xl font-bold tabular-nums" :class="youngFamilyMetrics.new_pipeline.length > 0 ? 'text-success' : 'text-ink'">{{ youngFamilyMetrics.new_pipeline.length }}</div>
          <div class="text-[10px] text-ink-disabled">first contact in last month</div>
        </div>
        <div>
          <div class="kpi-label">Member+</div>
          <div class="mt-0.5 text-xl font-bold text-ink tabular-nums">{{ youngFamilyMetrics.member_plus }}</div>
          <div class="text-[10px] text-ink-disabled">members / pillars / returning</div>
        </div>
        <div>
          <div class="kpi-label">In flight</div>
          <div class="mt-0.5 text-xl font-bold text-ink tabular-nums">{{ youngFamilyMetrics.visitor_or_connected }}</div>
          <div class="text-[10px] text-ink-disabled">visitors + connected</div>
        </div>
        <div>
          <div class="kpi-label">Drifting</div>
          <div class="mt-0.5 text-xl font-bold tabular-nums" :class="youngFamilyMetrics.drifting > 0 ? 'text-warn' : 'text-ink'">{{ youngFamilyMetrics.drifting }}</div>
          <div class="text-[10px] text-ink-disabled">at-risk · prioritize</div>
        </div>
      </div>
      <div v-if="youngFamilyMetrics.new_pipeline.length > 0" class="mt-3 pt-3 border-t border-purple-200/60">
        <div class="kpi-label mb-1.5 text-purple-700">New family pipeline</div>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="h in youngFamilyMetrics.new_pipeline"
            :key="h.id"
            class="inline-flex items-center rounded-full bg-white border border-purple-200 px-2 py-0.5 text-[11px] text-ink"
          >{{ h.household_name }}</span>
        </div>
      </div>
    </section>

    <!-- Filters -->
    <div class="card flex flex-wrap items-center gap-1.5">
      <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mr-1">Stage:</span>
      <button
        type="button"
        class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
        :class="stageFilter === 'all' ? 'bg-brand text-white' : 'bg-surface-elevated text-ink-muted hover:bg-surface-elevated/80'"
        @click="stageFilter = 'all'"
      >All</button>
      <button
        type="button"
        class="rounded-full px-3 py-1 text-xs font-semibold transition-colors text-white"
        :style="stageFilter === 'at_risk'
          ? { backgroundColor: '#EF4444' }
          : { backgroundColor: '#EF444422', color: '#EF4444' }"
        @click="stageFilter = 'at_risk'"
      >⚠ At-risk ({{ stats.at_risk_one_flag + stats.at_risk_two_plus_flags }})</button>
      <button
        type="button"
        class="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
        :class="stageFilter === 'young_kids'
          ? 'bg-purple-600 text-white'
          : 'bg-purple-100 text-purple-700 hover:bg-purple-200'"
        @click="stageFilter = 'young_kids'"
      >👶 Young kids ({{ youngFamilyMetrics.total }})</button>
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

    <!-- Households table -->
    <section class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('name')">
                Household {{ sortInd('name') }}
              </th>
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('stage')">
                Stage {{ sortInd('stage') }}
              </th>
              <th class="px-3 py-2 font-medium text-center">Kids attending</th>
              <th class="px-3 py-2 font-medium text-center">Giving</th>
              <th class="px-3 py-2 font-medium text-center">Serving</th>
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink text-center" @click="toggleSort('risk')">
                Flags {{ sortInd('risk') }}
              </th>
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('last_touch')">
                Last touch {{ sortInd('last_touch') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="h in filtered" :key="h.id">
              <tr class="border-b border-divider/60 hover:bg-surface-elevated/40 transition-colors">
                <td class="px-3 py-2.5">
                  <div class="text-sm font-semibold text-ink">{{ h.household_name }}</div>
                  <div class="text-[11px] text-ink-muted">
                    {{ memberSummary(h) }} · at Cornerstone {{ fmtSinceFirst(h.first_contact_at) }}
                  </div>
                  <div class="text-[10px] text-ink-disabled mt-0.5">
                    <span class="font-medium">Adults:</span> {{ adultsLine(h) }}
                    <span v-if="kidsLine(h)"><br><span class="font-medium">Kids:</span> {{ kidsLine(h) }}</span>
                  </div>
                </td>
                <td class="px-3 py-2.5">
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white whitespace-nowrap"
                    :style="{ backgroundColor: STAGE_META[h.stage].color }"
                  >{{ STAGE_META[h.stage].label }}</span>
                </td>
                <td class="px-3 py-2.5 text-center">
                  <div class="inline-flex flex-col items-center gap-0.5">
                    <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: flagDot(h.kids_attendance_flag) }" :title="FLAG_META[h.kids_attendance_flag].label"></span>
                    <span v-if="h.kids_attendance_flag !== 'na'" class="text-[10px] text-ink-disabled tabular-nums">{{ h.kids_attendance_score }}</span>
                  </div>
                </td>
                <td class="px-3 py-2.5 text-center">
                  <div class="inline-flex flex-col items-center gap-0.5">
                    <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: flagDot(h.giving_flag) }" :title="FLAG_META[h.giving_flag].label"></span>
                    <span v-if="h.giving_flag !== 'na'" class="text-[10px] text-ink-disabled tabular-nums">{{ h.giving_score }}</span>
                  </div>
                </td>
                <td class="px-3 py-2.5 text-center">
                  <div class="inline-flex flex-col items-center gap-0.5">
                    <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: flagDot(h.serving_flag) }" :title="FLAG_META[h.serving_flag].label"></span>
                    <div v-if="servingRolesForHousehold(h).length > 0" class="text-[9px] text-ink-disabled mt-0.5 max-w-[110px] truncate" :title="servingRolesForHousehold(h).join(', ')">
                      {{ servingRolesForHousehold(h)[0] }}{{ servingRolesForHousehold(h).length > 1 ? ` +${servingRolesForHousehold(h).length - 1}` : '' }}
                    </div>
                  </div>
                </td>
                <td class="px-3 py-2.5 text-center">
                  <span
                    class="text-base font-bold tabular-nums"
                    :style="{ color: totalFlagCount(h) >= 2 ? '#EF4444' : totalFlagCount(h) === 1 ? '#F59E0B' : '#10B981' }"
                  >{{ totalFlagCount(h) }}</span>
                </td>
                <td class="px-3 py-2.5 text-xs text-ink-muted whitespace-nowrap">{{ fmtAgo(h.last_personal_touch_at) }}</td>
              </tr>
              <!-- Pastoral note + life event under any household with one -->
              <tr v-if="h.pastoral_note || h.recent_life_event" class="border-b border-divider/60">
                <td colspan="7" class="px-3 pb-2 -mt-1 space-y-1">
                  <div
                    v-if="h.recent_life_event"
                    class="text-[11px] inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 bg-purple-100 text-purple-700"
                  >
                    <span class="font-semibold">{{ h.recent_life_event.kind === 'birth' ? '🎉 BIRTH' : h.recent_life_event.kind === 'death' ? '💔 LOSS' : '· EVENT' }} ·</span>
                    <span>{{ h.recent_life_event.detail }}</span>
                  </div>
                  <div
                    v-if="h.pastoral_note"
                    class="text-[11px] inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
                    :style="{
                      backgroundColor: STAGE_META[h.stage].color + '22',
                      color: STAGE_META[h.stage].color,
                    }"
                  >
                    <span class="font-semibold">📝 NOTE ·</span>
                    <span>{{ h.pastoral_note }}</span>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="filtered.length === 0">
              <td colspan="7" class="px-3 py-6 text-center text-sm text-ink-muted italic">
                No households match these filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Flag legend -->
    <div class="text-[11px] text-ink-disabled flex flex-wrap items-center gap-3 px-2">
      <span class="font-semibold text-ink-muted">Flags:</span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color:#10B981"></span> Healthy
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color:#F59E0B"></span> Watch (1-2 weeks of drift)
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color:#EF4444"></span> At-risk (3+ weeks of drift)
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color:#94A3B8"></span> N/A
      </span>
      <span class="opacity-70 ml-2">Kids-attendance is the leading indicator — when 7-year-olds skip 2 weeks, the family is drifting before adults realize.</span>
    </div>
  </div>
</template>
