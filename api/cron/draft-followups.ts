/**
 * Vercel Cron route — daily, drafts followup emails for sent leads
 * with no reply at day 3 (Touch 2) and day 7 (Touch 3). Auto-archives
 * leads that hit day 14 with no reply after 3 touches.
 *
 * Schedule (vercel.json): "0 12 * * *" → 12:00 UTC = 7:00 ET daily.
 *
 * Drafts land in cs_leads.draft_cold_email_* and appear in CommandSite
 * → Outreach → Ready to send for Josh to review/approve. Never auto-sends.
 *
 * Same auth pattern as morning-brief / weekly-plan.
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
  const followupSecret = process.env.FOLLOWUP_CRON_SECRET
  if (!supabaseUrl || !followupSecret) {
    return res.status(500).json({
      error: 'Misconfigured: SUPABASE_URL or FOLLOWUP_CRON_SECRET missing',
    })
  }

  try {
    const upstream = await fetch(`${supabaseUrl}/functions/v1/draft-followup-emails`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cron-secret': followupSecret,
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
