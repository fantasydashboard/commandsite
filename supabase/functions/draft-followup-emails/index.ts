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

# TOUCH 2 (founding offer + video, sent ~3-4 business days after Touch 1)

Goal: introduce a NEW piece of value (the founding offer + savings) that Touch 1 didn't have, and lower the ask from "reply" to "watch a 90-second video". Touch 1 asked them "Worth a reply?" Touch 2 escalates by giving them a tangible reason to engage (saving $3,000) and an easier way (watch, don't reply).

Research backing: Lavender 1B-email dataset shows cold email touch 2 reply rate peaks at 30-80 words when a NEW piece of value or evidence is introduced. Pure "circling back" follow-ups convert at <0.5%. Touch 2 with a tangible offer + video link converts at 2-4%. For SMB owner-operators (trades, remodelers, churches), concrete dollar savings + scarcity ("3 spots") outperforms vague "interesting?" follow-ups by 3-5x.

# PATH SELECTION (bath/kitchen primary vs fallback)

Use the BATH/KITCHEN PRIMARY PATH when ANY of these match the lead's industry field (case-insensitive substring match):
  - bath
  - kitchen
  - cabinet
  - remodel
  - renovation

Use the FALLBACK PATH only when NONE of those match. Cabinet shops, kitchen cabinet contractors, bath remodelers, kitchen remodelers, full remodelers, and renovation contractors ALL get the bath/kitchen founding-offer shape — they're the same buyer with the same pain.

# THE TOUCH 2 SHAPE (bath/kitchen vertical — primary)

Three paragraphs + sign-off:

1. **Offer paragraph** (1-2 sentences): "I'm looking to work with 3 bath/kitchen remodeling shops at founding rates over the next few weeks. Each one saves about $3,000 over the year compared to what I'll charge once those 3 are signed."
   - "3 shops" creates scarcity (concrete, honest — Josh's solo bandwidth)
   - "founding rates over the next few weeks" time-bounds it
   - "$3,000 saved" is the new value the reader didn't have in touch 1
   - "compared to what I'll charge once those 3 are signed" anchors savings without revealing actual monthly price (avoids price-shock before video)

2. **Soft callback + pain anchor** (1-2 sentences): "I mentioned the tool I built in last week's note. It handles things like lead follow-ups, review asks, and missed calls between jobs."
   - "I mentioned" is conversational, doesn't restate the touch 1 pitch
   - The three pains echo touch 1's "between the handshakes" pains but reframed plainly so cold-readers (who didn't open touch 1) get concrete examples

3. **Video + CTA** (separate lines): "Here's a 90-second walkthrough: <link>\\n\\nWorth a quick look?"
   - Direct, low-friction
   - Question CTA forces a decision (yes/no on watching, vs the touch 1 "no worries" passive permission)
   - "Worth a quick look?" matches the 90-second framing (not "worth a few minutes" which mismatches)

4. **Sign-off**: "Josh"

# TOUCH 2 — HARD CONSTRAINTS

- 75-85 words total body. Slightly longer than touch 1 because it introduces new info.
- USE THE THREE-PARAGRAPH CANONICAL SHAPE VERBATIM. The only substitution is [Firstname] in the greeting. Do NOT paraphrase the offer sentence. Do NOT rewrite the pain list. Do NOT add evidence from the lead's reviews or website (touch 1 already did that).
- DO NOT repeat touch 1's content. Specifically banned for touch 2:
  - "What I'm guessing eats your time is the rest" (touch 1 pain reframe)
  - "The stuff between the handshakes" (touch 1 signature line)
  - "the lead you need to follow up with, the review you've been meaning to ask for, the call you couldn't grab while you were on a jobsite" (touch 1 pain list, even rephrased)
  - "That's the part of the job that has to be you" (touch 1 validation line)
  - "I read a Google review of [Company]..." or any verbatim review quote (touch 1 evidence)
  - "That's what I'm always looking for in a contractor" (touch 1 Branch B peer line)
- DO NOT use the banned phrases: "circling back", "checking in", "just following up", "quick follow-up", "did this slip past", "in case it got buried", "bumping this up", "wanted to make sure"
- DO NOT show monthly cost ($X/mo). The video does the value pitch; cost discussion happens after.
- DO NOT use the name "Ada" in the body.
- The video link is a placeholder \`<link>\` in the draft (or the actual product_demo_link value if one is supplied in the user message).
- For leads with no first name, open with "Hey," instead of "Hey [Firstname],"

# TOUCH 2 CANONICAL EXAMPLE — Bath/kitchen (Coastal Bath & Kitchen, Mike, Touch 1 subject 'mike,'):

> Re: mike,
>
> Hey Mike,
>
> I'm looking to work with 3 bath/kitchen remodeling shops at founding rates over the next few weeks. Each one saves about $3,000 over the year compared to what I'll charge once those 3 are signed.
>
> I mentioned the tool I built in last week's note. It handles things like lead follow-ups, review asks, and missed calls between jobs.
>
> Here's a 90-second walkthrough: <link>
>
> Worth a quick look?
>
> Josh

# TOUCH 2 FOR NON-BATH/KITCHEN VERTICALS (fallback)

For HVAC, plumbing, electrical, roofing, landscaping, churches, etc., fall back to the previous video-reply pattern until per-industry founding offers are built:

> Re: <subject>,
>
> Hey [Firstname], if last week's note made any sense, hit reply with "video" and I'll send a 90-second walkthrough of how the [INDUSTRY-PAIN] piece works. No call required.
>
> If I'm reading your week wrong, ignore me, no hard feelings.
>
> Josh

INDUSTRY-PAIN phrase (for fallback path only):
- HVAC: "after-hours call catch"
- Plumbing: "dispatch triage"
- Residential electrical: "permit + estimate follow-up"
- Roofing: "estimate follow-up sequence"
- Landscaping (project work): "quote-chase"
- Cleaning: "new client booking"
- Pool service / pest control: "seasonal-spike call coverage"
- Churches/ministries: "first-time visitor follow-up"

Subject line: "Re: <original subject>" so Gmail threads it. Same lowercase casual style as Touch 1.

# TOUCH 3 (last note + later path + founding FOMO, sent ~7-10 days after Touch 1)

Goal: close the loop respectfully, offer the "later" capture path, and reinforce the founding offer one last time (since touch 2 introduced it). Research backing: pure-breakup (no ask at all) underperforms breakup-with-"later"-path by 3-5 reply points for owner-operator SMB targets. The "later" mechanic: ~4-5% of recipients reply "later", and 25-35% of those convert within 90 days.

Hard constraints:
- 60-75 words total body.
- Frame as the LAST email ("Last note from me").
- Offer THREE clear paths in this order:
  1. Silence is fine (you'll stop reaching out).
  2. "Hit reply with 'later' and I'll loop back in a few months" — load-bearing, KEEP VERBATIM.
  3. Warm closing wish (universal "good luck out there" works for trades).
- The "later" path MUST be a literal instruction: hit reply with "later". Don't soften it ("if you're interested down the road...") because that's vague.
- "in a few months" is year-round phrasing. Do NOT use seasons.
- After the "later" path, add ONE sentence about the founding spots being filled by then. This is light FOMO without pressure: "Those 3 founding spots will be filled by then."
- Use concrete pain examples from touch 2 in the opt-out clause ("the lead follow-ups and review asks between jobs") so cold readers who didn't see touch 2 still recognize what's at stake.
- DO NOT use the name "Ada" in the body.
- Sign off with "Josh" (just the name, no dash).
- NO em dashes anywhere.

# TOUCH 3 CANONICAL SHAPE — bath/kitchen (primary)

> Re: <original subject>,
>
> Hey [Firstname], last note from me.
>
> If the lead follow-ups and review asks between jobs aren't on your radar right now, totally fine, I'll stop reaching out. If they are and the timing's just not right, hit reply with "later" and I'll loop back in a few months. Those 3 founding spots will be filled by then.
>
> Either way, good luck out there.
>
> Josh

# TOUCH 3 EXAMPLE — Bath/kitchen (Coastal Bath & Kitchen, Mike, Touch 1 subject 'mike,'):

> Re: mike,
>
> Hey Mike, last note from me.
>
> If the lead follow-ups and review asks between jobs aren't on your radar right now, totally fine, I'll stop reaching out. If they are and the timing's just not right, hit reply with "later" and I'll loop back in a few months. Those 3 founding spots will be filled by then.
>
> Either way, good luck out there.
>
> Josh

# TOUCH 3 FALLBACK for non-bath/kitchen verticals

For HVAC, plumbing, electrical, roofing, landscaping, churches, etc., use the prior template (no founding FOMO since touch 2 didn't introduce the bath/kitchen offer). INDUSTRY-PAIN and INDUSTRY-WARM-CLOSE phrases:

INDUSTRY-PAIN phrase:
- HVAC: "after-hours calls"
- Plumbing: "dispatch triage"
- Residential electrical: "permit + estimate follow-up"
- Roofing: "estimate follow-up"
- Landscaping (project work): "quote-chase"
- Cleaning: "new client booking"
- Pool service / pest control: "seasonal-spike call coverage"
- Churches/ministries: "first-time visitor follow-up"

INDUSTRY-WARM-CLOSE phrase:
- HVAC / plumbing / electrical / roofing / landscaping: "good luck out there"
- Cleaning: "good luck with the routes"
- Churches/ministries: "praying your church grows" (only if recipient is a pastor)

Fallback canonical shape (no founding FOMO line):

> Re: <subject>,
>
> Hey [Firstname], last note from me.
>
> If [INDUSTRY-PAIN] isn't on your radar right now, totally fine, I'll stop reaching out. If it is and the timing's just not right, hit reply with "later" and I'll loop back in a few months.
>
> Either way, [INDUSTRY-WARM-CLOSE].
>
> Josh

Optional VIDEO DROP for fallback verticals only: if a product_demo_link is configured in context, insert BEFORE the three-paths paragraph: "Made a 90-second walkthrough in case it's useful even if we never talk: <link>." For bath/kitchen, video was already shared in touch 2, so do NOT repeat in touch 3.

Subject: "Re: <original subject>" (continue threading off Touch 1 + 2).

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
        body: { type: 'string', description: 'BATH/KITCHEN PRIMARY PATH (bath, kitchen, or remodel in industry). Touch 2 (75-85 words): three paragraphs — (1) "I\'m looking to work with 3 bath/kitchen remodeling shops at founding rates over the next few weeks. Each one saves about $3,000 over the year compared to what I\'ll charge once those 3 are signed." (2) "I mentioned the tool I built in last week\'s note. It handles things like lead follow-ups, review asks, and missed calls between jobs." (3) "Here\'s a 90-second walkthrough: <link>\\n\\nWorth a quick look?" Then "Josh" signoff. Touch 3 (60-75 words): "Hey [Firstname], last note from me. If the lead follow-ups and review asks between jobs aren\'t on your radar right now, totally fine, I\'ll stop reaching out. If they are and the timing\'s just not right, hit reply with \\"later\\" and I\'ll loop back in a few months. Those 3 founding spots will be filled by then. Either way, good luck out there. Josh". FALLBACK PATH (non-bath/kitchen): Touch 2 keeps the "if last week\'s note made any sense, hit reply with video" pattern. Touch 3 keeps "last note from me + later mechanic + industry-warm-close" without founding FOMO. NO em dashes anywhere. Signoff is just "Josh" on its own line, no leading dash. DO NOT use "Ada" in the body. DO NOT use banned phrases (circling back, checking in, just following up, quick follow-up).' },
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
  // Pass the product demo link if Josh has one configured.
  // Touch 2 (bath/kitchen path) injects it where <link> appears in the
  // canonical shape. Touch 3 (fallback verticals only) inserts the
  // "Made a 90-second walkthrough" line before the three-paths block.
  if (productDemoLink) {
    lines.push(`# VIDEO LINK FOR THIS TOUCH — INCLUDE THIS IN THE EMAIL`)
    lines.push(`product_demo_link: ${productDemoLink}`)
    if (touchNumber === 2) {
      lines.push(`In the bath/kitchen Touch 2 shape, the line "Here's a 90-second walkthrough: <link>" should substitute the actual product_demo_link URL for <link>.`)
    }
    lines.push('')
  } else if (touchNumber === 3) {
    lines.push(`# VIDEO LINK FOR TOUCH 3 — NOT CONFIGURED`)
    lines.push(`Skip the video drop paragraph entirely. Use the no-video Touch 3 shape (release + future triggers, no middle paragraph).`)
    lines.push('')
  } else if (touchNumber === 2) {
    lines.push(`# VIDEO LINK FOR TOUCH 2 — NOT CONFIGURED`)
    lines.push(`For the bath/kitchen path, omit the "Here's a 90-second walkthrough: <link>" paragraph entirely. Replace it with just "Worth a quick reply if it's relevant?" so the CTA still lands. For non-bath/kitchen path, no video line exists in Touch 2 so this doesn't apply.`)
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

  // NeverBounce gate (same rule as outreach-auto-draft): only draft
  // touch 2 + 3 for addresses NeverBounce verified as 'valid'. Even
  // if touch 1 happened to land without bouncing, the address being
  // unverified means it might still be soft-bouncing into spam or
  // hitting low-reputation graveyard inboxes. Sender reputation
  // matters most on follow-up touches because those are sent later
  // (more chances for Gmail to flag) and they go to addresses we've
  // already touched once. See 2026-06-15 incident.
  if (explicitIds.length > 0) {
    const { data } = await admin
      .from('cs_leads')
      .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score_reason, notes, send_count, last_contacted_at, tags')
      .in('id', explicitIds)
      .not('contact_email', 'is', null)
      .eq('email_verification_status', 'valid')
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
      .eq('email_verification_status', 'valid')
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
      .eq('email_verification_status', 'valid')
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
