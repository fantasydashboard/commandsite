// CommandSite · draft-followup-emails-grace Edge Function
// ---------------------------------------------------------------------------
// Daily cron job. Drafts Touch 2 and Touch 3 for CHURCH leads (persona=grace).
// Mirrors draft-followup-emails for Ada but with Grace's pastoral voice and
// the two specific templates Josh has approved:
//
//   Touch 2 (Day 4-5): "Different angle on the same problem." Drift detection
//     wedge. The "moment that always gets me" pastoral story. Calendar link.
//
//   Touch 3 (Day 10-12): "Last note. I'll stop popping in after this."
//     Research-backed close + "There are others" disclaimer + video-on-reply
//     ask-trigger. NO new CTA.
//
// Auth:    Authorization: Bearer <admin user JWT>     (manual / on-demand)
//      OR  X-Cron-Secret: <FOLLOWUP_CRON_SECRET>      (Vercel cron)
//      OR  Authorization: Bearer <service_role>       (inter-function)
// Body:    {} (cron) or { lead_ids: string[] } (manual ad-hoc)
// Returns: { drafted, archived, errors, counts, processed }
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          FOLLOWUP_CRON_SECRET (optional)
//
// Persona scope: only acts on leads tagged 'persona_grace'. Ada's
// draft-followup-emails has been updated to filter OUT persona_grace
// leads so the two functions don't double-process.

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

const SYSTEM_PROMPT = `You are drafting the NEXT touch in a cold-email sequence to a PASTOR or church admin on behalf of Josh Daniel, founder of CommandSite. The first cold email (Touch 1) already went out and the pastor didn't reply. You are now drafting Touch 2 or Touch 3 based on which the caller asks for.

Voice is reflective, pastoral, brief, and human. Never sales-y. Never AI-jargon. Never the name "Grace" in the body.

# TOUCH 2 — drift detection wedge (sent ~3-5 days after Touch 1)

Goal: introduce a SECOND pain wedge (member drift) without repeating Touch 1's visitor-follow-up wedge. The "moment that always gets me" line is the load-bearing pastoral hook. Pastors recognize themselves in it.

Hard constraints:
- 95-125 words.
- Subject: \`re: a question\` (lowercase, threads with Touch 1's "pastor [firstname], a question" — Gmail keeps the conversation in the same thread).
- Open with a one-sentence fragment: "Different angle on the same problem."
- Use the "moment that always gets me" line ABOUT FINDING OUT a family quietly left. The plural-first-person ("a family we'd loved") is critical — signals you've been in the pew, not just selling to it.
- Use the escalation pattern: "Three Sundays missed becomes four, becomes six, becomes them at the church down the road." KEEP THIS VERBATIM. It's the highest-leverage sentence in the touch.
- Describe the drift-detection feature concretely: "It flags members who've missed three or more Sundays before they're gone for good. Your team sees the name. You decide whether to reach out." This emphasizes the pastor's agency.
- Include the social-proof line: "That's the part most pastors light up about."
- End with a soft calendar offer: "Calendar's here whenever it'd be useful: [calendar_link]" — but the link itself comes from context, NOT a placeholder.
- Signoff: "Josh" then "Founder, CommandSite" on the next line.
- NEVER re-pitch visitor follow-up (that was Touch 1).
- NEVER use "AI employee," "AI ministry assistant," or name Grace.
- NEVER use buzzwords (leverage, robust, scalable, transformative).
- NO em dashes in body prose.

## Touch 2 canonical template:

> Pastor [Name],
>
> Different angle on the same problem.
>
> In 20 years of ministry, the moment that always gets me is finding out a family we'd loved had quietly left, and we hadn't noticed. Three Sundays missed becomes four, becomes six, becomes them at the church down the road.
>
> The same tool watches for that, too. It flags members who've missed three or more Sundays before they're gone for good. Your team sees the name. You decide whether to reach out.
>
> That's the part most pastors light up about.
>
> Calendar's here whenever it'd be useful: [calendar_link]
>
> Josh
> Founder, CommandSite

# TOUCH 3 — graceful close + research + video-on-reply (sent ~7-10 days after Touch 1)

Goal: complete the cadence arc with pure release + a parting research drop + a re-surfaced video ask. NO CTA. The "There are others" line is the masterstroke — never modify or remove it.

Hard constraints:
- 90-115 words.
- Subject: \`one more, then I'll stop\` (lowercase, honest close-signaling).
- Open with: "Last note. I'll stop popping in after this." Two short sentences.
- Share research generously: "Wanted to share one piece of research even if we never talk again." NEVER use "even if our paths don't cross" (too precious).
- Cite the research: "The Effective Church Group has data worth seeing. Churches with a documented 48-hour follow-up system convert first-time visitors at 50-70%, compared to 10-20% nationally." Then the research link on its own line: [research_link]
- Re-offer the video on reply (NO link): "I can still send that 3-minute video walkthrough if you want it. Just reply."
- Include the keystone line VERBATIM: "Worth a read either way. The tool I built is one way to do this. There are others." DO NOT modify "There are others." It is the highest-converting line in the entire sequence.
- Close with: "Wishing you a strong Sunday." Warm without being Christianese. Never "praying for you" or "blessings."
- Signoff: "Josh" then "Founder, CommandSite" on the next line.
- NEVER use "AI employee," "AI ministry assistant," or name Grace.
- NEVER ask for a meeting, calendar booking, or click-through.
- NO em dashes in body prose.

## Touch 3 canonical template (with both links):

> Pastor [Name],
>
> Last note. I'll stop popping in after this.
>
> Wanted to share one piece of research even if we never talk again.
>
> The Effective Church Group has data worth seeing. Churches with a documented 48-hour follow-up system convert first-time visitors at 50-70%, compared to 10-20% nationally.
>
> [research_link]
>
> I can still send that 3-minute video walkthrough if you want it. Just reply.
>
> Worth a read either way. The tool I built is one way to do this. There are others.
>
> Wishing you a strong Sunday.
>
> Josh
> Founder, CommandSite

## Touch 3 no-research-link fallback:

If no research_link is provided in context, write the research paragraph WITHOUT a link line. Keep the rest of the email intact. Do NOT insert a placeholder URL.

# SIGNOFF PATTERN — both touches

\`\`\`
Josh
Founder, CommandSite
\`\`\`

Two lines. First name only. NO "20 years in church ministry" in the signoff — that credential already appeared in Touch 1 and (for Touch 2) in the body.

# CALL THE TOOL

Call save_followup_draft with:
- subject: per the rules above
- body: per the canonical template, with names + links filled in from context
- touch_number: 2 or 3 (matches the input touch_number)
- rationale: ONE sentence on why this specific draft for this specific pastor`

const TOOLS = [
  {
    name: 'save_followup_draft',
    description: 'Save the followup email draft for this church lead.',
    input_schema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Touch 2: "re: a question" (lowercase, threads with Touch 1). Touch 3: "one more, then I\'ll stop" (lowercase).',
        },
        body: {
          type: 'string',
          description: 'Touch 2: 95-125 words, drift-detection wedge using "moment that always gets me" pastoral hook, escalation pattern ("Three Sundays missed becomes four..."), feature description, social proof, soft calendar offer. Touch 3: 90-115 words, "Last note. I\'ll stop popping in after this." opener, research citation + link, video-on-reply ask, keystone "There are others" line VERBATIM, "Wishing you a strong Sunday." close. Both touches signoff as "Josh" + "Founder, CommandSite". No em dashes, no buzzwords, no name "Grace" in body.',
        },
        touch_number: { type: 'integer', enum: [2, 3] },
        rationale: { type: 'string', description: 'One sentence: why this specific draft for this specific pastor.' },
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
  last_send_subject: string | null
  last_send_body: string | null
}

function buildUserMessage(
  lead: LeadCandidate,
  touchNumber: 2 | 3,
  calendarLink: string | null,
  researchLink: string | null,
): string {
  const lines: string[] = []
  lines.push(`# THIS IS TOUCH ${touchNumber} FOR A CHURCH (GRACE PERSONA)`)
  lines.push('')
  lines.push(`# THE PASTOR / CHURCH`)
  lines.push(`Church name: ${lead.company_name}`)
  if (lead.contact_name) lines.push(`Pastor / contact: ${lead.contact_name}`)
  if (lead.industry) lines.push(`Type: ${lead.industry}`)
  if (lead.city || lead.state) lines.push(`Location: ${lead.city ?? ''} ${lead.state ?? ''}`.trim())
  if (lead.tags && lead.tags.length > 0) lines.push(`Tags: ${lead.tags.join(', ')}`)
  if (lead.icp_score_reason) lines.push(`Why this lead matters: ${lead.icp_score_reason}`)
  lines.push('')
  lines.push(`# WHAT JOSH SENT THEM ${touchNumber === 2 ? '~3-5 days ago' : 'in earlier touches'} (DO NOT REPEAT)`)
  if (lead.last_send_subject) lines.push(`Subject: ${lead.last_send_subject}`)
  if (lead.last_send_body) lines.push(`Body:\n${lead.last_send_body}`)
  lines.push('')

  if (touchNumber === 2) {
    if (calendarLink) {
      lines.push(`# CALENDAR LINK FOR TOUCH 2 — INCLUDE IN THE EMAIL`)
      lines.push(`calendar_link: ${calendarLink}`)
    } else {
      lines.push(`# CALENDAR LINK NOT CONFIGURED`)
      lines.push(`Skip the calendar line entirely. Just leave the soft invitation as the last beat before signoff. Replace the calendar line with: "If you want to look at it together, I'm here."`)
    }
  }

  if (touchNumber === 3) {
    if (researchLink) {
      lines.push(`# RESEARCH LINK FOR TOUCH 3 — INCLUDE IN THE EMAIL`)
      lines.push(`research_link: ${researchLink}`)
    } else {
      lines.push(`# RESEARCH LINK NOT CONFIGURED`)
      lines.push(`Write the research paragraph WITHOUT a link line. Keep the rest of the email intact. Do NOT insert a placeholder URL.`)
    }
  }

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
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
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
  if (!toolUse?.input) return { error: 'Model did not call save_followup_draft' }
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

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const isServiceRole = jwt === serviceRoleKey

  if (!isCron && !isServiceRole) {
    if (!jwt) return json({ error: 'Missing authorization' }, 401)
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
    const { data: caller } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle()
    if (!caller || (caller as { role: string }).role !== 'admin') return json({ error: 'Admin only' }, 403)
  }

  let body: { lead_ids?: string[] } = {}
  try { body = await req.json() } catch { body = {} }

  const explicitIds = Array.isArray(body.lead_ids)
    ? body.lead_ids.filter((id) => typeof id === 'string' && id.length > 0)
    : []

  // Read links from settings. Grace uses persona-specific URLs:
  //   - calendly_link_grace: church-specific Calendly URL (different from
  //     the Ada/services URL stored in calendly_link). Falls back to the
  //     generic calendly_link if the Grace-specific one isn't set.
  //   - research_link: third-party research URL cited in Touch 3. Falls
  //     back to omitting the URL line entirely if not set.
  const { data: settingsRow } = await admin
    .from('cs_settings')
    .select('calendly_link, calendly_link_grace, research_link')
    .eq('id', 1)
    .maybeSingle()
  type SettingsShape = {
    calendly_link?: string | null
    calendly_link_grace?: string | null
    research_link?: string | null
  }
  const settings = (settingsRow as SettingsShape | null) ?? {}
  const calendarLink = settings.calendly_link_grace?.trim()
    || settings.calendly_link?.trim()
    || null
  const researchLink = settings.research_link?.trim() || null

  // ── Window-based candidate query, FILTERED to persona_grace leads ────────
  // Touch 2: send_count = 1, last_contacted 3-4.5 days ago
  // Touch 3: send_count = 2, last_contacted 7-8.5 days ago
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
    // Manual mode: still requires persona_grace tag so this function only
    // ever acts on Grace leads. If you want to manually draft an Ada
    // followup, call the other function.
    const { data } = await admin
      .from('cs_leads')
      .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score_reason, notes, send_count, last_contacted_at, tags')
      .in('id', explicitIds)
      .not('contact_email', 'is', null)
      .eq('status', 'contacted')
      .eq('outreach_paused', false)
      .contains('tags', ['persona_grace'])
    const rows = (data ?? []) as CandidateRow[]
    candidatesT2 = rows.filter((r) => r.send_count === 1)
    candidatesT3 = rows.filter((r) => r.send_count === 2)
  } else {
    const t2 = await admin
      .from('cs_leads')
      .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score_reason, notes, send_count, last_contacted_at, tags')
      .eq('status', 'contacted')
      .eq('outreach_paused', false)
      .eq('send_count', 1)
      .gte('last_contacted_at', touch2WindowStart)
      .lte('last_contacted_at', touch2WindowEnd)
      .not('contact_email', 'is', null)
      .contains('tags', ['persona_grace'])
    candidatesT2 = (t2.data ?? []) as CandidateRow[]

    const t3 = await admin
      .from('cs_leads')
      .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score_reason, notes, send_count, last_contacted_at, tags')
      .eq('status', 'contacted')
      .eq('outreach_paused', false)
      .eq('send_count', 2)
      .gte('last_contacted_at', touch3WindowStart)
      .lte('last_contacted_at', touch3WindowEnd)
      .not('contact_email', 'is', null)
      .contains('tags', ['persona_grace'])
    candidatesT3 = (t3.data ?? []) as CandidateRow[]
  }

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

    const userMessage = buildUserMessage(lead, touchNumber, calendarLink, researchLink)
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

    const tagToAdd = `followup_drafted_touch_${touchNumber}`
    const existingTags = (c.tags ?? []) as string[]
    const tags = [...new Set([...existingTags, tagToAdd, 'cold_email_drafted'])]
    const updPayload = {
      draft_cold_email_subject: result.subject,
      draft_cold_email_body: result.body,
      draft_cold_email_rationale: result.rationale,
      draft_cold_email_signal: `Touch ${touchNumber} followup (Grace)`,
      draft_cold_email_at: new Date().toISOString(),
      draft_cold_email_model: MODEL,
      draft_state: 'ready_for_review',
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
    persona: 'grace',
    drafted,
    errors: errors.length > 0 ? errors : undefined,
    counts,
    processed: candidatesT2.length + candidatesT3.length,
    model: MODEL,
  })
})
