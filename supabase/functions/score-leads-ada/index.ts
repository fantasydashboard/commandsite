// CommandSite score-leads-ada Edge Function
// ---------------------------------------------------------------------------
// Phase 1.5 of the lead-research engine. After research-leads returns a
// raw Maps batch, the frontend can call this to enrich each result with
// Place Details (reviews) and run Claude across them for a real ICP fit
// score, one-line reasoning, and structured signals.
//
// Why this exists: the existing scoreLead() heuristic only knows
// industry/state/team_size. Reviews carry the actual buying signal —
// "they never called me back", "had to chase them for the quote" —
// and chain detection (Roto-Rooter, One Hour, etc.) needs name + size
// pattern matching that's better as LLM judgment than regex.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    {
//            place_ids: string[],          // up to 60 per request
//            location_label?: string,      // e.g. "Orlando, FL" (context for Claude)
//            industries?: string[],        // context for Claude
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
  industries?: string[]
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

interface SignalKind {
  kind:
    | 'phone_response_complaint'
    | 'quote_followup_complaint'
    | 'small_owner_operator'
    | 'chain_detected'
    | 'no_website'
    | 'closed_or_inactive'
    | 'recent_activity'
    | 'family_business'
    | 'high_review_engagement'
    | 'review_pain_other'
  note: string
}

interface AdaScore {
  score: number
  reasoning: string
  signals: SignalKind[]
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
    'Score a single lead 0-100 against the CommandSite ICP, give one-line reasoning, and surface 1-3 structured signals.',
  input_schema: {
    type: 'object',
    properties: {
      score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description:
          '0-100 fit score. 80+ = strong fit, 60-79 = moderate, 30-59 = weak, 0-29 = skip.',
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
                'phone_response_complaint',
                'quote_followup_complaint',
                'small_owner_operator',
                'chain_detected',
                'no_website',
                'closed_or_inactive',
                'recent_activity',
                'family_business',
                'high_review_engagement',
                'review_pain_other',
              ],
              description: 'The kind of signal observed.',
            },
            note: {
              type: 'string',
              description:
                'Short evidence (e.g., "Review from 2 weeks ago: never called back after quote"). 1 sentence max.',
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
You score B2B prospects for CommandSite, which sells "AI employees" to small service businesses (HVAC, plumbing, electrical contractors) with 1-5 employees. The product (Ada) catches inbound calls, follows up on quotes, asks customers for reviews, and reactivates dormant customers.

The IDEAL customer:
- 1-5 person owner-operated shop, often family-run
- 50-2,000 reviews on Google (real shop, not chain, not brand new)
- Has a website (so we can find an owner email)
- Operational (not closed)
- In a residential service market
- Pain in reviews is ADDITIVE to fit, not required. Most clean small shops won't have public pain in reviews — the pain is latent.

# Score band definitions — calibrate to these explicitly

- **85-100: STRONG FIT with documented pain.** Reviews include explicit complaints about missed calls, ghost quotes, unreturned messages, slow callbacks, or communication failures. The 1-star reviews map directly to Ada's value prop.
- **65-80: STRONG ICP FIT, no documented pain (latent prospect).** Owner-operated 1-5 person shop, named owner in reviews, reasonable review count (~50-500), website, operational, in target geography. No pain visible — but pain is latent, not absent. **This is where most clean small shops should land.** If you're tempted to score lower because "no pain visible", stay here. Pain is additive, not required.
- **50-64: MODERATE FIT.** Slightly larger than 1-5 person target (5-15 person, mixed signals on size) OR borderline-clean ICP shop with some friction signals OR mid-size with some pain.
- **30-49: WEAK FIT.** Too big (multi-location signals, 1500+ reviews on one listing, multiple named office staff suggesting call-center infrastructure), OR operational excellence is so visible the buyer doesn't experience Ada's pain points (see Negative Signals below).
- **0-29: HARD DISQUALIFY.** Chains, closed, no website + no phone, regional/national franchise.

# NEGATIVE signals — operational excellence reduces Ada's value

**Critical:** when reviews show the shop ALREADY HAS the things Ada provides, score LOWER, not higher. Do not invert this logic.

- **Existing receptionist or office staff named in reviews** ("Suzette in the office", "Bri at the front desk", "Sarah always answers") = they already have human reception. Ada would be replacing or augmenting their existing person. Score 30-50, not high.
- **Reviews praising "fast response" / "answered immediately" / "called right back" / "responded same day"** = they've already solved Ada's core value prop. Score 30-50.
- **Multiple named technicians across reviews (5+ different names)** = larger team, likely has dispatcher / admin / call coordination already. Score 30-50.
- **"Service areas: [multiple cities]" language** or **multi-location URL patterns** ("/locations/cityname/", "/locations/orlando-fl/") = chain or growing multi-location operation. Score 5-25.

# Hard disqualifiers (score under 30)

- Franchise / chain (Roto-Rooter, One Hour Heating, Mister Sparky, Aire Serv, ARS Rescue Rooter, Mr. Rooter, Benjamin Franklin Plumbing, Service Experts, Mr. Electric, etc.) — detect by name pattern AND/OR very high review count (>3,000) AND/OR multi-location language
- Permanently or temporarily closed
- No website AND no phone (can't contact)
- Regional chain (typically >2,000 reviews on a single listing)

# Strong-fit signals (push score toward 80+)

- Reviews mention phone-response problems ("called multiple times", "never called back", "after-hours and no answer")
- Reviews mention quote-follow-up problems ("got a quote but never heard back", "had to chase them")
- Reviews mention slow communication or scheduling issues
- Owner named in reviews ("Bob came out", "Mike was great") with no separate office staff named = small shop, named operator
- Family-business language ("been our HVAC guy 15 years", "family-run")
- 4.0-5.0 rating but with at least some 1-2 star reviews calling out the pain Ada solves (those are converting prospects — happy enough to keep operating, frustrated enough to want help)

# Reasoning rules

- Be specific. Reference the actual review text, owner name, employee count, or URL signal you observed.
- Avoid generic statements like "good fit" — say WHY.
- When scoring 65-80 because of latent fit (no documented pain), say so explicitly: e.g. "Clean 1-5 person ICP profile (named owner, 95 reviews, website) — no pain documented in reviews but the latent prospect math fits."
- When scoring 30-50 because of operational excellence, name the specific signal: e.g. "Suzette named as office coordinator across 3 reviews — existing reception infrastructure reduces Ada's gap to fill."

ALWAYS use the score_lead tool to return your assessment. Always include 1-3 signals.
`.trim()

function buildUserPrompt(p: PlaceDetails, locationLabel?: string): string {
  const reviewLines = p.reviews
    .slice(0, 5)
    .map((r, i) => {
      const rating = r.rating != null ? `${r.rating}★` : '?'
      const time = r.relative_time ?? ''
      const text = (r.text ?? '').slice(0, 500)
      return `Review ${i + 1} (${rating}, ${time}): "${text}"`
    })
    .join('\n\n')

  return [
    `Score this lead${locationLabel ? ` (target market: ${locationLabel})` : ''}:`,
    '',
    `Company: ${p.name}`,
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
    // Retry on 429 (rate limit) and 503 (overloaded)
    if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
      const retryAfterHeader = res.headers.get('retry-after')
      const retryAfterSec = retryAfterHeader ? parseFloat(retryAfterHeader) : NaN
      // Exponential backoff with jitter, or honor server's hint when present
      const wait = !isNaN(retryAfterSec)
        ? Math.min(retryAfterSec * 1000, 10_000)
        : baseDelay * Math.pow(2, attempt) + Math.random() * 500
      await new Promise((r) => setTimeout(r, wait))
      // Drain body to avoid leaking the connection
      try { await res.text() } catch { /* ignore */ }
      continue
    }
    return res
  }
  // Should be unreachable; one final fetch as a safety net
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
): Promise<{ result: AdaScore | null; error: string | null }> {
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
        // Haiku 4.5 for the scoring step: ~3x faster + cheaper than Sonnet,
        // plenty of capacity for structured tool-use scoring with reviews
        // as input. Sonnet was overkill and the latency was killing us
        // against Supabase's gateway timeout. If quality drops noticeably,
        // fall back to claude-sonnet-4-6 with a smaller frontend chunk size.
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
  const parsed = block.input as Partial<AdaScore>
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

  // ── Auth: validate JWT, require admin
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

  // ── Parse body
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

  // ── Process places: fetch details + score with Claude.
  // With Haiku 4.5 (~2-3s per call), concurrency=6 gives ~2 leads/sec
  // sustained — comfortably under Anthropic limits with retry-on-429
  // protection, and fast enough that a 25-lead chunk finishes in
  // ~15-20s wall time, well under any gateway timeout.
  const scored: Record<string, AdaScore> = {}
  const errors: string[] = []
  const BATCH_SIZE = 6
  const INTER_BATCH_MS = 150

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
    // Tiny breather between batches to spread Anthropic load smoothly
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
