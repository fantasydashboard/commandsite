// CommandSite research-leads Edge Function
// ---------------------------------------------------------------------------
// Pulls prospect lists from the Google Places API (New). Frontend calls
// this with {queries, location, max_per_query} and gets back deduped
// raw results. The frontend then scores each via the existing scoreLead()
// heuristic (which needs CsSettings client-side anyway), shows a preview,
// and bulk-inserts via the existing importLeads() composable on confirm.
//
// Same two-step shape as the CSV import flow: research → preview/score →
// approve → insert. Source = 'google_maps'.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    {
//            queries: string[],        // e.g. ["HVAC contractor", "plumber"]
//            location: string,         // e.g. "Orlando, FL"
//            max_per_query?: number,   // 1-20, default 20
//          }
// Returns: { results: ResearchedLead[], count: number, queries_run: string[] }
// Secrets: GOOGLE_MAPS_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

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

interface SearchRequest {
  queries?: string[]
  location?: string
  max_per_query?: number
}

interface ResearchedLead {
  place_id: string
  company_name: string
  address: string
  phone: string | null
  website: string | null
  google_rating: number | null
  rating_count: number | null
  types: string[]
  open_now: boolean | null
  business_status: string | null
  matched_query: string
}

// Field mask for Places API (New). Pro tier: includes phone/website/rating.
// First 1000 calls/month free per Google Cloud's standard credit. At our
// expected volume (~13 calls per 250-prospect batch), we'll stay well
// inside the free tier even if Josh runs 5+ batches per month.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.types',
  'places.businessStatus',
  'places.regularOpeningHours.openNow',
].join(',')

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
    return json({ error: 'Server misconfigured (missing Supabase env)' }, 500)
  }
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)

  const { data: caller } = await admin
    .from('users')
    .select('id, role')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!caller || caller.role !== 'admin') {
    return json({ error: 'Admin only' }, 403)
  }

  // ── Parse + validate body
  let body: SearchRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const queries = Array.isArray(body.queries)
    ? body.queries.map((q) => String(q).trim()).filter((q) => q.length > 0)
    : []
  const location = (body.location ?? '').trim()
  const maxPerQuery = Math.min(Math.max(body.max_per_query ?? 20, 1), 20)

  if (queries.length === 0) return json({ error: 'queries required' }, 400)
  if (queries.length > 10) return json({ error: 'max 10 queries per request' }, 400)
  if (!location) return json({ error: 'location required' }, 400)

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!apiKey) return json({ error: 'Google Maps API key not configured' }, 500)

  // ── Run searches sequentially. Could be parallelized, but staying
  // sequential keeps us under any rate-limit edge cases on the free tier.
  const seen = new Set<string>()
  const results: ResearchedLead[] = []
  const queriesRun: string[] = []
  const errors: string[] = []

  for (const rawQuery of queries) {
    const textQuery = `${rawQuery} in ${location}`
    queriesRun.push(textQuery)

    let res: Response
    try {
      res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery,
          maxResultCount: maxPerQuery,
        }),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Network error on "${textQuery}": ${msg}`)
      continue
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      errors.push(`Places API ${res.status} on "${textQuery}": ${text.slice(0, 200)}`)
      continue
    }

    let data: { places?: unknown[] }
    try {
      data = await res.json()
    } catch {
      errors.push(`Bad JSON from Places API on "${textQuery}"`)
      continue
    }

    const places = Array.isArray(data.places) ? data.places : []
    for (const raw of places) {
      // deno-lint-ignore no-explicit-any
      const p = raw as any
      const placeId = typeof p.id === 'string' ? p.id : null
      if (!placeId || seen.has(placeId)) continue
      seen.add(placeId)
      results.push({
        place_id: placeId,
        company_name: p.displayName?.text ?? 'Unknown',
        address: typeof p.formattedAddress === 'string' ? p.formattedAddress : '',
        phone: typeof p.nationalPhoneNumber === 'string' ? p.nationalPhoneNumber : null,
        website: typeof p.websiteUri === 'string' ? p.websiteUri : null,
        google_rating: typeof p.rating === 'number' ? p.rating : null,
        rating_count: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
        types: Array.isArray(p.types) ? p.types.filter((t: unknown) => typeof t === 'string') : [],
        open_now: p.regularOpeningHours?.openNow ?? null,
        business_status: typeof p.businessStatus === 'string' ? p.businessStatus : null,
        matched_query: rawQuery,
      })
    }
  }

  return json({
    results,
    count: results.length,
    queries_run: queriesRun,
    errors: errors.length > 0 ? errors : undefined,
  })
})
