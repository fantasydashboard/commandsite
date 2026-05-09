// Josh Personal · ask-sage Edge Function
// ---------------------------------------------------------------------------
// The chat agent. Sage with tools. Multi-turn conversation, server-
// side tool-use loop, returns final assistant text + tool trace.
//
// Use cases this enables (the "real AI assistant" feeling):
//   - "Going to Longhorn for dinner: <url>" → fetch_url + read_targets +
//     read_active_concerns → specific menu recommendation
//   - "I'm sore today, swap workouts" → read_weekly_plan + propose alt
//   - "Why is my LDL not dropping?" → read_recent_metrics + reason
//   - "Sage, log: ate 3 eggs and oatmeal" → log_meal with macro estimates
//
// V1 is non-streaming: POST → run loop → return final response. The
// frontend shows "Sage is using fetch_url..." indicators from the tool
// trace. Streaming SSE is a v2 polish.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    { messages: ChatMessage[] }   // multi-turn conversation
// Returns: { assistant_text: string, tool_trace: ToolCall[], stop_reason }
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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
const MAX_TOOL_TURNS = 5     // cap to prevent runaway agent loops
const MAX_FETCH_BYTES = 200_000  // strip huge pages down

// ── Sage system prompt ──────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Sage, Josh's personal AI health coach. You're chatting with him through his dashboard.

# WHO JOSH IS

Josh is a 30-something founder building CommandSite. You've already worked with him for weeks — you know his profile, his calculated targets, his bloodwork concerns, his weekly plan, his recent metrics. Use the tools below to access any of that data when you need it.

# YOUR TOOLS

- **fetch_url**: server-side fetch a webpage and return its text content. Use this for restaurant menus, recipe pages, news articles, anything Josh shares a link to.
- **read_targets**: pull Josh's calculated daily targets (cal, protein, fat, sat fat ceiling, etc.). Always check these before recommending food quantities.
- **read_active_concerns**: pull bloodwork-derived concerns (LDL high, A1C elevated, etc.). Use these as hard constraints — never recommend something that violates them without flagging the tradeoff.
- **read_recent_metrics(days)**: pull last N days of sleep / HRV / weight / steps / workout days. Use when reasoning about recovery, energy, weight trends.
- **read_weekly_plan**: pull this week's planned meals + workouts + remaining days. Use when something is about to replace a planned meal/workout.
- **read_meal_log_today**: pull what Josh has logged eating today. Use to know remaining macros for the day.
- **read_profile**: pull Josh's profile (food prefs, avoidances, injuries, equipment). Use when constraints aren't already in your context.
- **log_meal**: write a meal Josh told you he ate to his log. Always estimate macros from the description. Use when Josh says "log:", "I ate", "had X for lunch" etc.

Call tools whenever you need data. Don't guess. If Josh asks "what should I eat for dinner" and you don't already know his targets + remaining macros, call read_targets and read_meal_log_today first.

# RESPONSE STYLE

- Direct, specific, evidence-based. Reference his actual numbers.
- First person ("I'd order the sirloin" / "I'd skip dessert today")
- Conversational but informed — you know his data, sound like it.
- No buzzwords, no cheerleading, no em dashes inside sentences (use commas/periods).
- When making a recommendation, tie it to specific numbers (calorie budget, sat fat ceiling, protein target).
- When there's a tradeoff (e.g. "this dish is over your sat fat for the day"), flag it explicitly with the alternative.
- It's OK to say "I don't know" or "I'd need more info" — better than guessing.

# WHAT NOT TO DO

- Don't make medical diagnoses ("you have X condition"). Flag markers, don't diagnose.
- Don't give exercise advice that contradicts his listed injuries (read_profile if uncertain).
- Don't override his goals — you can suggest a tighter approach, but his goals are his.
- Don't be sycophantic. He doesn't need "great question!" — just answer.
- If a tool returns an error or empty result, tell Josh honestly and ask what's missing.

# CRITICAL TOOL-LOOP RULES (prevent infinite loops)

- After calling **log_meal** and getting a successful result (ok: true), CONFIRM TO JOSH (e.g. "Logged: ~480 cal, 32g protein.") and STOP. Do NOT call log_meal again in the same response. Do NOT call additional tools to "verify" — trust the result.
- After calling any tool that returns an **error**, tell Josh exactly what the error said in plain language and ASK HIM what to do. Do NOT silently retry the same tool with different inputs.
- Maximum 4 tools per single response. If you find yourself reaching for a 5th tool, stop and answer with what you have.
- Each unique tool should be called at most ONCE per response unless Josh explicitly asks for multiple lookups.`

// ── Tool schemas ────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'fetch_url',
    description: 'Fetch a webpage and return its plain-text content. Use for restaurant menus, recipes, news articles, anything Josh shares a URL for. Strips HTML, caps at ~200KB.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL starting with https://' },
      },
      required: ['url'],
    },
  },
  {
    name: 'read_targets',
    description: 'Pull Josh\'s calculated daily targets (calories, protein, fat, sat fat ceiling, carbs, fiber, water). Always check before recommending food quantities.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_active_concerns',
    description: 'Pull bloodwork-derived active concerns (e.g. LDL high → sat fat ceiling 14g). Use as hard constraints when recommending food.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_recent_metrics',
    description: 'Pull last N days of Apple Health metrics: sleep, HRV, weight, steps, workout days. Use for recovery / energy / trend reasoning.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'How many days back (1-30). Default 7.' },
      },
    },
  },
  {
    name: 'read_weekly_plan',
    description: 'Pull this week\'s planned meals + workouts. Use when something is about to replace a planned item, or when assessing how today\'s plan looks.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_meal_log_today',
    description: 'Pull meals Josh has logged eating today (with macro estimates). Use to know remaining cal/protein/sat-fat budget for the day.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_profile',
    description: 'Pull Josh\'s profile: foods avoided/disliked, cuisines loved, injuries, equipment, eating window, cooking skill.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'log_meal',
    description: 'Save a meal Josh ate to his log. ALWAYS provide estimated macros from the description (calories, protein, fat, sat fat). Sage estimates these based on typical portions of the foods named.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What Josh said he ate, in his words. e.g. "7oz sirloin, side salad, broccoli at Longhorn"' },
        meal_slot:   { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
        estimated_cal:        { type: 'number' },
        estimated_protein_g:  { type: 'number' },
        estimated_fat_g:      { type: 'number' },
        estimated_sat_fat_g:  { type: 'number' },
        estimated_carbs_g:    { type: 'number' },
      },
      required: ['description', 'estimated_cal', 'estimated_protein_g'],
    },
  },
]

// ── Tool implementations ────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function execTool(name: string, input: any, admin: any, userId: string): Promise<unknown> {
  switch (name) {
    case 'fetch_url': {
      const url = String(input.url ?? '').trim()
      if (!url.startsWith('http')) return { error: 'URL must start with http:// or https://' }
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 12_000)
        const res = await fetch(url, {
          headers: {
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
          },
          signal: controller.signal,
          redirect: 'follow',
        })
        clearTimeout(timeout)
        if (!res.ok) return { error: `Fetch failed: ${res.status} ${res.statusText}` }
        const ct = res.headers.get('content-type') ?? ''
        const text = await res.text()
        const truncated = text.slice(0, MAX_FETCH_BYTES)
        // Strip HTML if response is HTML — quick + dirty regex pass.
        let body = truncated
        if (/text\/html|application\/xhtml/i.test(ct)) {
          body = truncated
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim()
        }
        return {
          url,
          content_type: ct,
          extracted_length: body.length,
          truncated_at_bytes: text.length > MAX_FETCH_BYTES,
          body: body.slice(0, MAX_FETCH_BYTES),
        }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    }

    case 'read_targets': {
      const { data } = await admin
        .from('personal_profile').select('computed_targets').eq('user_id', userId).maybeSingle()
      const t = (data as { computed_targets: unknown } | null)?.computed_targets
      if (!t) return { error: 'No profile / targets on file. Tell Josh to complete onboarding.' }
      return t
    }

    case 'read_active_concerns': {
      const { data: bw } = await admin
        .from('personal_bloodwork_panels').select('drawn_at, markers')
        .eq('user_id', userId).order('drawn_at', { ascending: false }).limit(1).maybeSingle()
      if (!bw) return { error: 'No bloodwork panels on file.' }
      const m = (bw as { markers: Record<string, number> }).markers
      const concerns: { label: string; value: string; range: string; constraint: string }[] = []
      if (typeof m.ldl_mg_dl === 'number' && m.ldl_mg_dl > 130) {
        concerns.push({
          label: 'LDL high', value: `${m.ldl_mg_dl} mg/dL`, range: '<130',
          constraint: 'Saturated fat <20g/day; tighter if LDL ≥160. Swap butter→olive oil, red meat ≤2x/week.',
        })
      }
      if (typeof m.a1c_pct === 'number' && m.a1c_pct >= 5.7) {
        concerns.push({
          label: 'A1C elevated', value: `${m.a1c_pct}%`, range: '<5.7',
          constraint: 'Lower-GI carbs, no added sugar, fiber up.',
        })
      }
      if (typeof m.triglycerides_mg_dl === 'number' && m.triglycerides_mg_dl > 150) {
        concerns.push({
          label: 'Triglycerides high', value: `${m.triglycerides_mg_dl} mg/dL`, range: '<150',
          constraint: 'Refined-carb ceiling, alcohol moderation.',
        })
      }
      if (typeof m.vit_d_ng_ml === 'number' && m.vit_d_ng_ml < 30) {
        concerns.push({
          label: 'Vitamin D low', value: `${m.vit_d_ng_ml} ng/mL`, range: '>30',
          constraint: 'Continue 2k IU/day + sunlight exposure.',
        })
      }
      return { drawn_at: (bw as { drawn_at: string }).drawn_at, concerns }
    }

    case 'read_recent_metrics': {
      const days = Math.max(1, Math.min(30, Number(input.days ?? 7)))
      const since = new Date()
      since.setDate(since.getDate() - days)
      since.setHours(0, 0, 0, 0)
      const sinceIso = since.toISOString()

      async function fetchSeries(metric: string) {
        const { data } = await admin
          .from('personal_metrics').select('value, recorded_at')
          .eq('metric_type', metric).gte('recorded_at', sinceIso)
          .order('recorded_at', { ascending: false })
        return ((data ?? []) as { value: number | string; recorded_at: string }[])
          .map((r) => ({ value: Number(r.value), recorded_at: r.recorded_at }))
      }

      const [sleep, hrv, weight, steps, exercise] = await Promise.all([
        fetchSeries('sleep_asleep'),
        fetchSeries('heart_rate_variability'),
        fetchSeries('weight_body_mass'),
        fetchSeries('step_count'),
        fetchSeries('apple_exercise_time'),
      ])

      const sleepAvg = sleep.length > 0 ? Number((sleep.reduce((s, r) => s + r.value, 0) / sleep.length).toFixed(1)) : null
      const hrvAvg = hrv.length > 0 ? Math.round(hrv.reduce((s, r) => s + r.value, 0) / hrv.length) : null
      const weightLatest = weight[0]?.value ?? null
      const weightOldest = weight[weight.length - 1]?.value ?? null
      const stepsByDay = new Map<string, number>()
      for (const r of steps) {
        const d = r.recorded_at.slice(0, 10)
        stepsByDay.set(d, (stepsByDay.get(d) ?? 0) + r.value)
      }
      const stepsAvg = stepsByDay.size > 0 ? Math.round(Array.from(stepsByDay.values()).reduce((s, v) => s + v, 0) / stepsByDay.size) : null
      const exerciseByDay = new Map<string, number>()
      for (const r of exercise) {
        const d = r.recorded_at.slice(0, 10)
        exerciseByDay.set(d, (exerciseByDay.get(d) ?? 0) + r.value)
      }
      let workoutDays = 0
      for (const v of exerciseByDay.values()) if (v >= 20) workoutDays++

      return {
        days_back: days,
        sleep: { avg_hours: sleepAvg, last_night_hours: sleep[0]?.value ?? null, sample_count: sleep.length },
        hrv: { avg_ms: hrvAvg, today_ms: hrv[0]?.value ?? null, sample_count: hrv.length },
        weight: { latest_lbs: weightLatest, oldest_lbs_in_window: weightOldest, change_lbs: weightLatest != null && weightOldest != null ? Number((weightLatest - weightOldest).toFixed(1)) : null },
        steps: { avg_per_day: stepsAvg, sample_count: stepsByDay.size },
        workouts: { days_with_20min_plus: workoutDays },
      }
    }

    case 'read_weekly_plan': {
      const { data } = await admin
        .from('personal_weekly_plans').select('*')
        .eq('user_id', userId).order('week_starting', { ascending: false }).limit(1).maybeSingle()
      if (!data) return { error: 'No weekly plan on file. Tell Josh to generate one on the Plan tab.' }
      const today = new Date().toISOString().slice(0, 10)
      const todaySlice = (data as { days: { date: string }[] }).days.find((d) => d.date === today)
      return {
        week_starting: (data as { week_starting: string }).week_starting,
        approved: (data as { approved_at: string | null }).approved_at != null,
        today_slice: todaySlice ?? null,
        full_week: (data as { days: unknown }).days,
        strategy: (data as { strategy: string | null }).strategy,
      }
    }

    case 'read_meal_log_today': {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const { data } = await admin
        .from('personal_meal_log')
        .select('logged_at, description, meal_slot, estimated_cal, estimated_protein_g, estimated_fat_g, estimated_sat_fat_g')
        .eq('user_id', userId)
        .gte('logged_at', todayStart.toISOString())
        .order('logged_at', { ascending: true })
      const rows = (data ?? []) as Array<{
        estimated_cal: number | null
        estimated_protein_g: number | null
        estimated_fat_g: number | null
        estimated_sat_fat_g: number | null
      }>
      const totals = {
        cal: rows.reduce((s, r) => s + (r.estimated_cal ?? 0), 0),
        protein_g: rows.reduce((s, r) => s + (r.estimated_protein_g ?? 0), 0),
        fat_g: rows.reduce((s, r) => s + (r.estimated_fat_g ?? 0), 0),
        sat_fat_g: rows.reduce((s, r) => s + (r.estimated_sat_fat_g ?? 0), 0),
      }
      return { meals: data ?? [], totals_so_far_today: totals }
    }

    case 'read_profile': {
      const { data } = await admin
        .from('personal_profile').select(`
          height_cm, age, sex_at_birth, primary_goal, target_weight_lbs, target_deadline,
          weekly_loss_rate_lbs, activity_level, workouts_per_week_target, preferred_split,
          preferred_workout_time, session_duration_min, foods_disliked, foods_avoided,
          cuisines_loved, eating_window_start, eating_window_end, cooking_skill,
          injuries, has_home_gym, home_equipment, has_commercial_gym
        `).eq('user_id', userId).maybeSingle()
      if (!data) return { error: 'No profile on file.' }
      return data
    }

    case 'log_meal': {
      const payload = {
        user_id: userId,
        description: String(input.description ?? '').trim(),
        meal_slot: input.meal_slot ?? null,
        estimated_cal: input.estimated_cal ?? null,
        estimated_protein_g: input.estimated_protein_g ?? null,
        estimated_fat_g: input.estimated_fat_g ?? null,
        estimated_sat_fat_g: input.estimated_sat_fat_g ?? null,
        estimated_carbs_g: input.estimated_carbs_g ?? null,
        source: 'chat',
      }
      const { data, error: e } = await admin
        .from('personal_meal_log').insert(payload).select('id').single()
      if (e) return { error: `Failed to log: ${e.message}` }
      return { ok: true, meal_id: (data as { id: string }).id, logged: payload }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ── Main: agent loop ──────────────────────────────────────────────

interface ToolCall {
  name: string
  input: unknown
  result: unknown
  duration_ms: number
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

  // Auth: admin JWT
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return json({ error: 'Missing authorization' }, 401)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
  const { data: caller } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle()
  if (!caller || (caller as { role: string }).role !== 'admin') return json({ error: 'Admin only' }, 403)
  const userId = userData.user.id

  // Body
  // deno-lint-ignore no-explicit-any
  let body: { messages: any[] }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: 'messages array required' }, 400)
  }

  // deno-lint-ignore no-explicit-any
  const messages: any[] = body.messages.slice()
  const toolTrace: ToolCall[] = []

  // Agent loop
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const anthropicBody = {
      model: MODEL,
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
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
      return json({ error: `Anthropic ${res.status}: ${text.slice(0, 500)}`, tool_trace: toolTrace }, 502)
    }

    const data = await res.json() as {
      // deno-lint-ignore no-explicit-any
      content: any[]
      stop_reason: string
      usage?: { input_tokens: number; output_tokens: number }
    }

    // Append assistant message to history
    messages.push({ role: 'assistant', content: data.content })

    // If no tool use, we're done — extract final text
    if (data.stop_reason !== 'tool_use') {
      // deno-lint-ignore no-explicit-any
      const textBlocks = data.content.filter((c: any) => c.type === 'text')
      // deno-lint-ignore no-explicit-any
      const finalText = textBlocks.map((b: any) => b.text).join('\n').trim()
      return json({
        assistant_text: finalText,
        tool_trace: toolTrace,
        stop_reason: data.stop_reason,
        usage: data.usage,
      })
    }

    // tool_use stop — execute the tool calls and feed results back
    // deno-lint-ignore no-explicit-any
    const toolUseBlocks = data.content.filter((c: any) => c.type === 'tool_use')
    // deno-lint-ignore no-explicit-any
    const toolResults: any[] = []
    for (const block of toolUseBlocks) {
      const start = Date.now()
      const result = await execTool(block.name, block.input, admin, userId)
      const duration = Date.now() - start
      toolTrace.push({ name: block.name, input: block.input, result, duration_ms: duration })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  // Hit the loop cap without a clean end_turn
  return json({
    assistant_text: '(Sage hit the tool-call cap before finishing — try rephrasing.)',
    tool_trace: toolTrace,
    stop_reason: 'max_turns',
  })
})
