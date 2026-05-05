// CommandSite vercel-analytics-poll Edge Function
// ---------------------------------------------------------------------------
// Pulls daily page-view counts from Vercel Web Analytics for the UFD project
// and stores them in daily_visits. Runs hourly via pg_cron — Vercel data
// updates a few minutes after each hour, so an hourly cadence keeps the
// chart current without spamming the API.
//
// Honest disclosure on the API: Vercel's Web Analytics public API surface
// is sparse + has changed shape over time. We try the official documented
// endpoint first; if Vercel ever changes it the function logs the actual
// response so we can adjust. Errors are non-fatal — failed polls just leave
// existing rows untouched.
//
// Trigger: GET (cron) or POST (manual). No auth required (deploy with
// --no-verify-jwt).
//
// Secrets needed:
//   VERCEL_API_TOKEN          — token from vercel.com/account/tokens
//   UFD_VERCEL_PROJECT_ID     — prj_xxx from project Settings
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
//   UFD_CLIENT_SLUG (defaults to 'ufd')

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

interface DailyPoint {
  date: string         // YYYY-MM-DD
  views: number
  visitors?: number
}

// Find which team the project belongs to. Token might be scoped to a
// personal account but project lives in a team (or vice versa). We list
// the teams the token can see, then probe each for the project.
async function verifyAuth(
  projectId: string,
  token: string,
): Promise<
  | { ok: true; teamId: string | null; projectName: string; teamSlug?: string }
  | { ok: false; error: string; body?: string; tried?: string[]; teamsSeen?: string[] }
> {
  const headers = { Authorization: `Bearer ${token}` }

  // Step 1: try the personal-account scope (no teamId).
  const personal = await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`,
    { headers },
  )
  if (personal.ok) {
    // deno-lint-ignore no-explicit-any
    const data: any = await personal.json()
    return { ok: true, teamId: null, projectName: data.name ?? projectId }
  }

  // Step 2: list teams accessible to this token.
  const teamsRes = await fetch('https://api.vercel.com/v2/teams', { headers })
  if (!teamsRes.ok) {
    let body = ''
    try { body = (await teamsRes.text()).slice(0, 300) } catch { /* empty */ }
    return {
      ok: false,
      error: `Token can't list teams (status ${teamsRes.status}). The token may be invalid or expired.`,
      body,
    }
  }
  // deno-lint-ignore no-explicit-any
  const teamsData: any = await teamsRes.json()
  const teams = (teamsData.teams ?? []) as { id: string; slug: string; name?: string }[]
  const teamsSeen: string[] = []
  const tried: string[] = ['personal scope']

  // Step 3: try the project under each team.
  for (const t of teams) {
    teamsSeen.push(`${t.slug ?? t.id}`)
    tried.push(`team ${t.slug ?? t.id}`)
    const r = await fetch(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}?teamId=${encodeURIComponent(t.id)}`,
      { headers },
    )
    if (r.ok) {
      // deno-lint-ignore no-explicit-any
      const data: any = await r.json()
      return {
        ok: true,
        teamId: t.id,
        teamSlug: t.slug,
        projectName: data.name ?? projectId,
      }
    }
  }

  return {
    ok: false,
    error: `Project ${projectId} not found in personal scope or any of ${teams.length} teams the token sees.`,
    teamsSeen,
    tried,
  }
}

// Try Vercel's various Web Analytics endpoints. Returns daily totals for
// the last `days` days (inclusive of today). Vercel's analytics API is
// unstable / undocumented — we try the candidates and report which one
// (if any) returned data.
async function fetchVercelDailyViews(
  projectId: string,
  token: string,
  days: number,
  teamId: string | null,
): Promise<{ ok: true; data: DailyPoint[]; endpoint: string } | { ok: false; error: string; status?: number; body?: string; tried: string[] }> {
  const now = Date.now()
  const since = now - days * 86400000
  const fromMs = since
  const toMs = now
  const fromIso = new Date(since).toISOString()
  const toIso = new Date(now).toISOString()

  // Endpoint candidates, in order of preference.
  const teamSuffix = teamId ? `&teamId=${encodeURIComponent(teamId)}` : ''
  const candidates: string[] = [
    // Newer documented Web Analytics endpoint
    `https://api.vercel.com/v1/web-analytics/${encodeURIComponent(projectId)}/views?from=${fromIso}&to=${toIso}&granularity=daily${teamSuffix}`,
    // Filter API used by the dashboard internally
    `https://vercel.com/api/web/insights/${encodeURIComponent(projectId)}/views?from=${fromMs}&to=${toMs}&granularity=daily${teamSuffix}`,
    // Older path
    `https://api.vercel.com/v1/web/insights/${encodeURIComponent(projectId)}/views?from=${fromIso}&to=${toIso}&granularity=daily${teamSuffix}`,
    // Even older — used to be public
    `https://api.vercel.com/v1/integrations/web-vitals/${encodeURIComponent(projectId)}?from=${fromIso}&to=${toIso}${teamSuffix}`,
  ]

  const tried: string[] = []
  let lastBody = ''
  let lastStatus = 0
  let res: Response | null = null
  let workingUrl = ''

  for (const url of candidates) {
    tried.push(url.split('?')[0])
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        workingUrl = url
        break
      }
      lastStatus = res.status
      try { lastBody = (await res.text()).slice(0, 300) } catch { /* empty */ }
    } catch (e) {
      lastBody = `Network: ${(e as Error).message}`
    }
  }

  if (!res || !res.ok) {
    return {
      ok: false,
      error: `All endpoints failed; last status ${lastStatus}`,
      status: lastStatus,
      body: lastBody,
      tried,
    }
  }

  // deno-lint-ignore no-explicit-any
  const data: any = await res.json()

  // Vercel returns various response shapes depending on endpoint version.
  // We try a few common ones; if none match, log the raw response so we
  // can iterate.
  let points: DailyPoint[] = []

  if (Array.isArray(data?.data)) {
    // deno-lint-ignore no-explicit-any
    points = data.data.map((row: any) => ({
      date: typeof row.date === 'string' ? row.date.slice(0, 10) : new Date(row.timestamp ?? Date.now()).toISOString().slice(0, 10),
      views: Number(row.views ?? row.value ?? row.count ?? 0),
      visitors: row.visitors !== undefined ? Number(row.visitors) : undefined,
    }))
  } else if (Array.isArray(data?.points)) {
    // deno-lint-ignore no-explicit-any
    points = data.points.map((row: any) => ({
      date: row.date ?? row.x?.slice(0, 10),
      views: Number(row.y ?? row.views ?? 0),
    }))
  } else if (Array.isArray(data?.timeseries)) {
    // deno-lint-ignore no-explicit-any
    points = data.timeseries.map((row: any) => ({
      date: row.date ?? new Date(row.t).toISOString().slice(0, 10),
      views: Number(row.value ?? row.views ?? 0),
    }))
  }

  if (points.length === 0) {
    // Couldn't parse — return raw shape for debugging.
    return {
      ok: false,
      error: 'Endpoint returned 200 but unrecognized response shape',
      body: JSON.stringify(data).slice(0, 800),
      tried: [workingUrl],
    }
  }

  return { ok: true, data: points, endpoint: workingUrl }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const token = Deno.env.get('VERCEL_API_TOKEN')
  const projectId = Deno.env.get('UFD_VERCEL_PROJECT_ID')
  if (!token || !projectId) {
    return json(
      { error: 'VERCEL_API_TOKEN or UFD_VERCEL_PROJECT_ID secret missing' },
      500,
    )
  }

  // Resolve UFD client_id.
  const ufdSlug = Deno.env.get('UFD_CLIENT_SLUG') ?? 'ufd'
  const { data: ufdClient } = await admin
    .from('clients')
    .select('id')
    .eq('slug', ufdSlug)
    .maybeSingle()
  if (!ufdClient) return json({ error: 'UFD client not configured' }, 500)

  // Sanity-check first — verify the token + project ID resolve.
  const auth = await verifyAuth(projectId, token)
  if (!auth.ok) {
    console.error('[vercel-poll] auth check failed:', auth.error, auth.body ?? '')
    return json({ error: auth.error, body: auth.body, hint: 'Token or project ID likely wrong' }, 502)
  }

  // Pull last 90 days. Upserts handle re-fetches gracefully.
  const result = await fetchVercelDailyViews(projectId, token, 90, auth.teamId)
  if (!result.ok) {
    console.error('[vercel-poll] fetch failed:', result.error, result.body ?? '')
    return json(
      {
        error: result.error,
        status: result.status,
        raw: result.body,
        tried: result.tried,
        auth: { project: auth.projectName, teamId: auth.teamId },
      },
      502,
    )
  }

  // Upsert each day. unique (client_id, source, date) handles dedup.
  const rows = result.data.map((p) => ({
    client_id: ufdClient.id,
    date: p.date,
    views: p.views,
    unique_visitors: p.visitors ?? null,
    source: 'vercel',
    fetched_at: new Date().toISOString(),
  }))

  const { error: upsertErr } = await admin
    .from('daily_visits')
    .upsert(rows, { onConflict: 'client_id,source,date' })
  if (upsertErr) {
    console.error('[vercel-poll] upsert failed:', upsertErr.message)
    return json({ error: `upsert: ${upsertErr.message}` }, 500)
  }

  return json({
    ok: true,
    project: auth.projectName,
    teamId: auth.teamId,
    endpoint: result.endpoint,
    days_fetched: rows.length,
    sample: rows.slice(-3),
  })
})
