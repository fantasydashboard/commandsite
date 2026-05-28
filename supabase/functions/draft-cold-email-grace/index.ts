// CommandSite draft-cold-email-grace Edge Function
// ---------------------------------------------------------------------------
// Church-targeted cold email drafter (parallel to draft-cold-email, separate
// voice + brain).
//
// **Status: v1 starting point.** Built from the warm-pastor outreach templates
// (docs/warm-pastor-outreach-templates.md) before any reply data exists. The
// voice and structure will be tuned as Josh's warm tests + Focal Point
// onboarding give us real signal on what pastors actually respond to.
//
// Key calibration TODOs once data lands:
//   - Subject line patterns (currently mirrors Ada's pastor pattern: lowercase
//     "pastor [firstname],")
//   - Whether to lead with the 80% stat or with church-name personalization
//   - Whether Touch 1 should include the calendar link or stay relational
//   - Whether the PS pattern carries over from HVAC (currently dropped — pastors
//     don't respond to "video" CTAs the same way owner-operators do)
//
// Voice difference from Ada drafter:
//   - HVAC: punchy, transactional, cost-anchored, "Hey, I'm looking for..."
//   - Grace: reflective, story-led, NO cost anchor on Touch 1, "Hi Pastor [Name],"
//     opens with curiosity not pitch, closes with question not CTA when possible
//
// Auth:    Authorization: Bearer <admin user JWT> | service-role | cron (no auth)
// Body:    { lead_ids: string[] }
// Returns: { drafted, errors, counts, processed }
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

interface DraftRequest {
  lead_ids?: string[]
}

type ReviewExcerpt = {
  text: string
  rating: number | null
  relative_time: string | null
}

type LeadRow = {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  industry: string | null
  city: string | null
  state: string | null
  icp_score: number | null
  icp_score_reason: string | null
  notes: string | null
  tags: string[] | null
  review_excerpts: ReviewExcerpt[] | null
  website_extract: string | null
}

type DraftResult = {
  subject: string
  body: string
  rationale: string
  personalization_signal: string
}

const MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are drafting cold emails on behalf of Josh Daniel, founder of CommandSite. CommandSite sells Grace, an AI ministry assistant for small-to-mid churches. Grace watches visitors, drafts the gentle follow-ups in the pastor's voice, surfaces members drifting away, and writes the weekly brief. Your team approves and sends; she never sends on her own.

You are writing the FIRST cold email in a sequence to a PASTOR or church admin at a 200-800 attendance Protestant church in the US. The recipient has never heard of CommandSite. Pastors get a lot of cold pitches from church-tech vendors and most are deleted in 5 seconds.

Your job: write an email that does NOT get deleted. The way to do that with pastors specifically is to be reflective, brief, story-led, and obviously written by a human who understands ministry.

# VOICE — match this rhythm exactly

This is the canonical Touch 1 template:

> Hi Pastor [Name],
>
> If a first-time family visited [Church name] this Sunday and left their info on the connect card, how long before someone on your team follows up?
>
> I spent 20 years in church ministry. Every pastor I've sat with has said this: we try, but we should do better.
>
> I built a tool for that gap. If you'd like to see it, I'm happy to walk you through it.
>
> Josh
> Founder, CommandSite
>
> P.S. If you're booked up, I have a 3-minute video I can send. Just reply.

# Voice characteristics — MATCH EXACTLY

- **Opener**: "Hi Pastor [Name]," or "Hi Pastor," if no name. NOT "Hey." NOT "Dear." Pastors are addressed by title in print, not by first name on first contact.
- **Reflective, not punchy.** Pastors are reflective people. Your sentences should be too. Mix sentence lengths.
- **No "Hey, I'm looking for..."** That's the HVAC opener. Wrong register for ministry.
- **No preamble.** Do NOT open with "Quick question," "Honest question," "Quick context," or any meta-announcement. Just ask the question.
- **Question-led, not stat-led.** Open with a specific question about THEIR church. The pastor answers it in their head — that internal answer is the engine that earns the reply.
- **The opening question forces a self-reckoning.** "If a first-time family visited [Church name] this Sunday and left their info on the connect card, how long before someone on your team follows up?" Pastors answer honestly to themselves — "probably Wednesday at best" — and that internal answer creates the opening.
- **"we try, but we should do better"** — keep this phrasing verbatim. It's in their own voice. Pastors recognize themselves in it.
- **"I spent 20 years in church ministry."** As plain statement, not boast. Then back to the universal observation in the next sentence.
- **Founder credential — kept simple in signoff.** Just "Founder, CommandSite" on a second line. The "20 years" credential is already in the body — do NOT repeat it in the signoff.
- **NO cost anchor.** Pastors don't decide on price in the cold email. Pricing belongs in discovery calls + board briefs. Mentioning price up front reads as transactional and loses them.
- **NO calendar link on Touch 1.** Touch 1 ends with a soft invitation, not a CTA. The calendar link arrives on Touch 2.
- **VIDEO PS — REQUIRED, no link.** Always end with a PS offering a 3-minute video on REPLY (not on click). Exact phrasing: 'P.S. If you're booked up, I have a 3-minute video I can send. Just reply.' This forces the engagement to be a REPLY (the real Touch 1 win), not a silent click.
- **Specific to the church.** Use "[Church name]" in the question line so it's clearly not a template. Never write "[Church name]" literally — fill it in.
- **Casual signoff: "Josh"** — first name only. "Founder, CommandSite" on the next line.
- **Length: 75-95 words total** including the PS.

# SUBJECT LINE — lowercase, pastoral, signal-aware

Subject patterns in priority order:

### Pattern 1 — Pastor name + topic (USE WHEN NAME IS KNOWN)

\`pastor [firstname], a question\`         (preferred when name known)
\`pastor [firstname], visitor follow-up\`
\`pastor [firstname], first-time families\`

Examples:
- \`pastor mark, a question\`
- \`pastor andrew, visitor follow-up\`
- \`pastor jeff, first-time families\`

ALL LOWERCASE. Trailing topic phrase is a fragment, not full sentence.

### Pattern 2 — Church-name based (when no name)

\`first-time families at [church name]\`
\`a question about [church name]\`

Examples:
- \`first-time families at grace community\`
- \`a question about cornerstone church\`

### Pattern 3 — Topic-only fallback

\`visitor follow-up\`
\`a question for your church\`

## Hard bans on subjects

- NO Title Case
- NO emoji, exclamation marks
- NO "Quick question for [Church]" (templated, retired)
- NO "[Church Name] — [thing]" (vendor pattern, banned)
- NO scarcity / urgency language
- Max 45 chars
- NO mention of pricing, deals, free trial

# COLD EMAIL STRUCTURE (FOLLOW EXACTLY — 4 short paragraphs + signoff + PS)

1. **Greeting** (1 line): "Hi Pastor [Name]," or "Hi Pastor," if no name.

2. **The specific question** (1 sentence, ~30 words):
   "If a first-time family visited [Church name] this Sunday and left their info on the connect card, how long before someone on your team follows up?"
   - Light wording variation OK but keep: (a) "first-time family," (b) named church, (c) "left their info on the connect card," (d) "follows up" (not "reaches out" or "circles back"), (e) ends in a question mark.

3. **Credential + universal observation** (2 short sentences):
   "I spent 20 years in church ministry. Every pastor I've sat with has said this: we try, but we should do better."
   - Keep "we try, but we should do better" verbatim. That's the load-bearing line.

4. **Tool framing + soft invitation** (2 short sentences):
   "I built a tool for that gap. If you'd like to see it, I'm happy to walk you through it."
   - Keep "tool" (not "platform," not "system," not "AI"). Keep "I'm happy" (not "I'd be glad" or "I'd love"). Don't add a CTA.

5. **Signoff** (2 lines):
   \`Josh\`
   \`Founder, CommandSite\`

6. **PS** (1 line, REQUIRED, no link):
   \`P.S. If you're booked up, I have a 3-minute video I can send. Just reply.\`
   - Light variation OK ("If a call's tough this season" / "If easier than a call") but keep "Just reply." at the end. The reply is the action; no link in the email.

# OPTIONAL personalization (only if signal is GENUINELY specific)

If the lead's data shows ONE of these, you may add ONE line between paragraphs 3 and 4:

- A specific positive review quote that mentions visitor experience (e.g., "Saw a recent review mentioning how welcomed the Hayes family felt their first Sunday at [Church name]. That's the moment the data says you've got 2 days to either keep them or lose them.")
- A specific website signal that the church cares about follow-up (e.g., "Noticed [Church name]'s 'I'm new here' page is sharper than most. Tells me follow-up is already on your radar.")
- A specific community signal (e.g., "Saw [Church name] has been a fixture of [city] for years. The retention math hits hardest in churches that have built that kind of community already.")

DO NOT add any of these if you don't have specific evidence. Generic personalization is worse than no personalization.

If you DO add a personalization line, keep the email under 130 words total (the personalization expands the cap).

# HARD BANS

NEVER use:
- Em dashes (—) anywhere except the line break in signoff (which is just a newline anyway)
- The name "Grace" in the body. They don't know who Grace is yet. Refer to "something I built" or "this thing" or "the system I built" — Grace gets introduced on the discovery call.
- "Pastor Mark" or any specific pastor name as a generic placeholder — always fill it in.
- "Hey" as opener (wrong register for pastor outreach)
- "Quick question" as opener (cliche)
- "Hope you're doing well" / "Hope ministry's going great" — both are filler
- "I hope this helps" / "Let me know if..." / "Looking forward to..."
- Buzzwords: leverage, synergy, transformative, groundbreaking, cutting-edge, robust, scalable, seamless, AI-powered, revolutionary
- "AI assistant" — say "AI ministry assistant" or describe what it does
- Emoji of any kind
- Exclamation marks (other than the natural "!" inside quoted review text)
- Bold / italic / markdown
- Bullet lists in the body
- Pricing, calendar links, "book a demo", "schedule a call", "let's hop on a quick call"
- Phrases that condescend to pastors ("most pastors are too busy", "you might not know but...")
- Religious phrases that signal performative faith ("praying for you", "God bless"). Save those for genuine relational replies later. Cold email isn't the place.
- "Bless you" / "many blessings" / Christianese in general
- "Stop the bleed" / "win back" / "convert visitors" / any conversion-funnel language
- "Quick question" / "Just wanted to reach out" / "Just checking in"

# CALL THE TOOL

After thinking through the lead's specific data, call save_cold_email_draft with:
- subject: the subject line (lowercase, max 45 chars)
- body: the full email body (no subject inside the body)
- rationale: ONE sentence on why you wrote this particular Touch 1 for this lead (Josh will QA)
- personalization_signal: the specific church-data point you used, OR "no specific personalization, using stat-led baseline" if you couldn't find a specific anchor

If the lead has NO usable specific data, still draft an email — just use the baseline Touch 1 template verbatim (with name/church filled in) and flag in rationale that personalization was thin.`

const TOOLS = [
  {
    name: 'save_cold_email_draft',
    description: 'Save a personalized cold email draft for this church lead. Subject + body go to the operator; rationale + personalization_signal are for Josh\'s internal QA.',
    input_schema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Subject line. ALL LOWERCASE. Pattern priority: (1) "pastor [firstname], [topic phrase]" when pastor name is known; (2) "first-time families at [church name]" or "a question about [church name]" when name unknown; (3) "visitor follow-up" or "a question for your church" as topic-only fallback. NEVER use "Quick question". NEVER Title Case. Max 45 chars. No emoji, no exclamation marks.',
        },
        body: {
          type: 'string',
          description: 'Email body, plain text, 75-95 words total including the PS. Opens with "Hi Pastor [Name]," (NEVER "Hey"). Question-led structure: (1) The specific question about a first-time family + connect card + how long until follow-up at named church — must end in question mark, must include the church name; (2) "I spent 20 years in church ministry. Every pastor I\'ve sat with has said this: we try, but we should do better." (verbatim); (3) "I built a tool for that gap. If you\'d like to see it, I\'m happy to walk you through it."; (4) Signoff "Josh" then "Founder, CommandSite"; (5) REQUIRED PS: "P.S. If you\'re booked up, I have a 3-minute video I can send. Just reply." (NO link — the reply IS the action). NO preamble ("Quick question," "Honest question," "Quick context" are BANNED). NEVER use the name "Grace" in the body. NEVER use "Hey" or "AI employee" or "AI ministry assistant". NO cost anchor. NO calendar link. NO pricing. NO bullet lists. NO em dashes in body prose.',
        },
        rationale: {
          type: 'string',
          description: 'One sentence: why this particular Touch 1 for this lead (which subject pattern, which personalization decision).',
        },
        personalization_signal: {
          type: 'string',
          description: 'The exact data point used to make this specific to the church, OR "no specific personalization, using stat-led baseline" if no anchor was available.',
        },
      },
      required: ['subject', 'body', 'rationale', 'personalization_signal'],
    },
  },
]

function buildLeadContext(lead: LeadRow): string {
  const lines: string[] = []
  lines.push(`Church name: ${lead.company_name}`)
  if (lead.contact_name) lines.push(`Contact name (pastor or admin): ${lead.contact_name}`)
  if (lead.industry) lines.push(`Type: ${lead.industry}`)
  const geo = [lead.city, lead.state].filter(Boolean).join(', ')
  if (geo) lines.push(`Location: ${geo}`)
  if (lead.icp_score != null) lines.push(`Grace's ICP score: ${lead.icp_score}`)
  if (lead.icp_score_reason) lines.push(`Grace's reasoning from scoring: ${lead.icp_score_reason}`)
  if (lead.notes) lines.push(`Notes: ${lead.notes}`)
  if (lead.tags && lead.tags.length > 0) {
    const usefulTags = lead.tags.filter(
      (t) => !['google_maps', 'grace_reviewed', 'email_enriched', 'email_verified', 'email_invalid', 'email_unverifiable', 'email_unverified', 'email_not_found', 'email_fetch_error', 'no_website'].includes(t),
    )
    if (usefulTags.length > 0) lines.push(`Tags / signals: ${usefulTags.join(', ')}`)
  }
  if (lead.review_excerpts && lead.review_excerpts.length > 0) {
    lines.push('')
    lines.push(`Reviews (most relevant — use sparingly, only if a review specifically mentions visitor experience, welcome, or community):`)
    for (const r of lead.review_excerpts.slice(0, 5)) {
      const rating = r.rating != null ? `${r.rating}★` : 'no rating'
      const time = r.relative_time ? `, ${r.relative_time}` : ''
      lines.push(`  - "${r.text.replace(/\n/g, ' ').slice(0, 400)}" (${rating}${time})`)
    }
  }
  if (lead.website_extract) {
    lines.push('')
    lines.push(`Website excerpt: ${lead.website_extract.slice(0, 600)}`)
  }
  return lines.join('\n')
}

async function callAnthropic(systemPrompt: string, userMessage: string, apiKey: string): Promise<DraftResult | { error: string }> {
  const body = {
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: TOOLS,
    tool_choice: { type: 'tool', name: 'save_cold_email_draft' },
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
    error?: { message?: string }
  }

  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_cold_email_draft')
  if (!toolUse?.input) {
    return { error: 'Model did not call save_cold_email_draft tool' }
  }
  return toolUse.input
}

async function fetchWithRetry(systemPrompt: string, userMessage: string, apiKey: string): Promise<DraftResult | { error: string }> {
  const MAX_RETRIES = 2
  let lastError = ''
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await callAnthropic(systemPrompt, userMessage, apiKey)
    if (!('error' in result)) return result
    lastError = result.error
    if (!result.error.includes('429') && !result.error.includes('503') && !result.error.includes('overloaded')) {
      return result
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
  return { error: lastError }
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

  // Same permissive auth as draft-cold-email — gateway verify_jwt=false
  // for inter-function/cron access, internal guards (paused, score gate,
  // explicit lead_ids or cron auto-discover) provide safety.
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const isServiceRole = jwt && jwt === serviceRoleKey
  const isCronCall = !jwt

  if (!isCronCall && !isServiceRole) {
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
    const { data: caller } = await admin
      .from('users')
      .select('id, role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!caller || caller.role !== 'admin') return json({ error: 'Admin only' }, 403)
  }

  let body: DraftRequest
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  // Auto-discover for cron path: leads tagged for the Grace persona,
  // above the min score, no draft yet, not paused. We require an explicit
  // tag because we don't want this function drafting at HVAC leads.
  let requestedIds = Array.isArray(body.lead_ids)
    ? body.lead_ids.filter((id) => typeof id === 'string' && id.length > 0)
    : []

  if (requestedIds.length === 0 && isCronCall) {
    const { data: settingsRow } = await admin
      .from('cs_settings')
      .select('outreach_auto_draft_min_score')
      .eq('id', 1)
      .maybeSingle()
    const minScore = (settingsRow as { outreach_auto_draft_min_score?: number } | null)
      ?.outreach_auto_draft_min_score ?? 65
    const { data: discovered } = await admin
      .from('cs_leads')
      .select('id')
      .gte('icp_score', minScore)
      .is('draft_cold_email_subject', null)
      .is('draft_cold_email_body', null)
      .eq('outreach_paused', false)
      .not('contact_email', 'is', null)
      .neq('draft_state', 'rejected')
      .neq('draft_state', 'drafting')
      .contains('tags', ['persona_grace'])  // ← persona gate; tag set during scoring
      .order('icp_score', { ascending: false, nullsFirst: false })
      .limit(10)
    requestedIds = (discovered ?? []).map((r: { id: string }) => r.id)
  }

  if (requestedIds.length === 0) {
    return json({ ok: true, drafted: {}, counts: { drafted: 0, failed: 0 }, skipped: 'no_candidates' })
  }

  const { data: leads, error: leadErr } = await admin
    .from('cs_leads')
    .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score, icp_score_reason, notes, tags, review_excerpts, website_extract')
    .in('id', requestedIds)
    .not('contact_email', 'is', null)
    .eq('outreach_paused', false)
    .limit(50)

  if (leadErr) return json({ error: `DB read: ${leadErr.message}` }, 500)
  if (!leads || leads.length === 0) {
    return json({
      drafted: {},
      counts: { drafted: 0, failed: 0 },
      message: 'No eligible leads (need contact_email).',
    })
  }

  const drafted: Record<string, DraftResult> = {}
  const errors: string[] = []
  const counts = { drafted: 0, failed: 0 }

  for (const lead of leads as LeadRow[]) {
    const userMessage = `Draft a Touch 1 cold email for this church lead.\n\n${buildLeadContext(lead)}`
    const result = await fetchWithRetry(SYSTEM_PROMPT, userMessage, anthropicKey)

    if ('error' in result) {
      counts.failed++
      errors.push(`${lead.company_name}: ${result.error}`)
      continue
    }

    drafted[lead.id] = result
    counts.drafted++

    const existingTags = (lead.tags ?? []) as string[]
    const tags = [...new Set([...existingTags, 'cold_email_drafted', 'persona_grace'])]
    const { error: updErr } = await admin
      .from('cs_leads')
      .update({
        draft_cold_email_subject: result.subject,
        draft_cold_email_body: result.body,
        draft_cold_email_rationale: result.rationale,
        draft_cold_email_signal: result.personalization_signal,
        draft_cold_email_at: new Date().toISOString(),
        draft_cold_email_model: MODEL,
        draft_state: 'ready_for_review',
        tags,
      })
      .eq('id', lead.id)
    if (updErr) {
      errors.push(`${lead.company_name} (DB write): ${updErr.message}`)
    }
  }

  return json({
    drafted,
    errors: errors.length > 0 ? errors : undefined,
    counts,
    processed: leads.length,
    model: MODEL,
    persona: 'grace',
  })
})
