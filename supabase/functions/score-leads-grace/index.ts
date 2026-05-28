// CommandSite score-leads-grace Edge Function
// ---------------------------------------------------------------------------
// Church-targeted ICP scoring (parallel to score-leads-ada, separate brain).
//
// **Status: v1 starting point.** Tuned from research, not yet from real
// converting customers. Calibration knobs to revisit once Focal Point
// (and the next 5-10 church prospects) give us pattern data:
//   - Sweet-spot attendance band (currently 200-800; may shift smaller)
//   - Which denominations actually convert (currently using openness heuristic)
//   - Which review-tone signals actually predict fit (currently guessing)
//   - Whether we need a separate non-review enrichment pass (website read
//     for "I'm new" page, ChMS footer detection — currently relying on
//     review text + place metadata only)
//
// Signal availability gap vs. Ada:
//   - HVAC reviews carry explicit pain ("never called back"). Churches
//     don't. Pastoral culture avoids public criticism. So signals here
//     are mostly STRUCTURAL (size, denomination, region) and qualitative
//     (welcome warmth, visitor experience language). Calibrate carefully.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    {
//            place_ids: string[],          // up to 60 per request
//            location_label?: string,      // e.g. "Orlando, FL"
//            denomination_hints?: string[] // optional context, e.g. ["Non-denominational"]
//          }
// Returns: {
//            scored: { [place_id]: { score, reasoning, signals } },
//            errors?: string[],
//          }
// Secrets: GOOGLE_MAPS_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

interface ScoreRequest {
  place_ids?: string[]
  location_label?: string
  denomination_hints?: string[]
}

interface PlaceDetails {
  id: string
  name: string
  address: string
  rating: number | null
  rating_count: number | null
  types: string[]
  business_status: string | null
  website: string | null
  reviews: Array<{ text: string; rating: number | null; relative_time: string | null }>
}

interface GraceSignalKind {
  kind:
    | 'sweet_spot_size'           // review count maps to 200-800 attendance band
    | 'too_small'                  // <10 reviews — likely a house church / under 100
    | 'too_large'                  // >1500 reviews — megachurch with admin staff
    | 'evangelical_open'           // non-denominational / Acts 29 / ARC / EFCA / Baptist
    | 'traditional_open'           // PCA, EPC, AG, modern Methodist
    | 'centralized_skip'           // Catholic diocese, LDS, JW, SDA, Orthodox
    | 'visitor_welcome_language'   // reviews mention "welcomed", "first time", "newcomers"
    | 'community_signal'           // reviews mention community, family, belonging
    | 'no_website'                 // can't even contact
    | 'closed_or_inactive'         // permanently/temporarily closed
    | 'multi_campus_megachurch'    // multi-site language detected
    | 'modern_engagement'          // recent reviews, sermon archive language
    | 'review_tone_other'          // other notable tonal signal
  note: string
}

interface GraceScore {
  score: number
  reasoning: string
  signals: GraceSignalKind[]
}

const PLACE_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'rating',
  'userRatingCount',
  'types',
  'businessStatus',
  'websiteUri',
  'reviews.text',
  'reviews.rating',
  'reviews.relativePublishTimeDescription',
].join(',')

const SCORE_LEAD_TOOL = {
  name: 'score_lead',
  description:
    'Score a single church 0-100 against the Grace ICP, give one-line reasoning, and surface 1-3 structured signals.',
  input_schema: {
    type: 'object',
    properties: {
      score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description:
          '0-100 fit score. 80+ = strong fit, 65-79 = latent fit, 50-64 = marginal, 30-49 = weak, 0-29 = skip.',
      },
      reasoning: {
        type: 'string',
        description:
          'One-sentence reason for the score. Reference the specific signal that drove it.',
      },
      signals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: [
                'sweet_spot_size',
                'too_small',
                'too_large',
                'evangelical_open',
                'traditional_open',
                'centralized_skip',
                'visitor_welcome_language',
                'community_signal',
                'no_website',
                'closed_or_inactive',
                'multi_campus_megachurch',
                'modern_engagement',
                'review_tone_other',
              ],
              description: 'The kind of signal observed.',
            },
            note: {
              type: 'string',
              description:
                'Short evidence (e.g., "Review: \'we felt welcomed our first Sunday\'"). 1 sentence max.',
            },
          },
          required: ['kind', 'note'],
        },
        minItems: 1,
        maxItems: 3,
      },
    },
    required: ['score', 'reasoning', 'signals'],
  },
}

const SYSTEM_PROMPT = `
You score churches for CommandSite, which sells Grace, an AI ministry assistant. Grace handles visitor follow-up, member drift detection, weekly communications, and care triage for small-to-mid churches. She drafts; the church team approves and sends.

The IDEAL customer is a 200-800 weekly attendance Protestant church with:
- Limited admin staff (pastor doing operational work that should be systemized)
- Care for first-time visitors but no documented follow-up system
- Willingness to use modern tools (Planning Center, online giving, social media presence)
- Decision-making authority that doesn't go through a denominational headquarters

# Score band definitions

- **85-100: STRONG FIT.** 200-800 attendance band by review count proxy, evangelical or non-denominational, modern engagement signals (active reviews, "I'm new" / "first time visitor" language, welcome tone), in a region where the buyer profile is common (Southeast, Midwest, Sun Belt especially).
- **65-79: LATENT FIT.** Right denomination + size, OR right size with denominational uncertainty, but missing one signal. The default landing zone for "looks correct, no documented pain." Pain in churches is rarely public — score latent fits here, not below.
- **50-64: MARGINAL.** Size mismatch (too small ~50-100 or too large 1500+) OR denominational concern (very traditional, central decision-making likely) OR weak engagement signals.
- **30-49: WEAK.** Multiple concerns: small + traditional + no website, or large + multi-campus + no visible pain mechanism Grace solves.
- **0-29: HARD DISQUALIFY.** Closed, no website, centralized denominations (Catholic diocese, LDS, JW, SDA, Orthodox), confirmed multi-campus megachurch with admin team.

# Important: how to read church signals

**Pain in reviews is RARE.** Churches don't get 1-star "they never followed up" reviews like HVAC shops do. Pastoral culture and reviewer self-selection (only happy attendees review) suppresses negative signal. So:
- The ABSENCE of negative reviews is NOT a disqualifier — it's the norm.
- Positive review tone IS a signal: warm welcome language, family/community references, mentions of visitor experience.
- Default to scoring on STRUCTURAL fit (size, denomination, region, website) rather than chasing review pain.

# Size estimation via review count (rough proxy)

This is approximate. Treat as a range, not a number:

- **<10 reviews**: probably under 100 attendance. Too small for Grace's pricing — score 50-64.
- **10-50 reviews**: 100-300 attendance. Lower edge of sweet spot — score 65-79 if other signals are good.
- **50-200 reviews**: 200-800 attendance. **Sweet spot.** Score 80+ on other signal alignment.
- **200-500 reviews**: 500-1,500 attendance. Upper edge. Score 70-85 — may have admin staff already.
- **500-1,500 reviews**: 1,500-5,000+ attendance. Megachurch territory. Probably has paid admin team — score 30-55.
- **>1,500 reviews**: Confirmed megachurch with multiple campuses. Hard skip — score 0-29.

# HARD review-count score CAPS — ABSOLUTE CEILINGS, NOT SUGGESTIONS

These are mathematical ceilings. They are not influenced by review tone, warmth, signal density, or any other rationale. If a church has N reviews, its score CANNOT exceed cap(N), full stop:

- **<20 reviews**: score MUST be ≤ 75
- **20-50 reviews**: score MUST be ≤ 80
- **50+ reviews**: no cap from review count (full 0-95 range available)

The cap is binding. There is no version of "but the structural signals justify a higher score" that is valid. If you find yourself writing reasoning that says "the cap allows X but I'm scoring X+2 because [reason]" — STOP. The cap won. Score = cap.

Why this is absolute: review count is a size proxy. A 47-review church is structurally smaller than a 200-review church, period. No amount of warm welcome language changes the underlying size. We'd rather under-score a small-but-quality church and let downstream prioritization sort it out than inflate the entire small-church band and lose the differentiation.

## Final cap-enforcement check — MANDATORY before returning your score

Run this sequence as the LAST step:

1. Look at review count → identify the cap.
2. Is your candidate score above the cap?
3. If yes: set score = cap. Do not rationalize a higher number.
4. State explicitly in reasoning: "Final score: [cap value], constrained by review-count cap on [N] reviews."

Example of the CORRECT thinking:
> "Strong signals would justify 84, but 47 reviews caps at 80. Final score: 80."

Example of WRONG thinking (do not do this):
> "Capped by review count: 47 reviews allows up to 80, but strong signals justify 82."

The cap is not a starting point you can argue past. It is the maximum value the score field will ever hold for a church with that review count.

# Denomination detection (from church name patterns)

**Open (boost toward 80+):**
- "Community Church", "Bible Church" (typically non-denominational)
- "Acts 29", "ARC", "Stadia", "Pillar" if visible in name
- "Baptist" without "Primitive/Reformed" qualifier (Southern Baptist + non-denom Baptist = open)
- "Evangelical Free", "Evangelical Covenant"

**Moderate (default to 65-79):**
- "Presbyterian" (PCA = open, others vary)
- "Methodist" (modern Methodist = open; traditional = mid)
- "Assemblies of God", "Pentecostal" (modern = open)
- "Lutheran" without "Missouri Synod" qualifier
- "Anglican" / "Episcopal" (varies — high-church liturgy may indicate slower tech adoption)
- Generic "Church of [city]" or unspecified — treat as moderate

**Centralized decision-making (hard skip, score 0-29):**
- "Catholic" or any Catholic parish name pattern (decisions go through diocese)
- "Latter-day Saints" / "LDS" / "Mormon" (central HQ)
- "Jehovah's Witnesses" / "Kingdom Hall"
- "Seventh-day Adventist" / "SDA" (denominational HQ buys tech)
- "Orthodox" / "Greek Orthodox" / "Russian Orthodox" / "Coptic"
- "Amish", "Mennonite" (often actively avoid modern tech)

# Visible buying signals to look for

**Push toward 80+:**
- Review language: "welcomed", "loved our first Sunday", "felt at home", "newcomers", "visitor friendly"
- Review language: "kids program", "small groups", "community", "family"
- Website present and seems modern (websiteUri exists)
- Recent reviews (within last 90 days) — active congregation

**Push toward 30-49:**
- No website
- Reviews note unfriendliness or "hard to find", "couldn't connect"
- Mentions of being "tied to" a larger network (suggests central decision)

**Hard disqualifiers (score 0-29):**
- Business status = CLOSED_TEMPORARILY or CLOSED_PERMANENTLY
- Multi-campus language in name (see strict rule below)
- Name pattern matches centralized denominations above
- >1,500 reviews AND multi-campus or megachurch language

# STRICT MULTI-CAMPUS NAME RULE — check this FIRST, before any other scoring

A church name that includes any of these tokens is a satellite of a larger network and CANNOT be a Grace customer. Score 20-40, no exceptions, regardless of how warm the reviews are:

- The word **"Campus"** anywhere in the name (e.g., "Alive Church — Florida Mall Campus", "Church X — Downtown Campus")
- The word **"Satellite"** in the name
- A directional + city qualifier appended: "Church X — North Orlando", "Church X — South Tampa", "Church X — Eastside"
- "Site" as a sibling word ("Church X — Westside Site")
- Numbered locations ("Church X — Location 3")

Even if the reviews glow, even if the size proxy lands in the sweet spot, even if the denomination is open — multi-campus means the buying decision is made centrally (at HQ), not by the local pastor. Grace is built for single-location autonomous churches. Apply this rule BEFORE running any other scoring logic. If the name passes this gate, then evaluate normally.

The check is on the NAME field, not the review text. A megachurch attendee mentioning "the downtown campus" in a review is not the same signal as the name itself being "Church X — Downtown Campus."

# SPREAD YOUR SCORES — do not anchor on round numbers

When you find yourself reaching for 82, 75, 65, 45, 35 — stop and ask which specific number better reflects the differentiation. Use the FULL 65-92 range, not just 4-5 round values.

Specifically:
- A 400-review established sweet-spot church and a 50-review newer-plant sweet-spot church should NOT both score 82. The 400-review church is structurally a stronger fit; score it 84-88. The 50-review one should be 72-78 (and capped by the review-count rule above).
- **Use ANY integer 65-92**, including 73, 77, 83, 85, 87, 89, 91. Not just multiples of 2 or 5.
- Differentiate within bands using the specific signals you observed. If one church has 3 strong signals and another has 1 strong signal, they should not get the same number.
- Avoid the pattern of "everyone above the line gets 86." Real differentiation looks like a spread: 73, 78, 81, 84, 87, 91 — each justified by a slightly different evidence weight.

# Pain-tone interpretation (CRITICAL — was being misread in v1)

Negative reviews are NOT all the same signal. Read them carefully:

- **1-star reviews about UNRESPONSIVENESS, MISSED FOLLOW-UP, "never heard back from anyone," "filled out connect card, nothing"**: this is Grace's EXACT wedge. This is an UPGRADE signal. Push the score 5-10 points higher. Example: "Two 1-star reviews from first-time visitors who never got a follow-up message — exactly the gap Grace fills. Score: 87."
- **1-star reviews about unfriendliness, doctrinal disagreement, parking, building, music style, sermon length**: these are NOT Grace's problem. Treat as neutral or slight downgrade only if there's a pattern.
- **1-star reviews about operational friction in member care (e.g., grief support gone wrong, didn't know member was sick)**: Grace's wedge. UPGRADE signal.

The mistake to avoid: treating any negative review as a generic "red flag on pastoral capacity." Pastoral capacity gaps ARE Grace's product, not a disqualifier.

# Worship style is NEUTRAL — do not use it as either a positive or negative signal

Worship style carries NO scoring weight. This is symmetric:

- Charismatic / Pentecostal / "high-production" worship is NOT a sign of "resistance to admin tools." Also NOT a sign of "tech-forward culture." It is neutral.
- Traditional / liturgical worship is NOT a sign of being closed to AI. Also NOT a sign of being structurally serious. It is neutral.
- Praise / contemporary / blended / acoustic / hymn-based — all neutral.

If your reasoning mentions worship style at all as either a positive or negative for the score, you are doing it wrong. Score on structure (size, denomination, region, tech adoption signals), not on worship aesthetics.

The ONE exception: if the denomination itself is centrally-governed (per the centralized denominations list above), that's a denomination signal, not a worship-style signal.

# Reasoning rules

- Be specific. Reference the church name, denomination cue, attendance estimate, or review tone.
- Avoid generic statements. Say WHY this score in this case.
- When scoring 65-79 (latent fit), explicitly note "no documented pain but structural fit is good" or similar.
- When scoring 0-29, name the specific disqualifier (closed, centralized denomination, megachurch scale).
- When in doubt between 65 and 75, lean toward 70 — let downstream filtering decide.

ALWAYS use the score_lead tool to return your assessment. Always include 1-3 signals.
`.trim()

function buildUserPrompt(p: PlaceDetails, locationLabel?: string): string {
  const reviewLines = p.reviews
    .slice(0, 5)
    .map((r, i) => {
      const rating = r.rating != null ? `${r.rating}★` : '?'
      const time = r.relative_time ?? ''
      const text = (r.text ?? '').slice(0, 300)
      return `Review ${i + 1} (${rating}, ${time}): "${text}"`
    })
    .join('\n\n')

  return [
    `Score this church${locationLabel ? ` (target market: ${locationLabel})` : ''}:`,
    '',
    `Name: ${p.name}`,
    `Address: ${p.address}`,
    `Google rating: ${p.rating != null ? p.rating.toFixed(1) + '★' : 'n/a'} (${p.rating_count ?? 0} reviews)`,
    `Business status: ${p.business_status ?? 'unknown'}`,
    `Types: ${p.types.join(', ') || 'unknown'}`,
    `Website: ${p.website ?? 'none'}`,
    '',
    `Recent reviews (${p.reviews.length} of ${p.rating_count ?? 0} total):`,
    reviewLines || '(no reviews returned)',
  ].join('\n')
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { maxRetries?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 2
  const baseDelay = opts.baseDelayMs ?? 1500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init)
    if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
      const retryAfterHeader = res.headers.get('retry-after')
      const retryAfterSec = retryAfterHeader ? parseFloat(retryAfterHeader) : NaN
      const wait = !isNaN(retryAfterSec)
        ? Math.min(retryAfterSec * 1000, 10_000)
        : baseDelay * Math.pow(2, attempt) + Math.random() * 500
      await new Promise((r) => setTimeout(r, wait))
      try { await res.text() } catch { /* ignore */ }
      continue
    }
    return res
  }
  return await fetch(url, init)
}

async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<PlaceDetails | null> {
  const res = await fetchWithRetry(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
      },
    },
  )
  if (!res.ok) return null
  // deno-lint-ignore no-explicit-any
  const p: any = await res.json()
  if (!p?.id) return null
  return {
    id: p.id,
    name: p.displayName?.text ?? 'Unknown',
    address: p.formattedAddress ?? '',
    rating: typeof p.rating === 'number' ? p.rating : null,
    rating_count: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    types: Array.isArray(p.types) ? p.types : [],
    business_status: typeof p.businessStatus === 'string' ? p.businessStatus : null,
    website: typeof p.websiteUri === 'string' ? p.websiteUri : null,
    reviews: Array.isArray(p.reviews)
      ? p.reviews.map((r: any) => ({
          text: r.text?.text ?? '',
          rating: typeof r.rating === 'number' ? r.rating : null,
          relative_time: r.relativePublishTimeDescription ?? null,
        }))
      : [],
  }
}

async function scoreOne(
  details: PlaceDetails,
  locationLabel: string | undefined,
  anthropicKey: string,
): Promise<{ result: GraceScore | null; error: string | null }> {
  const userPrompt = buildUserPrompt(details, locationLabel)
  const res = await fetchWithRetry(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Match Ada's choice: Haiku 4.5 for the scoring step.
        // Cheaper + faster; quality is fine for structured tool-use scoring.
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userPrompt }],
        tools: [SCORE_LEAD_TOOL],
        tool_choice: { type: 'tool', name: 'score_lead' },
      }),
    },
    { maxRetries: 2 },
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return {
      result: null,
      error: `Anthropic ${res.status}: ${text.slice(0, 200)}`,
    }
  }
  // deno-lint-ignore no-explicit-any
  const data: any = await res.json()
  const block = (data.content ?? []).find(
    (b: any) => b.type === 'tool_use' && b.name === 'score_lead',
  )
  if (!block || !block.input) {
    return {
      result: null,
      error: `No tool_use block in response (stop_reason=${data.stop_reason ?? 'unknown'})`,
    }
  }
  const parsed = block.input as Partial<GraceScore>
  if (typeof parsed.score !== 'number' || typeof parsed.reasoning !== 'string') {
    return { result: null, error: 'Tool output missing required fields' }
  }
  return {
    result: {
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      reasoning: parsed.reasoning,
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
    },
    error: null,
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return json({ error: 'Missing authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server misconfigured' }, 500)
  }
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
  const { data: caller } = await admin
    .from('users')
    .select('id, role')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!caller || caller.role !== 'admin') return json({ error: 'Admin only' }, 403)

  let body: ScoreRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const placeIds = Array.isArray(body.place_ids)
    ? body.place_ids.filter((id) => typeof id === 'string' && id.length > 0)
    : []
  if (placeIds.length === 0) return json({ error: 'place_ids required' }, 400)
  if (placeIds.length > 60) return json({ error: 'max 60 place_ids per request' }, 400)
  const locationLabel = typeof body.location_label === 'string' ? body.location_label : undefined

  const mapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!mapsKey) return json({ error: 'Google Maps API key not configured' }, 500)
  if (!anthropicKey) return json({ error: 'Anthropic API key not configured' }, 500)

  const scored: Record<string, GraceScore> = {}
  const errors: string[] = []
  const BATCH_SIZE = 3
  const INTER_BATCH_MS = 250

  for (let i = 0; i < placeIds.length; i += BATCH_SIZE) {
    const batch = placeIds.slice(i, i + BATCH_SIZE)
    const settled = await Promise.allSettled(
      batch.map(async (placeId) => {
        const details = await fetchPlaceDetails(placeId, mapsKey)
        if (!details) {
          throw new Error(`Place Details fetch failed for ${placeId}`)
        }
        const { result, error } = await scoreOne(details, locationLabel, anthropicKey)
        if (!result) {
          throw new Error(`Scoring failed for "${details.name}": ${error ?? 'unknown'}`)
        }
        return { placeId, result }
      }),
    )
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        scored[s.value.placeId] = s.value.result
      } else {
        errors.push(s.reason instanceof Error ? s.reason.message : String(s.reason))
      }
    }
    if (i + BATCH_SIZE < placeIds.length) {
      await new Promise((r) => setTimeout(r, INTER_BATCH_MS))
    }
  }

  return json({
    scored,
    count: Object.keys(scored).length,
    errors: errors.length > 0 ? errors : undefined,
  })
})
