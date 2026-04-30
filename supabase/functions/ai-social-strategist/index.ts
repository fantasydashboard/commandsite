// CommandSite ai-social-strategist Edge Function
// ---------------------------------------------------------------------------
// V2 of the AI Social pipeline. Reads brand profile + a metrics snapshot
// (passed in from the client, decouples this function from UFD-specific
// data sources) + recent post history, asks Claude to propose:
//   - a situation summary
//   - 2-4 themes the next batch should focus on
//   - 3-7 concrete post topics with angles + target platforms
//   - a cadence recommendation
// Persists the run to social_strategy_runs (run_type: 'strategist') for
// audit + future learning loop.
//
// Auth:   Authorization: Bearer <supabase-user-jwt> (admin or client member)
// Body:   { client_id?: string, metrics_snapshot?: any }
//   - admin can target any client; client users target their own
//   - metrics_snapshot is opaque to this function — whatever shape the
//     calling UI/adapter wants. We just stringify it into the prompt.
// Secrets: ANTHROPIC_API_KEY

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

const PROPOSE_STRATEGY_TOOL = {
  name: 'propose_strategy',
  description: 'Submit a content strategy informed by current metrics + brand',
  input_schema: {
    type: 'object',
    properties: {
      situation_summary: {
        type: 'string',
        description: '2-3 sentences on the state of the business right now and what content should respond to',
      },
      key_observations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific facts pulled from the metrics that should drive content choices',
      },
      themes: {
        type: 'array',
        description: '2-4 themes the next content batch should orbit around',
        items: {
          type: 'object',
          properties: {
            theme: { type: 'string' },
            why: { type: 'string', description: 'Why this theme fits this exact moment' },
          },
          required: ['theme', 'why'],
        },
      },
      proposed_topics: {
        type: 'array',
        description: '3-7 concrete, draftable topics across channels — specific, not generic',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Short label, what the writer would draft about' },
            theme: { type: 'string', description: 'Which theme this supports' },
            angle: { type: 'string', description: 'How to approach the topic — the hook/framing' },
            channel: {
              type: 'string',
              enum: ['social', 'email', 'paid_ads', 'landing_page'],
              description:
                'Which marketing channel this topic is for. Default to social when general; pick email for lifecycle/retention asks; paid_ads for retargeting/acquisition; landing_page for conversion-page copy.',
            },
            target_platforms: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['twitter', 'linkedin', 'facebook', 'instagram'],
              },
              description: 'Only meaningful when channel = social',
            },
          },
          required: ['topic', 'angle'],
        },
      },
      cadence_recommendation: {
        type: 'string',
        description: 'How often + when to post this batch',
      },
    },
    required: ['situation_summary', 'themes', 'proposed_topics'],
  },
}

interface RecentFeedback {
  items: { type: 'theme' | 'topic'; label: string; reaction: 'up' | 'down' | null; comment: string | null }[]
  notes: string | null
}

// deno-lint-ignore no-explicit-any
function buildSystemPrompt(profile: any, snapshot: any, recentPosts: any[], lessons: any[], feedback: RecentFeedback | null): string {
  const lines: string[] = [
    `You are a senior social media strategist for ${profile.business_name || 'this business'}.`,
    '',
    'BRAND PROFILE',
    '─────────────',
  ]
  if (profile.description) lines.push(`What we do: ${profile.description}`)
  if (profile.voice) lines.push(`Voice: ${profile.voice}`)
  if (profile.audience) lines.push(`Audience: ${profile.audience}`)
  if (profile.goals?.primary) {
    const cadence = profile.goals.cadence ? `, cadence: ${profile.goals.cadence}` : ''
    lines.push(`Primary goal: ${profile.goals.primary}${cadence}`)
  }
  if (profile.topics?.length) lines.push(`Allowed topics: ${profile.topics.join(', ')}`)
  if (profile.dos?.length) {
    lines.push('Do:')
    for (const d of profile.dos) lines.push(`  • ${d}`)
  }
  if (profile.donts?.length) {
    lines.push("Don't:")
    for (const d of profile.donts) lines.push(`  • ${d}`)
  }

  if (snapshot && Object.keys(snapshot).length > 0) {
    lines.push('')
    lines.push('LIVE METRICS')
    lines.push('────────────')
    lines.push(JSON.stringify(snapshot, null, 2))
  }

  if (recentPosts && recentPosts.length > 0) {
    lines.push('')
    lines.push('RECENT POSTS WE WROTE (last 10)')
    lines.push('────────────────────────────────')
    for (const p of recentPosts) {
      const status = p.status ?? 'draft'
      lines.push(`  • "${p.topic ?? 'untitled'}" — ${status}`)
    }
  }

  if (lessons && lessons.length > 0) {
    lines.push('')
    lines.push('LEARNED LESSONS')
    lines.push('───────────────')
    for (const l of lessons.slice(0, 8)) {
      lines.push(`  • ${typeof l === 'string' ? l : JSON.stringify(l)}`)
    }
  }

  if (feedback && (feedback.items.length > 0 || feedback.notes)) {
    lines.push('')
    lines.push('FEEDBACK ON PREVIOUS RUN (apply going forward)')
    lines.push('───────────────────────────────────────────────')
    lines.push('The user reviewed last run and reacted to specific items. These signals are validated — let them shape this run.')
    for (const it of feedback.items) {
      const symbol = it.reaction === 'up' ? '👍' : it.reaction === 'down' ? '👎' : '·'
      const cmt = it.comment ? ` — ${it.comment}` : ''
      lines.push(`  ${symbol} ${it.type}: "${it.label}"${cmt}`)
    }
    if (feedback.notes) {
      lines.push('')
      lines.push(`  Free-form note from user: ${feedback.notes}`)
    }
  }

  lines.push('')
  lines.push('YOUR JOB')
  lines.push('────────')
  lines.push(
    'Read the metrics + brand. Recommend a content plan that DIRECTLY responds to what the data says. Be specific, not generic — every recommendation should be traceable to a fact about THIS business at THIS moment.',
  )
  lines.push('')
  lines.push('Examples of metric-grounded thinking:')
  lines.push('- Open rates dropping → propose lighter, more curiosity-driven email subject angles (channel: email).')
  lines.push('- Churn climbing in a tier → propose retention email + social-proof posts (mixed channels).')
  lines.push('- Signup surge → social posts welcoming the wave (channel: social).')
  lines.push('- Trial users not converting → email reminder of value + paid retargeting (channels: email + paid_ads).')
  lines.push('- High-performing post type → propose 2 more in that vein (channel: social).')
  lines.push('')
  lines.push('Pick the channel that fits the moment. Mix channels across the batch — most content plans benefit from coordinated email + social, sometimes plus paid.')
  lines.push('')
  lines.push(
    'Avoid: vague themes ("educational content"), recycled topics already in the queue, anything in the brand\'s "don\'t" list. Submit via the propose_strategy tool.',
  )

  return lines.join('\n')
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

  // deno-lint-ignore no-explicit-any
  let body: { client_id?: string; metrics_snapshot?: any } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body fine */
  }

  const clientId =
    caller.role === 'admin' ? body.client_id ?? caller.client_id : caller.client_id
  if (!clientId) return json({ error: 'Cannot determine target client' }, 400)

  // Load brand profile.
  const { data: profile, error: profileErr } = await admin
    .from('client_brand_profiles')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (profileErr) return json({ error: `Profile read: ${profileErr.message}` }, 500)
  if (!profile) return json({ error: 'Brand profile not set up. Fill it in first.' }, 400)

  // Recent post drafts for context (avoid suggesting things we just wrote).
  const { data: recentPosts } = await admin
    .from('social_post_drafts')
    .select('topic, status, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(10)

  const lessons = Array.isArray(profile.lessons_learned) ? profile.lessons_learned : []

  // Pull the previous Strategist run + any feedback the user gave on it.
  // Hydrate item references against last run's actual themes/topics so the
  // model sees the human label instead of a meaningless index.
  // deno-lint-ignore no-explicit-any
  let recentFeedback: RecentFeedback | null = null
  const { data: lastRun } = await admin
    .from('social_strategy_runs')
    .select('id, output, feedback_notes')
    .eq('client_id', clientId)
    .eq('run_type', 'strategist')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastRun) {
    const { data: rawFeedback } = await admin
      .from('social_strategy_feedback')
      .select('item_type, item_index, reaction, comment')
      .eq('run_id', lastRun.id)
    // deno-lint-ignore no-explicit-any
    const output: any = lastRun.output ?? {}
    const items: RecentFeedback['items'] = []
    // deno-lint-ignore no-explicit-any
    for (const f of (rawFeedback ?? []) as any[]) {
      let label: string
      if (f.item_type === 'theme') {
        label = output.themes?.[f.item_index]?.theme ?? `theme ${f.item_index}`
      } else {
        label = output.proposed_topics?.[f.item_index]?.topic ?? `topic ${f.item_index}`
      }
      items.push({
        type: f.item_type as 'theme' | 'topic',
        label,
        reaction: f.reaction as 'up' | 'down' | null,
        comment: f.comment as string | null,
      })
    }
    if (items.length > 0 || lastRun.feedback_notes) {
      recentFeedback = { items, notes: lastRun.feedback_notes ?? null }
    }
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'Anthropic API key not configured on server' }, 500)

  const systemPrompt = buildSystemPrompt(
    profile,
    body.metrics_snapshot ?? null,
    recentPosts ?? [],
    lessons,
    recentFeedback,
  )

  const userPrompt =
    'Propose a content strategy for the next posting batch. Submit via the propose_strategy tool.'

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
      messages: [{ role: 'user', content: userPrompt }],
      tools: [PROPOSE_STRATEGY_TOOL],
      tool_choice: { type: 'tool', name: 'propose_strategy' },
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
    (b: any) => b.type === 'tool_use' && b.name === 'propose_strategy',
  )
  if (!toolBlock) return json({ error: 'Model returned no strategy' }, 502)

  const strategy = toolBlock.input
  const ai_meta = {
    model: result.model,
    tokens_in: result.usage?.input_tokens,
    tokens_out: result.usage?.output_tokens,
    stop_reason: result.stop_reason,
  }

  const { data: run, error: insertErr } = await admin
    .from('social_strategy_runs')
    .insert({
      client_id: clientId,
      run_type: 'strategist',
      input: { metrics_snapshot: body.metrics_snapshot ?? null },
      output: strategy,
      ai_meta,
    })
    .select('*')
    .single()
  if (insertErr) return json({ error: `Insert: ${insertErr.message}` }, 500)

  return json({ run, strategy })
})
