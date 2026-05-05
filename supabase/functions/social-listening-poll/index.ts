// CommandSite social-listening-poll Edge Function
// ---------------------------------------------------------------------------
// Hourly cron: for each enabled listening_config row, calls Reddit's free
// public read API for every (subreddit, keyword) combination and inserts
// new matches into social_mentions. Dedupe is handled by the unique index
// on (client_id, source_url) — duplicate inserts silently no-op.
//
// Reddit specifics:
//   - Endpoint: https://www.reddit.com/r/{subreddit}/search.json
//   - Params: q, restrict_sr=1 (search within sub), sort=new, limit=25
//   - Auth: none required for public read; just a proper User-Agent
//   - Rate limit: 60 req/min unauthenticated; we sleep 1.2s between calls
//
// Trigger:
//   GET (cron) — public; no body
//   POST       — manual admin trigger; same behaviour, no body needed
//
// Deploy with --no-verify-jwt so pg_cron's net.http_get can call it.

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

const REDDIT_USER_AGENT =
  'CommandSiteListening/1.0 (+https://github.com/fantasydashboard/commandsite)'

interface RedditPost {
  id: string
  title: string
  selftext: string
  author: string
  permalink: string
  subreddit: string
  created_utc: number
}

async function searchSubreddit(
  subreddit: string,
  query: string,
): Promise<RedditPost[]> {
  const url =
    `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json` +
    `?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&limit=25`
  const res = await fetch(url, { headers: { 'User-Agent': REDDIT_USER_AGENT } })
  if (!res.ok) {
    throw new Error(`Reddit ${res.status}: ${res.statusText}`)
  }
  // deno-lint-ignore no-explicit-any
  const data: any = await res.json()
  const children = data?.data?.children ?? []
  // deno-lint-ignore no-explicit-any
  return children.map((c: any) => c.data as RedditPost).filter(Boolean)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // Load every enabled config across clients. (Per-client pacing isn't
  // needed at low volume; we just iterate and respect Reddit's rate limit.)
  const { data: configs, error: cfgErr } = await admin
    .from('listening_config')
    .select('id, client_id, platform, subreddits, keywords')
    .eq('enabled', true)
    .eq('platform', 'reddit')
  if (cfgErr) return json({ error: `Config read: ${cfgErr.message}` }, 500)
  if (!configs || configs.length === 0) {
    return json({ message: 'No enabled configs', processed: 0 })
  }

  const summary: {
    config_id: string
    pairs_searched: number
    matches_seen: number
    new_inserted: number
    errors: string[]
  }[] = []

  // deno-lint-ignore no-explicit-any
  for (const cfg of configs as any[]) {
    const subs: string[] = (cfg.subreddits ?? []).map((s: string) => s.trim()).filter(Boolean)
    const kws: string[] = (cfg.keywords ?? []).map((k: string) => k.trim()).filter(Boolean)
    const errors: string[] = []
    let pairsSearched = 0
    let matchesSeen = 0
    let newInserted = 0

    for (const sub of subs) {
      for (const kw of kws) {
        pairsSearched++
        try {
          const posts = await searchSubreddit(sub, kw)
          matchesSeen += posts.length

          for (const p of posts) {
            const sourceUrl = `https://www.reddit.com${p.permalink}`
            // Snippet: title + leading body slice (Reddit selftext can be huge).
            const snippet =
              p.title +
              (p.selftext ? '\n\n' + p.selftext.slice(0, 800) : '')

            // Insert; rely on unique (client_id, source_url) index for dedup.
            const { error: insErr } = await admin
              .from('social_mentions')
              .insert({
                client_id: cfg.client_id,
                platform: 'reddit',
                source_url: sourceUrl,
                author: p.author ? `u/${p.author}` : null,
                snippet,
                kind: 'mention', // user can re-tag in the inbox
                status: 'new',
              })
            // 23505 = unique_violation = already in table; ignore.
            if (insErr && (insErr as any).code !== '23505') {
              errors.push(`insert ${p.id}: ${insErr.message}`)
            } else if (!insErr) {
              newInserted++
            }
          }
        } catch (e) {
          errors.push(`r/${sub} q=${kw}: ${(e as Error).message}`)
        }
        // Reddit rate limit: keep ~50 req/min to be safe.
        await new Promise((r) => setTimeout(r, 1200))
      }
    }

    await admin
      .from('listening_config')
      .update({
        last_polled_at: new Date().toISOString(),
        last_poll_error: errors.length > 0 ? errors.slice(0, 5).join('; ').slice(0, 1000) : null,
      })
      .eq('id', cfg.id)

    summary.push({
      config_id: cfg.id,
      pairs_searched: pairsSearched,
      matches_seen: matchesSeen,
      new_inserted: newInserted,
      errors,
    })
  }

  return json({ processed: configs.length, summary })
})
