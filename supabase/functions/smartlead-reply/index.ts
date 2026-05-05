// CommandSite smartlead-reply Edge Function
// ---------------------------------------------------------------------------
// Public endpoint that Smartlead POSTs to whenever a prospect replies to a
// cold-email sequence. Pipeline:
//   1. Verify shared-secret header (Smartlead's webhook security model)
//   2. Parse the reply payload (defensive — Smartlead's shape varies)
//   3. Classify with Claude (sonnet, tool-use, forced structured output)
//   4. Look up the matching cs_leads row by email + link the cs_deals row
//      if the lead has been promoted
//   5. Insert cs_replies row
//   6. Auto-handle if confidence cleared the threshold AND the action is
//      auto-takeable (oof, unsubscribe, clear unambiguous negative). Else
//      mark needs_review for the Outreach inbox.
//
// Deploy with `--no-verify-jwt` — auth is the shared-secret header below.
//
// Secrets expected:
//   SMARTLEAD_WEBHOOK_SECRET  — paste matching value into Smartlead's
//                                webhook config (X-Webhook-Secret header)
//   ANTHROPIC_API_KEY         — for the classifier
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected)

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-webhook-secret, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Classifier tool — Claude is forced to fill this out ─────────────────
const CLASSIFY_TOOL = {
  name: 'classify_reply',
  description: 'Classify a cold-email reply for the CommandSite Outreach inbox',
  input_schema: {
    type: 'object',
    properties: {
      classification: {
        type: 'string',
        enum: ['positive', 'objection', 'interested', 'oof', 'unsubscribe', 'negative'],
        description:
          'positive = ready to move forward (book a call, send info). ' +
          'objection = pushback that is winnable (price/timing/priority). ' +
          'interested = curious/asking questions but not yet committed. ' +
          'oof = automated out-of-office reply. ' +
          'unsubscribe = explicit ask to be removed from the list. ' +
          'negative = clear no, wrong person, hard rejection.',
      },
      confidence: {
        type: 'number',
        description: '0.0 to 1.0 — how confident you are. Use ≥0.9 only when unambiguous.',
      },
      reason: {
        type: 'string',
        description: 'One sentence on what in the reply made you classify it this way.',
      },
    },
    required: ['classification', 'confidence', 'reason'],
  },
}

type Classification =
  | 'positive' | 'objection' | 'interested' | 'oof' | 'unsubscribe' | 'negative'

// Which classifications can be auto-handled if confidence is high enough.
// Everything else surfaces in the inbox for Josh to handle personally —
// "positive" specifically NEVER auto-handles because we want him in the
// loop on hot replies.
function isAutoHandleable(c: Classification): boolean {
  return c === 'oof' || c === 'unsubscribe' || c === 'negative'
}

// What we did when we auto-handled. Plain English so the audit trail
// in cs_replies.auto_handled_action reads like a journal entry.
function describeAutoAction(c: Classification): string {
  switch (c) {
    case 'oof':         return 'Logged as out-of-office. Did not advance sequence — Smartlead suspends auto-replies on its own.'
    case 'unsubscribe': return 'Marked lead as disqualified + suppressed from future sends.'
    case 'negative':    return 'Marked lead as disqualified. Will not contact again.'
    default:            return 'No auto-action taken.'
  }
}

// ── Defensive payload parsing ───────────────────────────────────────────
//
// Smartlead's webhook shape has shifted across their API versions and
// can vary between "v2" and "v3" payloads. Pull the fields we need from
// wherever they happen to live.
// deno-lint-ignore no-explicit-any
function extractReply(p: any): {
  from_email: string | null
  from_name: string | null
  subject: string | null
  body: string | null
  campaign_id: string | null
  sequence_id: string | null
  message_id: string | null
  thread_id: string | null
} {
  const prospect = p?.prospect ?? p?.lead ?? {}
  const email = p?.email ?? p?.message ?? p?.reply ?? {}
  const stats = p?.stats ?? {}
  return {
    from_email: prospect.email ?? p.from_email ?? email.from_email ?? null,
    from_name: [prospect.first_name, prospect.last_name].filter(Boolean).join(' ') || prospect.name || null,
    subject: email.subject ?? p.subject ?? null,
    body: email.text ?? email.body ?? email.body_text ?? email.html ?? p.body ?? null,
    campaign_id: String(p.campaign_id ?? stats.campaign_id ?? '') || null,
    sequence_id: String(p.sequence_id ?? email.sequence_id ?? '') || null,
    message_id: String(p.message_id ?? email.message_id ?? email.id ?? '') || null,
    thread_id: String(p.thread_id ?? email.thread_id ?? '') || null,
  }
}

// ── Constant-time string compare (avoid timing leaks on secret check) ──
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ── 1. Auth ──
  const expectedSecret = Deno.env.get('SMARTLEAD_WEBHOOK_SECRET')
  if (!expectedSecret) return json({ error: 'Webhook secret not configured' }, 500)
  const presented = req.headers.get('x-webhook-secret') ?? ''
  if (!presented || !safeEqual(presented, expectedSecret)) {
    return json({ error: 'Invalid webhook secret' }, 401)
  }

  const rawText = await req.text()
  // deno-lint-ignore no-explicit-any
  let payload: any
  try { payload = JSON.parse(rawText) } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  // ── 2. Extract reply ──
  const reply = extractReply(payload)
  if (!reply.from_email || !reply.body) {
    return json({ error: 'Missing required fields (from_email, body)', extracted: reply }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 3. Idempotency — don't double-insert if Smartlead retries ──
  if (reply.message_id) {
    const { data: existing } = await supabase
      .from('cs_replies').select('id')
      .eq('smartlead_message_id', reply.message_id).maybeSingle()
    if (existing) return json({ ok: true, deduped: true, reply_id: existing.id })
  }

  // ── 4. Match the lead + (if promoted) the deal ──
  const { data: lead } = await supabase
    .from('cs_leads').select('id, status, promoted_deal_id')
    .eq('contact_email', reply.from_email.toLowerCase())
    .maybeSingle()

  // ── 5. Pull settings to know the auto-threshold + brand voice context ──
  const { data: settings } = await supabase
    .from('cs_settings').select('*').eq('id', 1).maybeSingle()
  const autoThreshold: number = settings?.reply_classifier_auto_threshold ?? 0.9
  const voiceContext: string = settings?.ai_voice_prompt_guide ?? ''

  // ── 6. Classify with Claude ──
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

  const systemPrompt = [
    'You are the reply classifier for Josh, a solo founder running cold outbound for CommandSite (a B2B SaaS for home-services businesses).',
    voiceContext ? `\n\nContext on Josh's brand voice (so you can spot tone mismatches):\n${voiceContext}` : '',
    '\n\nClassify the reply via the classify_reply tool. Be honest about confidence — Josh would rather see a 0.6-confidence "objection" surfaced for review than a wrong 0.95 auto-action.',
  ].join('')

  const userPrompt = [
    `From: ${reply.from_name ?? ''} <${reply.from_email}>`,
    `Subject: ${reply.subject ?? '(no subject)'}`,
    '',
    reply.body.slice(0, 4000),  // cap at 4k chars — replies are short
  ].join('\n')

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
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
      messages: [{ role: 'user', content: userPrompt }],
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: 'classify_reply' },
    }),
  })

  let classification: Classification = 'unclassified' as Classification
  let confidence = 0
  let reason = 'Classifier failed'
  let model = 'claude-sonnet-4-6'

  if (claudeRes.ok) {
    // deno-lint-ignore no-explicit-any
    const result: any = await claudeRes.json()
    // deno-lint-ignore no-explicit-any
    const toolBlock = (result.content ?? []).find(
      (b: any) => b.type === 'tool_use' && b.name === 'classify_reply',
    )
    if (toolBlock?.input) {
      classification = toolBlock.input.classification as Classification
      confidence = Number(toolBlock.input.confidence) || 0
      reason = String(toolBlock.input.reason ?? '')
      model = result.model ?? model
    }
  }

  // ── 7. Decide whether to auto-handle ──
  const cls = classification as Classification
  const autoHandle = (cls !== 'unclassified' as Classification) && confidence >= autoThreshold && isAutoHandleable(cls)
  const autoAction = autoHandle ? describeAutoAction(cls) : null

  // ── 8. Insert reply row ──
  const { data: inserted, error: insertErr } = await supabase
    .from('cs_replies').insert({
      lead_id: lead?.id ?? null,
      deal_id: lead?.promoted_deal_id ?? null,
      smartlead_campaign_id: reply.campaign_id,
      smartlead_sequence_id: reply.sequence_id,
      smartlead_message_id: reply.message_id,
      smartlead_thread_id: reply.thread_id,
      from_email: reply.from_email.toLowerCase(),
      from_name: reply.from_name,
      subject: reply.subject,
      body: reply.body,
      received_at: new Date().toISOString(),
      classification: classification,
      classification_confidence: confidence,
      classification_reason: reason,
      classification_model: model,
      classified_at: new Date().toISOString(),
      auto_handled: autoHandle,
      auto_handled_action: autoAction,
      auto_handled_at: autoHandle ? new Date().toISOString() : null,
      needs_review: !autoHandle,
      raw_payload: payload,
    }).select('id').single()

  if (insertErr) return json({ error: `Insert failed: ${insertErr.message}` }, 500)

  // ── 9. Side-effects of auto-handling on the lead ──
  if (autoHandle && lead?.id) {
    if (cls === 'unsubscribe' || cls === 'negative') {
      await supabase.from('cs_leads').update({ status: 'disqualified' }).eq('id', lead.id)
    }
    // 'oof' is intentionally a no-op on lead — Smartlead pauses sends itself.
  }
  // For everything that needs eyes (positive, objection, interested, low-confidence)
  // bump lead.status → 'replied' so the Leads + Today modules can flag it.
  if (!autoHandle && lead?.id && lead.status !== 'replied') {
    await supabase.from('cs_leads').update({ status: 'replied' }).eq('id', lead.id)
  }

  return json({
    ok: true,
    reply_id: inserted?.id,
    classification,
    confidence,
    auto_handled: autoHandle,
    auto_handled_action: autoAction,
  })
})
