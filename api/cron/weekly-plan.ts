/**
 * Vercel Cron route — fires Sage's Saturday weekly plan generation.
 *
 * Schedule (vercel.json): "0 11 * * 6" → 11:00 UTC Saturday = 7:00 ET.
 *
 * Same auth pattern as morning-brief — validates Vercel CRON_SECRET,
 * proxies to generate-weekly-plan with WEEKLY_PLAN_CRON_SECRET. Plan
 * defaults to NEXT Monday so Josh wakes up Saturday morning to next
 * week's plan ready to review before he heads to the store.
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
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = String(req.headers['authorization'] ?? '')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const planSecret = process.env.WEEKLY_PLAN_CRON_SECRET
  if (!supabaseUrl || !planSecret) {
    return res.status(500).json({
      error: 'Misconfigured: SUPABASE_URL or WEEKLY_PLAN_CRON_SECRET missing',
    })
  }

  try {
    const upstream = await fetch(`${supabaseUrl}/functions/v1/generate-weekly-plan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cron-secret': planSecret,
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
