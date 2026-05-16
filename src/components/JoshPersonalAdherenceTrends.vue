<script setup lang="ts">
/**
 * Josh Personal — adherence trends.
 *
 * Reads the last 56 days of personal_daily_adherence rows, buckets
 * them into ISO weeks, and renders a small bar grid: % of days hit
 * for each adherence flag, per week. The behavior signal complementing
 * the metric signal on the rest of the Trends page.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

interface AdherenceRow {
  adherence_date: string
  hit_cal: boolean | null
  hit_protein: boolean | null
  under_sat_fat: boolean | null
  hit_water: boolean | null
  hit_steps: boolean | null
  workout_done: boolean | null
}

const rows = ref<AdherenceRow[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) { rows.value = []; loading.value = false; return }
  const since = new Date(); since.setDate(since.getDate() - 56)
  const sinceDate = since.toISOString().slice(0, 10)
  const { data } = await supabase
    .from('personal_daily_adherence')
    .select('adherence_date, hit_cal, hit_protein, under_sat_fat, hit_water, hit_steps, workout_done')
    .eq('user_id', userData.user.id)
    .gte('adherence_date', sinceDate)
    .order('adherence_date', { ascending: true })
  rows.value = (data ?? []) as unknown as AdherenceRow[]
  loading.value = false
}
onMounted(load)

// Week-bucket: Monday-anchored ISO week
function isoMonday(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const dow = d.getDay()  // 0..6, 0 = Sun
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

interface WeekBucket {
  weekStart: string
  count: number
  cal: number
  protein: number
  satFat: number
  water: number
  steps: number
  workout: number
}

const weekBuckets = computed<WeekBucket[]>(() => {
  const map = new Map<string, WeekBucket>()
  for (const r of rows.value) {
    const w = isoMonday(r.adherence_date)
    if (!map.has(w)) map.set(w, { weekStart: w, count: 0, cal: 0, protein: 0, satFat: 0, water: 0, steps: 0, workout: 0 })
    const b = map.get(w)!
    b.count++
    if (r.hit_cal === true) b.cal++
    if (r.hit_protein === true) b.protein++
    if (r.under_sat_fat === true) b.satFat++
    if (r.hit_water === true) b.water++
    if (r.hit_steps === true) b.steps++
    if (r.workout_done === true) b.workout++
  }
  return Array.from(map.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
})

const METRICS: { key: keyof Omit<WeekBucket, 'weekStart' | 'count'>; label: string; tone: string }[] = [
  { key: 'cal',     label: 'Cal',      tone: 'bg-brand' },
  { key: 'protein', label: 'Protein',  tone: 'bg-success' },
  { key: 'satFat',  label: 'Sat fat',  tone: 'bg-warn' },
  { key: 'water',   label: 'Water',    tone: 'bg-sky-500' },
  { key: 'steps',   label: 'Steps',    tone: 'bg-brand' },
  { key: 'workout', label: 'Workout',  tone: 'bg-success' },
]

function fmtWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function pct(b: WeekBucket, key: keyof Omit<WeekBucket, 'weekStart' | 'count'>): number {
  if (!b.count) return 0
  return Math.round((b[key] / b.count) * 100)
}

function pctClass(p: number): string {
  if (p >= 80) return 'text-success'
  if (p >= 60) return 'text-brand'
  if (p >= 40) return 'text-warn'
  return 'text-danger'
}
</script>

<template>
  <section class="card p-4">
    <div class="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Adherence</div>
        <div class="text-base font-semibold text-ink mt-0.5">% of days you hit each target, by week</div>
        <p class="text-xs text-ink-muted mt-0.5">
          <template v-if="loading">Loading…</template>
          <template v-else-if="weekBuckets.length === 0">No adherence rollups yet — the nightly cron starts filling these once it runs.</template>
          <template v-else>{{ weekBuckets.length }} {{ weekBuckets.length === 1 ? 'week' : 'weeks' }} of rolled-up data</template>
        </p>
      </div>
    </div>

    <div v-if="weekBuckets.length > 0" class="overflow-x-auto">
      <table class="text-xs min-w-full">
        <thead>
          <tr class="text-[10px] text-ink-muted uppercase tracking-wide">
            <th class="text-left pb-2 pr-3 font-semibold">Week</th>
            <th v-for="m in METRICS" :key="m.key" class="text-right pb-2 px-2 font-semibold">{{ m.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in weekBuckets" :key="b.weekStart" class="border-t border-divider">
            <td class="py-2 pr-3 text-ink-muted text-[11px] tabular-nums">{{ fmtWeekLabel(b.weekStart) }}</td>
            <td v-for="m in METRICS" :key="m.key" class="py-2 px-2 text-right">
              <div class="inline-flex flex-col items-end gap-0.5">
                <span class="text-[11px] font-semibold tabular-nums" :class="pctClass(pct(b, m.key))">{{ pct(b, m.key) }}%</span>
                <span class="block w-12 h-1 bg-canvas rounded-full overflow-hidden">
                  <span class="block h-full rounded-full" :class="m.tone" :style="{ width: `${pct(b, m.key)}%` }" />
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
