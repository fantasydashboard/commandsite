// CommandSite pco-proxy Edge Function
// ---------------------------------------------------------------------------
// Thin proxy for Planning Center Online API calls. Exists because PCO's
// API doesn't send CORS headers, so the browser can't call it directly.
// The /admin/pco-test page sends { token, path, method } here, we forward
// to PCO, and return the response untouched (status + body).
//
// Auth:   Authorization: Bearer <admin user JWT>
// Body:   {
//           token: string   // PCO Personal Access Token in "app_id:secret"
//                           //   format. Get one at:
//                           //   https://api.planningcenteronline.com/oauth/applications
//           path: string    // e.g. "/people/v2/me" or "/check-ins/v2/check_ins?per_page=10"
//           method?: string // GET (default), POST, PATCH, DELETE
//           body?: unknown  // optional JSON body for POST/PATCH
//         }
// Response:
//   {
//     status: number,        // PCO HTTP status
//     statusText: string,
//     body: string,          // raw body
//     parsed?: unknown       // body parsed as JSON if possible
//   }
//
// Token is never stored server-side. It travels in the request body,
// is base64-encoded into a Basic Auth header, sent to PCO, and the
// proxy returns. No persistence. No logging of the token itself.

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

interface ProxyRequest {
  token?: string
  path?: string
  method?: string
  body?: unknown
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // ── Auth: validate JWT, require admin role
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
  let payload: ProxyRequest
  try {
    payload = await req.json() as ProxyRequest
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const token = (payload.token ?? '').trim()
  const path = (payload.path ?? '').trim()
  const method = (payload.method ?? 'GET').toUpperCase()
  if (!token || !path) {
    return json({ error: 'token and path are required' }, 400)
  }
  if (!token.includes(':')) {
    return json({ error: 'token must be in "app_id:secret" format (see PCO Personal Access Tokens)' }, 400)
  }

  // ── Forward to PCO
  // PCO uses HTTP Basic Auth where the username is the application id
  // and the password is the secret. Both come from the user's PAT.
  const basicAuth = btoa(token)  // btoa("app_id:secret") -> base64
  const pcoUrl = `https://api.planningcenteronline.com${path.startsWith('/') ? path : '/' + path}`

  let pcoRes: Response
  try {
    pcoRes = await fetch(pcoUrl, {
      method,
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: payload.body !== undefined && (method === 'POST' || method === 'PATCH')
        ? JSON.stringify(payload.body)
        : undefined,
    })
  } catch (err) {
    return json({
      status: 0,
      statusText: 'fetch failed',
      body: err instanceof Error ? err.message : String(err),
    })
  }

  const body = await pcoRes.text()
  let parsed: unknown = undefined
  try {
    parsed = JSON.parse(body)
  } catch {
    // not JSON, that's fine, raw body is in body
  }

  return json({
    status: pcoRes.status,
    statusText: pcoRes.statusText,
    body,
    parsed,
  })
})
