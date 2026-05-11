/**
 * Josh Personal — live data composable.
 *
 * Reads from personal_metrics + personal_workouts (Apple Health
 * pipeline via Health Auto Export → webhook). Returns reactive refs
 * shaped EXACTLY like the static mock exports in ./health.ts so the
 * module components don't have to change shape — just swap their
 * import from `health.ts` to `healthData.ts`.
 *
 * Aggregation happens client-side for v1. Apple Watch records ~minute
 * granularity; we sum / average to daily values for trend charts and
 * to today values for the snapshot strip. For 8 weeks of step data
 * (~28k rows) the JSON payload is ~1.5MB — fast enough on broadband.
 * If that becomes a bottleneck we'll add Postgres RPC functions.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { STEPS_DAILY_TARGET } from './health'
import type { SnapshotMetric, SeriesTrend, BarTrend } from './health'

// ── Helpers ────────────────────────────────────────────────────────────

/** ISO date string (YYYY-MM-DD) in the user's local timezone. */
function localDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ISO timestamp for "N days ago at midnight local time." */
function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** ISO timestamp for "today at midnight local time." */
function todayMidnightIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// The Supabase generated types don't include personal_metrics yet
// (we'd need to regenerate via supabase gen types — not worth the
// roundtrip for one table). Cast through unknown to skip the
// `never`-row inference problem.
type MetricRow = { value: number | string; recorded_at: string }

/** Pull rows of (value, recorded_at) for a metric type within a window. */
async function fetchSeries(
  metricType: string,
  sinceIso: string,
): Promise<{ value: number; recorded_at: string }[]> {
  const { data, error } = await supabase
    .from('personal_metrics')
    .select('value, recorded_at')
    .eq('metric_type', metricType)
    .gte('recorded_at', sinceIso)
    .order('recorded_at', { ascending: true })
  if (error) {
    console.error(`[healthData] fetchSeries ${metricType}:`, error.message)
    return []
  }
  // Supabase returns numeric as string for high-precision; coerce.
  const rows = (data ?? []) as unknown as MetricRow[]
  return rows.map((r) => ({
    value: Number(r.value),
    recorded_at: r.recorded_at,
  }))
}

/** Latest single value for a metric (e.g. most recent weight reading). */
async function fetchLatest(metricType: string): Promise<{ value: number; recorded_at: string } | null> {
  const { data, error } = await supabase
    .from('personal_metrics')
    .select('value, recorded_at')
    .eq('metric_type', metricType)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error(`[healthData] fetchLatest ${metricType}:`, error.message)
    return null
  }
  if (!data) return null
  const row = data as unknown as MetricRow
  return { value: Number(row.value), recorded_at: row.recorded_at }
}

/** Sum of values for a metric in a window. */
function sumSeries(rows: { value: number }[]): number {
  return rows.reduce((s, r) => s + r.value, 0)
}

/** Average of values. */
function avgSeries(rows: { value: number }[]): number {
  if (rows.length === 0) return 0
  return rows.reduce((s, r) => s + r.value, 0) / rows.length
}

/** Aggregate per-day sums (for cumulative metrics like steps, calories). */
function dailySum(rows: { value: number; recorded_at: string }[]): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const r of rows) {
    const day = r.recorded_at.slice(0, 10) // YYYY-MM-DD from ISO
    byDay.set(day, (byDay.get(day) ?? 0) + r.value)
  }
  return byDay
}

/** Aggregate per-day averages (for averaged metrics like HRV). */
function dailyAvg(rows: { value: number; recorded_at: string }[]): Map<string, number> {
  const sums = new Map<string, { sum: number; count: number }>()
  for (const r of rows) {
    const day = r.recorded_at.slice(0, 10)
    const s = sums.get(day) ?? { sum: 0, count: 0 }
    s.sum += r.value
    s.count += 1
    sums.set(day, s)
  }
  const out = new Map<string, number>()
  for (const [day, s] of sums) out.set(day, s.sum / s.count)
  return out
}

/** Aggregate per-day max (for daily-snapshot metrics like weight, sleep). */
function dailyMax(rows: { value: number; recorded_at: string }[]): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const r of rows) {
    const day = r.recorded_at.slice(0, 10)
    const cur = byDay.get(day)
    if (cur === undefined || r.value > cur) byDay.set(day, r.value)
  }
  return byDay
}

/** Pad a daily map into an N-length array of (date, value) for the last N days. */
function lastNDays(map: Map<string, number>, n: number): { day: string; value: number | null }[] {
  const out: { day: string; value: number | null }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = localDate(d)
    out.push({ day: key, value: map.has(key) ? map.get(key)! : null })
  }
  return out
}

/** Bucket daily values into ISO-week sums. Returns last N weeks newest-last. */
function lastNWeeklyCounts(
  byDay: Map<string, number>,
  n: number,
  threshold = 1,
): number[] {
  // Each week = 7 days ending today. Count days where value >= threshold.
  const weekly: number[] = []
  for (let w = n - 1; w >= 0; w--) {
    let count = 0
    for (let d = 0; d < 7; d++) {
      const date = new Date()
      date.setDate(date.getDate() - (w * 7 + d))
      const key = localDate(date)
      if ((byDay.get(key) ?? 0) >= threshold) count++
    }
    weekly.push(count)
  }
  return weekly
}

/** Drop nulls + take the last-non-null window for a sparkline. */
function compactValues(series: { value: number | null }[]): number[] {
  return series
    .filter((s) => s.value !== null)
    .map((s) => s.value as number)
}

// ── Composable ────────────────────────────────────────────────────────

export function useHealthData() {
  const loading = ref(true)
  const error = ref<string | null>(null)

  // Today snapshot values
  const todaySteps = ref(0)
  const todayHrv = ref<number | null>(null)
  const lastWeight = ref<number | null>(null)
  const lastSleepAsleepHours = ref<number | null>(null)
  const loggingStreak = ref(0)

  // 56-day series (raw daily series, used for both trends and deltas)
  const dailySteps = ref<{ day: string; value: number | null }[]>([])
  const dailySleepAsleep = ref<{ day: string; value: number | null }[]>([])
  const dailyHrvAvg = ref<{ day: string; value: number | null }[]>([])
  const dailyWeight = ref<{ day: string; value: number | null }[]>([])
  const dailyActiveCal = ref<{ day: string; value: number | null }[]>([])

  // Workouts/week counts (last 8 weeks) — derived from apple_exercise_time
  // bucketed per day; a "workout day" = >= 20 min of exercise. Real workout
  // table will replace this in a later phase.
  const workoutsPerWeek = ref<number[]>([])

  async function load() {
    loading.value = true
    error.value = null

    try {
      const since56 = daysAgoIso(56)
      const sinceToday = todayMidnightIso()

      // Pull everything in parallel.
      const [
        stepsRaw,
        sleepRaw,
        hrvRaw,
        weightRaw,
        activeCalRaw,
        exerciseTimeRaw,
        todayStepsRaw,
        todayHrvRaw,
        latestWeight,
      ] = await Promise.all([
        fetchSeries('step_count', since56),
        fetchSeries('sleep_asleep', since56),
        fetchSeries('heart_rate_variability', since56),
        fetchSeries('weight_body_mass', since56),
        fetchSeries('active_energy', since56),
        fetchSeries('apple_exercise_time', since56),
        fetchSeries('step_count', sinceToday),
        fetchSeries('heart_rate_variability', sinceToday),
        fetchLatest('weight_body_mass'),
      ])

      // Today snapshot
      todaySteps.value = Math.round(sumSeries(todayStepsRaw))
      todayHrv.value = todayHrvRaw.length > 0 ? Math.round(avgSeries(todayHrvRaw)) : null
      lastWeight.value = latestWeight ? round1(latestWeight.value) : null

      // Last night's sleep (sleep_asleep is reported as ONE row per
      // sleep session containing the total hours asleep; latest row
      // is "last night")
      const sleepSorted = [...sleepRaw].sort(
        (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
      )
      lastSleepAsleepHours.value = sleepSorted.length > 0 ? round1(sleepSorted[0].value) : null

      // Daily aggregates
      const stepsBy = dailySum(stepsRaw)
      const sleepBy = dailyMax(sleepRaw)
      const hrvBy = dailyAvg(hrvRaw)
      const weightBy = dailyMax(weightRaw)
      const activeCalBy = dailySum(activeCalRaw)
      const exerciseBy = dailySum(exerciseTimeRaw)

      dailySteps.value = lastNDays(stepsBy, 56)
      dailySleepAsleep.value = lastNDays(sleepBy, 56)
      dailyHrvAvg.value = lastNDays(hrvBy, 56)
      dailyWeight.value = lastNDays(weightBy, 56)
      dailyActiveCal.value = lastNDays(activeCalBy, 56)

      // Workouts/week — count days/wk where exercise_time sum >= 20 min
      workoutsPerWeek.value = lastNWeeklyCounts(exerciseBy, 8, 20).reverse()

      // Logging streak — consecutive days (back from today) with any data
      let streak = 0
      for (let i = 0; i < 56; i++) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = localDate(d)
        if ((stepsBy.get(key) ?? 0) > 0 || (hrvBy.get(key) ?? 0) > 0 || (sleepBy.get(key) ?? 0) > 0) {
          streak++
        } else {
          break
        }
      }
      loggingStreak.value = streak
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[healthData] load failed:', err)
    } finally {
      loading.value = false
    }
  }

  onMounted(load)

  // ── Derived shapes matching the static mock exports ────────────────

  /** Snapshot strip (matches the `snapshot` const in health.ts). */
  const snapshot = computed<Record<'sleep' | 'steps' | 'weight' | 'hrv' | 'streak', SnapshotMetric>>(() => {
    // Compute "vs avg" deltas from the 56-day series
    const sleepValues = compactValues(dailySleepAsleep.value)
    const sleepAvg = sleepValues.length > 0 ? avgArr(sleepValues) : 0
    const sleepDelta = lastSleepAsleepHours.value !== null && sleepAvg > 0
      ? formatDelta(lastSleepAsleepHours.value - sleepAvg, 'h vs avg')
      : ''

    const weightValues = compactValues(dailyWeight.value)
    const weight30dAgo = weightValues.length > 30 ? weightValues[weightValues.length - 31] : null
    const weightDelta = lastWeight.value !== null && weight30dAgo !== null
      ? `${(lastWeight.value - weight30dAgo).toFixed(1)} lbs / 30d`
      : ''

    const hrvValues = compactValues(dailyHrvAvg.value)
    const hrvAvg = hrvValues.length > 0 ? avgArr(hrvValues) : 0
    const hrvDelta = todayHrv.value !== null && hrvAvg > 0
      ? formatDelta(todayHrv.value - hrvAvg, 'ms vs avg')
      : ''

    return {
      sleep: {
        value: lastSleepAsleepHours.value ?? '—',
        unit: 'h',
        delta: sleepDelta || 'no data',
        trend: trendFromDelta(lastSleepAsleepHours.value !== null && sleepAvg > 0
          ? lastSleepAsleepHours.value - sleepAvg : 0),
      },
      steps: {
        value: todaySteps.value.toLocaleString(),
        unit: '',
        delta: `${Math.round((todaySteps.value / STEPS_DAILY_TARGET) * 100)}% of 10k goal`,
        trend: 'flat',
      },
      weight: {
        value: lastWeight.value ?? '—',
        unit: 'lbs',
        delta: weightDelta || 'no data',
        trend: trendFromDelta(lastWeight.value !== null && weight30dAgo !== null
          ? -(lastWeight.value - weight30dAgo) : 0), // down is "good" for cut
      },
      hrv: {
        value: todayHrv.value ?? '—',
        unit: 'ms',
        delta: hrvDelta || 'no data',
        trend: trendFromDelta(todayHrv.value !== null && hrvAvg > 0
          ? todayHrv.value - hrvAvg : 0),
      },
      streak: {
        value: loggingStreak.value,
        unit: 'days',
        delta: 'logged',
        trend: 'flat',
      },
    }
  })

  /** Trend objects matching the `trends` const in health.ts. */
  const trends = computed<{
    weight: SeriesTrend
    sleep: SeriesTrend
    hrv: SeriesTrend
    steps: SeriesTrend
    activeCal: SeriesTrend
    workouts: BarTrend
  }>(() => {
    const stepsVals = compactValues(dailySteps.value)
    const sleepVals = compactValues(dailySleepAsleep.value)
    const hrvVals = compactValues(dailyHrvAvg.value)
    const weightVals = compactValues(dailyWeight.value)
    const calVals = compactValues(dailyActiveCal.value)

    return {
      weight: {
        values: weightVals,
        label: 'Weight, last 8 weeks',
        summary: weightTrendSummary(weightVals),
        unit: 'lbs',
      },
      sleep: {
        values: sleepVals,
        label: 'Sleep, last 8 weeks',
        summary: sleepTrendSummary(sleepVals),
        unit: 'h',
      },
      hrv: {
        values: hrvVals,
        label: 'HRV (morning), last 8 weeks',
        summary: hrvTrendSummary(hrvVals),
        unit: 'ms',
      },
      steps: {
        values: stepsVals,
        label: 'Daily steps, last 8 weeks',
        summary: stepsTrendSummary(stepsVals),
        unit: '',
        targetLine: STEPS_DAILY_TARGET,
      },
      activeCal: {
        values: calVals,
        label: 'Active cal, last 8 weeks (avg/day)',
        summary: activeCalTrendSummary(calVals),
        unit: '',
      },
      workouts: {
        weeklyCounts: workoutsPerWeek.value,
        label: 'Workouts/week, last 8 weeks',
        summary: workoutsTrendSummary(workoutsPerWeek.value),
      },
    }
  })

  /** Steps summary block matching `stepsSummary` in health.ts. */
  const stepsSummary = computed(() => {
    const last7 = dailySteps.value.slice(-7)
    const validLast7 = last7.filter((d) => d.value !== null) as { day: string; value: number }[]
    const weekAvg = validLast7.length > 0
      ? Math.round(validLast7.reduce((s, d) => s + d.value, 0) / validLast7.length)
      : 0
    const daysHitGoal = validLast7.filter((d) => d.value >= STEPS_DAILY_TARGET).length

    // Longest streak of days hitting goal across the 56-day window
    let longest = 0
    let cur = 0
    for (const d of dailySteps.value) {
      if ((d.value ?? 0) >= STEPS_DAILY_TARGET) {
        cur++
        if (cur > longest) longest = cur
      } else {
        cur = 0
      }
    }

    return {
      weekAvg,
      daysHitGoal,
      daysInWeek: 7,
      longestStreak: longest,
      todayProgress: todaySteps.value,
    }
  })

  return {
    loading,
    error,
    reload: load,
    snapshot,
    trends,
    stepsSummary,
    dailyWeight,
  }
}

// ── Tiny helpers (local) ──────────────────────────────────────────────

function avgArr(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function formatDelta(diff: number, suffix: string): string {
  if (Math.abs(diff) < 0.05) return `even ${suffix.replace('vs avg', '/ avg')}`
  const sign = diff > 0 ? '+' : ''
  return `${sign}${diff.toFixed(1)}${suffix.startsWith(' ') ? '' : ''}${suffix}`
}

function trendFromDelta(diff: number): 'up' | 'down' | 'flat' {
  if (diff > 0.1) return 'up'
  if (diff < -0.1) return 'down'
  return 'flat'
}

function weightTrendSummary(vals: number[]): string {
  if (vals.length < 2) return 'Not enough data yet'
  const change = vals[vals.length - 1] - vals[0]
  const direction = change > 0 ? 'up' : 'down'
  return `${direction} ${Math.abs(change).toFixed(1)} lbs across the window`
}

function sleepTrendSummary(vals: number[]): string {
  if (vals.length === 0) return 'No sleep data yet'
  const avg = avgArr(vals)
  const best = Math.max(...vals)
  return `${avg.toFixed(1)}h average · best night was ${best.toFixed(1)}h`
}

function hrvTrendSummary(vals: number[]): string {
  if (vals.length === 0) return 'No HRV data yet'
  const avg = avgArr(vals)
  const recent = avgArr(vals.slice(-7))
  const direction = recent > avg ? 'trending up' : recent < avg ? 'trending down' : 'steady'
  return `${avg.toFixed(0)}ms average · ${direction} this week`
}

function stepsTrendSummary(vals: number[]): string {
  if (vals.length === 0) return 'No step data yet'
  const avg = Math.round(avgArr(vals))
  const last7 = vals.slice(-7)
  const hitGoal = last7.filter((v) => v >= STEPS_DAILY_TARGET).length
  return `Avg ${avg.toLocaleString()}/day · hit 10k goal ${hitGoal} of 7 days last week`
}

function activeCalTrendSummary(vals: number[]): string {
  if (vals.length === 0) return 'No active-cal data yet'
  const avg = Math.round(avgArr(vals))
  return `Avg ${avg.toLocaleString()} kcal/day burned`
}

function workoutsTrendSummary(weekly: number[]): string {
  if (weekly.length === 0) return 'No workout data yet'
  const avg = avgArr(weekly).toFixed(1)
  return `Avg ${avg}/week · target is 4`
}
