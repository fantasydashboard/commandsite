// CommandSite social-plan-generate Edge Function
// ---------------------------------------------------------------------------
// Generates a 7-day social media content plan for a client. Pulls:
//   - Their brand profile (voice, audience, dos/donts)
//   - Latest strategist themes (if available)
//   - Sport calendar context (in-season sports, upcoming tentpoles)
//
// Calls Claude with a propose_plan tool and inserts the returned posts
// into social_posts as status='planned' (review, edit, schedule from
// the Social Distribution composer).
//
// Auth:   Authorization: Bearer <user-jwt> (admin or client)
// Body:   { client_id?: string, start_date?: string (YYYY-MM-DD) }
//         start_date defaults to today; plan covers 7 days from there.
//
// Secrets: ANTHROPIC_API_KEY (already configured for the strategist)

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { sportContextFor } from '../_shared/sport-calendar.ts'

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

const PROPOSE_PLAN_TOOL = {
  name: 'propose_plan',
  description:
    'Propose a 7-day social media content plan with mixed platforms and creative types. ' +
    'Aim for 7-10 total posts across the week — not one per day, more like 1-2 per day on the most active platform plus weekly mixers on the secondary platform.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'One-sentence summary of the plan: theme of the week + key tentpole(s) it leans into.',
      },
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            day_offset: {
              type: 'integer',
              description: 'Days from the plan start_date (0 = day 1, 6 = day 7). Spread posts across the week.',
              minimum: 0,
              maximum: 6,
            },
            platform: {
              type: 'string',
              enum: ['x', 'reddit'],
              description: "X (Twitter) for short hot takes / polls / news; Reddit for longer educational threads + community participation.",
            },
            creative_type: {
              type: 'string',
              enum: ['downloadable_card', 'hot_take', 'educational', 'poll', 'reactive'],
              description:
                "downloadable_card = points to a UFD card image (power rankings / matchups / etc); " +
                "hot_take = one-sentence opinion designed to start arguments; " +
                "educational = explains a fantasy concept; " +
                "poll = a question with discrete options for engagement; " +
                "reactive = riffs on current sport news/event.",
            },
            title: {
              type: 'string',
              description: 'Reddit post title (omit for X).',
            },
            body: {
              type: 'string',
              description: 'The actual post text. For X, ≤280 chars. For Reddit, can be markdown.',
            },
            subreddit: {
              type: 'string',
              description: "For Reddit only. No 'r/' prefix. e.g. 'fantasyfootball', 'DynastyFF', 'fantasybaseball'.",
            },
            rationale: {
              type: 'string',
              description: 'Why this post for this day. Reference the sport context where applicable.',
            },
          },
          required: ['day_offset', 'platform', 'creative_type', 'body', 'rationale'],
        },
      },
    },
    required: ['summary', 'posts'],
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!jwt) return json({ error: 'Missing bearer token' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)

  const { data: caller } = await admin
    .from('users')
    .select('id, role, client_id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!caller) return json({ error: 'Profile not found' }, 403)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY missing' }, 500)

  let body: { client_id?: string; start_date?: string } = {}
  try { body = await req.json() } catch { /* empty */ }

  const clientId =
    caller.role === 'admin' ? body.client_id ?? caller.client_id : caller.client_id
  if (!clientId) return json({ error: 'Cannot determine target client' }, 400)

  // Plan window: 7 days starting from start_date (default = today UTC)
  const startDate = body.start_date
    ? new Date(body.start_date)
    : (() => {
        const d = new Date()
        d.setUTCHours(0, 0, 0, 0)
        return d
      })()
  const startIso = startDate.toISOString().slice(0, 10)

  // ── Brand profile ──────────────────────────────────────────────────────
  const { data: profile } = await admin
    .from('client_brand_profiles')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!profile) return json({ error: 'Brand profile not set up. Fill it in on the AI Marketing tab first.' }, 400)

  // ── Latest strategist run (themes) ─────────────────────────────────────
  // deno-lint-ignore no-explicit-any
  const { data: latestRun } = await admin
    .from('ai_runs')
    .select('output, kind, created_at')
    .eq('client_id', clientId)
    .eq('kind', 'social_strategy')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // ── Sport context ──────────────────────────────────────────────────────
  const sportCtx = sportContextFor(startDate)

  // ── Build the prompt ───────────────────────────────────────────────────
  const systemPrompt = [
    `You are the social media planner for ${profile.business_name || 'this business'}.`,
    profile.description ? `\nWhat the business does: ${profile.description}` : '',
    profile.voice ? `\nVoice: ${profile.voice}` : '',
    profile.audience ? `\nAudience: ${profile.audience}` : '',
    profile.dos?.length ? `\nDo: ${profile.dos.join('; ')}` : '',
    profile.donts?.length ? `\nDon't: ${profile.donts.join('; ')}` : '',
    profile.topics?.length ? `\nTopics: ${profile.topics.join('; ')}` : '',
    '',
    '──────────────────────────────────────────',
    'PLANNING WINDOW',
    `Plan starts: ${startIso} (UTC).`,
    `Output 7 days of posts. Day 0 = ${startIso}.`,
    '',
    '──────────────────────────────────────────',
    'SPORT CONTEXT (real fantasy-sports calendar)',
    `Primary sport this week: ${sportCtx.primary_sport}`,
    `In-season:`,
    ...sportCtx.in_season.map(
      (s) => `  - ${s.label}: ${s.phase}${s.week_of_season ? ` (week ${s.week_of_season})` : ''}`,
    ),
    sportCtx.in_season.length === 0 ? '  - (no major sport in-season — favour offseason content)' : '',
    `Upcoming tentpoles (next 14 days):`,
    ...sportCtx.upcoming_events.map(
      (e) => `  - ${e.date} (${e.days_away >= 0 ? `+${e.days_away}d` : `${e.days_away}d`}): ${e.label} [${e.weight}]`,
    ),
    sportCtx.upcoming_events.length === 0 ? '  - (no tentpoles in window)' : '',
    '',
    latestRun?.output
      ? `──────────────────────────────────────────\nLATEST STRATEGIST OUTPUT (use as inspiration; don't repeat verbatim):\n${JSON.stringify(latestRun.output).slice(0, 1500)}`
      : '',
    '',
    '──────────────────────────────────────────',
    'CREATIVE TYPES (pick deliberately):',
    '  - downloadable_card: a UFD card image — power rankings, matchups, draft grades. Suggest a TYPE of card to share, do not invent player names or stats. The body should be the caption that sits above the image.',
    '  - hot_take: a one-sentence opinion designed to start arguments. Best for X. Reference the actual sport state when possible (no fictional games or specific names you might get wrong).',
    '  - educational: explains a fantasy concept tied to UFD features (power rankings, win probability, matchup analysis). Best for Reddit (longer threads).',
    '  - poll: a question with 2-4 discrete options. X has native polls; phrase the body so it works as a poll prompt.',
    '  - reactive: riffs on a real upcoming sport tentpole from the list above. Connects UFD to that moment.',
    '',
    '──────────────────────────────────────────',
    'PLATFORM GUIDELINES',
    '  - X: short, punchy. 280 char hard limit. Hot takes + polls + reactive shine here.',
    '  - Reddit: longer. Title + markdown body. Subreddit field required. Best subs: fantasyfootball, DynastyFF, fantasybaseball, fantasybball, fantasyhockey, FFCommish, DynastyBaseball. Educational + downloadable_card work well.',
    '',
    'RULES',
    '  - Mix platforms: ~60% X, ~40% Reddit unless one sport is dominant',
    '  - Mix creative types: at least 3 different types across the week',
    '  - Don\'t invent specific players, scores, or trades you can\'t verify — speak in general terms or reference confirmed scheduled events',
    '  - Skip Sundays for posting if sport-irrelevant; bunch around game days for football',
    '  - Tie at least 1-2 posts directly to upcoming tentpole events from the sport context',
  ]
    .filter(Boolean)
    .join('\n')

  // ── Call Claude ────────────────────────────────────────────────────────
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: 'Propose a 7-day plan via the propose_plan tool.',
        },
      ],
      tools: [PROPOSE_PLAN_TOOL],
      tool_choice: { type: 'tool', name: 'propose_plan' },
    }),
  })
  if (!anthropicRes.ok) {
    const text = await anthropicRes.text()
    return json({ error: `Anthropic ${anthropicRes.status}: ${text.slice(0, 500)}` }, 502)
  }
  // deno-lint-ignore no-explicit-any
  const result: any = await anthropicRes.json()

  // deno-lint-ignore no-explicit-any
  const toolBlock = (result.content ?? []).find(
    (b: any) => b.type === 'tool_use' && b.name === 'propose_plan',
  )
  if (!toolBlock) return json({ error: 'Model returned no plan' }, 502)
  const plan = toolBlock.input as {
    summary: string
    posts: Array<{
      day_offset: number
      platform: 'x' | 'reddit'
      creative_type: string
      title?: string
      body: string
      subreddit?: string
      rationale: string
    }>
  }

  // ── Insert as planned posts ────────────────────────────────────────────
  // deno-lint-ignore no-explicit-any
  const planBatchId = crypto.randomUUID()
  const rows = plan.posts.map((p) => {
    const planDate = new Date(startDate)
    planDate.setUTCDate(planDate.getUTCDate() + p.day_offset)
    return {
      client_id: clientId,
      platform: p.platform,
      title: p.title ?? null,
      body: p.body,
      subreddit: p.subreddit ?? null,
      status: 'planned',
      planned_for: planDate.toISOString().slice(0, 10),
      creative_type: p.creative_type,
      plan_batch_id: planBatchId,
      created_by: caller.id,
    }
  })

  if (rows.length > 0) {
    const { error: insErr } = await admin.from('social_posts').insert(rows)
    if (insErr) return json({ error: `Insert: ${insErr.message}` }, 500)
  }

  return json({
    plan_batch_id: planBatchId,
    summary: plan.summary,
    posts_created: rows.length,
    sport_context: sportCtx,
    ai_meta: {
      model: result.model,
      tokens_in: result.usage?.input_tokens,
      tokens_out: result.usage?.output_tokens,
    },
  })
})
