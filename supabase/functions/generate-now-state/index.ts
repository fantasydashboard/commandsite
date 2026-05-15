// Josh Personal · generate-now-state Edge Function
// ---------------------------------------------------------------------------
// On-demand "Now" card generator for the Today page. Sage reads the
// inputs that matter at this hour of day, then writes a one-line hero
// + 1-3 actionable chips. The Today page caches the result in
// personal_now_state so re-renders are free.
//
// Time-bucket framing keeps the prompt focused:
//   morning  (5-11)  : recovery + day plan
//   midday   (11-16) : budget + activity
//   evening  (16-22) : dinner + wind-down + tomorrow prep
//   late     (22-5)  : sleep + tomorrow's first action
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    {}  (no input needed — Sage reads everything herself)
// Returns: { ok: true, now_state: { hero_text, secondary_text, suggested_actions, time_bucket, generated_at } }

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const MODEL = 'claude-sonnet-4-6'
const ANTHROPIC_TIMEOUT_MS = 30_000

const SYSTEM_PROMPT = `You are Sage writing Josh's "Now" card — the one line he sees at the top of his health dashboard.

# What this card does

It's the only sentence on the page that adapts to the hour. Josh checks the dashboard at 8am, 2pm, 6pm, 10pm. Each time, this card should tell him the ONE thing that matters at THIS hour given THIS data. Not a summary of his day. A pointer to a decision.

# Output via call_now_state tool

1. **hero_text** — ONE sentence, ≤120 characters, that earns its prominence at the top of the page. Lead with state ("Recovery looks good"), then action ("push the workout") OR a tradeoff worth flagging ("you're at 92% cal with dinner ahead"). No buzzwords. Reference one or two specific numbers, not all of them. First person allowed ("I'd push the workout today").

2. **secondary_text** — Optional second line, ≤140 characters, that adds context only if the hero needs it. Usually empty.

3. **suggested_actions** — 0 to 3 tap-chips for what Josh can do right now. Shape: { label, kind, payload? } where kind is one of:
   - 'log_water' — payload: { oz: number } — appears as "+{oz}oz water"
   - 'log_weight' — opens the quick-log popover focused on weight
   - 'open_plan' — links to the Plan tab
   - 'open_chat' — opens Ask Sage chat (useful when the situation calls for back-and-forth)
   - 'log_mood' — opens quick-log popover for mood
   Only suggest actions that make sense at this hour given the data. Don't suggest "log weight" at 8pm if he weighed in at 6am.

# Voice rules

- Direct, evidence-cited. "You logged 1,400 cal with 700 more in your budget" beats "Watch your intake."
- No em dashes inside sentences (use commas/periods).
- No cheerleading. He doesn't need "Great job!" — just facts and action.
- It's OK to say "Nothing urgent — your day looks on track" when that's accurate. Don't manufacture concerns.

# Time-bucket framing

The user message includes TIME_BUCKET. Lead the hero text accordingly:

- **morning**: recovery state (sleep hours, HRV vs avg), then "today's first move" — usually breakfast protein, workout intent, or a sleep flag if HRV is low.
- **midday**: where are you on budget + activity vs how much day is left? Frame around remaining cal, protein on pace, steps gap.
- **evening**: dinner status (planned vs not eaten), sat fat budget, water finish line, sleep prep timing.
- **late**: brief tomorrow setup (workout type, first meal protein anchor) OR a "you're done, sleep now" if past typical bedtime.

# What you must NEVER do

- Don't ask permission to do something. This card is informational + 0-3 actions, never a confirmation flow.
- Don't reference data you don't have. If sleep is null, don't mention sleep.
- Don't write more than one decision-grade sentence in the hero. If you need more, that's what secondary_text or chips are for.`

const TOOLS = [
  {
    name: 'call_now_state',
    description: "Persist the Now card content for Josh's dashboard.",
    input_schema: {
      type: 'object',
      properties: {
        hero_text: { type: 'string', description: 'One sentence, ≤120 chars.' },
        secondary_text: { type: 'string', description: 'Optional second line, ≤140 chars.' },
        suggested_actions: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              kind: { type: 'string', enum: ['log_water', 'log_weight', 'open_plan', 'open_chat', 'log_mood'] },
              payload: { type: 'object' },
            },
            required: ['label', 'kind'],
          },
        },
      },
      required: ['hero_text', 'suggested_actions'],
    },
  },
]

function timeBucket(now: Date): 'morning' | 'midday' | 'evening' | 'late' {
  const h = now.getHours()
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 16) return 'midday'
  if (h >= 16 && h < 22) return 'evening'
  return 'late'
}

function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function todayStartIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// deno-lint-ignore no-explicit-any
async function buildContext(admin: any, userId: string) {
  const now = new Date()
  const bucket = timeBucket(now)

  const [profileResp, todayMealsResp, sleepRows, hrvRows, weightRows, stepRows, waterRows, bloodworkResp, planResp] = await Promise.all([
    admin.from('personal_profile').select('*').eq('user_id', userId).maybeSingle(),
    admin.from('personal_meal_log')
      .select('logged_at, meal_slot, estimated_cal, estimated_protein_g, estimated_fat_g, estimated_sat_fat_g, description')
      .eq('user_id', userId).gte('logged_at', todayStartIso())
      .order('logged_at', { ascending: true }),
    admin.from('personal_metrics').select('value, recorded_at').eq('metric_type', 'sleep_asleep').gte('recorded_at', daysAgoIso(14)).order('recorded_at', { ascending: false }).limit(20),
    admin.from('personal_metrics').select('value, recorded_at').eq('metric_type', 'heart_rate_variability').gte('recorded_at', daysAgoIso(14)).order('recorded_at', { ascending: false }).limit(100),
    admin.from('personal_metrics').select('value, recorded_at').eq('metric_type', 'weight_body_mass').gte('recorded_at', daysAgoIso(14)).order('recorded_at', { ascending: false }).limit(20),
    admin.from('personal_metrics').select('value, recorded_at').eq('metric_type', 'step_count').gte('recorded_at', todayStartIso()),
    admin.from('personal_metrics').select('value, recorded_at').eq('metric_type', 'water_intake').gte('recorded_at', todayStartIso()),
    admin.from('personal_bloodwork_panels').select('drawn_at, markers').eq('user_id', userId).order('drawn_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('personal_weekly_plans').select('id, week_starting, end_date, days, approved_at').eq('user_id', userId).order('week_starting', { ascending: false }).limit(1).maybeSingle(),
  ])

  const profile = profileResp.data as Record<string, unknown> | null
  const targets = (profile?.computed_targets ?? null) as Record<string, unknown> | null
  // deno-lint-ignore no-explicit-any
  const todayMeals = (todayMealsResp.data ?? []) as any[]
  const todayTotals = todayMeals.reduce((acc, m) => ({
    cal: acc.cal + (m.estimated_cal ?? 0),
    protein_g: acc.protein_g + (m.estimated_protein_g ?? 0),
    fat_g: acc.fat_g + (m.estimated_fat_g ?? 0),
    sat_fat_g: acc.sat_fat_g + (m.estimated_sat_fat_g ?? 0),
  }), { cal: 0, protein_g: 0, fat_g: 0, sat_fat_g: 0 })

  function numAvg(rows: { value: number | string }[] | null | undefined, n?: number): number | null {
    if (!rows || rows.length === 0) return null
    const slice = n ? rows.slice(0, n) : rows
    return slice.reduce((s, r) => s + Number(r.value), 0) / slice.length
  }
  function todaySum(rows: { value: number | string }[] | null | undefined): number {
    if (!rows) return 0
    return rows.reduce((s, r) => s + Number(r.value), 0)
  }

  const sleepData = (sleepRows.data ?? []) as { value: number | string; recorded_at: string }[]
  const hrvData = (hrvRows.data ?? []) as { value: number | string; recorded_at: string }[]
  const weightData = (weightRows.data ?? []) as { value: number | string; recorded_at: string }[]
  const stepData = (stepRows.data ?? []) as { value: number | string; recorded_at: string }[]
  const waterData = (waterRows.data ?? []) as { value: number | string; recorded_at: string }[]

  const lastNightSleep = sleepData[0] ? Number(sleepData[0].value) : null
  const sleep7dAvg = numAvg(sleepData, 7)
  const hrvLatest = hrvData[0] ? Number(hrvData[0].value) : null
  const hrv7dAvg = numAvg(hrvData, 50)
  const weightLatest = weightData[0] ? Number(weightData[0].value) : null
  const stepsToday = todaySum(stepData)
  const waterToday = todaySum(waterData)

  // Active concerns from bloodwork
  const concerns: { label: string; value: string }[] = []
  if (bloodworkResp.data) {
    const m = (bloodworkResp.data as { markers: Record<string, number> }).markers
    if (typeof m.ldl_mg_dl === 'number' && m.ldl_mg_dl > 130) concerns.push({ label: 'LDL high', value: `${m.ldl_mg_dl}` })
    if (typeof m.a1c_pct === 'number' && m.a1c_pct >= 5.7) concerns.push({ label: 'A1C elevated', value: `${m.a1c_pct}%` })
    if (typeof m.triglycerides_mg_dl === 'number' && m.triglycerides_mg_dl > 150) concerns.push({ label: 'Triglycerides high', value: `${m.triglycerides_mg_dl}` })
  }

  // Today's planned meals from the weekly plan
  let todayPlannedMeals: Record<string, unknown> | null = null
  if (planResp.data) {
    const todayKey = now.toISOString().slice(0, 10)
    // deno-lint-ignore no-explicit-any
    const todayDay = (planResp.data as any).days?.find((d: { date: string }) => d.date === todayKey)
    todayPlannedMeals = todayDay?.meals ?? null
  }

  return {
    now_iso: now.toISOString(),
    time_bucket: bucket,
    profile_summary: profile ? {
      primary_goal: profile.primary_goal,
      target_weight_lbs: profile.target_weight_lbs,
      eating_window_start: profile.eating_window_start,
      eating_window_end: profile.eating_window_end,
      typical_bedtime: profile.typical_bedtime,
      sleep_target_hours: profile.sleep_target_hours,
    } : null,
    targets,
    concerns,
    today_intake: {
      meals_logged: todayMeals.length,
      totals: todayTotals,
      last_meal: todayMeals.length > 0 ? todayMeals[todayMeals.length - 1] : null,
    },
    today_activity: {
      steps: Math.round(stepsToday),
      water_oz: Math.round(waterToday * 10) / 10,
    },
    recovery: {
      last_night_sleep_h: lastNightSleep,
      sleep_7d_avg_h: sleep7dAvg ? Number(sleep7dAvg.toFixed(1)) : null,
      hrv_latest_ms: hrvLatest ? Math.round(hrvLatest) : null,
      hrv_14d_avg_ms: hrv7dAvg ? Math.round(hrv7dAvg) : null,
      weight_latest_lbs: weightLatest ? Number(weightLatest.toFixed(1)) : null,
    },
    today_planned_meals: todayPlannedMeals,
  }
}

function buildUserMessage(ctx: ReturnType<typeof buildContext> extends Promise<infer T> ? T : never): string {
  const lines: string[] = []
  lines.push(`# CURRENT MOMENT`)
  lines.push(`- Time: ${new Date(ctx.now_iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`)
  lines.push(`- TIME_BUCKET: ${ctx.time_bucket}`)
  lines.push('')
  if (ctx.profile_summary) {
    lines.push(`# PROFILE`)
    lines.push(`- Goal: ${ctx.profile_summary.primary_goal} → ${ctx.profile_summary.target_weight_lbs ?? '—'} lbs`)
    lines.push(`- Eating window: ${ctx.profile_summary.eating_window_start ?? '—'} → ${ctx.profile_summary.eating_window_end ?? '—'}`)
    lines.push(`- Sleep target: ${ctx.profile_summary.sleep_target_hours ?? '—'}h · bedtime ${ctx.profile_summary.typical_bedtime ?? '—'}`)
    lines.push('')
  }
  if (ctx.targets) {
    const t = ctx.targets
    lines.push(`# TARGETS`)
    lines.push(`- Cal: ${t.daily_cal_target} · Protein: ${t.protein_g}g · Sat fat ≤${t.sat_fat_g_ceiling}g · Water: ${t.water_oz ?? '—'}oz`)
    lines.push('')
  }
  lines.push(`# TODAY SO FAR`)
  lines.push(`- Meals logged: ${ctx.today_intake.meals_logged}`)
  lines.push(`- Cal: ${Math.round(ctx.today_intake.totals.cal)} · Protein: ${Math.round(ctx.today_intake.totals.protein_g)}g · Sat fat: ${ctx.today_intake.totals.sat_fat_g.toFixed(1)}g`)
  lines.push(`- Steps: ${ctx.today_activity.steps.toLocaleString()}`)
  lines.push(`- Water: ${ctx.today_activity.water_oz}oz`)
  lines.push('')
  lines.push(`# RECOVERY`)
  if (ctx.recovery.last_night_sleep_h != null) {
    const delta = ctx.recovery.sleep_7d_avg_h ? ` (vs ${ctx.recovery.sleep_7d_avg_h}h 7d avg)` : ''
    lines.push(`- Last night sleep: ${ctx.recovery.last_night_sleep_h.toFixed(1)}h${delta}`)
  }
  if (ctx.recovery.hrv_latest_ms != null) {
    const delta = ctx.recovery.hrv_14d_avg_ms ? ` (avg ${ctx.recovery.hrv_14d_avg_ms}ms)` : ''
    lines.push(`- HRV latest: ${ctx.recovery.hrv_latest_ms}ms${delta}`)
  }
  if (ctx.recovery.weight_latest_lbs != null) {
    lines.push(`- Weight: ${ctx.recovery.weight_latest_lbs} lbs`)
  }
  lines.push('')
  if (ctx.concerns.length > 0) {
    lines.push(`# ACTIVE BLOODWORK CONCERNS`)
    for (const c of ctx.concerns) lines.push(`- ${c.label}: ${c.value}`)
    lines.push('')
  }
  if (ctx.today_planned_meals) {
    lines.push(`# TODAY'S PLANNED MEALS (from weekly plan)`)
    // deno-lint-ignore no-explicit-any
    for (const [slot, meal] of Object.entries(ctx.today_planned_meals as Record<string, any>)) {
      if (meal) lines.push(`- ${slot}: ${meal.name} (${meal.cal} cal · ${meal.protein}g p)`)
    }
    lines.push('')
  }
  lines.push(`Now write the Now card for this exact moment. Call call_now_state.`)
  return lines.join('\n')
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured (supabase keys)' }, 500)
  if (!anthropicKey) return json({ error: 'Server misconfigured (anthropic key)' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return json({ error: 'Missing authorization' }, 401)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
  const { data: caller } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle()
  if (!caller || (caller as { role: string }).role !== 'admin') return json({ error: 'Admin only' }, 403)
  const userId = userData.user.id

  const ctx = await buildContext(admin, userId)
  const userMessage = buildUserMessage(ctx)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort('timeout'), ANTHROPIC_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        tool_choice: { type: 'tool', name: 'call_now_state' },
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    })
  } catch (err) {
    const wasTimeout = err instanceof DOMException && err.name === 'AbortError'
    return json({
      error: wasTimeout ? `Anthropic timed out after ${ANTHROPIC_TIMEOUT_MS / 1000}s` : `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    }, 504)
  } finally {
    clearTimeout(timeoutId)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return json({ error: `Anthropic ${res.status}: ${text.slice(0, 300)}` }, 502)
  }

  // deno-lint-ignore no-explicit-any
  const data = await res.json() as { content?: Array<{ type: string; name?: string; input?: any }> }
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'call_now_state')
  if (!toolUse?.input) return json({ error: 'Sage did not call call_now_state' }, 502)

  const row = {
    user_id: userId,
    hero_text: String(toolUse.input.hero_text ?? '').slice(0, 200),
    secondary_text: toolUse.input.secondary_text ? String(toolUse.input.secondary_text).slice(0, 200) : null,
    suggested_actions: Array.isArray(toolUse.input.suggested_actions) ? toolUse.input.suggested_actions.slice(0, 3) : [],
    time_bucket: ctx.time_bucket,
    model: MODEL,
    context_snapshot: ctx as unknown,
    generated_at: new Date().toISOString(),
  }

  const { error: upErr } = await admin
    .from('personal_now_state')
    .upsert(row as never, { onConflict: 'user_id' })

  if (upErr) return json({ error: `DB write: ${upErr.message}` }, 500)
  return json({ ok: true, now_state: row })
})
