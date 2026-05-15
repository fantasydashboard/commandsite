// CommandSite apollo-enrich-lead Edge Function
// ---------------------------------------------------------------------------
// Apollo-powered fallback enrichment for leads that the homepage scraper
// couldn't find an email for. Two-step API chain (free-tier safe):
//
//   1. organizations/enrich     → resolve company domain → organization_id
//      (fallback: organizations/search if no domain or no match by domain)
//   2. mixed_people/organization_top_people → top decision-makers at that org
//      ranked by seniority. We then pick the owner-shaped match (Owner /
//      Founder / President / CEO / Principal / General Manager / Director).
//
// Free-tier caveat: Apollo often returns the email obfuscated
// ("j***@duncansacorlando.com") and charges 1 email credit to reveal. We
// save whatever shape we get; the UI surfaces "obfuscated" status so
// Josh knows to upgrade or move on. Verified emails still go through.
//
// Auth:    Authorization: Bearer <admin user JWT> OR service role key.
// Body:    { lead_id: string }
// Returns: {
//            status: 'found' | 'no_org_match' | 'no_people_match'
//                  | 'no_url_no_name' | 'apollo_error',
//            org?: { name, domain, organization_id },
//            person?: { name, title, email, email_status },
//            error?: string,
//          }
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APOLLO_API_KEY

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

const APOLLO_BASE = 'https://api.apollo.io/api/v1'

// Title priority — higher score wins when picking the "best" decision-maker.
// Owner-shaped first, generic management last, individual contributors not
// scored (we don't want to email the on-call HVAC tech).
const TITLE_PRIORITY: { pattern: RegExp; score: number }[] = [
  { pattern: /\b(owner|founder|co-founder|cofounder|principal)\b/i, score: 100 },
  { pattern: /\b(president|ceo|chief executive)\b/i, score: 90 },
  { pattern: /\b(general manager|gm|managing director)\b/i, score: 80 },
  { pattern: /\b(vice president|vp|executive vp)\b/i, score: 70 },
  { pattern: /\b(director)\b/i, score: 60 },
  { pattern: /\b(operations manager|office manager|business manager)\b/i, score: 55 },
  { pattern: /\b(manager|head of)\b/i, score: 40 },
]

function scoreTitle(title: string | null | undefined): number {
  if (!title) return 0
  for (const { pattern, score } of TITLE_PRIORITY) {
    if (pattern.test(title)) return score
  }
  return 0
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}

type LeadRow = {
  id: string
  company_name: string
  company_url: string | null
  contact_email: string | null
  city: string | null
  state: string | null
}

type ApolloOrg = {
  id: string
  name?: string
  website_url?: string
  primary_domain?: string
}

type ApolloPerson = {
  id?: string
  name?: string
  first_name?: string
  last_name?: string
  title?: string
  email?: string
  email_status?: string | null
  organization?: { name?: string; primary_domain?: string }
}

async function apollo<T>(
  path: string,
  apiKey: string,
  params?: Record<string, string | number>,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const url = new URL(`${APOLLO_BASE}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v))
    }
  }
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': apiKey,
      },
    })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, status: res.status, error: text.slice(0, 400) }
    }
    try {
      return { ok: true, data: JSON.parse(text) as T }
    } catch {
      return { ok: false, status: res.status, error: `bad JSON: ${text.slice(0, 200)}` }
    }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

async function resolveOrganization(
  lead: LeadRow,
  apiKey: string,
): Promise<{ ok: true; org: ApolloOrg } | { ok: false; error: string }> {
  const domain = lead.company_url ? extractDomain(lead.company_url) : null

  if (domain) {
    const r = await apollo<{ organization?: ApolloOrg }>(
      '/organizations/enrich',
      apiKey,
      { domain },
    )
    if (r.ok && r.data.organization?.id) {
      return { ok: true, org: r.data.organization }
    }
    if (!r.ok && r.status !== 404) {
      return { ok: false, error: `organizations/enrich (${r.status}): ${r.error}` }
    }
  }

  // Fallback: search by company name (+ city/state hint when available).
  const locationHint = [lead.city, lead.state].filter(Boolean).join(', ')
  const q = locationHint ? `${lead.company_name} ${locationHint}` : lead.company_name
  const r = await apollo<{ organizations?: ApolloOrg[] }>(
    '/organizations/search',
    apiKey,
    { q_organization_name: q, page: 1, per_page: 1 },
  )
  if (r.ok && r.data.organizations && r.data.organizations.length > 0 && r.data.organizations[0].id) {
    return { ok: true, org: r.data.organizations[0] }
  }
  if (!r.ok) {
    return { ok: false, error: `organizations/search (${r.status}): ${r.error}` }
  }
  return { ok: false, error: 'no organization match' }
}

function pickBestPerson(people: ApolloPerson[]): ApolloPerson | null {
  let best: ApolloPerson | null = null
  let bestScore = 0
  for (const p of people) {
    const s = scoreTitle(p.title)
    if (s > bestScore) {
      bestScore = s
      best = p
    }
  }
  // If nobody hit our title priority list, fall back to the first record
  // with an email so we don't strand the lead. Apollo orders results by
  // relevance internally.
  if (!best) {
    best = people.find((p) => !!p.email) ?? people[0] ?? null
  }
  return best
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY')
  if (!APOLLO_API_KEY) {
    return json({ status: 'apollo_error', error: 'APOLLO_API_KEY not configured' }, 500)
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing Authorization' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // Auth: service role bypass OR admin user JWT
  if (token !== SERVICE_ROLE_KEY) {
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData.user) return json({ error: 'Invalid session' }, 401)
    const { data: profile } = await admin
      .from('users')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!profile || (profile as { role?: string }).role !== 'admin') {
      return json({ error: 'Admin only' }, 403)
    }
  }

  let body: { lead_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ status: 'apollo_error', error: 'Invalid JSON' }, 400)
  }
  const leadId = body.lead_id
  if (!leadId) return json({ status: 'apollo_error', error: 'lead_id required' }, 400)

  const { data: leadData, error: leadErr } = await admin
    .from('cs_leads')
    .select('id, company_name, company_url, contact_email, city, state')
    .eq('id', leadId)
    .maybeSingle()

  if (leadErr || !leadData) {
    return json({ status: 'apollo_error', error: `lead lookup failed: ${leadErr?.message ?? 'not found'}` }, 404)
  }

  const lead = leadData as LeadRow

  if (!lead.company_url && !lead.company_name) {
    return json({ status: 'no_url_no_name' })
  }

  // ── Step 1: resolve organization ──────────────────────────────────────
  const orgResult = await resolveOrganization(lead, APOLLO_API_KEY)
  if (!orgResult.ok) {
    return json({ status: 'no_org_match', error: orgResult.error })
  }
  const org = orgResult.org

  // ── Step 2: pull top decision-makers ──────────────────────────────────
  const peopleRes = await apollo<{ people?: ApolloPerson[]; contacts?: ApolloPerson[] }>(
    '/mixed_people/organization_top_people',
    APOLLO_API_KEY,
    { organization_id: org.id, page: 1, per_page: 10 },
  )
  if (!peopleRes.ok) {
    // Apollo's organization_top_people endpoint has a server-side bug where
    // it returns 422 with "undefined method 'total_entries' for nil" when
    // the underlying people query finds zero results. Their will_paginate
    // gem chokes on a nil collection. Treat this specific 422 as the
    // honest semantic — no people on file — instead of an unexpected error.
    if (peopleRes.status === 422 && /total_entries.*for nil/i.test(peopleRes.error)) {
      return json({
        status: 'no_people_match',
        org: { name: org.name ?? null, domain: org.primary_domain ?? null, organization_id: org.id },
      })
    }
    return json({
      status: 'apollo_error',
      error: `organization_top_people (${peopleRes.status}): ${peopleRes.error}`,
      org: { name: org.name ?? null, domain: org.primary_domain ?? null, organization_id: org.id },
    })
  }
  const people = [...(peopleRes.data.contacts ?? []), ...(peopleRes.data.people ?? [])]
  if (people.length === 0) {
    return json({
      status: 'no_people_match',
      org: { name: org.name ?? null, domain: org.primary_domain ?? null, organization_id: org.id },
    })
  }

  const person = pickBestPerson(people)
  if (!person) {
    return json({
      status: 'no_people_match',
      org: { name: org.name ?? null, domain: org.primary_domain ?? null, organization_id: org.id },
    })
  }

  const fullName = person.name
    ?? [person.first_name, person.last_name].filter(Boolean).join(' ').trim()
    ?? null

  // ── Step 3: write back to cs_leads ────────────────────────────────────
  const updates: Record<string, string | null> = {}
  // Only overwrite email if we got an unobfuscated one or the lead has no
  // email yet. Don't trample an existing real email with an obfuscated
  // placeholder.
  const email = person.email?.trim() ?? null
  const isObfuscated = !!email && (email.includes('***') || email.includes('email_not_unlocked'))
  if (email && !isObfuscated) {
    updates.contact_email = email
  } else if (!lead.contact_email && isObfuscated) {
    // Save the obfuscated form so Josh can see Apollo *has* an email,
    // surfaced in the UI as a "click to unlock" affordance later.
    updates.contact_email = email
  }
  if (fullName && fullName.length > 0) updates.contact_name = fullName
  if (person.title) updates.contact_title = person.title
  // Also backfill company_url if Apollo has a better domain than we do
  if (!lead.company_url && org.primary_domain) {
    updates.company_url = `https://${org.primary_domain}`
  }

  if (Object.keys(updates).length > 0) {
    await admin.from('cs_leads').update(updates as never).eq('id', leadId)
  }

  return json({
    status: 'found',
    org: {
      name: org.name ?? null,
      domain: org.primary_domain ?? null,
      organization_id: org.id,
    },
    person: {
      name: fullName,
      title: person.title ?? null,
      email,
      email_status: isObfuscated ? 'obfuscated_free_tier' : (person.email_status ?? 'unverified'),
    },
  })
})
