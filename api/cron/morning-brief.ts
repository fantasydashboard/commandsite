/**
 * Vercel Cron route — fires Sage's daily morning brief generation.
 *
 * Schedule (vercel.json): "0 10 * * *" → 10:00 UTC = 6:00 ET daily.
 *
 * Auth: Vercel auto-injects Authorization: Bearer ${CRON_SECRET}
 * when the env var is set on the project. We validate that, then
 * proxy to the generate-morning-brief Supabase Edge Function with
 * the matching MORNING_BRIEF_CRON_SECRET header. Function then
 * generates a brief for every admin user with a profile.
 *
 * Required env vars:
 *   - CRON_SECRET                    (Vercel project env)
 *   - SUPABASE_URL                   (Vercel project env, public ok)
 *   - MORNING_BRIEF_CRON_SECRET      (Vercel project env, must match
 *                                     the value set in Supabase secrets)
 */

interface VercelRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
}
interface VercelResponse {
  status: (code: number) => VercelResponse
  json: (body: unknown) => VercelResponse
  send: (body: unknown) => VercelResponse
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel cron only sends GET. Allow POST too for manual testing.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Validate Vercel cron secret. Without CRON_SECRET set, Vercel
  // doesn't add the auth header — we accept that case in dev only.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = String(req.headers['authorization'] ?? '')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const briefSecret = process.env.MORNING_BRIEF_CRON_SECRET
  if (!supabaseUrl || !briefSecret) {
    return res.status(500).json({
      error: 'Misconfigured: SUPABASE_URL or MORNING_BRIEF_CRON_SECRET missing',
    })
  }

  try {
    const upstream = await fetch(`${supabaseUrl}/functions/v1/generate-morning-brief`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cron-secret': briefSecret,
      },
      body: JSON.stringify({}),
    })

    const body = await upstream.text()
    if (!upstream.ok) {
      return res.status(502).json({
        error: `Upstream ${upstream.status}: ${body.slice(0, 500)}`,
      })
    }
    return res.status(200).send(body)
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
