// CommandSite ask-ada Edge Function
// ---------------------------------------------------------------------------
// Powers the floating "Ask Ada" / "Ask Grace" chat in demo dashboards.
// Public (anon-key) callable: no JWT required, since demo dashboards are
// public. Per-IP rate limiting belongs in front of this in v2.
//
// Body:    { slug: string, history: ChatTurn[], message: string }
// Returns: text/event-stream (SSE) — Anthropic's stream relayed verbatim.
// Secrets: ANTHROPIC_API_KEY
//
// The frontend consumes the stream and parses content_block_delta events
// to render text chunk-by-chunk.

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { buildSystemPrompt } from './prompts.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ChatTurn {
  role: 'user' | 'ai'
  text: string
}

function jsonError(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  let body: { slug?: string; history?: ChatTurn[]; message?: string }
  try {
    body = await req.json()
  } catch {
    return jsonError('Invalid JSON body')
  }

  const slug = (body.slug ?? '').trim()
  const message = (body.message ?? '').trim()
  const history = Array.isArray(body.history) ? body.history : []

  if (!slug) return jsonError('Missing slug')
  if (!message) return jsonError('Missing message')
  if (message.length > 2000) return jsonError('Message too long (max 2000 chars)')

  const systemPrompt = buildSystemPrompt(slug)
  if (!systemPrompt) {
    return jsonError(`No persona configured for slug "${slug}"`, 404)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return jsonError('Anthropic API key not configured on server', 500)
  }

  // Build the conversation. Cap history at 12 turns to keep context tight
  // and costs predictable. The persona's first message (the greeting) is
  // skipped on the wire — it's UI-only.
  const trimmedHistory = history
    .filter((t) => t && typeof t.text === 'string' && t.text.trim().length > 0)
    .slice(-12)
    .map((t) => ({
      role: t.role === 'ai' ? 'assistant' : 'user',
      content: t.text,
    }))

  // Anthropic requires alternating user/assistant turns starting with user.
  // If history starts with assistant (the greeting), drop it.
  while (trimmedHistory.length > 0 && trimmedHistory[0].role !== 'user') {
    trimmedHistory.shift()
  }

  const messages = [
    ...trimmedHistory,
    { role: 'user' as const, content: message },
  ]

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  })

  if (!anthropicRes.ok) {
    const text = await anthropicRes.text()
    return jsonError(
      `Anthropic ${anthropicRes.status}: ${text.slice(0, 500)}`,
      502,
    )
  }

  if (!anthropicRes.body) {
    return jsonError('Anthropic returned empty stream', 502)
  }

  // Relay the SSE stream verbatim. Anthropic emits events like:
  //   event: message_start
  //   data: {...}
  //
  //   event: content_block_delta
  //   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}
  //
  // The frontend parses content_block_delta events for incremental text.
  return new Response(anthropicRes.body, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})
