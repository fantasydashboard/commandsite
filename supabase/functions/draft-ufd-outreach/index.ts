// CommandSite · draft-ufd-outreach Edge Function
// ---------------------------------------------------------------------------
// Bones drafts a personalized outreach email to a UFD user. Mirrors
// the role draft-cold-email plays for CommandSite cold outreach — but
// tuned for the B2C/lifecycle context: trial encouragement, win-back,
// NPS check-in. Always drafts AS Josh (the founder), never as Bones
// directly. Recipient should think Josh wrote it.
//
// Auth:    Admin JWT or service role
// Body:    {
//            user: {
//              email: string,
//              full_name?: string,
//              signup_date?: string,
//              trial_started_at?: string,
//              trial_expires_at?: string,
//              plan_started_at?: string,
//              current_period_end?: string,
//              last_opened?: string,
//              open_rate?: number,
//            },
//            cohort: 'free_trial' | 'at_risk' | 'expired' |
//                    'individual_monthly' | 'individual_annual' |
//                    'league_passes' | 'total_users'
//          }
// Returns: { subject: string, body: string, model: string }

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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const MODEL = 'claude-sonnet-4-6'

type Cohort =
  | 'free_trial'
  | 'at_risk'
  | 'expired'
  | 'individual_monthly'
  | 'individual_annual'
  | 'league_passes'
  | 'total_users'

interface UfdUserCtx {
  email: string
  full_name?: string
  signup_date?: string
  trial_started_at?: string
  trial_expires_at?: string
  plan_started_at?: string
  current_period_end?: string
  last_opened?: string
  open_rate?: number
}

interface ReqBody {
  user: UfdUserCtx
  cohort: Cohort
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000))
}

function describeTimeOfYear(): string {
  // Hardcoded month-aware framing. Updated calendar-aware so Bones
  // doesn't keep referencing the NFL Draft after it passes.
  // Reference today (server time) to pick the right hook.
  const m = new Date().getMonth()  // 0 = Jan
  if (m >= 7 && m <= 8) return 'fantasy draft prep season — leagues are drafting in the next 4-6 weeks'   // Aug-Sep
  if (m === 9) return 'NFL Week 1-4 — fantasy is in full swing'                                            // Oct
  if (m >= 10 && m <= 11) return 'mid-season fantasy crunch — waivers and trades matter most'              // Nov-Dec
  if (m === 0) return 'fantasy playoffs and start of dynasty offseason'                                    // Jan
  if (m === 1) return 'Super Bowl wrap + start of dynasty/keeper league offseason work'                    // Feb
  if (m === 2) return 'NFL free agency + dynasty trades heat up'                                           // Mar
  if (m === 3) return 'NFL Draft week — fantasy hype peaks for rookies'                                    // Apr
  if (m === 4) return 'NFL schedule just dropped, dead-zone for casual fantasy but dynasty leagues active' // May
  if (m === 5) return 'mid-offseason — minicamps wrapping, OTAs done'                                      // Jun
  return 'early summer offseason — heading into training camp soon'                                        // Jul
}

function buildContext(user: UfdUserCtx, cohort: Cohort): string {
  const now = new Date()
  const lines: string[] = []
  lines.push(`# THE USER`)
  lines.push(`Email: ${user.email}`)
  lines.push(`Name: ${user.full_name || '(not provided)'}`)
  const firstName = (user.full_name ?? '').split(' ')[0] || '(no first name — open with "Hey,")'
  lines.push(`First name: ${firstName}`)
  if (user.signup_date) {
    const d = daysBetween(now, new Date(user.signup_date))
    lines.push(`Signed up: ${user.signup_date} (${d} days ago)`)
  }
  if (user.trial_started_at) lines.push(`Trial started: ${user.trial_started_at}`)
  if (user.trial_expires_at) {
    const d = daysBetween(new Date(user.trial_expires_at), now)
    lines.push(`Trial expires: ${user.trial_expires_at} (${d > 0 ? `in ${d} days` : `${Math.abs(d)} days ago`})`)
  }
  if (user.plan_started_at) lines.push(`Paid plan started: ${user.plan_started_at}`)
  if (user.current_period_end) lines.push(`Renews / expires: ${user.current_period_end}`)
  if (user.last_opened) lines.push(`Last opened a UFD email: ${user.last_opened}`)
  if (user.open_rate !== undefined) lines.push(`Email open rate: ${Math.round((user.open_rate ?? 0) * 100)}%`)
  lines.push(``)
  lines.push(`# COHORT: ${cohort}`)
  lines.push(`# CURRENT CONTEXT: ${describeTimeOfYear()}`)
  return lines.join('\n')
}

const SYSTEM_PROMPT_BASE = `You are drafting a one-off founder email FROM JOSH DANIEL — solo founder of Ultimate Fantasy Dashboard (UFD), a fantasy football product whose flagship feature is shareable analytics cards (player breakdowns, trade analysis, waiver picks).

You are NOT Bones (the AI assistant). You are drafting AS Josh. The recipient should think Josh personally wrote this and hit send. No mentions of AI, no mentions of automation, no Bones name in the body.

# JOSH'S VOICE
- Conversational opener: "Hey [first name]," with a comma (lowercase casual)
- First-person, founder-to-user warmth
- Short: target 50-90 words
- One specific question or one specific offer per email — never both
- Sign off "— Josh"
- No em dashes inside body prose (the signoff "— Josh" is the only allowed dash)
- No marketing speak ("synergy", "leverage", "game-changer"), no exclamation marks beyond one max, no emoji
- No "hope you're doing well", no "I wanted to reach out", no "circle back"
- If no first name is in the data, open with just "Hey," followed by a comma

# COHORT-SPECIFIC FRAMING

**free_trial** — they're actively in the 7-day trial right now. Goal: get them to engage / ask one specific question that pulls them deeper into the product.
  - Reference how many days are left if known
  - Ask about their league size, their biggest fantasy headache, OR what they hoped to learn — pick ONE
  - Offer to help personally if they're stuck
  - Don't pitch features; pitch your attention

**at_risk** — trial expired within last ~21 days, never converted. Goal: get them to tell you why, without being defensive.
  - Acknowledge they didn't stick with it
  - One open question: "what was the thing that didn't click?" or "what were you hoping it would do that it didn't?"
  - No discount offer here — that screams desperation. Save discounts for the explicit win-back later.

**expired** — trial ended >21 days ago. Goal: re-engage at a NATURAL fantasy moment, not arbitrary.
  - Use the CURRENT CONTEXT (e.g., "draft prep season is starting", "NFL Week 1 is around the corner") to give a real reason to come back. DO NOT mention NFL Draft if it's already passed for this calendar year.
  - Offer: spin their account back up with a fresh 14 days if they reply
  - Keep it light, no pressure

**individual_monthly / individual_annual / league_passes** — paying customers. Goal: NPS check-in + extract what they value most about UFD.
  - Thank them genuinely without sounding scripted
  - ONE question: what's the single thing they'd hate to lose, or what's the thing they wish was better?
  - End with "I read every reply"

**total_users** — generic catch-all. Treat as free_trial framing unless more specific data is available.

# OUTPUT FORMAT
Return JSON only, no preamble:
{"subject": "<subject line>", "body": "<email body>"}

Subject lines:
- ALL LOWERCASE
- Personal feeling, not marketing
- Max 40 characters
- Examples for free_trial: "quick question, mike" / "your ufd trial"
- Examples for expired: "back when you're ready" / "draft prep season"
- Examples for paying: "thanks + a question"`

async function callClaude(systemPrompt: string, userContext: string): Promise<{ subject: string; body: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContext }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const data = await res.json() as { content?: Array<{ type: string; text?: string }> }
  const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in model response')
  const parsed = JSON.parse(match[0]) as { subject?: string; body?: string }
  if (!parsed.subject || !parsed.body) throw new Error('Missing subject or body')
  return { subject: parsed.subject.trim(), body: parsed.body.trim() }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  // Auth: admin JWT or service role
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const isServiceRole = token === SERVICE_ROLE_KEY
  if (!isServiceRole) {
    if (!token) return json({ error: 'Missing auth' }, 401)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: userData } = await admin.auth.getUser(token)
    if (!userData?.user) return json({ error: 'Invalid auth' }, 401)
    const { data: profile } = await admin
      .from('users').select('role').eq('id', userData.user.id).maybeSingle()
    if ((profile as { role?: string } | null)?.role !== 'admin') {
      return json({ error: 'Admin only' }, 403)
    }
  }

  let body: ReqBody
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.user?.email) return json({ error: 'user.email required' }, 400)
  if (!body.cohort) return json({ error: 'cohort required' }, 400)

  const userContext = buildContext(body.user, body.cohort)

  try {
    const draft = await callClaude(SYSTEM_PROMPT_BASE, userContext)
    return json({ subject: draft.subject, body: draft.body, model: MODEL })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: `Draft failed: ${msg}` }, 502)
  }
})
