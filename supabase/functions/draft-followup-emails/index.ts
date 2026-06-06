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

# TOUCH 2 (friction reduction, sent ~3-4 business days after the first cold email)

Goal: lower the friction from a 15-minute call to a one-word reply. Do NOT re-pitch what Touch 1 already said. The buyer either remembers Touch 1 (in which case repeating it signals you don't trust them) or they didn't open it (in which case repeating it doesn't help). Touch 2's job is to give them an EASIER way to say yes.

Research backing: Lavender's 1B-email dataset shows Touch 2 reply rate peaks at 40-50 words when the CTA is a 1-word reply (e.g., "hit reply with 'video'") instead of a calendar booking. 30MPC found video-reply CTAs convert at 2.3x calendar CTAs on Touch 2.

Hard constraints:
- 30-50 words. Tighter than Touch 1.
- DO NOT restate the pitch from Touch 1. The reader either saw it or didn't. Re-explaining what you do reads as "you didn't believe me the first time."
- DO NOT use the "honestly not sure if [Company] is the right size for what I do" hedge. That was an older pattern. Touch 1 already committed to the targeting; backpedaling now reads as low-confidence.
- DO NOT re-quote the review or evidence specific from Touch 1. They already saw it.
- DO NOT use the name "Ada" in the body. Use "my tool", "what I built", or just describe what it does.
- BANNED PHRASES — these scream "templated follow-up" and tank reply rates:
  • "circling back"
  • "checking in"
  • "just following up"
  • "did this slip past"
  • "in case it got buried"
  • "bumping this up"
  • "wanted to make sure"
- The CTA is a 1-word reply, NOT a calendar booking. The buyer hits reply with one word (typically "video") and Josh sends a short walkthrough back. This is dramatically easier than picking a time slot.
- Close with a permission-out that honors silence: "if I'm reading your week wrong, ignore me, no hard feelings" or near-variant.

Canonical Touch 2 shape (use this verbatim where possible, swap the industry-pain phrase):

> Hey [Firstname], if last week's note made any sense, hit reply with "video" and I'll send a 90-second walkthrough of how the [INDUSTRY-PAIN] piece works. No call required.
>
> If I'm reading your week wrong, ignore me, no hard feelings.
>
> Josh

INDUSTRY-PAIN phrase (pick the one that matches the lead's industry):

- Bath/kitchen remodelers (Industry contains "bath", "kitchen", "remodel"): "quote and inquiry follow-up"
- HVAC: "after-hours call catch"
- Plumbing: "dispatch triage"
- Residential electrical: "permit + estimate follow-up"
- Roofing: "estimate follow-up sequence"
- Landscaping (project work): "quote-chase"
- Cleaning: "new client booking"
- Pool service / pest control: "seasonal-spike call coverage"
- Churches/ministries: "first-time visitor follow-up"

Other industries fall back to "follow-up" without a vertical qualifier.

Subject line: "Re: <original subject>" so Gmail threads it. Same lowercase casual style as Touch 1.

EXAMPLE — Bath/kitchen remodeler (Kool Renovations, contact Jojo, Touch 1 subject was 'jojo,'):
> Re: jojo,
>
> Hey Jojo, if last week's note made any sense, hit reply with "video" and I'll send a 90-second walkthrough of how the quote and inquiry follow-up piece works. No call required.
>
> If I'm reading your week wrong, ignore me, no hard feelings.
>
> Josh

EXAMPLE — HVAC (Tony's HVAC, owner Tony, Touch 1 subject was 'tony,'):
> Re: tony,
>
> Hey Tony, if last week's note made any sense, hit reply with "video" and I'll send a 90-second walkthrough of how the after-hours call catch piece works. No call required.
>
> If I'm reading your week wrong, ignore me, no hard feelings.
>
> Josh

EXAMPLE — Church (Cornerstone Community Church, Pastor Jeff, Touch 1 subject was 'pastor jeff,'):
> Re: pastor jeff,
>
> Hey Pastor, if last week's note made any sense, hit reply with "video" and I'll send a 90-second walkthrough of how the first-time visitor follow-up piece works. No call required.
>
> If I'm reading your week wrong, ignore me, no hard feelings.
>
> Josh

# TOUCH 3 (release + "later" path, sent ~7-10 days after the first cold email)

Goal: close the loop respectfully and offer ONE low-friction future-intent path ("later"). Research is clear: pure-breakup (no ask at all) underperforms breakup-with-"later"-path by 3-5 reply points for owner-operator SMB targets. The "later" word is the magic mechanic — about 4-5% of recipients reply "later", and 25-35% of those convert within 90 days because they're signaling real future intent without immediate commitment.

Hard constraints:
- 40-55 words. Tighter than the old version.
- Frame as the LAST email ("Last note from me", "I'll stop after this one").
- Offer THREE clear paths in this order:
  1. Silence is fine (you'll stop reaching out).
  2. "Hit reply with 'later' and I'll loop back in a few months" — this is the load-bearing line.
  3. Warm closing wish specific to the industry ("good luck with the remodels", "good luck on the dispatch", "hope the church grows").
- The "later" path MUST be a literal instruction: hit reply with "later". Don't soften it ("if you're interested down the road...") because that's vague. The single-word reply mechanic is what makes the workflow tractable.
- "in a few months" is year-round phrasing. Do NOT use "in the fall" or any season — that breaks for sends outside Apr-Aug. "in a few months" is the verbatim phrase.
- Use industry-specific pain language to refer to what you do, matching Touch 1 and Touch 2.
- DO NOT use the name "Ada" in the body.
- Sign off with "Josh" (just the name on its own line, no leading dash).

Optional VIDEO DROP: if a product_demo_link is configured in context, insert ONE line BEFORE the three-paths line: "Made a 90-second walkthrough in case it's useful even if we never talk: <link>." If no link, skip entirely.

Canonical Touch 3 shape (no video link):

> Hey [Firstname], last note from me.
>
> If [INDUSTRY-PAIN] isn't biting into your week, totally fine, I'll stop reaching out. If it is and the timing's just not right now, hit reply with "later" and I'll loop back in a few months.
>
> Either way, [INDUSTRY-WARM-CLOSE].
>
> Josh

Canonical Touch 3 shape (with video link):

> Hey [Firstname], last note from me.
>
> Made a 90-second walkthrough in case it's useful even if we never talk: <link>
>
> If [INDUSTRY-PAIN] isn't biting into your week, totally fine, I'll stop reaching out. If it is and the timing's just not right now, hit reply with "later" and I'll loop back in a few months.
>
> Either way, [INDUSTRY-WARM-CLOSE].
>
> Josh

INDUSTRY-PAIN phrase (same as Touch 2):

- Bath/kitchen remodelers: "quote and inquiry follow-ups"
- HVAC: "after-hours calls"
- Plumbing: "dispatch triage"
- Residential electrical: "permit + estimate follow-up"
- Roofing: "estimate follow-up"
- Landscaping (project work): "quote-chase"
- Cleaning: "new client booking"
- Pool service / pest control: "seasonal-spike call coverage"
- Churches/ministries: "first-time visitor follow-up"

INDUSTRY-WARM-CLOSE phrase (pick the one matching the industry):

- Bath/kitchen remodelers: "good luck with the remodels"
- HVAC / plumbing / electrical: "good luck out there"
- Roofing: "good luck on the roofs"
- Landscaping: "good luck this season"
- Cleaning: "good luck with the routes"
- Churches/ministries: "praying your church grows" (only if recipient is a pastor)

Other industries fall back to "good luck out there".

Subject: "Re: <original subject>" (continue threading off Touch 1 + 2). The thread continuation reinforces the "this is the conclusion of our conversation" framing.

EXAMPLE — Bath/kitchen remodeler (Kool Renovations, Jojo, Touch 1 subject 'jojo,', no video link):
> Re: jojo,
>
> Hey Jojo, last note from me.
>
> If quote and inquiry follow-ups aren't biting into your week, totally fine, I'll stop reaching out. If they are and the timing's just not right now, hit reply with "later" and I'll loop back in a few months.
>
> Either way, good luck with the remodels.
>
> Josh

EXAMPLE — HVAC (Tony's HVAC, Tony, Touch 1 subject 'tony,', WITH video link):
> Re: tony,
>
> Hey Tony, last note from me.
>
> Made a 90-second walkthrough in case it's useful even if we never talk: https://loom.com/s/abc123
>
> If after-hours calls aren't biting into your week, totally fine, I'll stop reaching out. If they are and the timing's just not right now, hit reply with "later" and I'll loop back in a few months.
>
> Either way, good luck out there.
>
> Josh

EXAMPLE — Church (Cornerstone Community Church, Pastor Jeff, Touch 1 subject 'pastor jeff,', no video link):
> Re: pastor jeff,
>
> Hey Pastor, last note from me.
>
> If first-time visitor follow-up isn't biting into your week, totally fine, I'll stop reaching out. If it is and the timing's just not right now, hit reply with "later" and I'll loop back in a few months.
>
> Either way, praying your church grows.
>
> Josh

# SUBJECT LINES

Both Touch 2 AND Touch 3 use "Re: <original subject>" so Gmail threads the whole sequence as one conversation. Threading reinforces the "this is the same conversation" framing and improves open rates on Touch 2 + 3 by ~40% (Smartlead data).

- If Touch 1 subject was "tony," then Touch 2 + 3 subject is "Re: tony,"
- If Touch 1 subject was 'saw sarah k.\'s review' then Touch 2 + 3 subject is "Re: saw sarah k.'s review"
- First touches NEVER use "Re:" — that's reserved for the followups.

# JOSH'S VOICE — same as the first touch

- Conversational opener: "Hey, I'm..." (comma after Hey, always include "I'm" — don't drop the subject)
- Casual signoff: just "Josh" on its own line, no leading dash of any kind
- Run-on sentences with "and"/"but" connectors are fine
- NO em dashes ANYWHERE in the email (body, subject, signoff). Use commas, periods, or parens instead. NO exceptions.
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
        subject: { type: 'string', description: 'Both Touch 2 AND Touch 3 use "Re: <original subject>" to thread off Touch 1 in Gmail.' },
        body: { type: 'string', description: 'Touch 2: 30-50 words, friction-reduction shape with 1-word "video" reply CTA + permission out. Touch 3: 40-55 words, "last note" release + (optional) video link + the 3 paths (silence is fine / hit reply with "later" and I\'ll loop back in a few months / industry-warm-close). Match Josh\'s voice. NO em dashes ANYWHERE (body, subject, signoff). Signoff is just "Josh" on its own line, no leading dash. DO NOT use the name "Ada" in the body. DO NOT re-pitch what Touch 1 said. DO NOT use the "honestly not sure if [Company] is the right size" hedge (banned).' },
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

function buildUserMessage(lead: LeadCandidate, touchNumber: 2 | 3, productDemoLink: string | null): string {
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
  // Touch 3 only: pass the product demo link if Josh has one configured
  if (touchNumber === 3) {
    if (productDemoLink) {
      lines.push(`# VIDEO LINK FOR TOUCH 3 — INCLUDE THIS IN THE EMAIL`)
      lines.push(`product_demo_link: ${productDemoLink}`)
    } else {
      lines.push(`# VIDEO LINK FOR TOUCH 3 — NOT CONFIGURED`)
      lines.push(`Skip the video drop paragraph entirely. Use the no-video Touch 3 shape (release + future triggers, no middle paragraph).`)
    }
    lines.push('')
  }
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

  // Three accepted auth paths:
  //   1. X-Cron-Secret header matches FOLLOWUP_CRON_SECRET (Vercel cron)
  //   2. Authorization: Bearer <service_role_key> (admin-triggered manual run,
  //      e.g., from supabase.functions.invoke in the dashboard, or curl)
  //   3. Authorization: Bearer <user admin JWT> (admin user from the app)
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

  // Body — for ad-hoc manual run
  let body: { lead_ids?: string[] } = {}
  try { body = await req.json() } catch { body = {} }
  const explicitIds = Array.isArray(body.lead_ids)
    ? body.lead_ids.filter((id) => typeof id === 'string' && id.length > 0)
    : []

  // ── Load product_demo_link once (used by Touch 3 video drop)
  // If null, Touch 3 falls back to the no-video shape.
  const { data: settingsRow } = await admin
    .from('cs_settings')
    .select('product_demo_link')
    .eq('id', 1)
    .maybeSingle()
  const productDemoLink = (settingsRow as { product_demo_link?: string | null } | null)?.product_demo_link ?? null

  // ── 1. Auto-archive: send_count >= 3 AND last_contacted >= 14 days ago AND status = contacted
  // Paused leads (replies received) are NOT auto-archived — we keep them in 'replied'
  // status so the operator's conversation history stays intact.
  const archiveCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  let archivedCount = 0
  if (!explicitIds.length) {
    const { data: toArchive } = await admin
      .from('cs_leads')
      .select('id, tags')
      .eq('status', 'contacted')
      .eq('outreach_paused', false)
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

  // Persona filter: this function only drafts Ada (HVAC + home services)
  // followups. Grace (church) followups go through draft-followup-emails-grace.
  // We filter persona_grace OUT below in both manual and cron paths so a lead
  // tagged for Grace never lands an Ada-voiced "Hey Tony, honestly not sure..."
  // followup. Untagged legacy leads default to Ada (no persona_grace tag → not
  // excluded → processed here).
  // Implementation note: Supabase JS doesn't have a NOT CONTAINS shortcut, so
  // we filter in memory after fetch. Cheap because each window is small.

  if (explicitIds.length > 0) {
    const { data } = await admin
      .from('cs_leads')
      .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score_reason, notes, send_count, last_contacted_at, tags')
      .in('id', explicitIds)
      .not('contact_email', 'is', null)
      .eq('status', 'contacted')
      .eq('outreach_paused', false)
    const rows = (data ?? []) as CandidateRow[]
    const adaRows = rows.filter((r) => !(r.tags ?? []).includes('persona_grace'))
    candidatesT2 = adaRows.filter((r) => r.send_count === 1)
    candidatesT3 = adaRows.filter((r) => r.send_count === 2)
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
    candidatesT2 = ((t2.data ?? []) as CandidateRow[])
      .filter((r) => !(r.tags ?? []).includes('persona_grace'))

    const t3 = await admin
      .from('cs_leads')
      .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score_reason, notes, send_count, last_contacted_at, tags')
      .eq('status', 'contacted')
      .eq('outreach_paused', false)
      .eq('send_count', 2)
      .gte('last_contacted_at', touch3WindowStart)
      .lte('last_contacted_at', touch3WindowEnd)
      .not('contact_email', 'is', null)
    candidatesT3 = ((t3.data ?? []) as CandidateRow[])
      .filter((r) => !(r.tags ?? []).includes('persona_grace'))
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

    const userMessage = buildUserMessage(lead, touchNumber, productDemoLink)
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

    // Persist — overwrite draft fields, tag with the touch number,
    // flip draft_state back to 'ready_for_review' so the Approval
    // Queue picks the new touch up (after Touch 1 was approved
    // draft_state is 'sent' — without this flip, Touch 2/3 drafts
    // would land in the DB but never surface in the queue).
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
    drafted,
    archived: archivedCount,
    errors: errors.length > 0 ? errors : undefined,
    counts,
    processed: candidatesT2.length + candidatesT3.length,
    model: MODEL,
  })
})
