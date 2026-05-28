// CommandSite lead-sourcing-cron Edge Function
// ---------------------------------------------------------------------------
// Hands-off lead pull. Each tick:
//
//   1. Find or activate a campaign (cs_lead_campaigns).
//      - If one is already 'active', use it.
//      - Else pick the lowest-priority 'pending' row, flip it to 'active'.
//      - If nothing pending, return early. Operator must queue more work.
//
//   2. Query Google Places (New) for businesses matching the campaign's
//      keywords × cities. Each (keyword, city) combination is one Places
//      textsearch call ("hvac contractor in Tampa, FL"). Iterates until
//      PULL_BATCH_LIMIT new leads are gathered.
//
//   3. For each result: dedupe against cs_leads (by company_url when
//      present, falling back to company_name+city+state), insert a new
//      row tagged with source_campaign_id. Lead lands as status='new',
//      no email yet — the enrichment cron picks up next.
//
//   4. Bump campaign.pulled_count. If >= target_count OR Google returned
//      nothing new, flip to 'done'. Activates the next pending campaign on
//      the next tick.
//
// Why Google Places over Apollo for this use case:
//   - Coverage of local service businesses (HVAC, plumbing, etc.) is far
//     better on Maps than Apollo. Apollo is for B2B SaaS firmographic data.
//   - Google's free tier is generous; Apollo's bulk-company-search endpoint
//     requires a paid plan.
//   - Apollo can still be used downstream for *enrichment* on a per-lead
//     basis (apollo-enrich-lead works on free) once we have a domain.
//
// Auth:    Authorization: Bearer <admin user JWT>  OR
//          X-Cron-Secret: <LEAD_SOURCING_CRON_SECRET>
// Body:    {} or { campaign_id?: string }   // optional: force a specific campaign
// Returns: { ok, campaign, pulled, deduped, errors }
// Secrets: GOOGLE_MAPS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          LEAD_SOURCING_CRON_SECRET (optional)

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

// Per-tick pull cap. Keeps wall-clock safe + spreads target_count across
// multiple cron firings so we don't burn Google Places API credits in a burst.
const PULL_BATCH_LIMIT = 25

// Max results per individual Places textsearch call. Google caps at 20.
const RESULTS_PER_QUERY = 20

// Hard cap on how many (keyword × city) queries we'll run per cron tick.
// Each query costs one Places API call. With 6 keywords × 3 cities that's
// 18 queries; we cap at 12 to keep tick cost predictable. Iteration stops
// early once PULL_BATCH_LIMIT new leads are gathered.
const MAX_QUERIES_PER_TICK = 12

interface Campaign {
  id: string
  name: string
  status: string
  geo: Record<string, unknown>
  apollo_query: Record<string, unknown>
  target_count: number
  priority: number
  pulled_count: number
  // 'ada' (home-services) or 'grace' (churches). Defaults to 'ada' for
  // legacy campaigns created before migration 0075. Drives lead tagging,
  // which drives downstream scoring + drafting routing.
  persona: 'ada' | 'grace'
}

interface PlacesLead {
  place_id: string
  company_name: string
  formatted_address: string
  phone: string | null
  website: string | null
  city: string | null
  state: string | null
  rating: number | null
  rating_count: number | null
  business_status: string | null
  matched_query: string
}

// Google Places (New) field mask — same set used by research-leads.
const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
].join(',')

// Parse "123 Main St, Tampa, FL 33602, USA" → { city: "Tampa", state: "FL" }.
// Best-effort US format; bails to nulls on non-matches.
function parseUsAddress(addr: string): { city: string | null; state: string | null } {
  if (!addr) return { city: null, state: null }
  const parts = addr.split(',').map((p) => p.trim())
  if (parts.length < 3) return { city: null, state: null }
  // Walk backward: last is "USA", second-to-last is "FL 33602", third-to-last is city.
  const statePart = parts[parts.length - 2]
  const cityPart = parts[parts.length - 3]
  const stateMatch = statePart.match(/^([A-Z]{2})\b/)
  return {
    city: cityPart || null,
    state: stateMatch ? stateMatch[1] : null,
  }
}

// ── 1. Google Places search ─────────────────────────────────────────
async function searchGoogleMaps(
  apiKey: string,
  geo: Record<string, unknown>,
  query: Record<string, unknown>,
  targetNewLeads: number,
): Promise<{ leads: PlacesLead[]; queriesRun: string[]; errors: string[] }> {
  // Normalize geo → list of "City, ST" strings to query against.
  const cities: string[] = Array.isArray((geo as { cities?: string[] }).cities)
    ? (geo as { cities: string[] }).cities
    : []
  const state = typeof geo.state === 'string' ? geo.state : ''
  const locations: string[] = []
  if (cities.length > 0) {
    for (const c of cities) {
      locations.push(state ? `${c}, ${state}` : c)
    }
  } else if (state) {
    locations.push(state)
  } else {
    return { leads: [], queriesRun: [], errors: ['Campaign geo has neither cities nor state'] }
  }

  // Normalize keywords → list of search terms.
  const keywords: string[] = Array.isArray((query as { keyword_tags?: string[] }).keyword_tags)
    ? (query as { keyword_tags: string[] }).keyword_tags
    : []
  if (keywords.length === 0) {
    return { leads: [], queriesRun: [], errors: ['Campaign apollo_query has no keyword_tags'] }
  }

  // Iterate (keyword × city), shortest cycle first so we cover variety
  // before depth. Dedupe by place_id within this run.
  const seen = new Set<string>()
  const leads: PlacesLead[] = []
  const queriesRun: string[] = []
  const errors: string[] = []

  outer: for (const location of locations) {
    for (const keyword of keywords) {
      if (leads.length >= targetNewLeads) break outer
      if (queriesRun.length >= MAX_QUERIES_PER_TICK) break outer

      const textQuery = `${keyword} in ${location}`
      queriesRun.push(textQuery)

      let res: Response
      try {
        res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': PLACES_FIELD_MASK,
          },
          body: JSON.stringify({
            textQuery,
            maxResultCount: RESULTS_PER_QUERY,
          }),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`Network error on "${textQuery}": ${msg}`)
        continue
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        errors.push(`Places ${res.status} on "${textQuery}": ${text.slice(0, 200)}`)
        continue
      }

      let data: { places?: unknown[] }
      try {
        data = await res.json()
      } catch {
        errors.push(`Bad JSON on "${textQuery}"`)
        continue
      }

      const places = Array.isArray(data.places) ? data.places : []
      for (const raw of places) {
        // deno-lint-ignore no-explicit-any
        const p = raw as any
        const placeId = typeof p.id === 'string' ? p.id : null
        if (!placeId || seen.has(placeId)) continue
        seen.add(placeId)

        const formattedAddress = typeof p.formattedAddress === 'string' ? p.formattedAddress : ''
        const parsed = parseUsAddress(formattedAddress)

        leads.push({
          place_id: placeId,
          company_name: p.displayName?.text ?? 'Unknown',
          formatted_address: formattedAddress,
          phone: typeof p.nationalPhoneNumber === 'string' ? p.nationalPhoneNumber : null,
          website: typeof p.websiteUri === 'string' ? p.websiteUri : null,
          city: parsed.city,
          state: parsed.state,
          rating: typeof p.rating === 'number' ? p.rating : null,
          rating_count: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
          business_status: typeof p.businessStatus === 'string' ? p.businessStatus : null,
          matched_query: keyword,
        })
        if (leads.length >= targetNewLeads) break outer
      }
    }
  }

  return { leads, queriesRun, errors }
}

// ── 2. The cron entrypoint ───────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  // Auth (intentionally permissive). Gateway-level verify_jwt is OFF
  // (see supabase/config.toml). Internal guards do the real work:
  //   • Only acts on campaigns the operator has set to status='active'.
  //   • PULL_BATCH_LIMIT caps how many leads a single call can add.
  //   • target_count caps how many leads a campaign can ever pull.
  //   • Google Places API spend is naturally bounded by the campaign
  //     target_count and the campaign queue depth.
  // An unauthenticated caller can only trigger work the operator has
  // already configured to happen — they can't dictate recipients,
  // queries, or budgets.
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')

  if (!GOOGLE_MAPS_API_KEY) {
    return json({ ok: false, error: 'GOOGLE_MAPS_API_KEY not configured' }, 500)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const body = await req.json().catch(() => ({})) as { campaign_id?: string }

  // ── Pick the campaign ────────────────────────────────────────────
  let campaign: Campaign | null = null

  if (body.campaign_id) {
    const { data } = await admin
      .from('cs_lead_campaigns')
      .select('*')
      .eq('id', body.campaign_id)
      .maybeSingle()
    campaign = (data as Campaign | null)
    if (campaign && campaign.status !== 'active') {
      await admin
        .from('cs_lead_campaigns')
        .update({ status: 'active', started_at: new Date().toISOString() } as never)
        .eq('id', campaign.id)
      campaign.status = 'active'
    }
  } else {
    // First check for an already-active campaign
    const { data: activeRows } = await admin
      .from('cs_lead_campaigns')
      .select('*')
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .limit(1)
    campaign = ((activeRows ?? [])[0] as Campaign | undefined) ?? null

    // Else activate the lowest-priority pending campaign
    if (!campaign) {
      const { data: pendingRows } = await admin
        .from('cs_lead_campaigns')
        .select('*')
        .eq('status', 'pending')
        .order('priority', { ascending: true })
        .limit(1)
      campaign = ((pendingRows ?? [])[0] as Campaign | undefined) ?? null
      if (campaign) {
        await admin
          .from('cs_lead_campaigns')
          .update({ status: 'active', started_at: new Date().toISOString() } as never)
          .eq('id', campaign.id)
      }
    }
  }

  if (!campaign) {
    return json({ ok: true, campaign: null, pulled: 0, deduped: 0, errors: [], message: 'No active or pending campaigns.' })
  }

  // ── Google Places search ─────────────────────────────────────────
  const remaining = Math.max(0, campaign.target_count - campaign.pulled_count)
  const perTick = Math.min(remaining, PULL_BATCH_LIMIT)
  if (perTick === 0) {
    // Target already met — flip to done and exit
    await admin
      .from('cs_lead_campaigns')
      .update({ status: 'done', ended_at: new Date().toISOString() } as never)
      .eq('id', campaign.id)
    return json({ ok: true, campaign: campaign.id, pulled: 0, deduped: 0, errors: [], message: 'Campaign already complete.' })
  }

  const { leads: places, queriesRun, errors: placeErrors } = await searchGoogleMaps(
    GOOGLE_MAPS_API_KEY,
    campaign.geo,
    campaign.apollo_query,
    perTick,
  )

  // ── Dedupe + insert ──────────────────────────────────────────────
  // Two-tier dedupe:
  //   (a) by company_url when the Google Place has a website (strong match)
  //   (b) by company_name + city when no website (softer, but catches
  //       "Joe's Plumbing" being added twice from different Maps queries)
  const candidateDomains = places.map((p) => p.website).filter((u): u is string => !!u)
  const candidateNameCity = places
    .filter((p) => !p.website && p.city)
    .map((p) => `${p.company_name.toLowerCase()}|${p.city!.toLowerCase()}`)

  const [byDomain, byNameCity] = await Promise.all([
    candidateDomains.length > 0
      ? admin.from('cs_leads').select('company_url').in('company_url', candidateDomains)
      : Promise.resolve({ data: [] as { company_url: string | null }[] }),
    admin
      .from('cs_leads')
      .select('company_name, city'),
  ])
  const existingDomains = new Set(
    ((byDomain.data ?? []) as { company_url: string | null }[])
      .map((r) => r.company_url ?? '')
      .filter(Boolean),
  )
  const existingNameCity = new Set(
    ((byNameCity.data ?? []) as { company_name: string; city: string | null }[])
      .filter((r) => r.city)
      .map((r) => `${r.company_name.toLowerCase()}|${r.city!.toLowerCase()}`),
  )

  // Best-effort: avoid same-batch duplicates by tracking what we've already queued.
  const queuedKeys = new Set<string>()

  const inserts: Record<string, unknown>[] = []
  let dedupedCount = 0
  for (const place of places) {
    const domain = place.website
    const nameCityKey = place.city ? `${place.company_name.toLowerCase()}|${place.city.toLowerCase()}` : null

    // Domain match wins if both sides have a website
    if (domain && existingDomains.has(domain)) { dedupedCount++; continue }
    // Otherwise check name+city
    if (!domain && nameCityKey && existingNameCity.has(nameCityKey)) { dedupedCount++; continue }
    // Also dedupe within this batch
    const batchKey = domain ?? nameCityKey ?? place.place_id
    if (queuedKeys.has(batchKey)) { dedupedCount++; continue }
    queuedKeys.add(batchKey)

    // Build the note text — gives the operator traceability of which keyword
    // surfaced this lead from which campaign.
    const noteLines = [
      `Sourced via Google Maps (campaign: ${campaign.name})`,
      `Query: "${place.matched_query}"`,
      place.formatted_address ? `Address: ${place.formatted_address}` : null,
      place.rating !== null ? `Google rating: ${place.rating}★ (${place.rating_count ?? 0} reviews)` : null,
    ].filter(Boolean)

    // Persona tag is the routing key for downstream auto-drafting:
    // persona_grace → draft-cold-email-grace, otherwise default to
    // draft-cold-email. Keep it on every lead (including ada) so the
    // tag space is symmetric and queries can branch on its presence.
    const personaTag = campaign.persona === 'grace' ? 'persona_grace' : 'persona_ada'
    const closedTag = place.business_status === 'CLOSED_TEMPORARILY' || place.business_status === 'CLOSED_PERMANENTLY'
      ? ['needs_review_closed']
      : []

    inserts.push({
      source: 'google_maps',
      source_campaign_id: campaign.id,
      company_name: place.company_name,
      company_url: domain,
      contact_phone: place.phone,
      city: place.city,
      state: place.state,
      status: 'new',
      notes: noteLines.join(' · '),
      tags: [personaTag, ...closedTag],
      // contact_email left null — enrichment cron picks it up on the next tick
      // Write place_id + enrichment timestamp so cron-imported leads are
      // covered by migration 0026's unique index. Without this, the Research
      // modal could later re-insert the same business as a "new" lead because
      // the modal looks up by place_id and the cron path leaves it null.
      google_maps_place_id: place.place_id,
      google_maps_enriched_at: new Date().toISOString(),
    })
  }

  const errors: string[] = [...placeErrors]
  let insertedCount = 0
  if (inserts.length > 0) {
    const { data: inserted, error: insErr } = await admin
      .from('cs_leads')
      .insert(inserts as never)
      .select('id')
    if (insErr) errors.push(`Insert failed: ${insErr.message}`)
    else insertedCount = (inserted ?? []).length
  }

  // ── Campaign aggregate update + lifecycle ───────────────────────
  const newPulled = campaign.pulled_count + insertedCount
  const campaignUpdate: Record<string, unknown> = { pulled_count: newPulled }
  // Flip to 'done' when target hit OR Google returned zero NEW + zero duplicates
  // (exhausted the geo/keyword combinations for this slice).
  if (newPulled >= campaign.target_count || (places.length === 0 && dedupedCount === 0)) {
    campaignUpdate.status = 'done'
    campaignUpdate.ended_at = new Date().toISOString()
  }
  await admin
    .from('cs_lead_campaigns')
    .update(campaignUpdate as never)
    .eq('id', campaign.id)

  return json({
    ok: true,
    campaign: campaign.id,
    campaignName: campaign.name,
    pulled: insertedCount,
    deduped: dedupedCount,
    placesReturned: places.length,
    queriesRun,
    errors,
    statusAfter: campaignUpdate.status ?? campaign.status,
  })
})
