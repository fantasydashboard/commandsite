// Josh Personal · generate-history-summary Edge Function (Phase 5)
// ---------------------------------------------------------------------------
// On-demand. Sage writes a paragraph synthesizing the last 30 days:
// experiments run + verdicts, target changes + outcomes, adherence,
// weight pace, workouts done, ingredient learnings, dismissed patterns.
// Cached in personal_sage_summary; the History tab renders it with a
// refresh button. Same shape as generate-now-state.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    {}
// Returns: { ok: true, summary: { ... } }

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
const ANTHROPIC_TIMEOUT_MS = 45_000
const WINDOW_DAYS = 30

const SYSTEM_PROMPT = `You are Sage writing Josh's 30-day history recap — the artifact at the top of his History page.

# What this recap does

It tells Josh, in one paragraph (and optional highlight chips), what actually happened the last 30 days. Not a metrics dump. The story: what we tried, what worked, what didn't, what's still open. The page below shows the raw timeline; this card narrates it.

# Output via call_history_summary

1. **body** — A single paragraph, 100-180 words. Lead with the headline result (weight change vs. target, biggest experiment outcome, biggest behavior shift). Then 2-3 sentences citing specific numbers (cal/protein adherence rate, days hit goal, experiment verdicts). Close with one sentence on what's still in motion or what to watch next.

2. **highlights** — 0-4 short chips for the UI. Shape: { label, kind } where kind is one of: 'experiment_completed' | 'experiment_active' | 'target_change' | 'adherence' | 'weight' | 'workout' | 'pattern'. Examples:
   - { label: '2 experiments completed', kind: 'experiment_completed' }
   - { label: 'Hit protein 22/30 days', kind: 'adherence' }
   - { label: '−1.8 lbs (target was −2.0)', kind: 'weight' }
   - { label: '11 workouts logged', kind: 'workout' }

# Voice

- Direct, evidence-cited. "You dropped 1.8 lbs against a 2.0 lb target — close to plan" beats "Solid weight progress."
- Specific numbers. Cite experiment verdicts, adherence rates, decision impacts.
- No buzzwords, no cheerleading, no em dashes inside sentences.
- First person allowed ("I lowered your sat fat ceiling because…").
- It's OK to say "the data is sparse" or "nothing notable" when that's true.

# What you must NEVER do

- Don't invent metrics not in the context.
- Don't repeat the timeline verbatim — you are summarizing, not listing.
- Don't moralize. State what happened.`

const TOOLS = [
  {
    name: 'call_history_summary',
    description: "Save the 30-day history recap for Josh's History tab.",
    input_schema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: 'One paragraph, 100-180 words.' },
        highlights: {
          type: 'array',
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              kind:  { type: 'string', enum: ['experiment_completed', 'experiment_active', 'target_change', 'adherence', 'weight', 'workout', 'pattern'] },
            },
            required: ['label', 'kind'],
          },
        },
      },
      required: ['body', 'highlights'],
    },
  },
]

function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// deno-lint-ignore no-explicit-any
async function buildContext(admin: any, userId: string) {
  const now = new Date()
  const since = daysAgoIso(WINDOW_DAYS)
  const sinceDate = since.slice(0, 10)
  const todayDate = now.toISOString().slice(0, 10)

  const [profileR, experimentsR, targetChangesR, adherenceR, workoutsR, weightR, prefsR, patternsR, observationsR] = await Promise.all([
    admin.from('personal_profile').select('primary_goal, target_weight_lbs, target_deadline, weekly_loss_rate_lbs, computed_targets').eq('user_id', userId).maybeSingle(),
    admin.from('personal_experiments').select('title, hypothesis, category, status, verdict, verdict_notes, baseline_value, end_value, primary_metric, start_date, end_date, ended_at').eq('user_id', userId).gte('start_date', sinceDate).order('start_date', { ascending: false }),
    admin.from('personal_target_changes').select('scope, field_key, old_value, new_value, reason, source, changed_at').eq('user_id', userId).gte('changed_at', since).order('changed_at', { ascending: false }),
    admin.from('personal_daily_adherence').select('adherence_date, hit_cal, hit_protein, under_sat_fat, hit_water, hit_steps, workout_done').eq('user_id', userId).gte('adherence_date', sinceDate).order('adherence_date', { ascending: true }),
    admin.from('personal_workouts').select('workout_date, workout_type, status').eq('user_id', userId).gte('workout_date', sinceDate),
    admin.from('personal_metrics').select('value, recorded_at').eq('metric_type', 'weight_body_mass').gte('recorded_at', since).order('recorded_at', { ascending: true }),
    admin.from('personal_ingredient_prefs').select('ingredient, verdict, set_at').eq('user_id', userId).gte('set_at', since),
    admin.from('personal_patterns_detected').select('title, severity, dismissed_at, detected_at').eq('user_id', userId).gte('detected_at', since),
    admin.from('personal_sage_observations').select('body, confidence, set_at').eq('user_id', userId).eq('status', 'active').gte('set_at', since),
  ])

  const profile = profileR.data as Record<string, unknown> | null
  // deno-lint-ignore no-explicit-any
  const experiments = (experimentsR.data ?? []) as any[]
  // deno-lint-ignore no-explicit-any
  const targetChanges = (targetChangesR.data ?? []) as any[]
  // deno-lint-ignore no-explicit-any
  const adherence = (adherenceR.data ?? []) as any[]
  // deno-lint-ignore no-explicit-any
  const workouts = (workoutsR.data ?? []) as any[]
  // deno-lint-ignore no-explicit-any
  const weight = (weightR.data ?? []) as any[]
  // deno-lint-ignore no-explicit-any
  const prefs = (prefsR.data ?? []) as any[]
  // deno-lint-ignore no-explicit-any
  const patterns = (patternsR.data ?? []) as any[]
  // deno-lint-ignore no-explicit-any
  const observations = (observationsR.data ?? []) as any[]

  const adherenceCount = adherence.length
  const hitCal = adherence.filter((r) => r.hit_cal === true).length
  const hitProtein = adherence.filter((r) => r.hit_protein === true).length
  const underSatFat = adherence.filter((r) => r.under_sat_fat === true).length
  const hitWater = adherence.filter((r) => r.hit_water === true).length
  const hitSteps = adherence.filter((r) => r.hit_steps === true).length
  const workoutDays = adherence.filter((r) => r.workout_done === true).length

  const completedWorkouts = workouts.filter((w) => w.status === 'completed').length

  const weightFirst = weight[0] ? Number(weight[0].value) : null
  const weightLast = weight[weight.length - 1] ? Number(weight[weight.length - 1].value) : null
  const weightDelta = (weightFirst != null && weightLast != null) ? Number((weightLast - weightFirst).toFixed(1)) : null

  return {
    today_iso: todayDate,
    window_start: sinceDate,
    window_end: todayDate,
    profile_summary: profile ? {
      primary_goal: profile.primary_goal,
      target_weight_lbs: profile.target_weight_lbs,
      weekly_loss_rate_lbs: profile.weekly_loss_rate_lbs,
    } : null,
    experiments,
    target_changes: targetChanges,
    adherence_window: {
      days_with_data: adherenceCount,
      hit_cal_days: hitCal,
      hit_protein_days: hitProtein,
      under_sat_fat_days: underSatFat,
      hit_water_days: hitWater,
      hit_steps_days: hitSteps,
      workout_days: workoutDays,
    },
    workouts_completed: completedWorkouts,
    weight: { first: weightFirst, last: weightLast, change: weightDelta },
    ingredient_prefs_changes: prefs.length,
    patterns_detected: patterns.length,
    patterns_dismissed: patterns.filter((p) => p.dismissed_at).length,
    observations_active: observations.length,
  }
}

function buildUserMessage(ctx: ReturnType<typeof buildContext> extends Promise<infer T> ? T : never): string {
  const lines: string[] = []
  lines.push(`# WINDOW`)
  lines.push(`Last ${WINDOW_DAYS} days: ${ctx.window_start} → ${ctx.window_end}`)
  lines.push('')
  if (ctx.profile_summary) {
    lines.push(`# GOAL`)
    lines.push(`- ${ctx.profile_summary.primary_goal} → ${ctx.profile_summary.target_weight_lbs ?? '—'} lbs at ${ctx.profile_summary.weekly_loss_rate_lbs ?? '—'} lb/wk pace`)
    lines.push('')
  }
  if (ctx.weight.first != null && ctx.weight.last != null) {
    lines.push(`# WEIGHT`)
    lines.push(`- ${ctx.weight.first} → ${ctx.weight.last} lbs (${ctx.weight.change! > 0 ? '+' : ''}${ctx.weight.change} lbs over ${WINDOW_DAYS}d)`)
    lines.push('')
  }
  lines.push(`# ADHERENCE (${ctx.adherence_window.days_with_data} days with rolled-up data)`)
  lines.push(`- Hit cal target: ${ctx.adherence_window.hit_cal_days}/${ctx.adherence_window.days_with_data} days`)
  lines.push(`- Hit protein: ${ctx.adherence_window.hit_protein_days}/${ctx.adherence_window.days_with_data} days`)
  lines.push(`- Under sat fat ceiling: ${ctx.adherence_window.under_sat_fat_days}/${ctx.adherence_window.days_with_data} days`)
  lines.push(`- Hit water target: ${ctx.adherence_window.hit_water_days}/${ctx.adherence_window.days_with_data} days`)
  lines.push(`- Hit 10k steps: ${ctx.adherence_window.hit_steps_days}/${ctx.adherence_window.days_with_data} days`)
  lines.push(`- Worked out: ${ctx.adherence_window.workout_days}/${ctx.adherence_window.days_with_data} days (${ctx.workouts_completed} sessions completed)`)
  lines.push('')
  if (ctx.experiments.length > 0) {
    lines.push(`# EXPERIMENTS (${ctx.experiments.length})`)
    for (const e of ctx.experiments) {
      const status = e.status === 'completed' ? `verdict=${e.verdict}` : e.status
      const delta = (e.baseline_value != null && e.end_value != null) ? ` baseline=${e.baseline_value} → end=${e.end_value}` : ''
      lines.push(`- "${e.title}" (${e.category}, ${status})${delta}`)
      if (e.verdict_notes) lines.push(`  notes: ${e.verdict_notes}`)
    }
    lines.push('')
  }
  if (ctx.target_changes.length > 0) {
    lines.push(`# TARGET / PROFILE CHANGES (${ctx.target_changes.length})`)
    for (const c of ctx.target_changes) {
      lines.push(`- ${c.scope}.${c.field_key}: ${JSON.stringify(c.old_value)} → ${JSON.stringify(c.new_value)} (${c.reason ?? '—'})`)
    }
    lines.push('')
  }
  if (ctx.ingredient_prefs_changes > 0) lines.push(`# INGREDIENT LEARNINGS: ${ctx.ingredient_prefs_changes} prefs updated`)
  if (ctx.patterns_detected > 0) lines.push(`# PATTERNS: ${ctx.patterns_detected} detected (${ctx.patterns_dismissed} dismissed/acted on)`)
  if (ctx.observations_active > 0) lines.push(`# ACTIVE OBSERVATIONS: ${ctx.observations_active} long-term notes Sage has logged`)
  lines.push('')
  lines.push(`Now write the recap. Call call_history_summary with body + highlights.`)
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
        max_tokens: 1500,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        tool_choice: { type: 'tool', name: 'call_history_summary' },
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    })
  } catch (err) {
    const wasTimeout = err instanceof DOMException && err.name === 'AbortError'
    return json({ error: wasTimeout ? `Anthropic timed out after ${ANTHROPIC_TIMEOUT_MS / 1000}s` : `Fetch failed: ${err instanceof Error ? err.message : String(err)}` }, 504)
  } finally {
    clearTimeout(timeoutId)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return json({ error: `Anthropic ${res.status}: ${text.slice(0, 300)}` }, 502)
  }
  // deno-lint-ignore no-explicit-any
  const data = await res.json() as { content?: Array<{ type: string; name?: string; input?: any }> }
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'call_history_summary')
  if (!toolUse?.input) return json({ error: 'Sage did not call call_history_summary' }, 502)

  const row = {
    user_id: userId,
    body: String(toolUse.input.body ?? '').slice(0, 4000),
    highlights: Array.isArray(toolUse.input.highlights) ? toolUse.input.highlights.slice(0, 4) : [],
    window_start: ctx.window_start,
    window_end: ctx.window_end,
    model: MODEL,
    context_snapshot: ctx as unknown,
    generated_at: new Date().toISOString(),
  }

  const { error: upErr } = await admin
    .from('personal_sage_summary')
    .upsert(row as never, { onConflict: 'user_id' })

  if (upErr) return json({ error: `DB write: ${upErr.message}` }, 500)
  return json({ ok: true, summary: row })
})
