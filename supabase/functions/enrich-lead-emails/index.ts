// CommandSite enrich-lead-emails Edge Function
// ---------------------------------------------------------------------------
// Phase 2 of the lead-research engine. Takes existing cs_leads rows that
// have a website (company_url) but no contact_email, fetches the homepage
// + /contact page, extracts the most plausible owner-reachable email via
// regex + filtering, then verifies it with NeverBounce before saving.
//
// Why regex + heuristic for extraction: emails are well-defined patterns.
// The "intelligence" needed is filtering (skip privacy@, noreply@,
// third-party services) and ranking (prefer on-domain, prefer
// owner-shaped names over generic info@). Deterministic logic; Claude
// would just slow it down and burn tokens for no quality lift.
//
// Why verify before saving: cold email sender reputation is sacred.
// NeverBounce returns 'valid' / 'invalid' / 'accept_all' (catch-all
// domain — uncertain) / 'disposable' / 'unknown'. We use a strict
// policy: only save the email if status='valid'. Invalid + catch-all
// + unknown get tagged but the email is dropped, so the lead stays in
// the table for manual follow-up but never lands in an outreach
// sequence with a guess-email that would bounce.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    { lead_ids?: string[] }  // omit to enrich all eligible
// Returns: {
//            results: { [lead_id]: { status, email?, verification?, error? } },
//            counts: { found, not_found, errors,
//                     verified, invalid, unverifiable },
//          }
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEVERBOUNCE_API_KEY

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

interface EnrichRequest {
  lead_ids?: string[]
}

type LeadRow = {
  id: string
  company_url: string | null
  contact_email: string | null
  tags: string[] | null
}

type VerifyOutcome =
  | { ok: true; nb_status: 'valid' }
  | { ok: false; nb_status: 'invalid' | 'disposable' }
  | { ok: false; nb_status: 'accept_all' | 'unknown' }
  | { ok: false; nb_status: 'verifier_unavailable'; error: string }

type EnrichResult =
  | { status: 'found'; email: string; verification: VerifyOutcome }
  | { status: 'not_found' }
  | { status: 'no_url' }
  | { status: 'fetch_error'; error: string }

// Common deliverability / spam / third-party emails to filter OUT
const EMAIL_BLOCKLIST_PATTERNS: RegExp[] = [
  /^(?:privacy|webmaster|abuse|postmaster|noreply|no-reply|donotreply|do-not-reply|security|legal|dmca|press|media)@/i,
  /^[^@]+@(?:sentry\.io|googletagmanager\.com|googleapis\.com|google\.com|gstatic\.com|cloudflare\.com|wordpress\.com|wp\.com|wixpress\.com|wix\.com|squarespace\.com|godaddy\.com|domainsbyproxy\.com|namecheap\.com|example\.com|example\.org|example\.net|test\.com|sentry-sample\.com|tracking-domain\.com)$/i,
  // Image filenames that match the email regex (e.g. icon@2x.png — rare but happens)
  /\.(png|jpe?g|gif|webp|svg|css|js|woff2?)$/i,
]

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}

function rankEmails(emails: string[], targetDomain: string | null): string[] {
  // Dedupe (case-insensitive)
  const seen = new Set<string>()
  const unique: string[] = []
  for (const e of emails) {
    const lower = e.toLowerCase()
    if (!seen.has(lower)) {
      seen.add(lower)
      unique.push(e)
    }
  }

  // Filter blocklist
  const filtered = unique.filter(
    (e) => !EMAIL_BLOCKLIST_PATTERNS.some((p) => p.test(e)),
  )

  // Rank: on-domain > common business prefixes on any domain > anything else.
  // Within "on-domain", prefer owner-shaped (first.last@, firstname@) over generic (info@).
  const onDomain = targetDomain
    ? filtered.filter((e) => e.toLowerCase().endsWith('@' + targetDomain))
    : []
  const offDomain = filtered.filter((e) => !onDomain.includes(e))

  function priorityScore(email: string): number {
    const local = email.split('@')[0]?.toLowerCase() ?? ''
    // Owner-shaped: contains a dot, hyphen, or is short (likely first name)
    if (/^[a-z]+\.[a-z]+$/.test(local)) return 10 // first.last
    if (/^[a-z]+_[a-z]+$/.test(local)) return 9
    if (/^[a-z]{3,12}$/.test(local) && !['info', 'contact', 'hello', 'sales', 'support', 'admin', 'office', 'service'].includes(local)) return 8
    // Generic but useful business
    if (['info', 'contact', 'hello'].includes(local)) return 5
    if (['sales', 'office', 'admin', 'support', 'service'].includes(local)) return 4
    return 1
  }

  onDomain.sort((a, b) => priorityScore(b) - priorityScore(a))
  offDomain.sort((a, b) => priorityScore(b) - priorityScore(a))

  return [...onDomain, ...offDomain]
}

async function fetchPage(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; CommandSiteResearch/1.0; +https://commandsite.io/research)',
        'accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml/i.test(ct)) return null
    const text = await res.text()
    // Cap at 500KB to avoid pulling down huge pages
    return text.slice(0, 500_000)
  } catch {
    return null
  }
}

function candidateContactUrls(siteUrl: string): string[] {
  try {
    const base = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`)
    const origin = base.origin
    return [
      origin + '/',
      origin + '/contact',
      origin + '/contact-us',
      origin + '/about',
    ]
  } catch {
    return []
  }
}

async function findCandidateEmail(lead: LeadRow): Promise<
  | { status: 'candidate'; email: string }
  | { status: 'not_found' }
  | { status: 'no_url' }
  | { status: 'fetch_error'; error: string }
> {
  if (lead.contact_email) return { status: 'candidate', email: lead.contact_email }
  if (!lead.company_url) return { status: 'no_url' }

  const domain = extractDomain(lead.company_url)
  const urls = candidateContactUrls(lead.company_url)
  if (urls.length === 0) return { status: 'fetch_error', error: 'invalid url' }

  const homepageHtml = await fetchPage(urls[0])
  if (!homepageHtml) {
    return { status: 'fetch_error', error: `cannot fetch ${urls[0]}` }
  }

  const allHtml: string[] = [homepageHtml]
  const homepageEmails = homepageHtml.match(EMAIL_REGEX) ?? []
  const homepageRanked = rankEmails(homepageEmails, domain)
  if (homepageRanked.length > 0) {
    return { status: 'candidate', email: homepageRanked[0] }
  }

  const fallback = await Promise.all(
    urls.slice(1).map((u) => fetchPage(u, 6000)),
  )
  for (const html of fallback) {
    if (html) allHtml.push(html)
  }

  const merged = allHtml.join('\n')
  const emails = merged.match(EMAIL_REGEX) ?? []
  const ranked = rankEmails(emails, domain)
  if (ranked.length === 0) return { status: 'not_found' }
  return { status: 'candidate', email: ranked[0] }
}

/**
 * Verify a candidate email with NeverBounce single-check.
 * Strict policy: only `valid` returns ok=true.
 * If NeverBounce is misconfigured or down, returns 'verifier_unavailable'
 * — caller decides whether to save anyway. (Currently we drop it so we
 * never send to an unverified address.)
 */
async function verifyEmail(email: string, apiKey: string | null): Promise<VerifyOutcome> {
  if (!apiKey) {
    return {
      ok: false,
      nb_status: 'verifier_unavailable',
      error: 'NEVERBOUNCE_API_KEY not configured',
    }
  }

  const url = `https://api.neverbounce.com/v4/single/check?key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}&address_info=0&credits_info=0&timeout=10`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12_000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!res.ok) {
      return {
        ok: false,
        nb_status: 'verifier_unavailable',
        error: `NeverBounce HTTP ${res.status}`,
      }
    }

    const data = await res.json() as {
      status?: string
      result?: string
      message?: string
    }

    if (data.status !== 'success') {
      return {
        ok: false,
        nb_status: 'verifier_unavailable',
        error: data.message ?? 'NeverBounce returned non-success status',
      }
    }

    const result = data.result ?? 'unknown'
    if (result === 'valid') return { ok: true, nb_status: 'valid' }
    if (result === 'invalid') return { ok: false, nb_status: 'invalid' }
    if (result === 'disposable') return { ok: false, nb_status: 'disposable' }
    if (result === 'catchall') return { ok: false, nb_status: 'accept_all' }
    return { ok: false, nb_status: 'unknown' }
  } catch (err) {
    return {
      ok: false,
      nb_status: 'verifier_unavailable',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function enrichOne(lead: LeadRow, neverBounceKey: string | null): Promise<EnrichResult> {
  const candidate = await findCandidateEmail(lead)
  if (candidate.status !== 'candidate') return candidate

  const verification = await verifyEmail(candidate.email, neverBounceKey)
  return { status: 'found', email: candidate.email, verification }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Auth: admin only
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return json({ error: 'Missing authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
  const { data: caller } = await admin
    .from('users')
    .select('id, role')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!caller || caller.role !== 'admin') return json({ error: 'Admin only' }, 403)

  // Parse body
  let body: EnrichRequest
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const requestedIds = Array.isArray(body.lead_ids)
    ? body.lead_ids.filter((id) => typeof id === 'string' && id.length > 0)
    : null

  // Pull eligible leads from DB. If lead_ids was provided, scope to those;
  // otherwise pull all leads with a company_url and no contact_email.
  let query = admin
    .from('cs_leads')
    .select('id, company_url, contact_email, tags')
    .not('company_url', 'is', null)
    .is('contact_email', null)

  if (requestedIds && requestedIds.length > 0) {
    query = query.in('id', requestedIds)
  }
  query = query.limit(100)

  const { data: leads, error: leadErr } = await query
  if (leadErr) return json({ error: `DB read: ${leadErr.message}` }, 500)
  if (!leads || leads.length === 0) {
    return json({
      results: {},
      counts: { found: 0, not_found: 0, errors: 0, verified: 0, invalid: 0, unverifiable: 0 },
      message: 'No eligible leads (need company_url + empty contact_email).',
    })
  }

  const neverBounceKey = Deno.env.get('NEVERBOUNCE_API_KEY') ?? null

  // Process with bounded concurrency. Network I/O so 5 concurrent is fine.
  // The verification step adds one more outbound request per lead, so total
  // budget per batch ≈ 5 fetches (homepage) + up to 15 fallback fetches +
  // 5 NeverBounce checks. Still well under any sane edge-function timeout.
  const results: Record<string, EnrichResult> = {}
  const counts = {
    found: 0,
    not_found: 0,
    errors: 0,
    verified: 0,
    invalid: 0,
    unverifiable: 0,
  }
  const BATCH_SIZE = 5

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE)
    const settled = await Promise.allSettled(
      batch.map(async (lead) => {
        const result = await enrichOne(lead as LeadRow, neverBounceKey)
        return { id: lead.id, result }
      }),
    )
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        const { id, result } = s.value
        results[id] = result
      }
    }
  }

  // Persist results. Per-row updates because partial updates across rows
  // don't compose well in Supabase upsert. Volume is small (≤100/call).
  //
  // Save-vs-tag policy:
  //   verification.ok=true (valid)         → save email,    tag email_verified
  //   nb_status=invalid|disposable         → drop email,    tag email_invalid
  //   nb_status=accept_all|unknown         → drop email,    tag email_unverifiable
  //   nb_status=verifier_unavailable       → drop email,    tag email_unverified
  //                                           (NB key missing or API down — keep the
  //                                            address out of outreach but not lose it)
  //   not_found / no_url / fetch_error     → previous tags  (no email change)
  //
  // We also still tag email_enriched on every successful regex find so the
  // pre-verification UX (counts of "Ada found N emails") still works.
  for (const [leadId, result] of Object.entries(results)) {
    const lead = leads.find((l) => l.id === leadId)
    const existingTags = (lead?.tags ?? []) as string[]

    if (result.status === 'found') {
      counts.found++
      const tagSet = new Set([...existingTags, 'email_enriched'])
      let saveEmail: string | null = null

      if (result.verification.ok) {
        counts.verified++
        tagSet.add('email_verified')
        saveEmail = result.email
      } else if (
        result.verification.nb_status === 'invalid'
        || result.verification.nb_status === 'disposable'
      ) {
        counts.invalid++
        tagSet.add('email_invalid')
        if (result.verification.nb_status === 'disposable') tagSet.add('email_disposable')
      } else if (
        result.verification.nb_status === 'accept_all'
        || result.verification.nb_status === 'unknown'
      ) {
        counts.unverifiable++
        tagSet.add('email_unverifiable')
        if (result.verification.nb_status === 'accept_all') tagSet.add('email_catch_all')
      } else {
        counts.unverifiable++
        tagSet.add('email_unverified')
      }

      const tags = [...tagSet]
      if (saveEmail) {
        await admin
          .from('cs_leads')
          .update({ contact_email: saveEmail, tags })
          .eq('id', leadId)
      } else {
        await admin.from('cs_leads').update({ tags }).eq('id', leadId)
      }
    } else if (result.status === 'not_found' || result.status === 'no_url') {
      counts.not_found++
      const tagToAdd =
        result.status === 'no_url' ? 'no_website' : 'email_not_found'
      const tags = [...new Set([...existingTags, tagToAdd])]
      await admin.from('cs_leads').update({ tags }).eq('id', leadId)
    } else {
      counts.errors++
      const tags = [...new Set([...existingTags, 'email_fetch_error'])]
      await admin.from('cs_leads').update({ tags }).eq('id', leadId)
    }
  }

  return json({
    results,
    counts,
    processed: leads.length,
    verifier: neverBounceKey ? 'neverbounce' : 'unavailable',
  })
})
