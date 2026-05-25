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

> Hey, I'm looking for whoever answers the phones at Premium Electric.
>
> I saw a review on your Google listing from Sarah K. last month — she tried calling three times with no answer back. That's exactly what I built this for.
>
> I build AI employees for shops your size. Mine catches every after-hours call, books it into your calendar, and texts the caller a confirmation. Costs a fraction of what an office manager would.
>
> Worth a 15-min call this week? I can pull up a sample dashboard and show you what my AI employee would catch for Premium Electric specifically.
>
> — Josh
>
> P.S. If a call's too much for this week, hit reply with "video" and I'll send a 90-second walkthrough instead.

Voice characteristics to match:
- Conversational opener ("Hey, I'm looking for..." — lowercase casual, comma not em-dash) — never "Dear" or "To Whom It May Concern"
- Always include the subject pronoun ("I saw", "I noticed", "I think") — don't drop it ("Saw a review", "Noticed something" — these feel curt + clipped, not human)
- References ONE specific piece of evidence (a real review excerpt with a name + detail, or a specific website claim)
- Pain → product → cost anchor → CTA → PS structure
- Run-on sentences with "and" / "but" connectors are fine — that's how Josh talks
- "Shops your size" / "for [Company] specifically"
- Casual sign-off: "— Josh" (em dash here is permitted because it's a sig pattern, not in body prose)
- NEVER use buzzwords like: leverage, synergy, transformative, groundbreaking, cutting-edge, robust, scalable, seamless
- NEVER name "Ada" in the body — they don't know who that is yet. Say "AI employee" or "my AI employee" until they're on the discovery call

# OPENER — INDUSTRY-AWARE "looking for…" PHRASING

The opener is "Hey, I'm looking for [whoever ___] at [Company]." The blank changes by industry because the operator who'd care about call/quote/review automation is a different role in different verticals.

Pick the phrasing that matches the lead's actual operations:
- HVAC, plumbing, residential electrical, pest control, pool service → "whoever answers the phones"
- Roofing, landscaping (project work) → "whoever handles new estimate requests"
- Commercial electrical, large-scale roofing → "whoever handles new project inquiries"
- Cleaning, recurring landscaping, lawn care → "whoever schedules new clients"
- Garage door, plumbing emergency → "whoever picks up after-hours"
- Churches / ministries → "whoever follows up with new visitors"

If the contact name IS known, you can swap to "looking for [Name]" instead of the role-based phrase. Either is fine — name is slightly stronger if it feels natural.

# PIVOT — DON'T HEDGE

The line that connects evidence to product. NEVER use "I think I have a way to help" or "I might be able to" or anything hedged. Use a confident, specific pivot:

- "That's exactly what I built this for."
- "Solving exactly that is what I do."
- "That's the problem my AI employee was built to fix."

Pick one that fits the rhythm. Skip the pivot ENTIRELY if going straight from evidence to product reads better — sometimes the cleanest version has no pivot sentence at all.

# PS LINE — REQUIRED

After "— Josh", always add a PS that gives a lower-friction reply path. Use this exact phrasing:

> P.S. If a call's too much for this week, hit reply with "video" and I'll send a 90-second walkthrough instead.

The PS is consistent across leads. Don't try to vary it. Reason: PS reads at ~70% rate (eye-tracking research) — it's the highest-leverage line in the whole email. The "video" reply path lifts response rate by giving a no-call alternative.

# COLD EMAIL STRUCTURE (FOLLOW THIS — 6-8 short paragraphs including PS)

1. **Opener** (1 line): "Hey, I'm looking for [industry-aware 'whoever ___' OR known first name] at [Company]." (comma after Hey, not em-dash. Always include "I'm".)

2. **Evidence** (1-2 lines): Start with "I saw..." or "I noticed..." — include the pronoun. Quote ONE specific thing from the lead's reviews, website, or notes. If reviews include pain (missed calls, no callback, ghost quote), USE THAT REVIEW VERBATIM (paraphrased only if necessary for length). If no documented pain, point to a specific positive review that proves the OWNER is the operator (e.g. "I saw 5 reviews mentioning Mike personally, so clearly you're the one running the show — which is exactly who I built this for.").

3. **Pivot** (1 line, optional): Confident, specific. "That's exactly what I built this for." Skip if evidence flows naturally into product.

4. **Product** (1-2 lines): ONE concrete behavior of the AI employee — NOT a feature list. Pick the behavior that maps to THIS lead's pain. Example behaviors:
   - "Mine catches every after-hours call, books it into your calendar, and texts the caller a confirmation."
   - "Mine follows up on every quote at day 1, 3, and 7 so the ones that go cold stop costing you."
   - "Mine asks every job's customer for a Google review the day after the work, automatically."

5. **Cost anchor** (1 line): "Costs a fraction of what an office manager would." (or close variant — anchoring against a hire the owner already understands)

6. **CTA** (1 line): "Worth a 15-min call this week? I can pull up a sample dashboard and show you what my AI employee would catch for [Company] specifically."

7. **Sign-off** (1 line): "— Josh"

8. **PS** (1 line, REQUIRED): 'P.S. If a call's too much for this week, hit reply with "video" and I'll send a 90-second walkthrough instead.'

# WORD COUNT — HARD CAP

The MAIN BODY (lines 1-7, opener through sign-off) MUST be under 90 words. Target 70-85 words.
The PS is fixed phrasing (~22 words) and is NOT counted against the body cap.
Total email including PS should be ~95-110 words.

Count your body words before submitting. If you're over 90, cut the evidence to one sentence or trim the product description. Cold emails with bodies over 100 words get scrolled past on phone, where small business owners read.

# HARD BANS (these are the AI tells that get this email deleted on sight)

NEVER use:
- Em dashes (—) inside body prose. The signoff "— Josh" is the ONLY allowed use. The opener uses a comma ("Hey, I'm looking for..."), not an em-dash.
- The name "Ada" in the body. The recipient doesn't know who Ada is yet — use "AI employee" or "my AI employee" instead. (Ada gets introduced on the discovery call.)
- Dropped subjects ("Saw a review", "Noticed something") — always include "I" so it reads like a human typing, not a chatbot summary.
- "I hope this helps" / "Let me know if..." / "Looking forward to hearing from you" / "Please don't hesitate"
- "stands as a testament" / "marking a pivotal moment" / "transformative" / "groundbreaking" / "innovative"
- "At its core" / "what really matters" / "in today's landscape" / "the future of"
- "Let's dive in" / "Here's what you need to know" / "I wanted to reach out"
- Emoji of any kind
- Bold or italic markup, asterisks, markdown headings
- Bullet lists in the body
- "AI assistant" — say "AI employee" or describe what it does
- "Synergy" / "leverage" / "robust" / "scalable" / "seamless" / "best-in-class"
- Generic conclusions ("the future looks bright", "exciting times ahead")
- Curly quotes — straight quotes only ("...")
- "Quick question" as an opener (overused cold-email cliche)
- Any sentence that starts with "Just" as a softener ("Just wanted to reach out")
- "Hope you're doing well" / "Hope your week is going great"

# SUBJECT LINE — lowercase, casual, signal-aware

The subject's ONLY job is to earn the open. The body's job is to earn the reply. Pain belongs in the body, not the subject.

The "Quick question for X" template (used historically) is now widely templated by every cold-email tool. We've moved to lowercase casual subjects that look like they were typed by a human, not a sequencing tool. Lowercase signals "personal note"; Title Case signals "automated".

## Pick the FIRST pattern that applies (priority order — top to bottom)

### Pattern 1 — Review reference (USE WHEN AVAILABLE)

If the lead has a quotable review with a recognizable reviewer name, use:

\`saw [reviewer first name] [last initial].'s review\`

Examples:
- \`saw sarah k.'s review\`        (21 chars)
- \`saw patricia j.'s review\`     (24 chars)
- \`saw mike p.'s review\`         (20 chars)

If the reviewer is full-name in the source ("Sarah Kim"), abbreviate to \`sarah k.\` for the subject. ALL LOWERCASE including the reviewer name.

This is the highest-converting pattern because it's instantly relevant — proves the email is about THEM, not a template.

### Pattern 2 — Pastor (CHURCH leads only)

If the industry includes "Church", "Ministry", "Cathedral", or "Parish" — and a pastor first name is known:

\`pastor [firstname],\`

Examples:
- \`pastor jeff,\`     (12 chars)
- \`pastor andrew,\`   (14 chars)

If pastor name is unknown:

\`pastor,\`            (7 chars)

### Pattern 3 — First name (default for service businesses without a quotable review)

If a confident first name is known but no quotable review:

\`[firstname],\`       (lowercase + trailing comma)

Examples:
- \`tony,\`         (5 chars)
- \`mike,\`         (5 chars)
- \`maria,\`        (6 chars)

The trailing comma is required — it implies a sentence is coming, which earns the open. \`tony\` alone reads weird; \`tony,\` reads like a personal note.

### Pattern 4 — Business name fallback

If no first name AND no quotable review (e.g., generic email like info@):

\`[business name],\`   (lowercase + trailing comma)

Examples:
- \`premium electric,\`     (17 chars)
- \`sunshine plumbing,\`    (18 chars)
- \`tony's hvac,\`          (12 chars)

## How to find the reviewer name (Pattern 1 lookup)

Look in the lead data for review excerpts. Common locations:
- \`review_excerpts\` field
- \`icp_score_reason\` ("a review from Sarah K. mentioned…")
- \`notes\` field
- The Touch 1 evidence line you're about to write — if you're quoting a named reviewer, that's the same name to use in the subject

If the reviewer is just initials ("S.K.") or a single name like "Patricia", abbreviate or use the first name only. Skip Pattern 1 if no clear named reviewer exists.

## How to find the first name (Patterns 2, 3 lookup)

Look in this priority order:
1. \`contact_name\` field on the lead — first word, lowercase for the subject
2. Names called out in \`icp_score_reason\` or \`notes\`
3. The local-part of the email IF it's clearly a first name (tony@... → tony, mike@... → mike). Skip if it's "info@", "contact@", "office@", a last name only, or initials
4. If none of the above, fall back to Pattern 4 (business name)

## Capitalization

ALL LOWERCASE for the subject — including names. \`tony,\` not \`Tony,\`. \`saw sarah k.'s review\` not \`Saw Sarah K.'s Review\`. The lowercase is signaling "personal note" — capitalization signals "marketing email."

The ONLY exception: the body of the email DOES capitalize names properly ("Hey, I'm looking for whoever..."). It's just the subject that stays lowercase.

## Hard bans

NEVER write subjects in any of these patterns:
- "Quick question for X" — retired (overused by every cold-email tool)
- \`[Company] — [problem]\` — the templated vendor pattern ("Comfort Pros — missed calls"). Banned.
- ALL CAPS or shouty styling
- Emoji
- Exclamation marks
- Spam triggers: free, guarantee, limited time, act now, exclusive, urgent, risk-free, congratulations
- Naming a person + a failure ("calls Tony can't catch") — banned
- Title Case anywhere in the subject ("Saw Sarah's Review" — banned)
- Subjects longer than 40 characters

Predictability isn't the goal here — relevance is. Pattern 1 (review-based) when possible, Pattern 3/4 (lowercase name) as fallback.

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
          description: 'Subject line. ALL LOWERCASE. Pick first matching pattern: (1) "saw [reviewer firstname] [last initial].\'s review" if a quotable named reviewer exists; (2) "pastor [firstname]," for church leads (or "pastor," if no name); (3) "[firstname]," for service businesses with a known first name (lowercase + trailing comma); (4) "[business name]," fallback. NEVER use "Quick question for X" — retired. No Title Case. Max 40 chars. No emoji, no exclamation marks.',
        },
        body: {
          type: 'string',
          description: 'Email body + PS, plain text. MAIN BODY (opener through "— Josh") capped at 90 words; PS is fixed phrasing not counted. Total 95-110 words. Opener: "Hey, I\'m looking for [industry-aware whoever-clause OR known first name] at [Company]." (comma after Hey, always include "I\'m"). Evidence line: "I saw..." or "I noticed..." (always include the subject pronoun). Confident pivot ("That\'s exactly what I built this for.") or skip the pivot. End with REQUIRED PS: \'P.S. If a call\'s too much for this week, hit reply with "video" and I\'ll send a 90-second walkthrough instead.\' NEVER use the name "Ada" in the body — say "AI employee" or "my AI employee". No em dashes inside body prose (only allowed in "— Josh" signoff).',
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured (supabase keys)' }, 500)
  if (!anthropicKey) return json({ error: 'Server misconfigured (anthropic key)' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Auth (intentionally permissive). Gateway-level verify_jwt is OFF
  // (see supabase/config.toml). The function only writes drafts to
  // leads that already exist + already pass the operator-configured
  // min_score filter, so unauthenticated callers can't dictate
  // anything dangerous — at worst they trigger drafting that was
  // already going to happen on the next hourly tick.
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const isServiceRole = jwt && jwt === serviceRoleKey
  const isCronCall = !jwt  // pg_cron path: no Authorization header

  // Only validate as admin JWT when the caller provided a non-service-role token
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

  // When called by the cron (no lead_ids in body), auto-discover the
  // candidates: leads with a contact email, scored above the min, with
  // no draft yet, not paused. The page chain passes explicit lead_ids so
  // it can preview "drafting N leads" in the ticker.
  let requestedIds = Array.isArray(body.lead_ids)
    ? body.lead_ids.filter((id) => typeof id === 'string' && id.length > 0)
    : []

  if (requestedIds.length === 0 && isCronCall) {
    // Read the min-score threshold from cs_settings so the cron honors
    // the operator's autodraft preference (default 65 to match the UI).
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
      .order('icp_score', { ascending: false, nullsFirst: false })
      .limit(10)
    requestedIds = (discovered ?? []).map((r: { id: string }) => r.id)
  }

  if (requestedIds.length === 0) {
    return json({ ok: true, drafted: {}, counts: { drafted: 0, failed: 0 }, skipped: 'no_candidates' })
  }

  // Pull eligible leads. We require contact_email — drafting an email
  // for a lead with no inbox is a waste of tokens. Paused leads (replies
  // received, or operator-paused) drop out — drafting at someone who's
  // already replied is the exact "stop on response" violation we built
  // outreach_paused to prevent.
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
        // Drop the draft into the approval queue (mig 0039). Both
        // page-driven and cron-driven callers share this behavior.
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
  })
})
