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
  | { status: 'found'; email: string; verification: VerifyOutcome; socialUrls: Record<string, string> }
  | { status: 'not_found'; socialUrls: Record<string, string> }
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

// Social profile URL extraction. Each entry's pattern matches the canonical
// public profile shape, NOT share/intent/embed URLs (which would otherwise
// flood the results with sharer.php and intent/tweet links from share
// buttons on the homepage). We take the first match per platform — header
// and footer typically point at the canonical profile, while later matches
// tend to be share-CTAs or partner mentions.
const SOCIAL_PATTERNS: Array<{ platform: string; pattern: RegExp }> = [
  // facebook.com/page or fb.com/page — exclude sharer/dialog/intent/plugins
  { platform: 'facebook',  pattern: /https?:\/\/(?:www\.|m\.|business\.)?(?:facebook\.com|fb\.com)\/(?!sharer|share(?:r|_post)?|dialog|plugins|tr|hashtag|v\d|home\.php|profile\.php)[A-Za-z0-9._\-]+\/?[A-Za-z0-9._\-]*/gi },
  // instagram.com/handle — exclude posts/reels/explore/stories
  { platform: 'instagram', pattern: /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|reels\/|tv\/|explore|stories|accounts|share)[A-Za-z0-9._]+\/?/gi },
  // linkedin.com/in/person or /company/X or /showcase/X
  { platform: 'linkedin',  pattern: /https?:\/\/(?:[a-z]{2}\.)?(?:www\.)?linkedin\.com\/(?:in|company|showcase|school)\/[A-Za-z0-9._\-]+\/?/gi },
  // twitter.com/handle or x.com/handle — exclude intent/share/search/home
  { platform: 'twitter',   pattern: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/(?!intent|share|search|home|i\/)[A-Za-z0-9_]+\/?/gi },
  // youtube.com/c|channel|@|user, or youtu.be — exclude /embed and /watch?
  { platform: 'youtube',   pattern: /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:c\/|channel\/|@|user\/)|youtu\.be\/)[A-Za-z0-9._\-@]+\/?/gi },
  // tiktok.com/@handle
  { platform: 'tiktok',    pattern: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._]+\/?/gi },
  // yelp.com/biz/business-name
  { platform: 'yelp',      pattern: /https?:\/\/(?:www\.)?yelp\.com\/biz\/[A-Za-z0-9._\-]+\/?/gi },
]

function extractSocialUrls(html: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const { platform, pattern } of SOCIAL_PATTERNS) {
    const matches = html.match(pattern)
    if (!matches || matches.length === 0) continue
    // Strip trailing punctuation that often gets caught by regex when the
    // URL is inside an HTML attribute like href="...". Also normalize
    // protocol-relative weirdness (e.g., facebook.com/me/ vs /me).
    let url = matches[0]
      .replace(/[)"'>}\\<]+$/, '')
      .replace(/\/$/, '')
    // Sanity check: skip URLs that are just the bare domain (no profile path)
    try {
      const u = new URL(url)
      if (u.pathname === '' || u.pathname === '/') continue
    } catch {
      continue
    }
    result[platform] = url
  }
  return result
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}

// Consumer email providers — emails on these domains are almost always
// real contacts (small biz owners often list a personal Gmail). Emails on
// other off-domain hosts (e.g., sansoxygen.com on mycousinstile.com) are
// almost always third-party widgets, trackers, or partner CTAs.
const CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'ymail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'comcast.net', 'verizon.net', 'sbcglobal.net', 'att.net',
  'cox.net', 'bellsouth.net', 'charter.net',
])

const GENERIC_BUSINESS_PREFIXES = new Set([
  'info', 'contact', 'hello', 'sales', 'support', 'admin', 'office',
  'service', 'team', 'help', 'mail', 'inquiry', 'inquiries',
])

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

  // Extract the "stem" of the company domain for matching against email
  // locals. "mycousinstile.com" → "mycousinstile". This lets us identify
  // owner-branded consumer emails like mycousinstile@gmail.com as belonging
  // to this company even though the email domain isn't the company domain.
  const companyStem = targetDomain
    ? targetDomain.split('.')[0]?.toLowerCase() ?? ''
    : ''

  function priorityScore(email: string): number {
    const lower = email.toLowerCase()
    const [local, domain] = lower.split('@')
    if (!local || !domain) return 0

    const onCompanyDomain = !!targetDomain && domain === targetDomain
    const isConsumerProvider = CONSUMER_EMAIL_DOMAINS.has(domain)
    const isGeneric = GENERIC_BUSINESS_PREFIXES.has(local)
    const matchesCompanyStem = !!companyStem
      && companyStem.length >= 4
      && (local === companyStem || local.includes(companyStem))

    // 100: owner@company.com (on-domain + owner-shaped)
    if (onCompanyDomain && !isGeneric && /^[a-z][a-z._-]{1,30}$/.test(local)) return 100
    // 90: info@company.com (on-domain, generic prefix — still likely real)
    if (onCompanyDomain && isGeneric) return 90
    // 80: any other on-domain shape (unusual but real)
    if (onCompanyDomain) return 80
    // 70: owner-branded consumer email (mycousinstile@gmail.com on mycousinstile.com)
    if (matchesCompanyStem && isConsumerProvider) return 70
    // 60: first.last@gmail.com (real-person owner email on a consumer provider)
    if (isConsumerProvider && /^[a-z]+[._-][a-z]+$/.test(local)) return 60
    // 50: short bareword name on a consumer provider (e.g., manny@gmail.com)
    if (isConsumerProvider && /^[a-z]{3,20}$/.test(local) && !isGeneric) return 50
    // 40: generic prefix on a consumer provider (rare; still real-ish)
    if (isConsumerProvider && isGeneric) return 40
    // 30: off-domain stem match on a non-consumer host (could be parent
    //     company / franchise headquarters — give it a chance)
    if (matchesCompanyStem) return 30
    // 10: anything else — likely third-party widget, tracker, or partner CTA
    return 10
  }

  // Score then sort all emails together. We no longer split on-domain/off-domain
  // because the priority score already encodes that preference, AND it lets a
  // strong consumer match outrank a weak generic off-domain "contact@" pickup.
  return filtered
    .slice()
    .sort((a, b) => priorityScore(b) - priorityScore(a))
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
    // Stream-read with a 150KB hard cap. Old logic loaded the full response
    // into memory before slicing, which OOM'd the worker on huge sites
    // (some contractor sites embed 2-5MB of inline base64 images). Reading
    // up to 150KB is more than enough to find emails + social links in the
    // <head> + <body> top, and bounds memory per fetch.
    const reader = res.body?.getReader()
    if (!reader) return null
    const decoder = new TextDecoder()
    let total = 0
    let text = ''
    const MAX_BYTES = 150_000
    try {
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        text += decoder.decode(value, { stream: true })
        total += value.byteLength
      }
      // Drain the rest so the connection closes cleanly even if we hit the cap
      if (total >= MAX_BYTES) {
        await reader.cancel().catch(() => {})
      }
    } catch {
      await reader.cancel().catch(() => {})
      return text || null
    }
    return text
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
  | { status: 'candidate'; email: string; socialUrls: Record<string, string> }
  | { status: 'not_found'; socialUrls: Record<string, string> }
  | { status: 'no_url' }
  | { status: 'fetch_error'; error: string }
> {
  if (lead.contact_email) return { status: 'candidate', email: lead.contact_email, socialUrls: {} }
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
  const homepageSocials = extractSocialUrls(homepageHtml)
  const homepageRanked = rankEmails(homepageEmails, domain)
  if (homepageRanked.length > 0) {
    return { status: 'candidate', email: homepageRanked[0], socialUrls: homepageSocials }
  }

  // Fetch fallback pages SEQUENTIALLY (was Promise.all). Parallel fetches
  // multiplied memory pressure across all leads in a chunk — 5 leads x 3
  // fallback pages = 15 simultaneous HTTPS connections + 15 HTML buffers
  // in flight at once. Sequential is slower per-lead but bounds memory
  // and is the difference between "succeeds" and WORKER_RESOURCE_LIMIT.
  // Also short-circuit as soon as we find an email on any fallback page
  // so we don't fetch /about when /contact already had what we needed.
  for (const u of urls.slice(1)) {
    const html = await fetchPage(u, 6000)
    if (!html) continue
    allHtml.push(html)
    const found = html.match(EMAIL_REGEX) ?? []
    const rankedSoFar = rankEmails(found, domain)
    if (rankedSoFar.length > 0) break
  }

  const merged = allHtml.join('\n')
  const emails = merged.match(EMAIL_REGEX) ?? []
  // Re-extract socials from the full corpus so contact-page links count too
  const socialUrls = { ...extractSocialUrls(merged), ...homepageSocials }
  const ranked = rankEmails(emails, domain)
  if (ranked.length === 0) return { status: 'not_found', socialUrls }
  return { status: 'candidate', email: ranked[0], socialUrls }
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
  if (candidate.status === 'no_url' || candidate.status === 'fetch_error') return candidate
  if (candidate.status === 'not_found') {
    return { status: 'not_found', socialUrls: candidate.socialUrls }
  }
  const verification = await verifyEmail(candidate.email, neverBounceKey)
  return {
    status: 'found',
    email: candidate.email,
    verification,
    socialUrls: candidate.socialUrls,
  }
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
  // Lowered from 5 → 3 after WORKER_RESOURCE_LIMIT errors on the
  // Supabase Free tier (~150ms CPU budget, 500MB memory). Each lead
  // now does fewer parallel things (see fetchPage stream-cap + the
  // sequential fallback fetch above), but the parallel batch size
  // still multiplies network buffer pressure, so we keep it tight.
  const BATCH_SIZE = 3
  // Overall wall-clock budget. Each lead can take 2-5s (website fetch +
  // fallback fetch + NeverBounce). With chunks of 50 at the old default,
  // total runtime easily exceeded the platform's ~150s function cap,
  // killing the function mid-flight and leaving the client hanging.
  // Returning cleanly within the budget with whatever we processed lets
  // the frontend resume from the remainder on the next chunk.
  const DEADLINE_MS = 50_000
  const startedAt = Date.now()
  let stoppedEarly = false

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    if (Date.now() - startedAt > DEADLINE_MS) { stoppedEarly = true; break }
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
  // Save-vs-tag policy (post mig 0059, May 2026):
  //   verification.ok=true (valid)         → SAVE email, status=valid
  //   nb_status=invalid|disposable         → drop email,  tag email_invalid
  //   nb_status=accept_all                 → SAVE email, status=catchall
  //   nb_status=unknown                    → SAVE email, status=unknown
  //   nb_status=verifier_unavailable       → SAVE email, status=unverified
  //   not_found / no_url / fetch_error     → previous tags (no email change)
  //
  // Rationale: NeverBounce returns `unknown` for most Gmail/Yahoo/AOL
  // addresses because consumer-provider SMTP doesn't reveal individual
  // accounts. The old "save only if valid" policy silently dropped every
  // small-business Gmail address that owners list as their contact. We
  // now keep them and surface the verification verdict as a badge so the
  // operator can decide whether to send.
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
      let verificationStatus: string | null = null

      if (result.verification.ok) {
        counts.verified++
        tagSet.add('email_verified')
        saveEmail = result.email
        verificationStatus = 'valid'
      } else if (
        result.verification.nb_status === 'invalid'
        || result.verification.nb_status === 'disposable'
      ) {
        counts.invalid++
        tagSet.add('email_invalid')
        if (result.verification.nb_status === 'disposable') tagSet.add('email_disposable')
        verificationStatus = result.verification.nb_status
      } else if (result.verification.nb_status === 'accept_all') {
        counts.unverifiable++
        tagSet.add('email_catch_all')
        saveEmail = result.email
        verificationStatus = 'catchall'
      } else if (result.verification.nb_status === 'unknown') {
        counts.unverifiable++
        tagSet.add('email_unverifiable')
        saveEmail = result.email
        verificationStatus = 'unknown'
      } else {
        counts.unverifiable++
        tagSet.add('email_unverified')
        saveEmail = result.email
        verificationStatus = 'unverified'
      }

      const tags = [...tagSet]
      const update: Record<string, unknown> = { tags }
      if (saveEmail) update.contact_email = saveEmail
      if (verificationStatus) update.email_verification_status = verificationStatus
      if (Object.keys(result.socialUrls).length > 0) update.social_urls = result.socialUrls
      await admin.from('cs_leads').update(update).eq('id', leadId)
    } else if (result.status === 'not_found' || result.status === 'no_url') {
      counts.not_found++
      const tagToAdd =
        result.status === 'no_url' ? 'no_website' : 'email_not_found'
      const tags = [...new Set([...existingTags, tagToAdd])]
      const update: Record<string, unknown> = { tags }
      if (result.status === 'not_found' && Object.keys(result.socialUrls).length > 0) {
        update.social_urls = result.socialUrls
      }
      await admin.from('cs_leads').update(update).eq('id', leadId)
    } else {
      counts.errors++
      const tags = [...new Set([...existingTags, 'email_fetch_error'])]
      await admin.from('cs_leads').update({ tags }).eq('id', leadId)
    }
  }

  return json({
    results,
    counts,
    processed: Object.keys(results).length,
    requested: leads.length,
    stopped_early: stoppedEarly,
    note: stoppedEarly
      ? `Stopped at the ${DEADLINE_MS / 1000}s time budget with ${Object.keys(results).length} of ${leads.length} processed. The remaining leads stay eligible; click Find emails again to pick them up.`
      : undefined,
    verifier: neverBounceKey ? 'neverbounce' : 'unavailable',
  })
})
