// Josh Personal · generate-trends-summary Edge Function
// ---------------------------------------------------------------------------
// On-demand. Sage writes a paragraph that synthesizes the last 8 weeks
// of *metric movement* — weight slope, sleep/HRV trends, adherence
// rate, completed-experiment outcomes, bloodwork delta if a new draw
// landed in the window. Cached in personal_trends_summary; the Trends
// tab renders + offers a refresh button.
//
// Sister function to generate-history-summary (which covers DECISIONS
// over 30 days). This one covers DATA over 8 weeks.

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const MODEL = 'claude-sonnet-4-6'
const ANTHROPIC_TIMEOUT_MS = 45_000
const WINDOW_DAYS = 56  // 8 weeks

const SYSTEM_PROMPT = `You are Sage writing Josh's 8-week trends recap — the paragraph at the top of his Trends page.

# What this recap does

It tells him, in one paragraph, what the data has DONE over the last 8 weeks. The page below shows the raw charts; this card narrates the story.

# Output via call_trends_summary

1. **body** — One paragraph, 90-160 words. Lead with the headline metric movement (weight, the most-relevant trend right now). Then 2-3 sentences citing specific deltas: sleep avg vs prior 8w, HRV trajectory, adherence rate, the biggest experiment outcome, bloodwork change if applicable. Close with one sentence on what's working or what to watch.

2. **highlights** — 0-4 short chips. Shape: { label, kind } where kind is one of: 'weight' | 'sleep' | 'hrv' | 'adherence' | 'experiment' | 'bloodwork' | 'workout'. Examples:
   - { label: '−2.4 lbs over 8 weeks', kind: 'weight' }
   - { label: 'LDL 168 → 142', kind: 'bloodwork' }
   - { label: '85% protein adherence', kind: 'adherence' }
   - { label: 'Sat fat experiment confirmed', kind: 'experiment' }

# Voice

- Direct, evidence-cited. No hedging.
- Specific numbers. Cite movement, not status.
- No buzzwords, no cheerleading, no em dashes inside sentences.
- Honest when data is sparse: "8 weeks isn't long enough yet for HRV trends — checking again at 12."

# Don't

- Don't reference data not in the context.
- Don't repeat the chart values verbatim — synthesize.
- Don't moralize about what Josh "should" do — that's the History recap's job.`

const TOOLS = [
  {
    name: 'call_trends_summary',
    description: "Save the 8-week trends recap.",
    input_schema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: '90-160 words.' },
        highlights: {
          type: 'array', maxItems: 4,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              kind:  { type: 'string', enum: ['weight', 'sleep', 'hrv', 'adherence', 'experiment', 'bloodwork', 'workout'] },
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
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// deno-lint-ignore no-explicit-any
async function buildContext(admin: any, userId: string) {
  const now = new Date()
  const since = daysAgoIso(WINDOW_DAYS)
  const sinceDate = since.slice(0, 10)
  const todayDate = now.toISOString().slice(0, 10)

  // deno-lint-ignore no-explicit-any
  async function metricsAvg(metric: string, sinceIso: string): Promise<number | null> {
    const { data } = await admin.from('personal_metrics').select('value')
      .eq('metric_type', metric).gte('recorded_at', sinceIso)
    const vals = ((data ?? []) as { value: number | string }[]).map((r) => Number(r.value))
    if (vals.length === 0) return null
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }

  const since112 = daysAgoIso(WINDOW_DAYS * 2)

  const [profileR, weightR, expR, adherenceR, bloodworkR] = await Promise.all([
    admin.from('personal_profile').select('primary_goal, target_weight_lbs, target_deadline, weekly_loss_rate_lbs').eq('user_id', userId).maybeSingle(),
    admin.from('personal_metrics').select('value, recorded_at').eq('metric_type', 'weight_body_mass').gte('recorded_at', since).order('recorded_at', { ascending: true }),
    admin.from('personal_experiments').select('title, hypothesis, status, verdict, verdict_notes, baseline_value, end_value, primary_metric, end_date').eq('user_id', userId).gte('end_date', sinceDate),
    admin.from('personal_daily_adherence').select('hit_cal, hit_protein, under_sat_fat, hit_water, hit_steps, workout_done, adherence_date').eq('user_id', userId).gte('adherence_date', sinceDate),
    admin.from('personal_bloodwork_panels').select('drawn_at, markers').eq('user_id', userId).order('drawn_at', { ascending: false }).limit(2),
  ])

  const profile = profileR.data as Record<string, unknown> | null
  // deno-lint-ignore no-explicit-any
  const weight = (weightR.data ?? []) as any[]
  // deno-lint-ignore no-explicit-any
  const experiments = (expR.data ?? []) as any[]
  // deno-lint-ignore no-explicit-any
  const adherence = (adherenceR.data ?? []) as any[]
  // deno-lint-ignore no-explicit-any
  const bloodwork = (bloodworkR.data ?? []) as any[]

  // Weight: first vs last in the 8-week window
  const weightFirst = weight[0] ? Number(weight[0].value) : null
  const weightLast = weight[weight.length - 1] ? Number(weight[weight.length - 1].value) : null
  const weightDelta = (weightFirst != null && weightLast != null) ? Number((weightLast - weightFirst).toFixed(1)) : null

  // Sleep + HRV: this 8w avg vs prior 8w avg
  const [sleepCur, sleepPrior, hrvCur, hrvPrior] = await Promise.all([
    metricsAvg('sleep_asleep', since),
    (async () => {
      const { data } = await admin.from('personal_metrics').select('value')
        .eq('metric_type', 'sleep_asleep').gte('recorded_at', since112).lt('recorded_at', since)
      const vals = ((data ?? []) as { value: number | string }[]).map((r) => Number(r.value))
      return vals.length === 0 ? null : vals.reduce((s, v) => s + v, 0) / vals.length
    })(),
    metricsAvg('heart_rate_variability', since),
    (async () => {
      const { data } = await admin.from('personal_metrics').select('value')
        .eq('metric_type', 'heart_rate_variability').gte('recorded_at', since112).lt('recorded_at', since)
      const vals = ((data ?? []) as { value: number | string }[]).map((r) => Number(r.value))
      return vals.length === 0 ? null : vals.reduce((s, v) => s + v, 0) / vals.length
    })(),
  ])

  // Adherence rate
  const adhCount = adherence.length
  const adh = {
    hit_cal: adherence.filter((r) => r.hit_cal === true).length,
    hit_protein: adherence.filter((r) => r.hit_protein === true).length,
    under_sat_fat: adherence.filter((r) => r.under_sat_fat === true).length,
    hit_water: adherence.filter((r) => r.hit_water === true).length,
    hit_steps: adherence.filter((r) => r.hit_steps === true).length,
    workout: adherence.filter((r) => r.workout_done === true).length,
  }

  // Bloodwork delta — only if we have 2 panels and at least one in window
  let bloodworkDelta: Record<string, { from: number; to: number; drawn_to: string; drawn_from: string }> | null = null
  if (bloodwork.length === 2) {
    const latest = bloodwork[0]
    const prior = bloodwork[1]
    if (latest.drawn_at >= sinceDate) {
      bloodworkDelta = {}
      const keys = ['ldl_mg_dl', 'hdl_mg_dl', 'a1c_pct', 'triglycerides_mg_dl', 'vit_d_ng_ml']
      for (const k of keys) {
        const lv = latest.markers?.[k]
        const pv = prior.markers?.[k]
        if (typeof lv === 'number' && typeof pv === 'number') {
          bloodworkDelta[k] = { from: pv, to: lv, drawn_to: latest.drawn_at, drawn_from: prior.drawn_at }
        }
      }
    }
  }

  return {
    today_iso: todayDate,
    window_start: sinceDate,
    window_end: todayDate,
    profile_summary: profile ? {
      primary_goal: profile.primary_goal,
      target_weight_lbs: profile.target_weight_lbs,
      weekly_loss_rate_lbs: profile.weekly_loss_rate_lbs,
    } : null,
    weight: { first: weightFirst, last: weightLast, change: weightDelta, sample_count: weight.length },
    sleep: { avg_8w: sleepCur != null ? Number(sleepCur.toFixed(1)) : null, avg_prior_8w: sleepPrior != null ? Number(sleepPrior.toFixed(1)) : null },
    hrv: { avg_8w: hrvCur != null ? Math.round(hrvCur) : null, avg_prior_8w: hrvPrior != null ? Math.round(hrvPrior) : null },
    adherence: { days_with_data: adhCount, ...adh },
    experiments_in_window: experiments,
    bloodwork_delta: bloodworkDelta,
  }
}

function buildUserMessage(ctx: ReturnType<typeof buildContext> extends Promise<infer T> ? T : never): string {
  const lines: string[] = []
  lines.push(`# WINDOW`)
  lines.push(`Last ${WINDOW_DAYS} days: ${ctx.window_start} → ${ctx.window_end}`)
  lines.push('')
  if (ctx.profile_summary) {
    lines.push(`# GOAL`)
    lines.push(`- ${ctx.profile_summary.primary_goal} → ${ctx.profile_summary.target_weight_lbs ?? '—'} lbs at ${ctx.profile_summary.weekly_loss_rate_lbs ?? '—'} lb/wk`)
    lines.push('')
  }
  if (ctx.weight.first != null && ctx.weight.last != null) {
    lines.push(`# WEIGHT`)
    lines.push(`- ${ctx.weight.first} → ${ctx.weight.last} lbs (${ctx.weight.change! > 0 ? '+' : ''}${ctx.weight.change} over 8w, ${ctx.weight.sample_count} readings)`)
    lines.push('')
  }
  if (ctx.sleep.avg_8w != null) {
    const cmp = ctx.sleep.avg_prior_8w != null ? ` (prior 8w avg: ${ctx.sleep.avg_prior_8w}h)` : ''
    lines.push(`# SLEEP`)
    lines.push(`- ${ctx.sleep.avg_8w}h avg over 8w${cmp}`)
    lines.push('')
  }
  if (ctx.hrv.avg_8w != null) {
    const cmp = ctx.hrv.avg_prior_8w != null ? ` (prior 8w avg: ${ctx.hrv.avg_prior_8w}ms)` : ''
    lines.push(`# HRV`)
    lines.push(`- ${ctx.hrv.avg_8w}ms avg over 8w${cmp}`)
    lines.push('')
  }
  lines.push(`# ADHERENCE (${ctx.adherence.days_with_data} of 56 days had rolled-up data)`)
  if (ctx.adherence.days_with_data > 0) {
    const pct = (n: number) => `${Math.round((n / ctx.adherence.days_with_data) * 100)}%`
    lines.push(`- Cal: ${pct(ctx.adherence.hit_cal)} · Protein: ${pct(ctx.adherence.hit_protein)} · Sat fat: ${pct(ctx.adherence.under_sat_fat)} · Water: ${pct(ctx.adherence.hit_water)} · Steps: ${pct(ctx.adherence.hit_steps)} · Workout: ${pct(ctx.adherence.workout)}`)
  }
  lines.push('')
  if (ctx.experiments_in_window.length > 0) {
    lines.push(`# COMPLETED EXPERIMENTS IN WINDOW`)
    for (const e of ctx.experiments_in_window) {
      const delta = (e.baseline_value != null && e.end_value != null) ? ` ${e.baseline_value} → ${e.end_value}` : ''
      lines.push(`- "${e.title}" (${e.status}, verdict=${e.verdict ?? '—'})${delta}`)
    }
    lines.push('')
  }
  if (ctx.bloodwork_delta && Object.keys(ctx.bloodwork_delta).length > 0) {
    lines.push(`# BLOODWORK CHANGE (latest draw vs prior)`)
    for (const [k, v] of Object.entries(ctx.bloodwork_delta)) {
      lines.push(`- ${k}: ${v.from} → ${v.to} (${v.drawn_from} → ${v.drawn_to})`)
    }
    lines.push('')
  }
  lines.push(`Now write the trends recap. Call call_trends_summary.`)
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
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        tool_choice: { type: 'tool', name: 'call_trends_summary' },
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    })
  } catch (err) {
    const wasTimeout = err instanceof DOMException && err.name === 'AbortError'
    return json({ error: wasTimeout ? `Anthropic timed out after ${ANTHROPIC_TIMEOUT_MS / 1000}s` : `Fetch failed: ${err instanceof Error ? err.message : String(err)}` }, 504)
  } finally { clearTimeout(timeoutId) }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return json({ error: `Anthropic ${res.status}: ${text.slice(0, 300)}` }, 502)
  }
  // deno-lint-ignore no-explicit-any
  const data = await res.json() as { content?: Array<{ type: string; name?: string; input?: any }> }
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'call_trends_summary')
  if (!toolUse?.input) return json({ error: 'Sage did not call call_trends_summary' }, 502)

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
    .from('personal_trends_summary')
    .upsert(row as never, { onConflict: 'user_id' })

  if (upErr) return json({ error: `DB write: ${upErr.message}` }, 500)
  return json({ ok: true, summary: row })
})
