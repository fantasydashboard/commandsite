// CommandSite ufd-emails Edge Function
// ---------------------------------------------------------------------------
// Phase 1: pass-through Resend email analytics for the UFD dashboard.
// Calls Resend's /emails endpoint, paginates back through the requested
// window, and returns an aggregate-by-last-event breakdown + recent rows.
//
// Note on accuracy: Resend's list endpoint exposes `last_event` per email
// (the latest event that happened to it). We roll that up into funnel-ish
// counters — an opened+clicked email only shows as 'clicked'. To get true
// funnel counts across all events, Phase 2 will add a webhook → event log.
//
// Auth:   Authorization: Bearer <supabase-user-jwt>
//         Caller must be CommandSite admin OR the UFD client user.
// Body:   { window: 'today'|'7d'|'15d'|'30d'|'90d'|'1y'|'all' }
// Secrets expected:
//   UFD_RESEND_API_KEY  — Resend API key (ideally scoped to UFD's domain)

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

type Window = 'today' | '7d' | '15d' | '30d' | '90d' | '1y' | 'all'

function windowRange(w: Window): { since: string | null; now: string } {
  const now = new Date()
  const nowISO = now.toISOString()
  if (w === 'all') return { since: null, now: nowISO }
  const days = w === 'today' ? 1 : w === '7d' ? 7 : w === '15d' ? 15 : w === '30d' ? 30 : w === '90d' ? 90 : 365
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  if (w === 'today') since.setUTCHours(0, 0, 0, 0)
  return { since: since.toISOString(), now: nowISO }
}

// Resend "last_event" states, ordered by funnel progression.
// Used to classify an email into buckets for the aggregate cards.
type LastEvent =
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'

interface ResendEmail {
  id: string
  to: string[]
  from: string
  subject: string
  created_at: string
  last_event: LastEvent
}

interface ResendListResponse {
  data: ResendEmail[]
  has_more?: boolean
}

// Paginate through Resend /emails until we run out of rows in the window.
// Resend's list endpoint paginates newest-first, so we can stop early as
// soon as rows fall before `since`. Hard-cap pages to avoid runaway loops
// against very large accounts.
// Paginate through Resend /emails, staying under the 5 req/sec rate limit
// by sleeping 250ms between pages. Stops as soon as rows fall before
// `since` (Resend lists newest-first).
async function fetchEmails(
  apiKey: string,
  since: string | null,
): Promise<{ emails: ResendEmail[]; truncated: boolean }> {
  const out: ResendEmail[] = []
  const sinceMs = since ? new Date(since).getTime() : 0
  const PAGE_SIZE = 100 // Resend's max per-page
  const MAX_PAGES = 5 // 5 × 100 = 500 emails per window
  let cursor: string | null = null
  let truncated = false

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await new Promise((r) => setTimeout(r, 250))

    const url = new URL('https://api.resend.com/emails')
    url.searchParams.set('limit', String(PAGE_SIZE))
    if (cursor) url.searchParams.set('after', cursor)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Resend ${res.status}: ${text.slice(0, 200)}`)
    }
    const body: ResendListResponse = await res.json()
    const rows = body.data ?? []
    if (rows.length === 0) break

    let stopped = false
    for (const row of rows) {
      if (since !== null && new Date(row.created_at).getTime() < sinceMs) {
        stopped = true
        break
      }
      out.push(row)
    }
    if (stopped) break
    if (!body.has_more) break
    cursor = rows[rows.length - 1].id
    if (page === MAX_PAGES - 1 && body.has_more) truncated = true
  }

  return { emails: out, truncated }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!jwt) return json({ error: 'Missing bearer token' }, 401)

  // ── Auth ────────────────────────────────────────────────────────────────
  const csAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: userData, error: userErr } = await csAdmin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)

  const { data: profile, error: profileErr } = await csAdmin
    .from('users')
    .select('id, role, client_id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profileErr || !profile) return json({ error: 'Profile not found' }, 403)

  const ufdSlug = Deno.env.get('UFD_CLIENT_SLUG') ?? 'ufd'
  const { data: ufdClient } = await csAdmin
    .from('clients')
    .select('id')
    .eq('slug', ufdSlug)
    .maybeSingle()
  if (!ufdClient) return json({ error: 'UFD client not configured' }, 500)

  const allowed = profile.role === 'admin' || profile.client_id === ufdClient.id
  if (!allowed) return json({ error: 'Forbidden' }, 403)

  // ── Body ────────────────────────────────────────────────────────────────
  let body: { window?: Window }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const w: Window = (body.window ?? '30d') as Window
  const valid: Window[] = ['today', '7d', '15d', '30d', '90d', '1y', 'all']
  if (!valid.includes(w)) return json({ error: 'Invalid window' }, 400)
  const { since, now } = windowRange(w)

  // ── Fetch emails ────────────────────────────────────────────────────────
  const apiKey = Deno.env.get('UFD_RESEND_API_KEY')
  if (!apiKey) return json({ error: 'Resend API key not configured on server' }, 500)

  let emails: ResendEmail[]
  let truncated = false
  try {
    const res = await fetchEmails(apiKey, since)
    emails = res.emails
    truncated = res.truncated
  } catch (e) {
    return json({ error: `Resend fetch: ${(e as Error).message}` }, 502)
  }

  // ── Aggregate ───────────────────────────────────────────────────────────
  // last_event is the *latest* event, so counters reflect current state,
  // not a strict funnel. Delivered counts emails that made it past the MTA
  // (delivered, opened, clicked). Opened counts emails at opened or beyond.
  let sent = emails.length
  let delivered = 0
  let opened = 0
  let clicked = 0
  let bounced = 0
  let complained = 0
  let pending = 0

  for (const e of emails) {
    switch (e.last_event) {
      case 'delivered':
        delivered++
        break
      case 'opened':
        delivered++
        opened++
        break
      case 'clicked':
        delivered++
        opened++
        clicked++
        break
      case 'bounced':
        bounced++
        break
      case 'complained':
        complained++
        break
      case 'sent':
      case 'delivery_delayed':
      default:
        pending++
        break
    }
  }

  // ── Series: sent-per-day, for a mini trend chart ────────────────────────
  const sentSeries: Record<string, number> = {}
  for (const e of emails) {
    const key = e.created_at.slice(0, 10)
    sentSeries[key] = (sentSeries[key] ?? 0) + 1
  }

  // ── Group by subject ────────────────────────────────────────────────────
  // Most UFD emails come from templates (welcome, power rankings, etc.) and
  // share an exact subject. Collapsing by subject lets the user see per-
  // template performance at a glance, with the individual rows still
  // accessible as an expandable detail.
  interface GroupAccum {
    subject: string
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    complained: number
    pending: number
    first_sent: string
    last_sent: string
    emails: {
      id: string
      to: string
      subject: string
      created_at: string
      last_event: string
    }[]
  }
  const groups = new Map<string, GroupAccum>()
  const keyFor = (subj: string) => (subj ?? '').trim().toLowerCase() || '(no subject)'

  for (const e of emails) {
    const k = keyFor(e.subject)
    let g = groups.get(k)
    if (!g) {
      g = {
        subject: (e.subject ?? '').trim() || '(no subject)',
        sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, pending: 0,
        first_sent: e.created_at,
        last_sent: e.created_at,
        emails: [],
      }
      groups.set(k, g)
    }
    g.sent++
    switch (e.last_event) {
      case 'delivered': g.delivered++; break
      case 'opened': g.delivered++; g.opened++; break
      case 'clicked': g.delivered++; g.opened++; g.clicked++; break
      case 'bounced': g.bounced++; break
      case 'complained': g.complained++; break
      default: g.pending++; break
    }
    if (e.created_at < g.first_sent) g.first_sent = e.created_at
    if (e.created_at > g.last_sent) g.last_sent = e.created_at
    g.emails.push({
      id: e.id,
      to: Array.isArray(e.to) ? e.to[0] : (e.to as unknown as string),
      subject: e.subject,
      created_at: e.created_at,
      last_event: e.last_event,
    })
  }

  const groupList = Array.from(groups.values())
    .map((g) => {
      // Keep at most 50 detail rows per group to cap payload size.
      g.emails.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      const detail = g.emails.slice(0, 50)
      const moreCount = g.emails.length - detail.length
      return {
        subject: g.subject,
        sent: g.sent,
        delivered: g.delivered,
        opened: g.opened,
        clicked: g.clicked,
        bounced: g.bounced,
        complained: g.complained,
        pending: g.pending,
        first_sent: g.first_sent,
        last_sent: g.last_sent,
        emails: detail,
        more_count: moreCount > 0 ? moreCount : 0,
      }
    })
    .sort((a, b) => b.sent - a.sent)

  return json({
    window: w,
    range: { since, now },
    cards: { sent, delivered, opened, clicked, bounced, complained, pending },
    rates: {
      delivery_rate: sent ? delivered / sent : 0,
      open_rate: delivered ? opened / delivered : 0,
      click_rate: delivered ? clicked / delivered : 0,
      bounce_rate: sent ? bounced / sent : 0,
      complain_rate: sent ? complained / sent : 0,
    },
    series: { sent: sentSeries },
    groups: groupList,
    truncated,
  })
})
