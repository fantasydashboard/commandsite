// Josh Personal · generate-morning-brief Edge Function
// ---------------------------------------------------------------------------
// Sage's daily AI-coach brief. Reads everything she has on Josh —
// profile, calculated targets, latest bloodwork + active concerns,
// 7-day metrics window from Apple Health, today's planned workout +
// meals, active goals — and writes a 4-section action-oriented brief
// for the day. Saved to personal_morning_briefs (one row per day per
// user, regenerations upsert).
//
// Why Sonnet 4.6 + tool use: the brief format is structured (4
// sections + headline) but the CONTENT requires actual reasoning
// across multiple data axes (e.g. "your HRV dropped after late
// dinners" requires correlating sleep + last-meal time). Sonnet 4.6
// handles that. Tool use forces the structured output so the UI
// can render reliably.
//
// Auth:    Authorization: Bearer <admin user JWT>     (manual trigger)
//      OR  X-Cron-Secret: <MORNING_BRIEF_CRON_SECRET> (later, when
//          we wire Vercel Cron — generates for ALL admin users)
// Body:    {} (empty for now; future: { force_regenerate?: bool })
// Returns: { brief: { ...row }, generated: 'manual' | 'cron' }
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          MORNING_BRIEF_CRON_SECRET (optional, for cron trigger)

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

const MODEL = 'claude-sonnet-4-6'

// ── System prompt — Sage's persona + format requirements ────────────

const SYSTEM_PROMPT = `You are Sage, Josh's personal AI health coach. You're writing his morning brief — the first thing he sees when he opens his dashboard.

Your job: anchor him for the day with what the data is actually saying. Not generic wellness advice. Not corporate-speak. Direct, evidence-based, calling out specific numbers from his real data.

# FORMAT — call save_morning_brief with these four sections

1. **headline** — ONE line summarizing today's overall picture. ~10-15 words. Examples: "Push day, HRV recovered — push the bench 5 lbs." / "Rest day. Sleep was short — protein priority + early bed." / "Cardio day. Sat fat is at limit — choose the salad lunch."

2. **todays_focus** (~40-70 words) — What to actually DO today. Reference today's planned workout + key meal. Tie it to current data (HRV state, sleep last night, weight trend). Be specific — name the workout, the protein target, the calorie target. NOT vague encouragement.

3. **watch_out_for** (~40-70 words) — The guardrails Sage is enforcing today and WHY they exist. Reference the bloodwork concern that drives each one. Specific numbers. If there are no concerns, use this section to flag a tracking metric trending wrong (e.g. weight stalled, sleep dropping).

4. **patterns_noticed** (~40-70 words) — One concrete correlation or anomaly from the recent data. Look at the metrics carefully. Examples: "HRV dropped 3 mornings after dinners after 8pm" / "Steps lowest on Wednesdays — weekly meeting day?" / "Weight loss accelerated when protein hit 180g target." If you genuinely don't see a pattern, say so honestly: "Three weeks of clean data — nothing notable to flag."

5. **goal_check** (~40-70 words) — Quick on-track / off-track read on each active goal. Reference current status with numbers. If a goal is off-track, say what's needed to get back. Don't sugarcoat.

# VOICE

- Conversational but informed. You know his data; sound like it.
- Specific numbers > general descriptions ("HRV 58, recovered from 52 last week" not "HRV is good")
- Short sentences. Active voice. No buzzwords.
- Don't say "great work!" or "keep it up" or any cheerleading. He doesn't need that.
- It's OK to flag concerns directly: "LDL is moving the wrong way" beats "your lipid panel could be optimized"
- First person ("I'm tightening sat fat to 14g today" / "I noticed the HRV pattern")
- No em dashes inside sentences (use commas/periods). No emojis. No bold.

# WHAT YOU CAN INFER

- "Push day" / "Pull day" / "Rest day" — pulled from today's planned workout
- "Sat fat ceiling" — from the user's calculated targets (driven by current LDL)
- HRV state — compare today's value to 7-day avg
- Workout days hit — count from last 7 days
- Weight trend — compare current to 7d ago and 30d ago
- Sleep debt — sum of (target - actual) over last 7 days

# CONTINUITY — use yesterday's actuals and active experiments

If the user message has a YESTERDAY ACTUALS section, treat it as the bridge from yesterday to today. Lead todays_focus with one sentence that picks up the thread: "You hit protein but missed water — let's fix the water first today." If yesterday went well, say so concretely ("under sat fat all day, +5 lbs on bench") rather than skipping it. This is what makes the brief feel like a real coach instead of a static template.

If the user message has an ACTIVE EXPERIMENTS section, those are mid-flight. Mention any "READY FOR VERDICT" experiment in todays_focus — call out by title and offer to review it. Mention experiments still in progress in goal_check or patterns_noticed when they're the most relevant signal. Never restart an experiment without reading verdict status; respect the ones already in motion.

# GUARDRAILS

- Don't invent data. If a number isn't in the context, don't reference it.
- Don't make medical diagnoses. You can flag an out-of-range marker, but don't say "you have hypothyroidism."
- Don't override a user-set goal. You can say it's off-track and suggest a tighter approach, but the goal is theirs.`

// ── Build user-message context block ────────────────────────────────

interface BriefContext {
  date_label: string                  // "Saturday, May 9, 2026"
  day_of_week: string
  profile: Record<string, unknown> | null
  targets: Record<string, unknown> | null
  bloodwork_latest: {
    drawn_at: string
    drawn_by: string | null
    notes: string | null
    markers: Record<string, number>
  } | null
  active_concerns: { label: string; value: string; range: string; severity: string }[]
  metrics_7d: {
    sleep_last_night_hours: number | null
    sleep_7d_avg_hours: number | null
    hrv_today_ms: number | null
    hrv_7d_avg_ms: number | null
    weight_current_lbs: number | null
    weight_7d_ago_lbs: number | null
    weight_30d_ago_lbs: number | null
    steps_today: number
    steps_7d_avg: number | null
    workout_days_last_7: number
  }
  todays_plan: {
    workout: string | null
    workout_detail: string | null
    meals_summary: string | null
    total_cal: number | null
    total_protein: number | null
  } | null
  goals: { label: string; status: string; detail: string }[]
  // Yesterday's rollup from personal_daily_adherence (continuity).
  yesterday_adherence: {
    date: string
    meals_logged: number
    cal: number
    protein_g: number
    sat_fat_g: number
    water_oz: number
    steps: number
    workout_done: boolean
    sleep_hours: number | null
    flags: { hit_cal: boolean | null; hit_protein: boolean | null; under_sat_fat: boolean | null; hit_water: boolean | null; hit_steps: boolean | null }
  } | null
  // Active experiments — flag any ready for verdict (end_date passed).
  active_experiments: {
    id: string
    title: string
    hypothesis: string
    primary_metric: string
    baseline_value: number | null
    success_criteria: string
    end_date: string
    days_remaining: number
    ready_for_verdict: boolean
  }[]
}

function buildUserMessage(ctx: BriefContext): string {
  const lines: string[] = []
  lines.push(`# TODAY`)
  lines.push(`Date: ${ctx.date_label}`)
  lines.push(`Day of week: ${ctx.day_of_week}`)
  lines.push('')

  if (ctx.profile) {
    lines.push(`# JOSH'S PROFILE`)
    const p = ctx.profile as Record<string, unknown>
    lines.push(`- Goal: ${p.primary_goal} (target ${p.target_weight_lbs ?? '—'} lbs by ${p.target_deadline ?? '—'})`)
    lines.push(`- Activity level: ${p.activity_level}, ${p.workouts_per_week_target} workouts/wk target`)
    lines.push(`- Preferred split: ${p.preferred_split ?? '—'}, train at ${p.preferred_workout_time ?? '—'}`)
    if (Array.isArray(p.injuries) && (p.injuries as unknown[]).length > 0) {
      lines.push(`- Injuries: ${(p.injuries as { body_part: string; note: string }[]).map((i) => `${i.body_part} (${i.note})`).join('; ')}`)
    }
    if (Array.isArray(p.foods_disliked) && (p.foods_disliked as unknown[]).length > 0) {
      lines.push(`- Foods to avoid: ${(p.foods_disliked as string[]).join(', ')}`)
    }
    lines.push('')
  }

  if (ctx.targets) {
    const t = ctx.targets as Record<string, unknown>
    lines.push(`# CALCULATED TARGETS`)
    lines.push(`- Daily cal: ${t.daily_cal_target} (${t.deficit_or_surplus_kcal} vs maintenance)`)
    lines.push(`- Protein: ${t.protein_g}g (${t.protein_per_lb}g/lb)`)
    lines.push(`- Fat: ${t.fat_g_target}g target, ${t.fat_g_min}g floor`)
    lines.push(`- Saturated fat ceiling: ≤${t.sat_fat_g_ceiling}g/day`)
    lines.push(`- Carbs: ${t.carbs_g}g (remainder)`)
    if (t.computed_from && (t.computed_from as { bloodwork_adjustments: string[] }).bloodwork_adjustments?.length > 0) {
      lines.push(`- Bloodwork-driven adjustments: ${(t.computed_from as { bloodwork_adjustments: string[] }).bloodwork_adjustments.join('; ')}`)
    }
    lines.push('')
  }

  if (ctx.bloodwork_latest) {
    lines.push(`# LATEST BLOODWORK · drawn ${ctx.bloodwork_latest.drawn_at}`)
    for (const [k, v] of Object.entries(ctx.bloodwork_latest.markers)) {
      lines.push(`- ${k}: ${v}`)
    }
    lines.push('')
  }

  if (ctx.active_concerns.length > 0) {
    lines.push(`# ACTIVE CONCERNS (from latest panel)`)
    for (const c of ctx.active_concerns) {
      lines.push(`- ${c.label}: ${c.value} (target ${c.range}) — severity ${c.severity}`)
    }
    lines.push('')
  }

  lines.push(`# METRICS · last 7 days`)
  const m = ctx.metrics_7d
  if (m.sleep_last_night_hours != null) lines.push(`- Sleep last night: ${m.sleep_last_night_hours.toFixed(1)}h (7d avg ${m.sleep_7d_avg_hours?.toFixed(1) ?? '—'})`)
  if (m.hrv_today_ms != null) lines.push(`- HRV today: ${m.hrv_today_ms} ms (7d avg ${m.hrv_7d_avg_ms ?? '—'})`)
  if (m.weight_current_lbs != null) {
    let weightLine = `- Weight: ${m.weight_current_lbs} lbs`
    if (m.weight_7d_ago_lbs != null) weightLine += ` (7d ago: ${m.weight_7d_ago_lbs}, change ${(m.weight_current_lbs - m.weight_7d_ago_lbs).toFixed(1)})`
    if (m.weight_30d_ago_lbs != null) weightLine += `, 30d change ${(m.weight_current_lbs - m.weight_30d_ago_lbs).toFixed(1)}`
    lines.push(weightLine)
  }
  lines.push(`- Steps today so far: ${m.steps_today.toLocaleString()}, 7d avg ${m.steps_7d_avg?.toLocaleString() ?? '—'}`)
  lines.push(`- Workouts in last 7 days: ${m.workout_days_last_7}`)
  lines.push('')

  if (ctx.todays_plan) {
    lines.push(`# TODAY'S PLAN`)
    lines.push(`- Workout: ${ctx.todays_plan.workout ?? 'rest day'}${ctx.todays_plan.workout_detail ? ` (${ctx.todays_plan.workout_detail})` : ''}`)
    if (ctx.todays_plan.meals_summary) lines.push(`- Meals: ${ctx.todays_plan.meals_summary}`)
    if (ctx.todays_plan.total_cal) lines.push(`- Total: ${ctx.todays_plan.total_cal} cal · ${ctx.todays_plan.total_protein}g protein`)
    lines.push('')
  }

  if (ctx.goals.length > 0) {
    lines.push(`# ACTIVE GOALS`)
    for (const g of ctx.goals) {
      lines.push(`- ${g.label} — ${g.status} — ${g.detail}`)
    }
    lines.push('')
  }

  if (ctx.yesterday_adherence) {
    const y = ctx.yesterday_adherence
    lines.push(`# YESTERDAY ACTUALS (${y.date}) — use for continuity in todays_focus and goal_check`)
    lines.push(`- Meals logged: ${y.meals_logged}`)
    lines.push(`- Cal: ${Math.round(y.cal)}${y.flags.hit_cal === true ? ' ✓' : y.flags.hit_cal === false ? ' (off-target)' : ''}`)
    lines.push(`- Protein: ${Math.round(y.protein_g)}g${y.flags.hit_protein === true ? ' ✓' : y.flags.hit_protein === false ? ' (under)' : ''}`)
    lines.push(`- Sat fat: ${y.sat_fat_g.toFixed(1)}g${y.flags.under_sat_fat === false ? ' (OVER ceiling)' : ''}`)
    lines.push(`- Water: ${Math.round(y.water_oz)}oz${y.flags.hit_water ? ' ✓' : ''}`)
    lines.push(`- Steps: ${Math.round(y.steps).toLocaleString()}${y.flags.hit_steps ? ' ✓' : ''}`)
    lines.push(`- Workout done: ${y.workout_done ? 'yes' : 'NO'}`)
    if (y.sleep_hours != null) lines.push(`- Sleep: ${y.sleep_hours.toFixed(1)}h`)
    lines.push('')
  }

  if (ctx.active_experiments.length > 0) {
    lines.push(`# ACTIVE EXPERIMENTS`)
    for (const e of ctx.active_experiments) {
      const status = e.ready_for_verdict ? `READY FOR VERDICT (ended ${Math.abs(e.days_remaining)}d ago)` : `${e.days_remaining}d remaining`
      lines.push(`- ${e.title} (${status})`)
      lines.push(`  hypothesis: ${e.hypothesis}`)
      lines.push(`  watching: ${e.primary_metric}${e.baseline_value != null ? ` (baseline ${e.baseline_value})` : ''} · goal: ${e.success_criteria}`)
    }
    const verdictReady = ctx.active_experiments.filter((e) => e.ready_for_verdict)
    if (verdictReady.length > 0) {
      lines.push('')
      lines.push(`⚠️ ${verdictReady.length} experiment${verdictReady.length === 1 ? ' is' : 's are'} ready for a verdict review. Surface this in todays_focus and offer to review them.`)
    }
    lines.push('')
  }

  lines.push(`Now write today's brief. Call save_morning_brief.`)
  return lines.join('\n')
}

// ── Tool schema ─────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'save_morning_brief',
    description: "Save today's brief in 4 sections + headline.",
    input_schema: {
      type: 'object',
      properties: {
        headline:          { type: 'string', description: 'ONE-line summary of the day. ~10-15 words.' },
        todays_focus:      { type: 'string', description: 'What to actually do today, with specific numbers. ~40-70 words.' },
        watch_out_for:     { type: 'string', description: 'Guardrails Sage is enforcing + why. ~40-70 words.' },
        patterns_noticed:  { type: 'string', description: 'One concrete correlation/anomaly from recent data. Or honest "nothing notable yet". ~40-70 words.' },
        goal_check:        { type: 'string', description: 'On-track / off-track read across active goals with numbers. ~40-70 words.' },
      },
      required: ['headline', 'todays_focus', 'watch_out_for', 'patterns_noticed', 'goal_check'],
    },
  },
]

// ── Data assembly: pull everything Sage needs ─────────────────────────

// deno-lint-ignore no-explicit-any
async function assembleContext(admin: any, userId: string): Promise<BriefContext> {
  const today = new Date()
  const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' })
  const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // Profile
  const { data: profile } = await admin
    .from('personal_profile').select('*').eq('user_id', userId).maybeSingle()
  const targets = (profile as { computed_targets: unknown } | null)?.computed_targets ?? null

  // Latest bloodwork
  const { data: bloodwork } = await admin
    .from('personal_bloodwork_panels')
    .select('drawn_at, drawn_by, notes, markers')
    .eq('user_id', userId)
    .order('drawn_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Active concerns from bloodwork — derive in JS using same thresholds
  // as the front-end MARKERS registry (kept aligned by hand for now).
  const concerns: BriefContext['active_concerns'] = []
  if (bloodwork) {
    const m = (bloodwork as { markers: Record<string, number> }).markers
    const checks: { key: string; label: string; max?: number; min?: number; range: string }[] = [
      { key: 'ldl_mg_dl',           label: 'LDL high',          max: 130, range: '<130' },
      { key: 'a1c_pct',             label: 'A1C elevated',      max: 5.7, range: '<5.7' },
      { key: 'triglycerides_mg_dl', label: 'Triglycerides high', max: 150, range: '<150' },
      { key: 'vit_d_ng_ml',         label: 'Vitamin D low',     min: 30,  range: '>30' },
      { key: 'tsh_miu_l',           label: 'TSH low',           min: 0.4, range: '0.4-4.5' },
      { key: 'tsh_miu_l',           label: 'TSH high',          max: 4.5, range: '0.4-4.5' },
      { key: 'crp_mg_l',            label: 'CRP elevated',      max: 3.0, range: '<3.0' },
    ]
    for (const c of checks) {
      const v = m[c.key]
      if (typeof v !== 'number') continue
      if (c.max != null && v > c.max) {
        concerns.push({ label: c.label, value: `${v} ${c.key.includes('pct') ? '%' : ''}`.trim(), range: c.range, severity: v > c.max * 1.2 ? 'high' : 'borderline' })
      }
      if (c.min != null && v < c.min) {
        concerns.push({ label: c.label, value: `${v}`, range: c.range, severity: v < c.min * 0.8 ? 'high' : 'borderline' })
      }
    }
  }

  // Metrics — 7-day window
  function daysAgoIso(n: number): string {
    const d = new Date()
    d.setDate(d.getDate() - n)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  function todayMidnightIso(): string {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }

  // Pull all needed metric series in parallel
  async function fetchSeries(metricType: string, sinceIso: string) {
    const { data } = await admin
      .from('personal_metrics')
      .select('value, recorded_at')
      .eq('metric_type', metricType)
      .gte('recorded_at', sinceIso)
      .order('recorded_at', { ascending: false })
    return ((data ?? []) as { value: number | string; recorded_at: string }[]).map((r) => ({
      value: Number(r.value),
      recorded_at: r.recorded_at,
    }))
  }

  const since7 = daysAgoIso(7)
  const since30 = daysAgoIso(30)
  const sinceToday = todayMidnightIso()

  const [steps7d, sleep7d, hrv7d, hrvToday, weight30d, stepsToday] = await Promise.all([
    fetchSeries('step_count', since7),
    fetchSeries('sleep_asleep', since7),
    fetchSeries('heart_rate_variability', since7),
    fetchSeries('heart_rate_variability', sinceToday),
    fetchSeries('weight_body_mass', since30),
    fetchSeries('step_count', sinceToday),
  ])

  // Daily aggregations
  function dailySum(rows: { value: number; recorded_at: string }[]): Map<string, number> {
    const m = new Map<string, number>()
    for (const r of rows) {
      const day = r.recorded_at.slice(0, 10)
      m.set(day, (m.get(day) ?? 0) + r.value)
    }
    return m
  }
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
    for (const [d, s] of sums) out.set(d, s.sum / s.count)
    return out
  }

  const stepsByDay = dailySum(steps7d)
  const stepsAvg7d = stepsByDay.size > 0
    ? Math.round(Array.from(stepsByDay.values()).reduce((s, v) => s + v, 0) / stepsByDay.size)
    : null

  const sleepByDay = dailyAvg(sleep7d) // sleep_asleep is one row per session — avg=value
  const sleepAvg7d = sleepByDay.size > 0
    ? Number((Array.from(sleepByDay.values()).reduce((s, v) => s + v, 0) / sleepByDay.size).toFixed(1))
    : null
  const sleepLast = sleep7d.length > 0 ? Number(sleep7d[0].value.toFixed(1)) : null

  const hrvByDay = dailyAvg(hrv7d)
  const hrvAvg7d = hrvByDay.size > 0
    ? Math.round(Array.from(hrvByDay.values()).reduce((s, v) => s + v, 0) / hrvByDay.size)
    : null
  const hrvTodayAvg = hrvToday.length > 0
    ? Math.round(hrvToday.reduce((s, r) => s + r.value, 0) / hrvToday.length)
    : null

  // Weight: latest, 7d ago, 30d ago (closest non-null)
  const weightSorted = weight30d.slice().sort((a, b) =>
    new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  )
  const weightLatest = weightSorted[0]?.value ?? null
  function closestWeight(daysBack: number): number | null {
    const target = new Date()
    target.setDate(target.getDate() - daysBack)
    let best: typeof weightSorted[0] | null = null
    let bestDiff = Infinity
    for (const w of weightSorted) {
      const diff = Math.abs(new Date(w.recorded_at).getTime() - target.getTime())
      if (diff < bestDiff) { bestDiff = diff; best = w }
    }
    return best ? Number(best.value.toFixed(1)) : null
  }
  const weight7dAgo = closestWeight(7)
  const weight30dAgo = closestWeight(30)

  // Workouts: count days in last 7 with >= 20 min exercise time
  const exerciseTime = await fetchSeries('apple_exercise_time', since7)
  const exerciseByDay = dailySum(exerciseTime)
  let workoutDays = 0
  for (const v of exerciseByDay.values()) if (v >= 20) workoutDays++

  // Today's plan slice — pulled from the mock for now since the
  // weekly-plan generator (Phase 5 / Path B) hasn't shipped. When it
  // does, this becomes a DB read.
  const todaysPlan: BriefContext['todays_plan'] = {
    workout: dayOfWeek === 'Saturday' ? 'Cardio (zone 2)' :
             dayOfWeek === 'Sunday' ? null :
             dayOfWeek === 'Monday' ? 'Push' :
             dayOfWeek === 'Tuesday' ? 'Pull' :
             dayOfWeek === 'Wednesday' ? 'Legs' :
             dayOfWeek === 'Thursday' ? null :
             dayOfWeek === 'Friday' ? 'Full body' : null,
    workout_detail: dayOfWeek === 'Saturday' ? '45 min easy zone 2 (HR 125-145), bike or walk' : null,
    meals_summary: 'Breakfast oats+berries · Lunch Chipotle bowl · Dinner olive-oil salmon · snacks Greek yogurt',
    total_cal: 2200,
    total_protein: 180,
  }

  // Goals — for now, derive simple status from profile target
  const goals: BriefContext['goals'] = []
  if (profile && (profile as { target_weight_lbs?: number; target_deadline?: string }).target_weight_lbs) {
    const p = profile as { target_weight_lbs: number; target_deadline: string | null; primary_goal: string }
    if (weightLatest != null) {
      const onTrack = p.primary_goal === 'cut'
        ? weightLatest > p.target_weight_lbs && (weight30dAgo == null || weightLatest < weight30dAgo)
        : true
      goals.push({
        label: `${p.primary_goal === 'cut' ? 'Cut to' : 'Reach'} ${p.target_weight_lbs} lbs${p.target_deadline ? ` by ${p.target_deadline}` : ''}`,
        status: onTrack ? 'on track' : 'off track',
        detail: weight30dAgo != null
          ? `currently ${weightLatest} lbs · ${(weightLatest - weight30dAgo).toFixed(1)} lbs over 30d · ${(weightLatest - p.target_weight_lbs).toFixed(1)} lbs to go`
          : `currently ${weightLatest} lbs · ${(weightLatest - p.target_weight_lbs).toFixed(1)} lbs to go`,
      })
    }
  }

  // Yesterday's adherence (continuity layer)
  const yest = new Date(today)
  yest.setDate(yest.getDate() - 1)
  const yestIso = yest.toISOString().slice(0, 10)
  const { data: yRow } = await admin
    .from('personal_daily_adherence')
    .select('adherence_date, meals_logged, cal_total, protein_g_total, sat_fat_g_total, water_oz_total, steps_total, workout_count, sleep_hours, hit_cal, hit_protein, under_sat_fat, hit_water, hit_steps')
    .eq('user_id', userId)
    .eq('adherence_date', yestIso)
    .maybeSingle()
  // deno-lint-ignore no-explicit-any
  const yAny = yRow as any
  const yesterdayAdherence: BriefContext['yesterday_adherence'] = yAny ? {
    date: yAny.adherence_date,
    meals_logged: yAny.meals_logged ?? 0,
    cal: Number(yAny.cal_total ?? 0),
    protein_g: Number(yAny.protein_g_total ?? 0),
    sat_fat_g: Number(yAny.sat_fat_g_total ?? 0),
    water_oz: Number(yAny.water_oz_total ?? 0),
    steps: Number(yAny.steps_total ?? 0),
    workout_done: (yAny.workout_count ?? 0) > 0,
    sleep_hours: yAny.sleep_hours != null ? Number(yAny.sleep_hours) : null,
    flags: {
      hit_cal: yAny.hit_cal,
      hit_protein: yAny.hit_protein,
      under_sat_fat: yAny.under_sat_fat,
      hit_water: yAny.hit_water,
      hit_steps: yAny.hit_steps,
    },
  } : null

  // Active experiments — flag any past end_date as ready for verdict.
  const todayIso = today.toISOString().slice(0, 10)
  const { data: expRows } = await admin
    .from('personal_experiments')
    .select('id, title, hypothesis, primary_metric, baseline_value, success_criteria, end_date')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('end_date', { ascending: true })
  // deno-lint-ignore no-explicit-any
  const activeExperiments: BriefContext['active_experiments'] = ((expRows ?? []) as any[]).map((e) => {
    const endMs = new Date(e.end_date + 'T00:00:00').getTime()
    const todayMs = new Date(todayIso + 'T00:00:00').getTime()
    const daysRemaining = Math.ceil((endMs - todayMs) / (24 * 60 * 60 * 1000))
    return {
      id: e.id,
      title: e.title,
      hypothesis: e.hypothesis,
      primary_metric: e.primary_metric,
      baseline_value: e.baseline_value != null ? Number(e.baseline_value) : null,
      success_criteria: e.success_criteria,
      end_date: e.end_date,
      days_remaining: daysRemaining,
      ready_for_verdict: daysRemaining <= 0,
    }
  })

  return {
    date_label: dateLabel,
    day_of_week: dayOfWeek,
    profile,
    targets,
    bloodwork_latest: bloodwork as BriefContext['bloodwork_latest'],
    active_concerns: concerns,
    metrics_7d: {
      sleep_last_night_hours: sleepLast,
      sleep_7d_avg_hours: sleepAvg7d,
      hrv_today_ms: hrvTodayAvg,
      hrv_7d_avg_ms: hrvAvg7d,
      weight_current_lbs: weightLatest != null ? Number(weightLatest.toFixed(1)) : null,
      weight_7d_ago_lbs: weight7dAgo,
      weight_30d_ago_lbs: weight30dAgo,
      steps_today: Math.round(stepsToday.reduce((s, r) => s + r.value, 0)),
      steps_7d_avg: stepsAvg7d,
      workout_days_last_7: workoutDays,
    },
    todays_plan: todaysPlan,
    goals,
    yesterday_adherence: yesterdayAdherence,
    active_experiments: activeExperiments,
  }
}

// ── Main ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured (supabase keys)' }, 500)
  if (!anthropicKey) return json({ error: 'Server misconfigured (anthropic key)' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Auth: prefer admin JWT (manual trigger). Cron-secret path will
  // come later when we wire Vercel Cron.
  const cronSecret = req.headers.get('X-Cron-Secret') ?? req.headers.get('x-cron-secret') ?? ''
  const expectedCron = Deno.env.get('MORNING_BRIEF_CRON_SECRET') ?? ''
  const isCron = expectedCron && cronSecret === expectedCron

  let userIds: string[] = []
  let trigger: 'manual' | 'cron' = 'manual'

  if (isCron) {
    trigger = 'cron'
    // Generate for all admin users with a profile
    const { data: admins } = await admin.from('users').select('id').eq('role', 'admin')
    const adminIds = ((admins ?? []) as { id: string }[]).map((u) => u.id)
    const { data: profiles } = await admin
      .from('personal_profile')
      .select('user_id')
      .in('user_id', adminIds)
    userIds = ((profiles ?? []) as { user_id: string }[]).map((p) => p.user_id)
  } else {
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!jwt) return json({ error: 'Missing authorization' }, 401)
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
    const { data: caller } = await admin
      .from('users').select('role').eq('id', userData.user.id).maybeSingle()
    if (!caller || (caller as { role: string }).role !== 'admin') return json({ error: 'Admin only' }, 403)
    userIds = [userData.user.id]
  }

  if (userIds.length === 0) return json({ generated: trigger, briefs: [], message: 'No admin users with profiles to generate for.' })

  const briefs: { user_id: string; brief_date: string; status: 'ok' | 'error'; error?: string }[] = []

  for (const userId of userIds) {
    try {
      const ctx = await assembleContext(admin, userId)
      const briefDate = new Date().toISOString().slice(0, 10)

      const userMessage = buildUserMessage(ctx)

      const anthropicBody = {
        model: MODEL,
        max_tokens: 1500,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        tool_choice: { type: 'tool', name: 'save_morning_brief' },
        messages: [{ role: 'user', content: userMessage }],
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(anthropicBody),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        briefs.push({ user_id: userId, brief_date: briefDate, status: 'error', error: `Anthropic ${res.status}: ${text.slice(0, 200)}` })
        continue
      }

      const data = await res.json() as {
        content?: Array<{ type: string; name?: string; input?: Record<string, string> }>
      }
      const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_morning_brief')
      if (!toolUse?.input) {
        briefs.push({ user_id: userId, brief_date: briefDate, status: 'error', error: 'Sage did not call save_morning_brief' })
        continue
      }

      const briefRow = {
        user_id: userId,
        brief_date: briefDate,
        headline: toolUse.input.headline,
        todays_focus: toolUse.input.todays_focus,
        watch_out_for: toolUse.input.watch_out_for,
        patterns_noticed: toolUse.input.patterns_noticed,
        goal_check: toolUse.input.goal_check,
        generated_at: new Date().toISOString(),
        generated_by: trigger,
        model: MODEL,
        context_snapshot: ctx as unknown,
      }

      const { error: upsertErr } = await admin
        .from('personal_morning_briefs')
        .upsert(briefRow as never, { onConflict: 'user_id,brief_date' })

      if (upsertErr) {
        briefs.push({ user_id: userId, brief_date: briefDate, status: 'error', error: `DB write: ${upsertErr.message}` })
      } else {
        briefs.push({ user_id: userId, brief_date: briefDate, status: 'ok' })
      }
    } catch (err) {
      briefs.push({ user_id: userId, brief_date: new Date().toISOString().slice(0, 10), status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  return json({ generated: trigger, briefs })
})
