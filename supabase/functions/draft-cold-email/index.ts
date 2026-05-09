// CommandSite draft-cold-email Edge Function
// ---------------------------------------------------------------------------
// Phase 3 of the lead engine. Takes cs_leads rows that have a verified
// email + Ada's source material (icp_score_reason, notes, optionally
// review_excerpts + website_extract) and asks Claude to draft a
// personalized cold email per lead in Josh's voice.
//
// Why Claude here: this is the one step where the *quality* of the
// language matters more than speed. A generic templated email gets a
// 1-2% reply rate. A specific opener that quotes a real review of
// THEIR shop gets 8-15%. The signal/noise ratio justifies Sonnet 4.6
// over Haiku.
//
// Why bake humanizer rules into the system prompt: a post-hoc cleanup
// pass works but it's better to never produce the AI tells in the
// first place. The drafter has hard bans on em dashes, "stands as a
// testament", "transformative", emoji, and the rest of the 29 patterns
// from blader/humanizer's Wikipedia-derived guide.
//
// Why tool use for output: structured (subject, body, rationale,
// personalization_signal) makes the QA UI easy + the rationale field
// is gold for diagnosing why a draft is weak.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    { lead_ids: string[] }
// Returns: {
//            drafted: { [lead_id]: { subject, body, rationale, signal } },
//            errors?: string[],
//            counts: { drafted, failed }
//          }
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

// ── System prompt ──────────────────────────────────────────────────────────
//
// Long deliberately. The cold-email-writing instructions, voice sample,
// and humanizer bans are ALL load-bearing. Cached via cache_control
// since the system prompt is identical across all leads in a batch.

const SYSTEM_PROMPT = `You are Ada, drafting cold emails on behalf of Josh Daniel, founder of CommandSite. CommandSite sells "AI employees" to local service businesses (HVAC, plumbing, electrical, roofing, landscaping). Ada is the AI employee — she catches missed calls, follows up on quotes, asks for reviews, and reactivates dormant customers.

You are writing the FIRST cold email in a sequence to an owner-operator at a small service business in the US. The recipient has never heard of CommandSite. They get cold sales emails constantly and delete most of them within 5 seconds.

Your job: write an email that does NOT get deleted. The way to do that is to be specific, brief, and obviously written by a human.

# JOSH'S VOICE — match this rhythm and tone exactly

This is Josh's polished cold email template:

> Hey — looking for whoever answers the phones at Premium Electric.
>
> Saw a review on your Google listing from Sarah K. last month — said she tried calling three times with no answer back. I think I have a way to help with exactly that.
>
> I build AI employees for shops your size. Mine catches every after-hours call, books the booking into your calendar, and texts the caller a confirmation. Costs a fraction of what an office manager would.
>
> Worth a 15-min call this week? I can pull up a sample dashboard and show you what Ada would catch for Premium Electric specifically.
>
> — Josh

Voice characteristics to match:
- Conversational opener ("Hey —", lowercase casual) — never "Dear" or "To Whom It May Concern"
- References ONE specific piece of evidence (a real review excerpt with a name + detail, or a specific website claim)
- Pain → product → cost anchor → CTA structure
- Run-on sentences with "and" / "but" connectors are fine — that's how Josh talks
- "Shops your size" / "for [Company] specifically"
- Casual sign-off: "— Josh" (em dash here is permitted because it's a sig pattern, not in body prose)
- NEVER use buzzwords like: leverage, synergy, transformative, groundbreaking, cutting-edge, robust, scalable, seamless

# COLD EMAIL STRUCTURE (FOLLOW THIS — 5-7 short paragraphs total, 60-110 words)

1. **Opener** (1 line): "Hey — looking for [name if known, otherwise 'whoever answers the phones'] at [Company]."

2. **Evidence** (1-2 lines): Quote ONE specific thing from the lead's reviews, website, or notes. If reviews include pain (missed calls, no callback, ghost quote), USE THAT REVIEW VERBATIM (paraphrased only if necessary for length). If no documented pain, point to a specific positive review that proves the OWNER is the operator (e.g. "Saw 5 reviews mentioning Mike personally — clearly you're the one running the show, which is exactly who I built Ada for.").

3. **Pivot** (1 line): "I think I have a way to help with exactly that." (or close variant)

4. **Product** (1-2 lines): ONE concrete behavior of Ada's — NOT a feature list. Pick the behavior that maps to THIS lead's pain. Example behaviors:
   - "Mine catches every after-hours call, books it into your calendar, and texts the caller a confirmation."
   - "Mine follows up on every quote at day 1, 3, and 7 so the ones that go cold stop costing you."
   - "Mine asks every job's customer for a Google review the day after the work, automatically."

5. **Cost anchor** (1 line): "Costs a fraction of what an office manager would." (or close variant — anchoring against a hire the owner already understands)

6. **CTA** (1 line): "Worth a 15-min call this week? I can pull up a sample dashboard and show you what Ada would catch for [Company] specifically."

7. **Sign-off** (1 line): "— Josh"

# HARD BANS (these are the AI tells that get this email deleted on sight)

NEVER use:
- Em dashes (—) inside body prose. The opener "Hey —" and signoff "— Josh" are the ONLY allowed uses.
- "I hope this helps" / "Let me know if..." / "Looking forward to hearing from you" / "Please don't hesitate"
- "stands as a testament" / "marking a pivotal moment" / "transformative" / "groundbreaking" / "innovative"
- "At its core" / "what really matters" / "in today's landscape" / "the future of"
- "Let's dive in" / "Here's what you need to know" / "I wanted to reach out"
- Emoji of any kind
- Bold or italic markup, asterisks, markdown headings
- Bullet lists in the body
- "AI assistant" — say "AI employee" or describe what Ada DOES
- "Synergy" / "leverage" / "robust" / "scalable" / "seamless" / "best-in-class"
- Generic conclusions ("the future looks bright", "exciting times ahead")
- Curly quotes — straight quotes only ("...")
- "Quick question" as an opener (overused cold-email cliche)
- Any sentence that starts with "Just" as a softener ("Just wanted to reach out")
- "Hope you're doing well" / "Hope your week is going great"

# SUBJECT LINE

Write a subject line that:
- References ONE specific thing from the lead's data (their company name + the specific pain, or a person's name from their reviews)
- Is 4-8 words, all lowercase except proper nouns
- Doesn't sound like marketing ("Save 30%!" / "Don't miss this!")
- Examples that work:
  - "Premium Electric — Saturday calls"
  - "Sarah K's review of Sunshine Plumbing"
  - "Quick thought on Apex's missed calls"
  - "AllPro — the calls you're missing"

# CALL THE TOOL

After thinking through the lead's specific data, call save_cold_email_draft with:
- subject: the subject line
- body: the full email body (no subject inside the body)
- rationale: ONE sentence on why you chose this opener for this lead (for Josh's QA)
- personalization_signal: the EXACT data point you used (a review excerpt, a website claim, a signal tag) — Josh will skim this to confirm Ada didn't make something up

If the lead has NO usable specific data (no reviews, no website extract, generic notes), still draft an email but use a softer evidence line like "Saw your shop has been around since [year if available]" or focus on the industry-specific pain Ada solves. Flag in rationale that personalization was thin.`

const TOOLS = [
  {
    name: 'save_cold_email_draft',
    description: 'Save a personalized cold email draft for this lead. Subject + body go to the user; rationale + personalization_signal are for Josh\'s internal QA.',
    input_schema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Subject line. 4-8 words. Specific to this lead. No marketing language.',
        },
        body: {
          type: 'string',
          description: 'Email body, plain text. 60-110 words. 5-7 short paragraphs. Match Josh\'s voice exactly.',
        },
        rationale: {
          type: 'string',
          description: 'One sentence: why this opener was chosen for this lead.',
        },
        personalization_signal: {
          type: 'string',
          description: 'The exact data point used to make this email specific (a review excerpt verbatim, a website claim, a signal tag).',
        },
      },
      required: ['subject', 'body', 'rationale', 'personalization_signal'],
    },
  },
]

function buildLeadContext(lead: LeadRow): string {
  const lines: string[] = []
  lines.push(`Company: ${lead.company_name}`)
  if (lead.contact_name) lines.push(`Contact name: ${lead.contact_name}`)
  if (lead.industry) lines.push(`Industry: ${lead.industry}`)
  const geo = [lead.city, lead.state].filter(Boolean).join(', ')
  if (geo) lines.push(`Location: ${geo}`)
  if (lead.icp_score != null) lines.push(`Ada's ICP score: ${lead.icp_score}`)
  if (lead.icp_score_reason) lines.push(`Ada's reasoning from scoring: ${lead.icp_score_reason}`)
  if (lead.notes) lines.push(`Notes: ${lead.notes}`)
  if (lead.tags && lead.tags.length > 0) {
    // Filter out internal/admin tags that aren't useful for drafting
    const usefulTags = lead.tags.filter(
      (t) => !['google_maps', 'ada_reviewed', 'email_enriched', 'email_verified', 'email_invalid', 'email_unverifiable', 'email_unverified', 'email_not_found', 'email_fetch_error', 'no_website'].includes(t),
    )
    if (usefulTags.length > 0) lines.push(`Tags / signals: ${usefulTags.join(', ')}`)
  }
  if (lead.review_excerpts && lead.review_excerpts.length > 0) {
    lines.push('')
    lines.push(`Reviews (most relevant — use ONE of these verbatim or close-paraphrase if it shows pain):`)
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

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return json({ error: 'Missing authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured (supabase keys)' }, 500)
  if (!anthropicKey) return json({ error: 'Server misconfigured (anthropic key)' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
  const { data: caller } = await admin
    .from('users')
    .select('id, role')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!caller || caller.role !== 'admin') return json({ error: 'Admin only' }, 403)

  let body: DraftRequest
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const requestedIds = Array.isArray(body.lead_ids)
    ? body.lead_ids.filter((id) => typeof id === 'string' && id.length > 0)
    : []
  if (requestedIds.length === 0) {
    return json({ error: 'lead_ids required' }, 400)
  }

  // Pull eligible leads. We require contact_email — drafting an email
  // for a lead with no inbox is a waste of tokens.
  const { data: leads, error: leadErr } = await admin
    .from('cs_leads')
    .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score, icp_score_reason, notes, tags, review_excerpts, website_extract')
    .in('id', requestedIds)
    .not('contact_email', 'is', null)
    .limit(50)

  if (leadErr) return json({ error: `DB read: ${leadErr.message}` }, 500)
  if (!leads || leads.length === 0) {
    return json({
      drafted: {},
      counts: { drafted: 0, failed: 0 },
      message: 'No eligible leads (need contact_email).',
    })
  }

  // Sequential. Each call is ~5-8s on Sonnet 4.6. Anthropic Tier 1 is
  // 50k input tokens/min — system prompt is ~2.5k cached, lead context
  // is ~500-1500 tokens, so 30+ leads/min is achievable. We stay
  // sequential here mostly so we don't exhaust the edge function's
  // wall-clock budget on bigger batches; the frontend chunks anyway.
  const drafted: Record<string, DraftResult> = {}
  const errors: string[] = []
  const counts = { drafted: 0, failed: 0 }

  for (const lead of leads as LeadRow[]) {
    const userMessage = `Draft a cold email for this lead.\n\n${buildLeadContext(lead)}`
    const result = await fetchWithRetry(SYSTEM_PROMPT, userMessage, anthropicKey)

    if ('error' in result) {
      counts.failed++
      errors.push(`${lead.company_name}: ${result.error}`)
      continue
    }

    drafted[lead.id] = result
    counts.drafted++

    // Persist to cs_leads + tag the lead so the UI knows there's a draft.
    const existingTags = (lead.tags ?? []) as string[]
    const tags = [...new Set([...existingTags, 'cold_email_drafted'])]
    const { error: updErr } = await admin
      .from('cs_leads')
      .update({
        draft_cold_email_subject: result.subject,
        draft_cold_email_body: result.body,
        draft_cold_email_rationale: result.rationale,
        draft_cold_email_signal: result.personalization_signal,
        draft_cold_email_at: new Date().toISOString(),
        draft_cold_email_model: MODEL,
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
  })
})
