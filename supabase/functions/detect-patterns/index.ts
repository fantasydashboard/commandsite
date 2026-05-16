// Josh Personal · detect-patterns Edge Function (Phase 3)
// ---------------------------------------------------------------------------
// Cron-fired nightly at 04:00 UTC. For each admin user with a profile,
// runs a small set of statistical rules over the last 30-60 days of
// metrics + adherence. Findings are upserted to personal_patterns_detected
// (dedup'd on user_id + pattern_type + window_key) so the same pattern
// detected on consecutive nights doesn't pile up.
//
// The Today page reads undismissed patterns and shows them as chips
// the user can tap to discuss with Sage. From there Sage can convert
// any pattern into a structured experiment via propose_experiment.
//
// This function is pure data analysis — no Anthropic calls. Cheap.
//
// Auth:    X-Cron-Secret header (CRON only — no user trigger path)
// Body:    {}  optional { user_id?: string } to backfill for one user
// Returns: { ok, patterns_detected, errors }
//
// MUST DEPLOY WITH --no-verify-jwt.

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

interface Pattern {
  pattern_type: string
  window_key: string
  title: string
  evidence_summary: string
  evidence_data: Record<string, unknown>
  severity: 'info' | 'notable' | 'concerning'
  suggested_experiment?: Record<string, unknown>
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoWeekKey(d = new Date()): string {
  // ISO week: Thursday in current week decides the year
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// ── Helpers for series math ─────────────────────────────────────────

function avg(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = avg(arr)
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

// ── Pattern detectors ───────────────────────────────────────────────
// Each takes raw inputs and returns 0-1 patterns. Detectors are pure.

interface DetectorInputs {
  // Daily values, newest LAST in each array (ascending by date)
  sleep_30d: { date: string; value: number }[]
  hrv_30d: { date: string; value: number }[]
  weight_30d: { date: string; value: number }[]
  water_14d: { date: string; value: number }[]
  satFat_14d: { date: string; value: number }[]   // daily totals
  satFatCeiling: number | null
  bp_systolic_recent: { recorded_at: string; value: number }[]   // last 14d, no aggregation
  bp_diastolic_recent: { recorded_at: string; value: number }[]
  workoutDates_14d: string[]
  weightLossTargetPerWeek: number | null  // from profile
  waterTarget: number
  primaryGoal: string | null
  adherence_14d: {
    date: string; cal_total: number; protein_g_total: number;
    hit_cal: boolean | null; hit_protein: boolean | null
  }[]
}

function detectSleepDeviation(inp: DetectorInputs): Pattern | null {
  const s = inp.sleep_30d
  if (s.length < 14) return null
  const recent7 = s.slice(-7).map((r) => r.value)
  const baseline23 = s.slice(0, -7).map((r) => r.value)
  if (baseline23.length < 7) return null
  const recentAvg = avg(recent7)
  const baselineAvg = avg(baseline23)
  const sd = stddev(baseline23)
  if (sd < 0.2) return null  // not enough variance
  const zScore = (recentAvg - baselineAvg) / sd
  if (Math.abs(zScore) < 1.5) return null  // not meaningful
  const direction = zScore < 0 ? 'down' : 'up'
  const delta = (recentAvg - baselineAvg).toFixed(1)
  const sevAbs = Math.abs(zScore)
  const severity: Pattern['severity'] = sevAbs >= 2.5 ? 'concerning' : sevAbs >= 2 ? 'notable' : 'info'
  return {
    pattern_type: 'sleep_deviation',
    window_key: isoWeekKey(),
    title: `Sleep ${direction} ${Math.abs(parseFloat(delta))}h vs 30d baseline`,
    evidence_summary: `Last 7 nights averaged ${recentAvg.toFixed(1)}h vs prior 23-day baseline of ${baselineAvg.toFixed(1)}h (z = ${zScore.toFixed(1)}).`,
    evidence_data: {
      recent_7d_avg: Number(recentAvg.toFixed(2)),
      baseline_23d_avg: Number(baselineAvg.toFixed(2)),
      z_score: Number(zScore.toFixed(2)),
      delta_hours: Number(delta),
    },
    severity,
    suggested_experiment: direction === 'down' ? {
      hypothesis: `If I move bedtime 30 min earlier for 14 days, my 7-day sleep avg returns to ~${baselineAvg.toFixed(1)}h.`,
      category: 'sleep',
      primary_metric: 'sleep_7d_avg',
      duration_days: 14,
      success_criteria: `Sleep 7-day avg ≥ ${(baselineAvg - 0.2).toFixed(1)}h`,
    } : undefined,
  }
}

function detectHrvDeviation(inp: DetectorInputs): Pattern | null {
  const h = inp.hrv_30d
  if (h.length < 14) return null
  const recent7 = h.slice(-7).map((r) => r.value)
  const baseline23 = h.slice(0, -7).map((r) => r.value)
  if (baseline23.length < 7) return null
  const recentAvg = avg(recent7)
  const baselineAvg = avg(baseline23)
  const sd = stddev(baseline23)
  if (sd < 1.5) return null
  const zScore = (recentAvg - baselineAvg) / sd
  if (Math.abs(zScore) < 1.5) return null
  const direction = zScore < 0 ? 'down' : 'up'
  const sevAbs = Math.abs(zScore)
  const severity: Pattern['severity'] = sevAbs >= 2.5 ? 'concerning' : sevAbs >= 2 ? 'notable' : 'info'
  return {
    pattern_type: 'hrv_deviation',
    window_key: isoWeekKey(),
    title: `HRV ${direction} ${Math.abs(recentAvg - baselineAvg).toFixed(0)}ms vs 30d baseline`,
    evidence_summary: `Last 7 days averaged ${Math.round(recentAvg)}ms vs prior 23-day baseline of ${Math.round(baselineAvg)}ms (z = ${zScore.toFixed(1)}).`,
    evidence_data: {
      recent_7d_avg: Math.round(recentAvg),
      baseline_23d_avg: Math.round(baselineAvg),
      z_score: Number(zScore.toFixed(2)),
    },
    severity,
  }
}

function detectWeightPace(inp: DetectorInputs): Pattern | null {
  const w = inp.weight_30d
  if (w.length < 14 || inp.weightLossTargetPerWeek == null || inp.primaryGoal !== 'cut') return null
  const sorted = [...w].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0].value
  const last = sorted[sorted.length - 1].value
  const days = (new Date(sorted[sorted.length - 1].date).getTime() - new Date(sorted[0].date).getTime()) / 86400000
  if (days < 14) return null
  const actualPerWeek = ((last - first) / days) * 7   // negative for cuts in the right direction
  const targetSign = -inp.weightLossTargetPerWeek    // cut means weight should DROP, so negative weekly change
  // If actualPerWeek is much less negative than targetSign, that's "stalled"
  const ratio = actualPerWeek / targetSign  // 1 = on pace; >1 faster (more loss); <0.4 stalled
  if (Math.abs(actualPerWeek) > Math.abs(targetSign) * 0.6) return null  // close enough; nothing to flag
  const severity: Pattern['severity'] = ratio < 0 ? 'concerning' : ratio < 0.3 ? 'notable' : 'info'
  return {
    pattern_type: 'weight_pace',
    window_key: isoWeekKey(),
    title: `Weight loss stalled — ${actualPerWeek > 0 ? '+' : ''}${actualPerWeek.toFixed(2)} lb/wk vs ${targetSign.toFixed(2)} target`,
    evidence_summary: `Over the last ${Math.round(days)} days you went from ${first.toFixed(1)} → ${last.toFixed(1)} lbs. Actual weekly pace ${actualPerWeek.toFixed(2)} vs target ${targetSign.toFixed(2)} lb/wk.`,
    evidence_data: {
      window_days: Math.round(days),
      first_lbs: Number(first.toFixed(1)),
      last_lbs: Number(last.toFixed(1)),
      actual_per_week: Number(actualPerWeek.toFixed(2)),
      target_per_week: Number(targetSign.toFixed(2)),
    },
    severity,
    suggested_experiment: {
      hypothesis: `If I cut daily calories by 150 for 21 days, my weekly weight pace returns to ~${targetSign.toFixed(2)} lb/wk.`,
      category: 'nutrition',
      primary_metric: 'weight_body_mass',
      duration_days: 21,
      success_criteria: `Weight drops at least ${(Math.abs(targetSign) * 3 * 0.7).toFixed(1)} lbs over 21 days`,
    },
  }
}

function detectAdherenceDrift(inp: DetectorInputs): Pattern | null {
  const a = inp.adherence_14d
  if (a.length < 7) return null
  const recent7 = a.slice(-7)
  const hitProteinCount = recent7.filter((r) => r.hit_protein === true).length
  const hitCalCount = recent7.filter((r) => r.hit_cal === true).length
  // Flag if hitting fewer than 4/7 days on protein OR cal
  if (hitProteinCount >= 4 && hitCalCount >= 4) return null
  const worst = hitProteinCount < hitCalCount ? 'protein' : 'cal'
  const worstCount = Math.min(hitProteinCount, hitCalCount)
  const severity: Pattern['severity'] = worstCount <= 1 ? 'concerning' : worstCount <= 3 ? 'notable' : 'info'
  return {
    pattern_type: 'adherence_drift',
    window_key: isoWeekKey(),
    title: `Hit ${worst} only ${worstCount}/7 days last week`,
    evidence_summary: `Past 7 days: protein hit ${hitProteinCount}/7, cal hit ${hitCalCount}/7. Adherence is the lever — without it, the plan is theoretical.`,
    evidence_data: {
      protein_hit_days: hitProteinCount,
      cal_hit_days: hitCalCount,
      window: 'last_7_days',
    },
    severity,
  }
}

function detectSatFatBreach(inp: DetectorInputs): Pattern | null {
  if (inp.satFatCeiling == null || inp.satFat_14d.length < 7) return null
  const last7 = inp.satFat_14d.slice(-7)
  const breaches = last7.filter((r) => r.value > inp.satFatCeiling!)
  if (breaches.length < 3) return null
  const avgOver = breaches.reduce((s, r) => s + (r.value - inp.satFatCeiling!), 0) / breaches.length
  const severity: Pattern['severity'] = breaches.length >= 5 ? 'concerning' : 'notable'
  return {
    pattern_type: 'sat_fat_breach',
    window_key: isoWeekKey(),
    title: `Sat fat over ceiling ${breaches.length}/7 days last week`,
    evidence_summary: `Daily sat fat exceeded the ${inp.satFatCeiling}g ceiling on ${breaches.length} of 7 days, averaging ${avgOver.toFixed(1)}g over.`,
    evidence_data: {
      breach_days: breaches.length,
      ceiling_g: inp.satFatCeiling,
      avg_over_g: Number(avgOver.toFixed(1)),
    },
    severity,
  }
}

function detectBpThreshold(inp: DetectorInputs): Pattern | null {
  const sys = inp.bp_systolic_recent
  if (sys.length < 3) return null
  const recent3 = sys.slice(-3).map((r) => r.value)
  const allHigh = recent3.every((v) => v >= 130)
  if (!allHigh) return null
  return {
    pattern_type: 'bp_threshold',
    window_key: todayIso(),
    title: `Systolic BP ≥ 130 in last 3 readings`,
    evidence_summary: `Last 3 systolic readings: ${recent3.join(', ')} mmHg. Sustained Stage 1+ hypertension territory.`,
    evidence_data: { last_3_systolic: recent3 },
    severity: recent3.every((v) => v >= 140) ? 'concerning' : 'notable',
  }
}

function detectWorkoutGap(inp: DetectorInputs): Pattern | null {
  // No workouts logged in last 7 days = workout gap
  const last7Ago = new Date()
  last7Ago.setDate(last7Ago.getDate() - 7)
  const recent = inp.workoutDates_14d.filter((d) => new Date(d) >= last7Ago)
  if (recent.length >= 2) return null  // 2+ workouts/week is OK to skip
  return {
    pattern_type: 'workout_gap',
    window_key: isoWeekKey(),
    title: recent.length === 0 ? 'No workouts in last 7 days' : `Only ${recent.length} workout in last 7 days`,
    evidence_summary: `Workouts logged last 7 days: ${recent.length}. During a cut, lifting is what protects lean mass — the deficit can cost muscle without it.`,
    evidence_data: { workouts_in_last_7d: recent.length },
    severity: recent.length === 0 ? 'concerning' : 'notable',
  }
}

function detectWaterChronicUnder(inp: DetectorInputs): Pattern | null {
  if (inp.water_14d.length < 7) return null
  const last7 = inp.water_14d.slice(-7)
  const underDays = last7.filter((r) => r.value < inp.waterTarget * 0.7).length
  if (underDays < 5) return null
  const avg7 = avg(last7.map((r) => r.value))
  return {
    pattern_type: 'water_chronic_under',
    window_key: isoWeekKey(),
    title: `Water under target ${underDays}/7 days last week`,
    evidence_summary: `Water averaged ${Math.round(avg7)}oz vs ${inp.waterTarget}oz target. ${underDays} of 7 days were under 70% of target.`,
    evidence_data: { avg_oz: Math.round(avg7), target_oz: inp.waterTarget, under_days: underDays },
    severity: 'info',
  }
}

const DETECTORS = [
  detectSleepDeviation,
  detectHrvDeviation,
  detectWeightPace,
  detectAdherenceDrift,
  detectSatFatBreach,
  detectBpThreshold,
  detectWorkoutGap,
  detectWaterChronicUnder,
]

// ── Per-user pipeline ───────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function patternsForUser(admin: any, userId: string): Promise<{ written: number; errors: string[] }> {
  const errors: string[] = []

  // Profile + targets
  const { data: profile } = await admin
    .from('personal_profile').select('primary_goal, weekly_loss_rate_lbs, computed_targets').eq('user_id', userId).maybeSingle()
  const profileRow = profile as { primary_goal?: string; weekly_loss_rate_lbs?: number; computed_targets?: { sat_fat_g_ceiling?: number; water_oz?: number } } | null

  // Pull metrics in parallel
  const since30 = daysAgoIso(30)
  const since14 = daysAgoIso(14)

  // deno-lint-ignore no-explicit-any
  async function metricsAsDailyMaxOrAvg(metric: string, sinceIso: string, agg: 'max' | 'avg'): Promise<{ date: string; value: number }[]> {
    const { data } = await admin
      .from('personal_metrics').select('value, recorded_at')
      .eq('metric_type', metric)
      .gte('recorded_at', sinceIso)
      .order('recorded_at', { ascending: true })
    const byDay = new Map<string, number[]>()
    for (const r of (data ?? []) as { value: number | string; recorded_at: string }[]) {
      const day = r.recorded_at.slice(0, 10)
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day)!.push(Number(r.value))
    }
    const out: { date: string; value: number }[] = []
    for (const [date, vals] of byDay) {
      const v = agg === 'max' ? Math.max(...vals) : (vals.reduce((s, x) => s + x, 0) / vals.length)
      out.push({ date, value: v })
    }
    return out.sort((a, b) => a.date.localeCompare(b.date))
  }

  async function metricsRaw(metric: string, sinceIso: string): Promise<{ recorded_at: string; value: number }[]> {
    const { data } = await admin
      .from('personal_metrics').select('value, recorded_at')
      .eq('metric_type', metric)
      .gte('recorded_at', sinceIso)
      .order('recorded_at', { ascending: true })
    return ((data ?? []) as { value: number | string; recorded_at: string }[]).map((r) => ({ recorded_at: r.recorded_at, value: Number(r.value) }))
  }

  // Adherence rows (from Phase 2 cron)
  const { data: adherenceData } = await admin
    .from('personal_daily_adherence')
    .select('adherence_date, cal_total, protein_g_total, sat_fat_g_total, water_oz_total, hit_cal, hit_protein')
    .eq('user_id', userId)
    .gte('adherence_date', since14.slice(0, 10))
    .order('adherence_date', { ascending: true })

  // deno-lint-ignore no-explicit-any
  const adherenceRows = ((adherenceData ?? []) as any[]).map((r) => ({
    date: r.adherence_date,
    cal_total: Number(r.cal_total ?? 0),
    protein_g_total: Number(r.protein_g_total ?? 0),
    hit_cal: r.hit_cal,
    hit_protein: r.hit_protein,
  }))

  // sat fat per day from adherence (better than the meal-log re-aggregation)
  const satFat14d: { date: string; value: number }[] = ((adherenceData ?? []) as { adherence_date: string; sat_fat_g_total: number | string }[])
    .map((r) => ({ date: r.adherence_date, value: Number(r.sat_fat_g_total) }))

  // Workouts
  const { data: workoutsData } = await admin
    .from('personal_workouts').select('started_at')
    .eq('user_id', userId)
    .gte('started_at', since14)
  const workoutDates = ((workoutsData ?? []) as { started_at: string }[]).map((r) => r.started_at.slice(0, 10))

  const [sleep30d, hrv30d, weight30d, water14d, bpSys, bpDia] = await Promise.all([
    metricsAsDailyMaxOrAvg('sleep_asleep', since30, 'max'),
    metricsAsDailyMaxOrAvg('heart_rate_variability', since30, 'avg'),
    metricsAsDailyMaxOrAvg('weight_body_mass', since30, 'avg'),
    metricsAsDailyMaxOrAvg('water_intake', since14, 'max'),  // sums fold into one row per day; max is fine for "did you drink"
    metricsRaw('blood_pressure_systolic', since14),
    metricsRaw('blood_pressure_diastolic', since14),
  ])

  // For water we want SUM per day, not max. Quick re-aggregate from raw.
  const waterRaw = await metricsRaw('water_intake', since14)
  const waterByDay = new Map<string, number>()
  for (const r of waterRaw) {
    const d = r.recorded_at.slice(0, 10)
    waterByDay.set(d, (waterByDay.get(d) ?? 0) + r.value)
  }
  const water14dSum: { date: string; value: number }[] = Array.from(waterByDay.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const inputs: DetectorInputs = {
    sleep_30d: sleep30d,
    hrv_30d: hrv30d,
    weight_30d: weight30d,
    water_14d: water14dSum,
    satFat_14d: satFat14d,
    satFatCeiling: profileRow?.computed_targets?.sat_fat_g_ceiling ?? null,
    bp_systolic_recent: bpSys,
    bp_diastolic_recent: bpDia,
    workoutDates_14d: workoutDates,
    weightLossTargetPerWeek: profileRow?.weekly_loss_rate_lbs ?? null,
    waterTarget: profileRow?.computed_targets?.water_oz ?? 96,
    primaryGoal: profileRow?.primary_goal ?? null,
    adherence_14d: adherenceRows,
  }

  let written = 0
  for (const detector of DETECTORS) {
    try {
      const pattern = detector(inputs)
      if (!pattern) continue
      const row = {
        user_id: userId,
        pattern_type: pattern.pattern_type,
        window_key: pattern.window_key,
        title: pattern.title,
        evidence_summary: pattern.evidence_summary,
        evidence_data: pattern.evidence_data,
        severity: pattern.severity,
        suggested_experiment: pattern.suggested_experiment ?? null,
      }
      const { error: e } = await admin
        .from('personal_patterns_detected')
        .upsert(row as never, { onConflict: 'user_id,pattern_type,window_key' })
      if (e) errors.push(`${pattern.pattern_type}: ${e.message}`)
      else written++
    } catch (err) {
      errors.push(`${detector.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { written, errors }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const cronSecret = req.headers.get('X-Cron-Secret') ?? req.headers.get('x-cron-secret') ?? ''
  const expected = Deno.env.get('MORNING_BRIEF_CRON_SECRET') ?? ''
  if (!expected || cronSecret !== expected) return json({ error: 'Invalid cron secret' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured' }, 500)
  const admin = createClient(supabaseUrl, serviceRoleKey)

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { body = {} }

  let userIds: string[]
  if (body.user_id) {
    userIds = [body.user_id]
  } else {
    const { data: admins } = await admin.from('users').select('id').eq('role', 'admin')
    const adminIds = ((admins ?? []) as { id: string }[]).map((u) => u.id)
    const { data: profiles } = await admin.from('personal_profile').select('user_id').in('user_id', adminIds)
    userIds = ((profiles ?? []) as { user_id: string }[]).map((p) => p.user_id)
  }

  const results: { user_id: string; written: number; errors: string[] }[] = []
  for (const userId of userIds) {
    try {
      const r = await patternsForUser(admin, userId)
      results.push({ user_id: userId, ...r })
    } catch (err) {
      results.push({ user_id: userId, written: 0, errors: [err instanceof Error ? err.message : String(err)] })
    }
  }

  const totalWritten = results.reduce((s, r) => s + r.written, 0)
  const allErrors = results.flatMap((r) => r.errors)
  return json({
    ok: allErrors.length === 0,
    users_scanned: results.length,
    patterns_detected: totalWritten,
    errors: allErrors.length > 0 ? allErrors : undefined,
  })
})
