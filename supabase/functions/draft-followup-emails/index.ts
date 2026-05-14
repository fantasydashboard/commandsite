// CommandSite · draft-followup-emails Edge Function
// ---------------------------------------------------------------------------
// Daily cron job. Scans cs_leads for prospects who got a cold email
// but haven't replied. Drafts the next touch in the sequence:
//
//   - send_count = 1, last_contacted ~3 days ago → Touch 2 (soft check-in)
//   - send_count = 2, last_contacted ~7 days ago → Touch 3 (breakup)
//   - send_count >= 3, last_contacted >= 14 days ago → archive
//
// Drafts are written to cs_leads.draft_cold_email_* (overwriting the
// previous touch's draft — the original is preserved in
// cs_outreach_sends). Tagged with followup_drafted_touch_N so the UI
// can show a Touch N badge in Ready to send.
//
// Conservative mode: NEVER auto-sends. Josh approves each draft via
// the existing "Open Gmail + mark sent" flow.
//
// Auth:    Authorization: Bearer <admin user JWT>     (manual / on-demand)
//      OR  X-Cron-Secret: <FOLLOWUP_CRON_SECRET>      (Vercel cron)
// Body:    {} (cron) or { lead_ids: string[] } (manual ad-hoc)
// Returns: { drafted: {...}, archived: number, counts: {...}, processed: number }
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          FOLLOWUP_CRON_SECRET (optional)

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { COMMANDSITE_KB } from '../_shared/commandsite-kb.ts'

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

const SYSTEM_PROMPT = `You are Ada, drafting the NEXT touch in a cold-email sequence on behalf of Josh Daniel, founder of CommandSite. The first cold email already went out and the prospect didn't reply. You are now drafting the next nudge.

Two cases:

# TOUCH 2 (honest takeaway, sent ~3 days after the first cold email)

Goal: re-surface the thread by HONESTLY QUALIFYING them, not by checking in. The takeaway pattern works because it removes social pressure (you're filtering THEM, they're not being sold) and triggers reciprocity (they want to confirm they qualify).

Hard constraints:
- 35-55 words.
- BANNED PHRASES — NEVER use any of these or close variants. They scream "templated follow-up" and tank reply rates:
  • "circling back"
  • "checking in"
  • "just following up"
  • "did this slip past"
  • "in case it got buried"
  • "bumping this up"
  • "wanted to make sure"
- Open with an HONEST takeaway: "honestly not sure if [Company] is the right size for what I do" OR a near-variant. The opener signals you're qualifying THEM.
- Drop TWO concrete pain criteria the lead would self-recognize against. Both must be SPECIFIC (numbers or named symptoms), not abstract. Never say "AI", "automation", "operations", "workflows", "tech stack" — those are empty category words.
- Close with a graceful out: "if neither's bothering you, I'd be wasting your time" / "if that's not you, ignore me" / similar.
- Do NOT re-pitch the product. Do NOT re-quote reviews from Touch 1. Do NOT use the name "Ada".

Pick the TWO pains from this menu based on the lead's industry. Always pick two that pair naturally — one operational + one revenue, where possible.

SERVICE-BUSINESS pain menu (use for HVAC, plumbing, electrical, roofing, landscaping, pool, pest, cleaning):
- Missed after-hours calls (use a number: "5+ a week", "10+ a week")
- Quotes going cold without follow-up (use a number: "10+ quotes a month", "half your quotes")
- Reviews you should be collecting but aren't ("most happy customers leave without a review ask")
- Dormant customers slipping away ("customers from 2+ years ago you've lost track of")
- Permits / scheduling chaos eating dispatcher time
- Owner answering the phone after 5pm because no one else can

CHURCH pain menu (use when Industry contains "Church", "Ministry", "Cathedral", "Parish", or any tag includes "church" / "ministry" / "tier-large" / "tier-multi-congregation"):
- Guest visitors who fill out a card and never hear back
- Volunteer coordination eating staff time on Mondays
- Member care follow-ups (hospital visits, life events) falling through cracks
- Prayer requests piling up unread
- New small group connections that never get made
- Sunday attendance numbers that don't translate into actual relationships

Subject line: same as before — "Re: <original subject>" so Gmail threads it.

EXAMPLE — HVAC lead (Tony's HVAC, owner Tony):
> Re: quick question for tony
>
> Hey Tony, honestly not sure if Tony's HVAC is the right size for what I do. If you're missing 5+ after-hours calls a week, or quotes keep going cold without follow-up, worth a 15-min chat. If neither's bothering you, I'd be wasting your time.
>
> — Josh

EXAMPLE — Roofing lead (Acme Roofing, contact Mike):
> Re: quick question for mike
>
> Hey Mike, honestly not sure if Acme Roofing is the right size for what I do. If you're sending 10+ quotes a month and most go cold without a follow-up, or your happy customers walk away without leaving a review, worth a 15-min chat. If neither's true, ignore me.
>
> — Josh

EXAMPLE — Church lead (Cornerstone Community Church, contact Pastor Jeff):
> Re: quick question for pastor jeff
>
> Hey Pastor, honestly not sure if Cornerstone is the right size for what I do. If guest visitors keep slipping past follow-up, or volunteer coordination is eating up your Mondays, worth a 15-min chat. If neither's a real issue, no worries.
>
> — Josh

# TOUCH 3 (breakup, sent ~7 days after the first cold email)

Goal: respect their time, give them an easy out, leave the door open. The "permission to close the loop" framing has the highest reply rate of any followup pattern.

Hard constraints:
- 30-50 words.
- Frame this as the LAST email. ("Last time I'll reach out", "I'll stop after this", "closing the loop").
- Offer a one-word reply path: "yes / no / not now / wrong person".
- Leave the door open at the end ("if anything changes...").

Example shape:
> Hey, I'm closing the loop on this one.
>
> Totally fine if this isn't a fit right now — just hit reply with "not now" or "wrong person" and I'll stop. If your call volume keeps growing and you ever want to see what my AI employee would catch for [Company], you know where to find me.
>
> — Josh

# SUBJECT LINES

For Touch 2: Use Re: with the original subject. Gmail threads it.
- If original subject was "quick question for tony" → "Re: quick question for tony"
- This is the ONLY place "Re:" is allowed; first touches never use it.

For Touch 3: New subject, lowercase, max 33 chars.
- "last note from josh"
- "closing the loop"
- "stopping here, [first_name]"
- Pick one that fits.

# JOSH'S VOICE — same as the first touch

- Conversational opener: "Hey, I'm..." (comma after Hey, always include "I'm" — don't drop the subject)
- Casual sign-off "— Josh"
- Run-on sentences with "and"/"but" connectors are fine
- NO em dashes inside body prose (only "— Josh" signoff)
- NEVER use the name "Ada" — say "my AI employee" or "this". The prospect hasn't been introduced to Ada by name yet (that happens on the discovery call).
- NO buzzwords, NO emoji, NO "I hope this helps", NO "looking forward to hearing"
- Match the tone of the original cold email's voice — read it before drafting

# CALL THE TOOL

Call save_followup_draft with:
- subject: per the rules above
- body: per the rules above
- touch_number: 2 or 3 (matches the input touch_number)
- rationale: ONE sentence on why this specific framing for this specific lead`

const TOOLS = [
  {
    name: 'save_followup_draft',
    description: 'Save the followup email draft for this lead.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Touch 2: "Re: <original subject>". Touch 3: new lowercase subject ≤33 chars.' },
        body: { type: 'string', description: 'Touch 2: 35-55 words, honest takeaway + 2 specific pains. Touch 3: 30-50 words, breakup pattern. Match Josh\'s voice. No em dashes inside prose.' },
        touch_number: { type: 'integer', enum: [2, 3] },
        rationale: { type: 'string', description: 'One sentence: why this specific framing.' },
      },
      required: ['subject', 'body', 'touch_number', 'rationale'],
    },
  },
]

interface LeadCandidate {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  industry: string | null
  city: string | null
  state: string | null
  icp_score_reason: string | null
  notes: string | null
  send_count: number
  last_contacted_at: string
  tags: string[] | null
  // Most recent send (the one we're following up on)
  last_send_subject: string | null
  last_send_body: string | null
}

function buildUserMessage(lead: LeadCandidate, touchNumber: 2 | 3): string {
  const lines: string[] = []
  lines.push(`# THIS IS TOUCH ${touchNumber}`)
  lines.push('')
  lines.push(`# THE PROSPECT`)
  lines.push(`Company: ${lead.company_name}`)
  if (lead.contact_name) lines.push(`Contact: ${lead.contact_name}`)
  if (lead.industry) lines.push(`Industry: ${lead.industry}`)
  if (lead.city || lead.state) lines.push(`Location: ${lead.city ?? ''} ${lead.state ?? ''}`.trim())
  if (lead.tags && lead.tags.length > 0) lines.push(`Tags: ${lead.tags.join(', ')}`)
  if (lead.icp_score_reason) lines.push(`Why this lead matters: ${lead.icp_score_reason}`)
  lines.push('')
  lines.push(`# WHAT JOSH SENT THEM ${touchNumber === 2 ? '~3 days ago' : 'in earlier touches'} (DO NOT REPEAT)`)
  if (lead.last_send_subject) lines.push(`Subject: ${lead.last_send_subject}`)
  if (lead.last_send_body) lines.push(`Body:\n${lead.last_send_body}`)
  lines.push('')
  lines.push(`Now draft Touch ${touchNumber}. Call save_followup_draft.`)
  return lines.join('\n')
}

interface DraftResult {
  subject: string
  body: string
  touch_number: 2 | 3
  rationale: string
}

async function callAnthropic(userMessage: string, apiKey: string): Promise<DraftResult | { error: string }> {
  const body = {
    model: MODEL,
    max_tokens: 800,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT + '\n\n# ADA\'S KNOWLEDGE BASE (for context — DO NOT re-pitch from this)\n\n' + COMMANDSITE_KB,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: TOOLS,
    tool_choice: { type: 'tool', name: 'save_followup_draft' },
    messages: [{ role: 'user', content: userMessage }],
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { error: `Anthropic ${res.status}: ${text.slice(0, 300)}` }
  }

  // deno-lint-ignore no-explicit-any
  const data = await res.json() as { content?: Array<{ type: string; name?: string; input?: any }> }
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_followup_draft')
  if (!toolUse?.input) return { error: 'Ada did not call save_followup_draft' }
  return toolUse.input as DraftResult
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

  const cronSecret = req.headers.get('X-Cron-Secret') ?? req.headers.get('x-cron-secret') ?? ''
  const expectedCron = Deno.env.get('FOLLOWUP_CRON_SECRET') ?? ''
  const isCron = expectedCron.length > 0 && cronSecret === expectedCron

  if (!isCron) {
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!jwt) return json({ error: 'Missing authorization' }, 401)
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
    const { data: caller } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle()
    if (!caller || (caller as { role: string }).role !== 'admin') return json({ error: 'Admin only' }, 403)
  }

  // Body — for ad-hoc manual run
  let body: { lead_ids?: string[] } = {}
  try { body = await req.json() } catch { body = {} }
  const explicitIds = Array.isArray(body.lead_ids)
    ? body.lead_ids.filter((id) => typeof id === 'string' && id.length > 0)
    : []

  // ── 1. Auto-archive: send_count >= 3 AND last_contacted >= 14 days ago AND status = contacted
  const archiveCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  let archivedCount = 0
  if (!explicitIds.length) {
    const { data: toArchive } = await admin
      .from('cs_leads')
      .select('id, tags')
      .eq('status', 'contacted')
      .gte('send_count', 3)
      .lt('last_contacted_at', archiveCutoff)
    for (const l of (toArchive ?? []) as { id: string; tags: string[] | null }[]) {
      const tags = [...new Set([...(l.tags ?? []), 'no_response'])]
      await admin.from('cs_leads').update({ status: 'archived', tags } as never).eq('id', l.id)
      archivedCount++
    }
  }

  // ── 2. Find followup candidates
  // Touch 2: send_count = 1, last_contacted between 3 and 4.5 days ago
  // Touch 3: send_count = 2, last_contacted between 7 and 8.5 days ago
  // Window is wider than 24h so a missed cron run still catches them next day.
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const touch2WindowStart = new Date(now - 4.5 * day).toISOString()
  const touch2WindowEnd = new Date(now - 3 * day).toISOString()
  const touch3WindowStart = new Date(now - 8.5 * day).toISOString()
  const touch3WindowEnd = new Date(now - 7 * day).toISOString()

  type CandidateRow = {
    id: string
    company_name: string
    contact_name: string | null
    contact_email: string | null
    industry: string | null
    city: string | null
    state: string | null
    icp_score_reason: string | null
    notes: string | null
    send_count: number
    last_contacted_at: string
    tags: string[] | null
  }

  let candidatesT2: CandidateRow[] = []
  let candidatesT3: CandidateRow[] = []

  if (explicitIds.length > 0) {
    // Manual mode: take whatever was passed and figure out the touch from send_count
    const { data } = await admin
      .from('cs_leads')
      .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score_reason, notes, send_count, last_contacted_at, tags')
      .in('id', explicitIds)
      .not('contact_email', 'is', null)
      .eq('status', 'contacted')
    const rows = (data ?? []) as CandidateRow[]
    candidatesT2 = rows.filter((r) => r.send_count === 1)
    candidatesT3 = rows.filter((r) => r.send_count === 2)
  } else {
    // Cron mode: window-based query
    const t2 = await admin
      .from('cs_leads')
      .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score_reason, notes, send_count, last_contacted_at, tags')
      .eq('status', 'contacted')
      .eq('send_count', 1)
      .gte('last_contacted_at', touch2WindowStart)
      .lte('last_contacted_at', touch2WindowEnd)
      .not('contact_email', 'is', null)
    candidatesT2 = (t2.data ?? []) as CandidateRow[]

    const t3 = await admin
      .from('cs_leads')
      .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score_reason, notes, send_count, last_contacted_at, tags')
      .eq('status', 'contacted')
      .eq('send_count', 2)
      .gte('last_contacted_at', touch3WindowStart)
      .lte('last_contacted_at', touch3WindowEnd)
      .not('contact_email', 'is', null)
    candidatesT3 = (t3.data ?? []) as CandidateRow[]
  }

  // ── 3. For each candidate, pull the most recent send (so Ada knows what NOT to repeat)
  const drafted: Record<string, DraftResult> = {}
  const errors: string[] = []
  const counts = { drafted: 0, failed: 0, touch2: 0, touch3: 0 }

  async function processCandidate(c: CandidateRow, touchNumber: 2 | 3): Promise<void> {
    const { data: lastSend } = await admin
      .from('cs_outreach_sends')
      .select('subject, body')
      .eq('lead_id', c.id)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const ls = lastSend as { subject: string | null; body: string | null } | null

    const lead: LeadCandidate = {
      ...c,
      last_send_subject: ls?.subject ?? null,
      last_send_body: ls?.body ?? null,
    }

    const userMessage = buildUserMessage(lead, touchNumber)
    const result = await callAnthropic(userMessage, anthropicKey!)
    if ('error' in result) {
      counts.failed++
      errors.push(`${c.company_name}: ${result.error}`)
      return
    }

    drafted[c.id] = result
    counts.drafted++
    if (touchNumber === 2) counts.touch2++
    else counts.touch3++

    // Persist — overwrite draft fields, tag with the touch number
    const tagToAdd = `followup_drafted_touch_${touchNumber}`
    const existingTags = (c.tags ?? []) as string[]
    const tags = [...new Set([...existingTags, tagToAdd, 'cold_email_drafted'])]
    const updPayload = {
      draft_cold_email_subject: result.subject,
      draft_cold_email_body: result.body,
      draft_cold_email_rationale: result.rationale,
      draft_cold_email_signal: `Touch ${touchNumber} followup`,
      draft_cold_email_at: new Date().toISOString(),
      draft_cold_email_model: MODEL,
      tags,
    }
    const { error: updErr } = await admin
      .from('cs_leads').update(updPayload as never).eq('id', c.id)
    if (updErr) errors.push(`${c.company_name} (DB write): ${updErr.message}`)
  }

  for (const c of candidatesT2) await processCandidate(c, 2)
  for (const c of candidatesT3) await processCandidate(c, 3)

  return json({
    trigger: isCron ? 'cron' : 'manual',
    drafted,
    archived: archivedCount,
    errors: errors.length > 0 ? errors : undefined,
    counts,
    processed: candidatesT2.length + candidatesT3.length,
    model: MODEL,
  })
})
