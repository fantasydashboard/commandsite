<script setup lang="ts">
/**
 * Josh Personal — Health module (mocked v1).
 *
 * The personal-life mirror of the Ada/Grace pattern: an AI coach (Sage)
 * reads everything Josh logs (sleep, weight, food, blood work, workouts)
 * and writes daily plans + surfaces patterns. This v1 is mock-data only
 * so Josh can react to the shape before we wire real ingestion.
 *
 * Real data sources on the roadmap once shape is approved:
 *   ─ Apple Health CSV export → upload + parse
 *   ─ Blood work PDF (Quest/LabCorp) → vision-model extract → time-series
 *   ─ Food log → "tell Sage what you ate" chat → Claude estimates macros
 *   ─ Workouts → preset programs Josh ticks "done" on, Sage adjusts split
 *   ─ Daily check-in form (mood/energy 1-10 sliders, weight, supplements)
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import AssistantMark from '@/components/AssistantMark.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// ── MOCK DATA ──────────────────────────────────────────────────────────
//
// Realistic-feeling values so Josh can read the surface and judge the
// shape. Numbers are tuned to a 38-year-old male, mid-cut, lifting 4x/wk.
// Replace each block when the corresponding ingestion path ships.

const today = computed(() => {
  const now = new Date()
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
})

// Sage activity strip — what she's done lately
const sageActivity = [
  {
    icon: '🍽️',
    label: 'Drafted today\'s meal + workout plan',
    detail: '2,200 cal · 180g protein · push day · timed for 10am gym',
    ago: '35m ago',
  },
  {
    icon: '⚠️',
    label: 'Flagged: LDL trending up 4 panels in a row',
    detail: '110 → 128 → 141 → 148 over 12 months · added recommendation to today\'s plan',
    ago: '2d ago',
  },
  {
    icon: '🛌',
    label: 'Updated workout split: deload week',
    detail: 'HRV dropped to 52 average over 3 days · pulled volume 30% on lifts',
    ago: '5d ago',
  },
]

// Today snapshot
const snapshot = {
  sleep: { value: 7.4, unit: 'h', delta: '+0.3h vs avg', trend: 'up' as const },
  energy: { value: 7, unit: '/10', delta: 'predicted', trend: 'flat' as const },
  weight: { value: 172.4, unit: 'lbs', delta: '−2.1 lbs / 30d', trend: 'down' as const },
  hrv: { value: 58, unit: 'ms', delta: '+4ms vs avg', trend: 'up' as const },
  streak: { value: 12, unit: 'days', delta: 'logged', trend: 'flat' as const },
}

// Today's plan
const todaysMeals = {
  total: { cal: 2200, protein: 180, carbs: 220, fat: 75 },
  meals: [
    {
      name: 'Breakfast',
      cal: 520,
      detail: '3 whole eggs scrambled, ½ cup oats with berries, black coffee',
      protein: 32,
      time: '7:30am',
    },
    {
      name: 'Lunch',
      cal: 680,
      detail: 'Chipotle bowl: double chicken, brown rice, fajita peppers, salsa, no cheese',
      protein: 62,
      time: '12:30pm',
    },
    {
      name: 'Dinner',
      cal: 700,
      detail: '6 oz salmon, roasted sweet potato (200g), large mixed-greens salad with olive oil + lemon',
      protein: 50,
      time: '7:00pm',
    },
    {
      name: 'Snacks',
      cal: 300,
      detail: 'Greek yogurt + almonds (3pm), 1 apple post-workout',
      protein: 36,
      time: 'split',
    },
  ],
  rationale: 'Hit 180g protein target on a ~500-cal deficit, supporting cut to 168 by July. Olive-oil-forward dinner reflects this week\'s LDL recommendation (swap from butter).',
}

const todaysWorkout = {
  name: 'Push day',
  duration: '~45 min',
  scheduledAt: '10:00am',
  exercises: [
    { name: 'Bench press', sets: '4 × 6', load: '185 lbs', notes: 'Add 5 lbs vs last session' },
    { name: 'Overhead press', sets: '3 × 8', load: '105 lbs', notes: '' },
    { name: 'Incline DB press', sets: '3 × 10', load: '50s', notes: '' },
    { name: 'Tricep pushdown', sets: '3 × 12', load: '70 lbs', notes: 'Superset' },
    { name: 'Lateral raises', sets: '3 × 15', load: '15s', notes: 'Superset with above' },
  ],
  rationale: 'HRV 58 today (good — back from deload). On schedule for week 4 of the program. Bench progression is on track for 225×5 by Q3.',
}

// Blood work
type Marker = {
  name: string
  latest: number
  unit: string
  range: string
  status: 'good' | 'warn' | 'danger'
  history: number[]
  trendNote: string
}
const bloodwork = {
  drawnAt: 'April 12, 2026',
  drawnBy: 'Quest Diagnostics',
  markers: [
    { name: 'LDL Cholesterol',  latest: 148, unit: 'mg/dL', range: '<130',     status: 'warn'   as const, history: [110, 128, 141, 148], trendNote: 'Up 38pts in 12mo' },
    { name: 'HDL Cholesterol',  latest: 52,  unit: 'mg/dL', range: '>40',      status: 'good'   as const, history: [48, 50, 51, 52],     trendNote: 'Steady, on the right side' },
    { name: 'Triglycerides',    latest: 88,  unit: 'mg/dL', range: '<150',     status: 'good'   as const, history: [90, 85, 92, 88],     trendNote: 'Solid' },
    { name: 'Hemoglobin A1C',   latest: 5.4, unit: '%',     range: '<5.7',     status: 'good'   as const, history: [5.5, 5.4, 5.4, 5.4], trendNote: 'No glucose drift' },
    { name: 'Vitamin D',        latest: 32,  unit: 'ng/mL', range: '30-100',   status: 'warn'   as const, history: [24, 28, 30, 32],     trendNote: 'Just over the floor — sunlight + 2k IU/day worked' },
    { name: 'Total Testosterone', latest: 640, unit: 'ng/dL', range: '264-916', status: 'good' as const, history: [610, 605, 625, 640], trendNote: 'Trending up since strength block' },
    { name: 'TSH',              latest: 2.1, unit: 'mIU/L', range: '0.4-4.5',  status: 'good'   as const, history: [2.0, 1.9, 2.2, 2.1], trendNote: 'Thyroid stable' },
    { name: 'CRP (inflammation)', latest: 0.8, unit: 'mg/L', range: '<3.0',    status: 'good'   as const, history: [0.6, 0.9, 0.7, 0.8], trendNote: 'Low — recovery is good' },
  ] satisfies Marker[],
  sageRead: 'LDL is up 38 points across 4 draws — ~12% per panel. Strongest correlation in your food log: saturated fat averaged 32g/day this quarter (vs 18g in the prior year). Recommend swapping butter → olive oil for cooking and reducing red meat to 2x/week. Re-test in 90 days. Everything else is in good shape and trending the right direction.',
}

// Trends — values for sparklines (simple SVG paths)
function buildSparklinePath(values: number[], width = 200, height = 40): string {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = width / (values.length - 1)
  return values
    .map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / range) * (height - 4) - 2
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

const trends = {
  weight: {
    values: [177.2, 176.8, 175.9, 175.1, 174.6, 173.8, 172.9, 172.4],
    label: 'Weight, last 8 weeks',
    summary: '−4.8 lbs in 8 weeks · on pace for 168 by Jul 1',
    unit: 'lbs',
  },
  sleep: {
    values: [6.8, 7.0, 6.5, 7.4, 7.2, 7.6, 7.4, 7.4],
    label: 'Sleep, last 8 weeks',
    summary: '7.2h average · best week was 7.6h',
    unit: 'h',
  },
  workouts: {
    // 0/1 booleans → bar count per week
    weeklyCounts: [3, 4, 4, 3, 4, 5, 4, 4],
    label: 'Workouts/week, last 8 weeks',
    summary: 'Avg 3.9/week · target is 4',
  },
}

// Goals
const goals = [
  { label: 'Cut to 168 lbs by Jul 1', progress: 0.69, status: 'on-track', detail: '−2.1 lbs / 30d · 4.4 lbs to go' },
  { label: 'LDL under 130 by next draw', progress: 0.0, status: 'off-track', detail: 'Trending wrong direction · re-test 90 days' },
  { label: 'Bench 225 × 5 by Q3', progress: 0.78, status: 'on-track', detail: 'At 205 × 5 · adding 5 lbs / 2 sessions' },
  { label: 'Sleep 7.5h average', progress: 0.99, status: 'on-track', detail: '7.4h 30-day · within margin' },
]

// ── Helpers ────────────────────────────────────────────────────────────
function statusClass(status: 'good' | 'warn' | 'danger'): string {
  if (status === 'good')   return 'bg-success/15 text-success'
  if (status === 'warn')   return 'bg-warn/15 text-warn'
  return 'bg-danger/15 text-danger'
}
function statusIcon(status: 'good' | 'warn' | 'danger'): string {
  if (status === 'good')   return '✓'
  if (status === 'warn')   return '⚠'
  return '✕'
}
function trendArrow(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up')   return '↑'
  if (trend === 'down') return '↓'
  return '·'
}
function goalToneClass(status: string): string {
  if (status === 'on-track')  return 'bg-success'
  if (status === 'off-track') return 'bg-danger'
  return 'bg-warn'
}

// Ask Sage chat (mock — clicks a no-op for now)
const chatOpen = ref(false)
const chatInput = ref('')
const chatPlaceholders = [
  'plan tomorrow around 200g protein',
  'why is my LDL up?',
  'i\'m sore — should i push or rest?',
  'what should i eat for dinner tonight?',
]
const samplePrompts = chatPlaceholders.slice(0, 3)
</script>

<template>
  <div class="space-y-5">
    <!-- ── Sage activity strip ──────────────────────────────────────── -->
    <section class="card overflow-hidden p-0 border border-brand/30">
      <div class="flex items-start gap-3 bg-brand/5 px-5 py-3 border-b border-brand/20">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-brand flex-shrink-0">
          <AssistantMark class="h-5 w-5" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-0.5">
            <span class="text-sm font-semibold text-ink">Sage's role on this page</span>
            <span class="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
              <span>🌿</span>
              <span>Health Coach</span>
            </span>
          </div>
          <p class="text-xs text-ink-muted leading-relaxed">
            Sage reads your blood work, food log, sleep, and workouts to draft daily plans and surface trends you'd miss. She nudges; you decide.
          </p>
        </div>
      </div>
      <div class="px-5 py-3 bg-surface-raised">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
          Sage's recent activity here
        </div>
        <ul class="space-y-1.5">
          <li
            v-for="(a, i) in sageActivity"
            :key="i"
            class="flex items-start gap-2 text-xs"
          >
            <span class="text-base shrink-0 leading-none mt-0.5">{{ a.icon }}</span>
            <span class="flex-1 min-w-0">
              <span class="font-semibold text-ink">{{ a.label }}</span>
              <span class="text-ink-muted">  {{ a.detail }}</span>
            </span>
            <span class="text-[10px] text-ink-disabled shrink-0">{{ a.ago }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- ── Header ───────────────────────────────────────────────────── -->
    <div class="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-xl font-semibold text-ink">Health · {{ today }}</h2>
        <p class="text-xs text-ink-muted mt-0.5">
          Today's snapshot, Sage's daily plan, blood work, and trends. Logging takes ~30 seconds.
        </p>
      </div>
      <button
        type="button"
        class="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
      >
        <span>+ Log today</span>
      </button>
    </div>

    <!-- ── Snapshot strip ───────────────────────────────────────────── -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div class="card p-3">
        <div class="kpi-label">Sleep</div>
        <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.sleep.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.sleep.unit }}</span></div>
        <div class="text-[11px] text-success mt-0.5">{{ trendArrow(snapshot.sleep.trend) }} {{ snapshot.sleep.delta }}</div>
      </div>
      <div class="card p-3">
        <div class="kpi-label">Energy (predicted)</div>
        <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.energy.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.energy.unit }}</span></div>
        <div class="text-[11px] text-ink-muted mt-0.5">based on sleep + plan</div>
      </div>
      <div class="card p-3">
        <div class="kpi-label">Weight</div>
        <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.weight.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.weight.unit }}</span></div>
        <div class="text-[11px] text-success mt-0.5">{{ trendArrow(snapshot.weight.trend) }} {{ snapshot.weight.delta }}</div>
      </div>
      <div class="card p-3">
        <div class="kpi-label">HRV (morning)</div>
        <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.hrv.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.hrv.unit }}</span></div>
        <div class="text-[11px] text-success mt-0.5">{{ trendArrow(snapshot.hrv.trend) }} {{ snapshot.hrv.delta }}</div>
      </div>
      <div class="card p-3">
        <div class="kpi-label">Logging streak</div>
        <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.streak.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.streak.unit }}</span></div>
        <div class="text-[11px] text-ink-muted mt-0.5">keep it going</div>
      </div>
    </div>

    <!-- ── Today's plan: meals + workout side by side ──────────────── -->
    <div class="grid gap-4 lg:grid-cols-2">
      <!-- Meals -->
      <section class="card p-0 overflow-hidden">
        <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Today's meals</div>
            <div class="font-semibold text-ink mt-0.5">
              {{ todaysMeals.total.cal.toLocaleString() }} cal · {{ todaysMeals.total.protein }}g protein
            </div>
            <div class="text-[11px] text-ink-muted mt-0.5">
              {{ todaysMeals.total.carbs }}g carbs · {{ todaysMeals.total.fat }}g fat
            </div>
          </div>
          <button class="text-xs font-medium text-brand hover:underline">Regenerate</button>
        </header>
        <ul class="divide-y divide-divider">
          <li v-for="m in todaysMeals.meals" :key="m.name" class="px-4 py-3">
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold text-ink text-sm">{{ m.name }}</span>
              <span class="text-[11px] text-ink-muted tabular-nums">{{ m.cal }} cal · {{ m.protein }}g p · {{ m.time }}</span>
            </div>
            <p class="text-xs text-ink-muted mt-1 leading-snug">{{ m.detail }}</p>
          </li>
        </ul>
        <div class="px-4 py-3 bg-brand/5 border-t border-brand/15">
          <div class="flex items-start gap-2">
            <AssistantMark class="h-3.5 w-3.5 text-brand mt-0.5 shrink-0" />
            <p class="text-[12px] text-ink-muted leading-relaxed">
              <strong class="text-ink font-semibold">Why this:</strong> {{ todaysMeals.rationale }}
            </p>
          </div>
        </div>
      </section>

      <!-- Workout -->
      <section class="card p-0 overflow-hidden">
        <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Today's workout</div>
            <div class="font-semibold text-ink mt-0.5">
              {{ todaysWorkout.name }} · {{ todaysWorkout.duration }}
            </div>
            <div class="text-[11px] text-ink-muted mt-0.5">scheduled {{ todaysWorkout.scheduledAt }}</div>
          </div>
          <button class="text-xs font-medium text-brand hover:underline">Mark done</button>
        </header>
        <ul class="divide-y divide-divider">
          <li v-for="ex in todaysWorkout.exercises" :key="ex.name" class="px-4 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="font-semibold text-ink text-sm">{{ ex.name }}</div>
              <div v-if="ex.notes" class="text-[11px] text-ink-muted mt-0.5">{{ ex.notes }}</div>
            </div>
            <div class="text-right shrink-0">
              <div class="font-mono text-sm text-ink tabular-nums">{{ ex.sets }}</div>
              <div class="text-[11px] text-ink-muted tabular-nums">{{ ex.load }}</div>
            </div>
          </li>
        </ul>
        <div class="px-4 py-3 bg-brand/5 border-t border-brand/15">
          <div class="flex items-start gap-2">
            <AssistantMark class="h-3.5 w-3.5 text-brand mt-0.5 shrink-0" />
            <p class="text-[12px] text-ink-muted leading-relaxed">
              <strong class="text-ink font-semibold">Why this:</strong> {{ todaysWorkout.rationale }}
            </p>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Blood work ──────────────────────────────────────────────── -->
    <section class="card p-0 overflow-hidden">
      <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Blood work</div>
          <div class="font-semibold text-ink mt-0.5">Last drawn {{ bloodwork.drawnAt }}</div>
          <div class="text-[11px] text-ink-muted mt-0.5">via {{ bloodwork.drawnBy }}</div>
        </div>
        <button class="rounded-md border border-brand text-brand bg-brand/5 px-3 py-1.5 text-xs font-semibold hover:bg-brand/10">
          + Upload new panel
        </button>
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
      <div class="px-4 py-4 bg-brand/5 border-t border-brand/15">
        <div class="flex items-start gap-2">
          <AssistantMark class="h-4 w-4 text-brand mt-0.5 shrink-0" />
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-1">Sage's read on this panel</div>
            <p class="text-sm text-ink leading-relaxed">{{ bloodwork.sageRead }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Trends ──────────────────────────────────────────────────── -->
    <div class="grid gap-4 md:grid-cols-3">
      <div v-for="(t, key) in trends" :key="key" class="card p-4">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-2">{{ t.label }}</div>
        <svg v-if="'values' in t" :viewBox="`0 0 200 40`" class="h-12 w-full text-brand mb-2">
          <path :d="buildSparklinePath(t.values)" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div v-else class="flex items-end gap-1 h-12 mb-2">
          <div
            v-for="(c, i) in t.weeklyCounts"
            :key="i"
            class="flex-1 bg-brand rounded-sm"
            :style="{ height: `${(c / 5) * 100}%` }"
            :title="`Week ${i + 1}: ${c} workouts`"
          />
        </div>
        <p class="text-xs text-ink-muted leading-snug">{{ t.summary }}</p>
      </div>
    </div>

    <!-- ── Goals ────────────────────────────────────────────────────── -->
    <section class="card p-4">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-3">Goals</div>
      <ul class="space-y-3">
        <li v-for="g in goals" :key="g.label">
          <div class="flex items-center justify-between gap-3 mb-1">
            <span class="text-sm font-medium text-ink">{{ g.label }}</span>
            <span class="text-[11px] text-ink-muted">{{ g.detail }}</span>
          </div>
          <div class="h-1.5 w-full bg-brand/10 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="goalToneClass(g.status)"
              :style="{ width: `${Math.max(g.progress * 100, 4)}%` }"
            />
          </div>
        </li>
      </ul>
    </section>

    <!-- ── Ask Sage floating chat (placeholder) ────────────────────── -->
    <button
      type="button"
      class="fixed bottom-6 right-6 z-40 rounded-full bg-brand text-white shadow-2xl px-4 py-3 text-sm font-semibold hover:opacity-90 inline-flex items-center gap-2"
      @click="chatOpen = !chatOpen"
    >
      <AssistantMark class="h-4 w-4 text-white" />
      Ask Sage
    </button>

    <!-- Sample chat panel (visual only — not wired) -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="chatOpen"
        class="fixed bottom-24 right-6 z-40 w-96 max-w-[calc(100vw-3rem)] card p-4 shadow-2xl border-brand/30"
      >
        <div class="flex items-center gap-2 mb-3">
          <AssistantMark class="h-5 w-5 text-brand" />
          <span class="font-semibold text-ink">Ask Sage</span>
          <span class="ml-auto text-[10px] text-ink-muted uppercase tracking-wider">demo</span>
        </div>
        <div class="space-y-2 mb-3">
          <p class="text-xs text-ink-muted">Try:</p>
          <button
            v-for="p in samplePrompts"
            :key="p"
            type="button"
            class="block w-full text-left text-xs text-brand bg-brand/5 hover:bg-brand/10 rounded-md px-2 py-1.5"
            @click="chatInput = p"
          >{{ p }}</button>
        </div>
        <input
          v-model="chatInput"
          type="text"
          :placeholder="chatPlaceholders[0]"
          class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand"
        />
        <p class="text-[10px] text-ink-disabled mt-2">
          Real chat wires up after you tell me to ship this for real.
        </p>
      </div>
    </Transition>
  </div>
</template>
