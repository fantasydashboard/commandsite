// Josh Personal · end-of-day-adherence Edge Function (Phase 2 cadence)
// ---------------------------------------------------------------------------
// Cron-fired at ~03:00 UTC (≈10pm ET previous day). For each admin
// user with a profile, summarizes the day's intake + activity into
// personal_daily_adherence. The next morning's brief reads that row
// as "yesterday actuals" and Sage can talk continuity ("you hit
// protein but missed water — let's tighten that today").
//
// This function does NOT itself talk to Anthropic. It's a pure data
// rollup. Cheap and idempotent: re-running it on the same day upserts.
//
// Auth:    X-Cron-Secret header (CRON only — no user-triggered path)
// Body:    {}  optional { adherence_date: 'YYYY-MM-DD' } to backfill
// Returns: { ok, days_written, errors }
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MORNING_BRIEF_CRON_SECRET
//
// MUST DEPLOY WITH --no-verify-jwt. pg_cron sends X-Cron-Secret only.

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

// "Yesterday" in ET — the cron fires at 03:00 UTC which is the
// previous day in ET. We summarize the day that JUST ENDED for the user.
function yesterdayLocalIso(now = new Date()): string {
  // Use ET-ish offset: subtract 4-5 hrs depending on DST. Simpler:
  // start from UTC-now, subtract 4 hrs (works for both DST and standard
  // because the cron runs at 03:00 UTC — anywhere from 22:00 to 23:00 ET
  // the previous day. After subtracting 4 hours we land safely in
  // "yesterday" ET regardless of DST.)
  const et = new Date(now.getTime() - 4 * 60 * 60 * 1000)
  return et.toISOString().slice(0, 10)
}

function startOfDayIso(dateIso: string): string {
  // Use ET-bounded day window (UTC-4) so a meal logged at 11pm ET on
  // 2026-05-15 lands in the right adherence row.
  return `${dateIso}T04:00:00Z`
}
function endOfDayIso(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00Z')
  d.setDate(d.getDate() + 1)
  return `${d.toISOString().slice(0, 10)}T04:00:00Z`
}

interface ComputedTargets {
  daily_cal_target?: number
  protein_g?: number
  sat_fat_g_ceiling?: number
  water_oz?: number
}

// deno-lint-ignore no-explicit-any
async function rollupForUser(admin: any, userId: string, dateIso: string): Promise<{ ok: boolean; error?: string }> {
  const startIso = startOfDayIso(dateIso)
  const endIso = endOfDayIso(dateIso)

  // Profile + targets for adherence flags
  const { data: profile } = await admin
    .from('personal_profile').select('computed_targets').eq('user_id', userId).maybeSingle()
  const targets = ((profile as { computed_targets?: ComputedTargets } | null)?.computed_targets) ?? {}

  // Meals
  const { data: meals } = await admin
    .from('personal_meal_log')
    .select('estimated_cal, estimated_protein_g, estimated_fat_g, estimated_sat_fat_g, estimated_carbs_g')
    .eq('user_id', userId)
    .gte('logged_at', startIso)
    .lt('logged_at', endIso)
  const mealRows = (meals ?? []) as Array<{
    estimated_cal: number | null
    estimated_protein_g: number | null
    estimated_fat_g: number | null
    estimated_sat_fat_g: number | null
    estimated_carbs_g: number | null
  }>
  const mealsLogged = mealRows.length
  const cal = mealRows.reduce((s, r) => s + (r.estimated_cal ?? 0), 0)
  const protein = mealRows.reduce((s, r) => s + (r.estimated_protein_g ?? 0), 0)
  const fat = mealRows.reduce((s, r) => s + (r.estimated_fat_g ?? 0), 0)
  const satFat = mealRows.reduce((s, r) => s + (r.estimated_sat_fat_g ?? 0), 0)
  const carbs = mealRows.reduce((s, r) => s + (r.estimated_carbs_g ?? 0), 0)

  // Metrics: water, steps, sleep, hrv
  async function metricSum(metric: string): Promise<number> {
    const { data } = await admin
      .from('personal_metrics').select('value')
      .eq('metric_type', metric)
      .gte('recorded_at', startIso).lt('recorded_at', endIso)
    return ((data ?? []) as { value: number | string }[]).reduce((s, r) => s + Number(r.value), 0)
  }
  async function metricLatest(metric: string): Promise<number | null> {
    const { data } = await admin
      .from('personal_metrics').select('value')
      .eq('metric_type', metric)
      .gte('recorded_at', startIso).lt('recorded_at', endIso)
      .order('recorded_at', { ascending: false }).limit(1).maybeSingle()
    return data ? Number((data as { value: number | string }).value) : null
  }
  async function metricAvg(metric: string): Promise<number | null> {
    const { data } = await admin
      .from('personal_metrics').select('value')
      .eq('metric_type', metric)
      .gte('recorded_at', startIso).lt('recorded_at', endIso)
    const vals = ((data ?? []) as { value: number | string }[]).map((r) => Number(r.value))
    if (vals.length === 0) return null
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }

  const [waterOz, stepsTotal, sleepLast, hrvAvgRaw] = await Promise.all([
    metricSum('water_intake'),
    metricSum('step_count'),
    metricLatest('sleep_asleep'),
    metricAvg('heart_rate_variability'),
  ])
  const hrvAvg = hrvAvgRaw != null ? Math.round(hrvAvgRaw) : null

  // Workouts
  const { data: workouts } = await admin
    .from('personal_workouts').select('id')
    .eq('user_id', userId)
    .gte('started_at', startIso).lt('started_at', endIso)
  const workoutCount = (workouts ?? []).length

  // Adherence flags
  const calTarget = targets.daily_cal_target ?? null
  const proteinTarget = targets.protein_g ?? null
  const satFatCeiling = targets.sat_fat_g_ceiling ?? null
  const waterTarget = targets.water_oz ?? 96

  const hitCal = calTarget ? (cal >= calTarget * 0.9 && cal <= calTarget * 1.1) : null
  const hitProtein = proteinTarget ? protein >= proteinTarget * 0.9 : null
  const underSatFat = satFatCeiling ? satFat <= satFatCeiling : null
  const hitWater = Math.abs(waterOz - waterTarget) <= 10
  const hitSteps = stepsTotal >= 10000
  const workoutDone = workoutCount > 0

  const row = {
    user_id: userId,
    adherence_date: dateIso,
    meals_logged: mealsLogged,
    cal_total: cal,
    protein_g_total: protein,
    fat_g_total: fat,
    sat_fat_g_total: satFat,
    carbs_g_total: carbs,
    water_oz_total: waterOz,
    steps_total: stepsTotal,
    workout_count: workoutCount,
    sleep_hours: sleepLast,
    hrv_avg_ms: hrvAvg,
    hit_cal: hitCal,
    hit_protein: hitProtein,
    under_sat_fat: underSatFat,
    hit_water: hitWater,
    hit_steps: hitSteps,
    workout_done: workoutDone,
    summary: null,
    source: 'cron' as const,
  }

  const { error: e } = await admin
    .from('personal_daily_adherence')
    .upsert(row as never, { onConflict: 'user_id,adherence_date' })
  if (e) return { ok: false, error: e.message }
  return { ok: true }
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

  // Optional override (for backfill)
  let body: { adherence_date?: string } = {}
  try { body = await req.json() } catch { body = {} }
  const dateIso = body.adherence_date ?? yesterdayLocalIso()

  // Iterate admin users with personal_profile
  const { data: admins } = await admin.from('users').select('id').eq('role', 'admin')
  const adminIds = ((admins ?? []) as { id: string }[]).map((u) => u.id)
  const { data: profiles } = await admin
    .from('personal_profile').select('user_id').in('user_id', adminIds)
  const userIds = ((profiles ?? []) as { user_id: string }[]).map((p) => p.user_id)

  const results: { user_id: string; ok: boolean; error?: string }[] = []
  for (const userId of userIds) {
    try {
      const r = await rollupForUser(admin, userId, dateIso)
      results.push({ user_id: userId, ...r })
    } catch (err) {
      results.push({ user_id: userId, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const errors = results.filter((r) => !r.ok)
  return json({
    ok: errors.length === 0,
    adherence_date: dateIso,
    days_written: results.length - errors.length,
    errors: errors.length > 0 ? errors : undefined,
  })
})
