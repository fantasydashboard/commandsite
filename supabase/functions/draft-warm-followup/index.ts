// CommandSite draft-warm-followup Edge Function
// ---------------------------------------------------------------------------
// Drafts a warm-followup email for a lead who replied to a cold touch +
// got a reply from Josh + then went silent. Different shape from cold
// T2/T3 (those assume no engagement); this assumes prior context exists.
//
// Goal: nudge the conversation back open with a SOFT re-engagement that
// honors silence + offers one easy next step. Not a re-pitch. The
// prospect has the context. The job is to lower the bar to "yes."
//
// Research backing:
//   - HubSpot B2B follow-up data: day-5-7 nudge after engagement = 35%
//     reply rate. Day-14 = 22%. Day-21 = cliff.
//   - Jason Bay split tests: warm cadence works at 5-7 day intervals,
//     not the 3-4 day cold cadence. Faster = pushy.
//   - Will Allred (Lavender): best re-engagement is question or new
//     context, NOT restated pitch.
//
// Trigger:  POST {lead_id: string}
// Auth:     Authorization: Bearer <service_role> OR admin JWT
// Returns:  { ok: true, draft: {subject, body, rationale, touch_number} }
// Secrets:  ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

const SYSTEM_PROMPT = `You are Ada, drafting the NEXT email in a warm conversation thread for Josh Daniel, founder of CommandSite. The prospect already replied to Josh's cold outreach, Josh replied back, and now they've gone silent. You are drafting the gentle re-engagement.

# CONTEXT YOU WILL RECEIVE

For each draft you will see:
- The lead's company, contact name, industry, location
- The original cold-outreach email Josh sent (Touch 1)
- The prospect's reply to that cold email
- Josh's reply back to them
- Which warm-followup touch this is (WT1 = first warm nudge, WT2 = second, WT3 = soft close)
- The Calendly link to use for this lead's vertical

# THE JOB

Re-open the door WITHOUT re-pitching. Three principles:

1. Acknowledge that silence is a fine answer. Pressure backfires after engagement.
2. Offer ONE specific low-friction next step (a question, a video, a "later" path).
3. Honor their context. They already saw the pitch. Don't re-explain what you do.

# HARD CONSTRAINTS

- 30-50 words MAX. Tighter than cold touches because the context is already established.
- NO em dashes anywhere (body, subject, signoff). Use commas, periods, or parens. This rule has no exceptions.
- NO restating the original pitch from Touch 1.
- NO restating what Josh said in his earlier reply.
- NO "circling back" / "checking in" / "did this slip through" / "wanted to make sure" / "bumping this up" / "in case you missed". These are dead phrases that scream templated follow-up.
- NO "exactly" or "literally" as emphasizers. Used too often by LLMs.
- NO "AI employee" or "Ada" in the body. The prospect doesn't need the system explained.
- Signoff is just "Josh" on its own line. No leading dash, hyphen, or any other character.
- Subject is "Re: <original subject>" so Gmail threads it.

# WT1 (first warm nudge, sent 5-7 days after Josh's reply)

Shape: light re-engagement that acknowledges silence + brings ONE new piece of context (the founding rate reminder). NOT a call ask. The cold sequence already exhausted call/video asks — repeating them now reads as "I forgot what I sent." The new info IS the founding offer.

BATH/KITCHEN canonical shape:

> Hey [First], no rush either way. Quick reminder the founding rate is still open if it's relevant — about $3,000 off the first year for the first 3 bath/kitchen shops to sign on. Otherwise, [WARM-CLOSE].
>
> Josh

EXAMPLE — Mike (bath/kitchen, replied warmly, no follow-through):
> Re: mike,
>
> Hey Mike, no rush either way. Quick reminder the founding rate is still open if it's relevant — about $3,000 off the first year for the first 3 bath/kitchen shops to sign on. Otherwise, hope the projects are running smooth.
>
> Josh

FALLBACK for non-bath/kitchen verticals (no founding offer yet): keep the prior light re-engagement shape:
> Hey [First], no rush either way. If timing's off, just let me know and I'll get out of the way. Otherwise, [WARM-CLOSE].

# WT2 (second warm nudge, sent 12-15 days after Josh's reply)

Shape: bring NEW peer insight + reinforce the founding scarcity. Different angle from WT1 (which was a soft reminder). WT2 brings a piece of industry observation the reader hasn't seen before, then anchors it back to the offer.

BATH/KITCHEN canonical shape:

> Hey [First], one more thought. Most bath/kitchen shops I've talked to lose more to silence after the quote goes out than to losing on price. If that hits close to home, the founding spots are still open for another week or two. After that, the rate goes up.
>
> Josh

The "lose more to silence than to price" insight is the load-bearing line — keep it verbatim where possible. It's true industry observation and lands harder than any pitch could.

FALLBACK for non-bath/kitchen verticals: use the "later" mechanic from the prior shape:
> Hey [First], if [INDUSTRY-PAIN] isn't on your radar this month, totally fine. If it is and the timing's just off right now, hit reply with "later" and I'll loop back in a few months.

# WT3 (soft close, sent 21-28 days after Josh's reply)

Shape: respectful release + callback to the "between the handshakes" signature phrase from the cold sequence for narrative continuity. Acknowledge the founding rate is likely closed by now (honest, not manufactured urgency). NO call ask. NO new pitch.

BATH/KITCHEN canonical shape:

> Hey [First], last note from me.
>
> Going to step back. The founding rate has probably closed by the time you read this, but if the between-the-handshakes work ever becomes a problem you want off your plate, you know where to find me.
>
> [WARM-CLOSE].
>
> Josh

The phrase "between-the-handshakes work" is a deliberate callback to the cold sequence's signature line. Touch 1 introduced it; WT3 closes the loop with it. Same conversation, different chapter.

FALLBACK for non-bath/kitchen verticals: prior shape without founding-rate language:
> Hey [First], last note from me. Going to step back. If [INDUSTRY-PAIN] becomes a problem you want solved later, you know where to find me. [WARM-CLOSE].

# INDUSTRY-PAIN PHRASE (use in WT2 + WT3 FALLBACK only)

Match the lead's industry:
- HVAC: "after-hours calls"
- Plumbing: "dispatch triage"
- Residential electrical: "permit + estimate follow-up"
- Roofing: "estimate follow-up"
- Landscaping (project work): "quote-chase"
- Cleaning: "new client booking"
- Pool service / pest control: "seasonal-spike call coverage"
- Churches/ministries: "first-time visitor follow-up"
- Anything else: just "follow-up"

Bath/kitchen has its own canonical shapes (founding offer + between-the-handshakes callback) and does NOT use this generic pain phrase.

# WARM-CLOSE PHRASE (use in WT1 + WT3)

Match the lead's industry:
- Bath/kitchen: "hope the projects are running smooth" or "hope the remodels are landing"
- HVAC / plumbing / electrical: "hope the calls are landing"
- Roofing: "hope the roofs keep coming"
- Landscaping: "hope the season's running well"
- Cleaning: "hope the routes are humming"
- Churches/ministries: "praying your church grows"
- Anything else: "hope it's running well"

# BANNED for all warm touches (these read as templated follow-up)

- "circling back", "checking in", "just following up", "did this slip past", "in case it got buried", "bumping this up", "wanted to make sure"
- Re-offering the video the prospect already saw in cold touch 2 ("hit reply with 'video'" is now redundant)
- Re-asking for a 15-minute call (the cold sequence already exhausted that ask — warm follow-ups should NOT re-ask for the same thing)
- "exactly" / "literally" as emphasizers
- "AI employee" / "Ada" by name in the body

# CALL THE TOOL

After thinking through the lead context + conversation history, call save_warm_followup_draft with:
- subject: "Re: <original subject from Touch 1>"
- body: the warm-followup email body following the constraints above
- touch_number: 1, 2, or 3 (matches the input warm_touch_number)
- rationale: ONE sentence on the angle you picked + why for this specific lead`

const TOOLS = [
  {
    name: 'save_warm_followup_draft',
    description: 'Save the warm-followup email draft for this lead.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: '"Re: <original cold-touch subject>". Lowercase, max 40 chars. Threads off the cold touch in Gmail.' },
        body: { type: 'string', description: 'Warm-followup body, 30-60 words. No em dashes. Signoff is just "Josh" on its own line. BATH/KITCHEN canonical shapes: WT1 reminds about the founding rate ($3,000 off the first year for first 3 shops) without re-pitching, NO call ask. WT2 uses the peer insight ("most shops I\'ve talked to lose more to silence after the quote goes out than to losing on price") + reinforces founding scarcity ("spots still open for another week or two, after that the rate goes up"). WT3 respectful release + callback to "between-the-handshakes work" + acknowledges founding has likely closed. NEVER re-offer the video the prospect already saw in cold touch 2. NEVER re-ask for a 15-minute call. NEVER use "circling back" / "checking in" / "just following up". Non-bath/kitchen verticals use the fallback shapes (peer-pattern + "later" mechanic + INDUSTRY-PAIN phrase).' },
        touch_number: { type: 'integer', enum: [1, 2, 3], description: '1=WT1 (first warm nudge), 2=WT2 (different angle), 3=WT3 (soft close)' },
        rationale: { type: 'string', description: 'One sentence: why this angle for this specific lead based on conversation history.' },
      },
      required: ['subject', 'body', 'touch_number', 'rationale'],
    },
  },
]

interface DraftRequest {
  lead_id: string
}

interface LeadRow {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  industry: string | null
  city: string | null
  state: string | null
  icp_score_reason: string | null
  notes: string | null
  tags: string[] | null
}

interface SendRow {
  touch_number: number
  subject: string | null
  body: string | null
  sent_at: string
}

interface ReplyRow {
  body_text: string | null
  received_at: string
  from_email: string | null
}

interface DraftResult {
  subject: string
  body: string
  touch_number: 1 | 2 | 3
  rationale: string
}

function buildUserMessage(
  lead: LeadRow,
  prevSends: SendRow[],
  prevReplies: ReplyRow[],
  warmTouchNumber: 1 | 2 | 3,
  calendlyLink: string | null,
  videoLink: string | null,
): string {
  const lines: string[] = []
  lines.push(`# WARM-FOLLOWUP TOUCH ${warmTouchNumber}`)
  lines.push('')
  lines.push(`# THE PROSPECT`)
  lines.push(`Company: ${lead.company_name}`)
  if (lead.contact_name) lines.push(`Contact: ${lead.contact_name}`)
  if (lead.industry) lines.push(`Industry: ${lead.industry}`)
  if (lead.city || lead.state) lines.push(`Location: ${[lead.city, lead.state].filter(Boolean).join(', ')}`)
  if (lead.tags && lead.tags.length > 0) lines.push(`Tags: ${lead.tags.join(', ')}`)
  lines.push('')
  lines.push(`# CONVERSATION SO FAR (chronological, DO NOT RESTATE)`)
  // Interleave sends + replies by timestamp so the LLM sees the actual back-and-forth.
  type Event = { kind: 'send' | 'reply'; when: string; subject: string | null; body: string | null; from: string | null; touch: number | null }
  const events: Event[] = [
    ...prevSends.map((s) => ({ kind: 'send' as const, when: s.sent_at, subject: s.subject, body: s.body, from: 'Josh', touch: s.touch_number })),
    ...prevReplies.map((r) => ({ kind: 'reply' as const, when: r.received_at, subject: null, body: r.body_text, from: r.from_email, touch: null })),
  ].sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime())
  for (const ev of events) {
    if (ev.kind === 'send') {
      lines.push(`## Josh sent (Touch ${ev.touch}) — ${ev.when}`)
      if (ev.subject) lines.push(`Subject: ${ev.subject}`)
      if (ev.body) lines.push(`Body:\n${ev.body}`)
    } else {
      lines.push(`## Prospect replied — ${ev.when}`)
      if (ev.from) lines.push(`From: ${ev.from}`)
      if (ev.body) lines.push(`Body:\n${ev.body}`)
    }
    lines.push('')
  }
  lines.push(`# AVAILABLE LINKS`)
  if (calendlyLink) lines.push(`calendly_link: ${calendlyLink}`)
  if (videoLink) lines.push(`video_link: ${videoLink}`)
  if (!calendlyLink && !videoLink) lines.push('(no links configured for this vertical)')
  lines.push('')
  lines.push(`Now draft Warm-followup Touch ${warmTouchNumber}. Call save_warm_followup_draft.`)
  return lines.join('\n')
}

async function callAnthropic(userMessage: string, apiKey: string): Promise<DraftResult | { error: string }> {
  const body = {
    model: MODEL,
    max_tokens: 800,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: TOOLS,
    tool_choice: { type: 'tool', name: 'save_warm_followup_draft' },
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

  const data = await res.json() as {
    content?: Array<{ type: string; name?: string; input?: DraftResult }>
  }
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_warm_followup_draft')
  if (!toolUse?.input) {
    return { error: 'Model did not call save_warm_followup_draft tool' }
  }
  return toolUse.input
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
  if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── Auth (intentionally permissive, see draft-cold-email for rationale)
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const isServiceRole = jwt && jwt === SERVICE_ROLE_KEY
  const isCronCall = !jwt

  if (!isCronCall && !isServiceRole) {
    const { data: userData } = await admin.auth.getUser(jwt)
    if (!userData?.user) return json({ error: 'Invalid session' }, 401)
    const { data: caller } = await admin
      .from('users')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if ((caller as { role?: string } | null)?.role !== 'admin') {
      return json({ error: 'Admin only' }, 403)
    }
  }

  let body: DraftRequest
  try {
    body = await req.json() as DraftRequest
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.lead_id) return json({ error: 'lead_id required' }, 400)

  // ── Mark drafting so concurrent runs don't double-pick
  await admin
    .from('cs_leads')
    .update({ warm_followup_state: 'drafting' })
    .eq('id', body.lead_id)

  // ── Load lead + conversation history
  const { data: leadData, error: leadErr } = await admin
    .from('cs_leads')
    .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score_reason, notes, tags')
    .eq('id', body.lead_id)
    .maybeSingle()
  if (leadErr || !leadData) {
    await admin.from('cs_leads').update({ warm_followup_state: 'queued' }).eq('id', body.lead_id)
    return json({ error: `Lead not found: ${leadErr?.message ?? 'no row'}` }, 404)
  }
  const lead = leadData as LeadRow

  // Prior sends
  const { data: sendsData } = await admin
    .from('cs_outreach_sends')
    .select('touch_number, subject, body, sent_at')
    .eq('lead_id', body.lead_id)
    .eq('channel', 'email')
    .order('sent_at', { ascending: true })
  const prevSends = (sendsData ?? []) as SendRow[]

  // Prior replies
  const { data: repliesData } = await admin
    .from('cs_replies')
    .select('body_text, received_at, from_email')
    .eq('lead_id', body.lead_id)
    .order('received_at', { ascending: true })
  const prevReplies = (repliesData ?? []) as ReplyRow[]

  // Compute which warm touch this is (count prior warm followups, default to 1)
  const priorWarmCount = (lead.tags ?? []).filter((t) => t.startsWith('warm_followup_sent_')).length
  const warmTouchNumber = Math.min(3, priorWarmCount + 1) as 1 | 2 | 3

  // Pull Calendly + video links from cs_settings
  const isGrace = (lead.tags ?? []).includes('persona_grace')
  const { data: settingsRow } = await admin
    .from('cs_settings')
    .select('calendly_link, calendly_link_grace, video_link, video_link_grace')
    .eq('id', 1)
    .maybeSingle()
  const settings = settingsRow as
    | { calendly_link: string | null; calendly_link_grace: string | null; video_link?: string | null; video_link_grace?: string | null }
    | null
  const calendlyLink = isGrace ? (settings?.calendly_link_grace ?? settings?.calendly_link ?? null) : (settings?.calendly_link ?? null)
  const videoLink = isGrace ? (settings?.video_link_grace ?? settings?.video_link ?? null) : (settings?.video_link ?? null)

  const userMessage = buildUserMessage(lead, prevSends, prevReplies, warmTouchNumber, calendlyLink, videoLink)
  const result = await callAnthropic(userMessage, ANTHROPIC_KEY)

  if ('error' in result) {
    // Reset state so cron retries next tick
    await admin
      .from('cs_leads')
      .update({ warm_followup_state: 'queued' })
      .eq('id', body.lead_id)
    return json({ error: result.error }, 500)
  }

  // Persist the draft. Reuse the existing draft_cold_email_* fields since
  // the approval queue UI + send pipeline already work with them. The
  // warm_followup_state flag + warm_followup_drafted tag let the UI
  // identify these as warm follow-ups for badge rendering.
  const existingTags = (lead.tags ?? []) as string[]
  const tagsWithMarker = Array.from(new Set([
    ...existingTags.filter((t) => t !== 'warm_followup_drafted'),
    'warm_followup_drafted',
    `warm_followup_drafted_t${result.touch_number}`,
  ]))
  const { error: updErr } = await admin
    .from('cs_leads')
    .update({
      draft_cold_email_subject: result.subject,
      draft_cold_email_body: result.body,
      draft_cold_email_rationale: result.rationale,
      draft_cold_email_signal: `Warm followup WT${result.touch_number}`,
      draft_cold_email_at: new Date().toISOString(),
      draft_cold_email_model: MODEL,
      draft_state: 'ready_for_review',
      warm_followup_state: 'ready_for_review',
      tags: tagsWithMarker,
    })
    .eq('id', body.lead_id)
  if (updErr) {
    return json({ error: `DB write failed: ${updErr.message}` }, 500)
  }

  return json({
    ok: true,
    draft: result,
    warm_touch_number: warmTouchNumber,
    lead_id: body.lead_id,
    model: MODEL,
  })
})
