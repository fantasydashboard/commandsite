// CommandSite ai-social-generate Edge Function
// ---------------------------------------------------------------------------
// V1.1: the writer agent. Loads a client's brand profile, sends it to Claude
// along with a topic (or a "fresh batch" instruction), and gets back N
// drafts — each with platform-specific variants for X / LinkedIn / Facebook
// / Instagram. Persists drafts to social_post_drafts and logs the run to
// social_strategy_runs for the audit trail / future learning loop.
//
// Auth:   Authorization: Bearer <supabase-user-jwt>
//         Caller must be CommandSite admin OR a member of the target client.
// Body:   { client_id?: string, topic?: string, count?: number }
//         - admin can pass client_id explicitly; client users always operate
//           on their own client_id and any explicit value is ignored.
// Secrets expected:
//   ANTHROPIC_API_KEY  — Claude API key

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

const PLATFORMS = ['twitter', 'linkedin', 'facebook', 'instagram'] as const

const PLATFORM_CONSTRAINTS = `
Platform rules — treat as hard constraints, write distinct copy per platform:
- twitter (X): max 280 chars; hook in first 7 words; 0-2 hashtags; can be a thread if marked.
- linkedin: 1300-3000 chars works best; lead with a hook line + line break; story or framework structure; 0-3 hashtags.
- facebook: 40-80 chars in feed performs best, but longer fine if value-dense; 0-3 hashtags.
- instagram: first 125 chars are the visible hook; body can be long; 5-15 relevant hashtags; user attaches an image at publish time so write copy assuming an image will appear.
`.trim()

// Tool schema is what we *want* Claude to fill out. Forcing the tool call
// (tool_choice: {type:'tool', name:'create_drafts'}) gives us guaranteed
// structured output.
const CREATE_DRAFTS_TOOL = {
  name: 'create_drafts',
  description: 'Submit a batch of social media post drafts for human review',
  input_schema: {
    type: 'object',
    properties: {
      drafts: {
        type: 'array',
        description: 'One entry per post idea. Each idea has a per-platform variant.',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Short label for this idea' },
            reasoning: {
              type: 'string',
              description: 'One sentence: why this topic and framing fit the brand right now',
            },
            variants: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  platform: {
                    type: 'string',
                    enum: ['twitter', 'linkedin', 'facebook', 'instagram'],
                  },
                  body: { type: 'string' },
                  hashtags: { type: 'array', items: { type: 'string' } },
                  notes: {
                    type: 'string',
                    description: 'Optional: rationale or hook explanation for this variant',
                  },
                },
                required: ['platform', 'body'],
              },
            },
          },
          required: ['topic', 'variants'],
        },
      },
    },
    required: ['drafts'],
  },
}

// deno-lint-ignore no-explicit-any
function buildSystemPrompt(profile: any): string {
  const lines: string[] = [
    `You are an expert social media copywriter and strategist for ${profile.business_name || 'this business'}.`,
    '',
    'BRAND PROFILE',
    '─────────────',
  ]
  if (profile.description) lines.push(`What we do: ${profile.description}`)
  if (profile.voice) lines.push(`Voice / tone: ${profile.voice}`)
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
  if (Array.isArray(profile.lessons_learned) && profile.lessons_learned.length > 0) {
    lines.push('Recent performance lessons (apply where relevant):')
    for (const l of profile.lessons_learned.slice(0, 8)) {
      lines.push(`  • ${typeof l === 'string' ? l : JSON.stringify(l)}`)
    }
  }
  lines.push('')
  lines.push('PLATFORM RULES')
  lines.push('──────────────')
  lines.push(PLATFORM_CONSTRAINTS)
  lines.push('')
  lines.push(
    'Your job is to draft scroll-stopping posts in this brand voice. Be specific — names, numbers, examples beat generic statements. Submit drafts via the create_drafts tool.',
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

  let body: { client_id?: string; topic?: string; count?: number } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body fine */
  }

  // Resolve target client. Admin may target any client; client users only
  // operate on their own and explicit body.client_id is ignored.
  const clientId =
    caller.role === 'admin' ? body.client_id ?? caller.client_id : caller.client_id
  if (!clientId) return json({ error: 'Cannot determine target client' }, 400)

  const topic = (body.topic ?? '').trim()
  // Default 1 if topic supplied (focused), 5 if not (variety batch). Cap at 10.
  const count = Math.max(1, Math.min(10, body.count ?? (topic ? 1 : 5)))

  const { data: profile, error: profileErr } = await admin
    .from('client_brand_profiles')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (profileErr) return json({ error: `Profile read: ${profileErr.message}` }, 500)
  if (!profile) {
    return json({ error: 'Brand profile not set up. Fill it in first.' }, 400)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'Anthropic API key not configured on server' }, 500)

  const systemPrompt = buildSystemPrompt(profile)
  const userPrompt = topic
    ? `Draft ${count} ${count === 1 ? 'post idea' : 'distinct angles'} on: ${topic}\n\nEach idea must have variants for all four platforms. Submit via the create_drafts tool.`
    : `Draft ${count} different post ideas drawing from the allowed topics. Mix types (educational, community, product/conversion, personality). Each idea must have variants for all four platforms. Submit via the create_drafts tool.`

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [CREATE_DRAFTS_TOOL],
      tool_choice: { type: 'tool', name: 'create_drafts' },
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
    (b: any) => b.type === 'tool_use' && b.name === 'create_drafts',
  )
  if (!toolBlock) return json({ error: 'Model returned no drafts' }, 502)

  const generated: { topic: string; reasoning?: string; variants: unknown[] }[] =
    toolBlock.input?.drafts ?? []

  const ai_meta_base = {
    model: result.model,
    tokens_in: result.usage?.input_tokens,
    tokens_out: result.usage?.output_tokens,
    stop_reason: result.stop_reason,
    topic: topic || null,
  }

  const rows = generated.map((d) => ({
    client_id: clientId,
    topic: d.topic,
    variants: d.variants ?? [],
    status: 'draft',
    ai_meta: { ...ai_meta_base, reasoning: d.reasoning ?? null },
  }))

  // deno-lint-ignore no-explicit-any
  const { data: inserted, error: insertErr } = await admin
    .from('social_post_drafts')
    .insert(rows as any)
    .select('*')
  if (insertErr) return json({ error: `Insert: ${insertErr.message}` }, 500)

  await admin.from('social_strategy_runs').insert({
    client_id: clientId,
    run_type: 'generator',
    input: { topic: topic || null, count },
    output: {
      draft_ids: (inserted ?? []).map((r) => r.id),
      reasoning_per_draft: generated.map((d) => ({ topic: d.topic, reasoning: d.reasoning })),
    },
    ai_meta: ai_meta_base,
  })

  return json({ drafts: inserted ?? [] })
})
