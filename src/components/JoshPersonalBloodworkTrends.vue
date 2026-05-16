<script setup lang="ts">
/**
 * Josh Personal — bloodwork trends.
 *
 * Reads all personal_bloodwork_panels in chronological order. For
 * each tracked marker (LDL, HDL, A1C, triglycerides, vit D, fasting
 * glucose), draws a small chart with the reference-range band shaded
 * green, his value markers, and the most-recent number called out.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

interface Panel { drawn_at: string; markers: Record<string, number> }

interface MarkerSpec {
  key: string
  label: string
  unit: string
  /** Healthy range (inclusive). */
  range: { min?: number; max?: number }
}

// Common biomarkers we render. If a marker isn't in any panel it's hidden.
const MARKERS: MarkerSpec[] = [
  { key: 'ldl_mg_dl',           label: 'LDL',           unit: 'mg/dL', range: { max: 100 } },
  { key: 'hdl_mg_dl',           label: 'HDL',           unit: 'mg/dL', range: { min: 40 } },
  { key: 'triglycerides_mg_dl', label: 'Triglycerides', unit: 'mg/dL', range: { max: 150 } },
  { key: 'a1c_pct',             label: 'A1C',           unit: '%',     range: { max: 5.7 } },
  { key: 'vit_d_ng_ml',         label: 'Vitamin D',     unit: 'ng/mL', range: { min: 30 } },
  { key: 'fasting_glucose_mg_dl', label: 'Fasting Glu', unit: 'mg/dL', range: { max: 99 } },
]

const panels = ref<Panel[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) { panels.value = []; loading.value = false; return }
  const { data } = await supabase
    .from('personal_bloodwork_panels')
    .select('drawn_at, markers')
    .eq('user_id', userData.user.id)
    .order('drawn_at', { ascending: true })
    .limit(20)
  panels.value = (data ?? []) as unknown as Panel[]
  loading.value = false
}
onMounted(load)

interface MarkerSeries {
  spec: MarkerSpec
  points: { drawn_at: string; value: number }[]
  latest: number | null
  prior: number | null
  inRange: boolean | null
}

const seriesByMarker = computed<MarkerSeries[]>(() => {
  return MARKERS.map((spec) => {
    const points = panels.value
      .filter((p) => typeof p.markers?.[spec.key] === 'number')
      .map((p) => ({ drawn_at: p.drawn_at, value: Number(p.markers[spec.key]) }))
    const latest = points.length > 0 ? points[points.length - 1].value : null
    const prior = points.length > 1 ? points[points.length - 2].value : null
    const inRange = latest != null
      ? (spec.range.min == null || latest >= spec.range.min) && (spec.range.max == null || latest <= spec.range.max)
      : null
    return { spec, points, latest, prior, inRange }
  }).filter((s) => s.points.length > 0)
})

// Mini-chart geometry
const W = 220
const H = 70
const PAD_X = 6
const PAD_TOP = 10
const PAD_BOT = 14

function chartFor(series: MarkerSeries) {
  if (series.points.length === 0) return { linePath: '', dotXY: [], rangeY: null as { y1: number; y2: number } | null, yMin: 0, yMax: 1, xCoord: (_: number) => 0, yCoord: (_: number) => 0 }
  const vals = series.points.map((p) => p.value)
  if (series.spec.range.min != null) vals.push(series.spec.range.min)
  if (series.spec.range.max != null) vals.push(series.spec.range.max)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = Math.max(0.5, (hi - lo) * 0.15)
  const yMin = lo - pad
  const yMax = hi + pad
  const range = yMax - yMin || 1
  const xStep = series.points.length > 1 ? (W - PAD_X * 2) / (series.points.length - 1) : 0
  const xCoord = (i: number) => PAD_X + i * xStep
  const yCoord = (v: number) => PAD_TOP + (1 - (v - yMin) / range) * (H - PAD_TOP - PAD_BOT)
  const linePath = series.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xCoord(i).toFixed(1)} ${yCoord(p.value).toFixed(1)}`)
    .join(' ')
  const dotXY = series.points.map((p, i) => ({ x: xCoord(i), y: yCoord(p.value), value: p.value, drawn_at: p.drawn_at }))
  let rangeY: { y1: number; y2: number } | null = null
  if (series.spec.range.min != null || series.spec.range.max != null) {
    const yMaxBand = series.spec.range.max != null ? yCoord(series.spec.range.max) : PAD_TOP
    const yMinBand = series.spec.range.min != null ? yCoord(series.spec.range.min) : (H - PAD_BOT)
    rangeY = { y1: Math.min(yMaxBand, yMinBand), y2: Math.max(yMaxBand, yMinBand) }
  }
  return { linePath, dotXY, rangeY, yMin, yMax, xCoord, yCoord }
}

function rangeText(spec: MarkerSpec): string {
  if (spec.range.min != null && spec.range.max != null) return `${spec.range.min}–${spec.range.max}`
  if (spec.range.max != null) return `≤ ${spec.range.max}`
  if (spec.range.min != null) return `≥ ${spec.range.min}`
  return ''
}

function deltaText(s: MarkerSeries): string | null {
  if (s.latest == null || s.prior == null) return null
  const diff = s.latest - s.prior
  return `${diff > 0 ? '+' : ''}${diff.toFixed(1)} vs prior`
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}
</script>

<template>
  <section class="card p-4">
    <div class="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Bloodwork</div>
        <div class="text-base font-semibold text-ink mt-0.5">Markers across {{ panels.length }} {{ panels.length === 1 ? 'draw' : 'draws' }}</div>
        <p class="text-xs text-ink-muted mt-0.5">
          Reference range shaded green · most recent value annotated.
        </p>
      </div>
    </div>

    <div v-if="loading" class="text-xs text-ink-muted">Loading…</div>
    <div v-else-if="seriesByMarker.length === 0" class="text-xs text-ink-muted">
      No bloodwork on file yet. Upload a PDF on the Bloodwork tab.
    </div>
    <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="s in seriesByMarker" :key="s.spec.key" class="rounded-md border border-divider p-3">
        <div class="flex items-baseline justify-between gap-2 mb-1">
          <div>
            <div class="text-[11px] text-ink-muted">{{ s.spec.label }}</div>
            <div class="text-base font-bold tabular-nums" :class="s.inRange ? 'text-success' : 'text-warn'">
              {{ s.latest }} <span class="text-[10px] font-normal text-ink-muted">{{ s.spec.unit }}</span>
            </div>
            <div class="text-[10px] text-ink-disabled">target {{ rangeText(s.spec) }}</div>
          </div>
          <div v-if="deltaText(s)" class="text-[10px] tabular-nums" :class="s.inRange ? 'text-ink-muted' : 'text-warn'">
            {{ deltaText(s) }}
          </div>
        </div>
        <svg :viewBox="`0 0 ${W} ${H}`" class="w-full h-16 block">
          <!-- Reference range band (green) -->
          <rect
            v-if="chartFor(s).rangeY"
            :x="PAD_X" :y="chartFor(s).rangeY!.y1"
            :width="W - PAD_X * 2" :height="chartFor(s).rangeY!.y2 - chartFor(s).rangeY!.y1"
            fill="rgb(var(--color-success))" fill-opacity="0.10"
          />
          <!-- Line + dots -->
          <path v-if="chartFor(s).linePath && s.points.length > 1" :d="chartFor(s).linePath"
            fill="none" stroke="rgb(var(--color-brand))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <circle
            v-for="(d, i) in chartFor(s).dotXY" :key="i"
            :cx="d.x" :cy="d.y" r="3"
            fill="rgb(var(--color-brand))"
            stroke="rgb(var(--color-surface, 255 255 255))" stroke-width="1.5"
          >
            <title>{{ d.value }} on {{ fmtDate(d.drawn_at) }}</title>
          </circle>
        </svg>
      </div>
    </div>
  </section>
</template>
