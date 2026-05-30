// CommandSite · draft-reply Edge Function
// ---------------------------------------------------------------------------
// Phase 2: Ada's adaptive reply drafter. Replaces the basic
// classify-manual-reply for the conversational case — same outcome
// (classification + draft response) but with FULL conversation
// context + the CommandSite knowledge base + better prompt.
//
// What it does:
//   1. Pulls the lead's full context (profile, scoring reason, signals)
//   2. Pulls the conversation history: original cold email (from
//      cs_outreach_sends) + every prior reply + Ada's prior drafts
//   3. Injects the CommandSite knowledge base
//   4. Asks Sonnet 4.6 to classify + draft an adaptive response
//   5. Saves to cs_replies (drafted_response field)
//   6. Updates lead status if positive/interested
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    {
//            lead_id: string,
//            from_email: string,
//            from_name?: string,
//            subject?: string,
//            body: string,
//          }
// Returns: {
//            reply_id, classification, classification_confidence,
//            classification_reason, drafted_response, suggested_action
//          }
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { COMMANDSITE_KB } from '../_shared/commandsite-kb.ts'
import { calendlyLinkForIndustry } from '../_shared/calendly-links.ts'

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

const MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are Ada, the AI employee for CommandSite. You're drafting reply responses to inbound emails from prospects who replied to Josh's cold outreach. You draft AS Josh — recipients should think Josh wrote it.

Your job: read the new reply IN CONTEXT of the full conversation history + the lead's profile + the CommandSite knowledge base, then draft a specific, adaptive response.

# CRITICAL RULES

1. **Adapt to what they specifically said.** Don't fall back on a template — read their exact words. If they asked about Spanish callers, answer about Spanish callers. If they pushed back on AI in general, address THAT specific concern.

2. **Reference prior conversation.** If you (Josh) said something in a previous turn, don't repeat it verbatim. Build on it.

3. **Match their tone + length.** Short reply → short response. Long detailed reply → match the depth.

4. **Pricing: never quote a number.** Use the framing in the KB. Always pivot to the exact booking link in the BOOKING LINK section (use it verbatim, ignore any other Calendly URLs in the knowledge base examples).

5. **Sign off "— Josh"** (Ada drafts as Josh, not as a separate AI).

6. **No buzzwords, no em dashes inside body prose, no bold/italic, no emoji, no "I hope this helps" type fluff.**

7. **If you're genuinely uncertain about the right response (low confidence)**, say so in your reasoning + draft a CONSERVATIVE version that doesn't commit Josh to anything.

# OUTPUT — call save_drafted_reply with these fields

- **classification**: one of positive / interested / objection / oof / unsubscribe / negative / neutral
- **classification_confidence**: 0-1
- **classification_reason**: one line — what specifically about THIS reply put it in this category
- **drafted_response**: the actual reply you'd send. Match Josh's voice. ~30-100 words for most cases. Brief acknowledgements for "no thanks." Longer only if they asked specific questions that need answers.
- **suggested_action**: one of:
  - 'send' — Josh should send your draft
  - 'edit' — your draft is a starting point but Josh should tweak (use this for objections where the right response depends on context you don't have)
  - 'manual' — Josh should write this himself (use for truly weird/complex replies)
  - 'auto_handle' — clear oof/unsubscribe/negative — no human response needed, just acknowledge/suppress
- **reasoning**: 1-2 sentences explaining your thinking — why this classification, why this response. Helps Josh decide whether to approve.

# CRITICAL: Use the conversation history

If this is the FIRST reply (no prior turns), draft a fresh response based on the cold email Josh sent.
If this is a CONTINUING conversation (prior turns visible), reference what was discussed and move it forward — don't restart.`

const TOOLS = [
  {
    name: 'save_drafted_reply',
    description: 'Save your classification + drafted response.',
    input_schema: {
      type: 'object',
      properties: {
        classification: {
          type: 'string',
          enum: ['positive', 'interested', 'objection', 'oof', 'unsubscribe', 'negative', 'neutral'],
        },
        classification_confidence: { type: 'number', minimum: 0, maximum: 1 },
        classification_reason: { type: 'string' },
        drafted_response: { type: 'string', description: 'The reply Josh should send. Match his voice. No em dashes in body prose. Sign off "— Josh".' },
        suggested_action: {
          type: 'string',
          enum: ['send', 'edit', 'manual', 'auto_handle'],
        },
        reasoning: { type: 'string', description: '1-2 sentences explaining your thinking. Helps Josh approve quickly.' },
      },
      required: ['classification', 'classification_confidence', 'classification_reason', 'drafted_response', 'suggested_action', 'reasoning'],
    },
  },
]

interface DraftReplyRequest {
  lead_id: string
  from_email: string
  from_name?: string
  subject?: string
  body: string
  /** If provided, UPDATE this existing cs_replies row instead of
   *  inserting a new one. Used by gmail-inbox-poll which inserts the
   *  bare reply first then asks draft-reply to fill classification +
   *  drafted_response. */
  reply_id?: string
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured (supabase keys)' }, 500)
  if (!anthropicKey) return json({ error: 'Server misconfigured (anthropic key)' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Auth: admin JWT OR service role (so gmail-inbox-poll can call this
  // without a user JWT)
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const isServiceRole = jwt === serviceRoleKey
  if (!isServiceRole) {
    if (!jwt) return json({ error: 'Missing authorization' }, 401)
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
    const { data: caller } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle()
    if (!caller || (caller as { role: string }).role !== 'admin') return json({ error: 'Admin only' }, 403)
  }

  let body: DraftReplyRequest
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  if (!body.lead_id || !body.body || !body.from_email) {
    return json({ error: 'lead_id, from_email, body required' }, 400)
  }

  // ── Pull lead context ──────────────────────────────────────────────
  const { data: lead } = await admin
    .from('cs_leads')
    .select('id, company_name, contact_name, contact_email, industry, city, state, icp_score, icp_score_reason, notes, draft_cold_email_subject, draft_cold_email_body, status, send_count')
    .eq('id', body.lead_id)
    .maybeSingle()
  if (!lead) return json({ error: 'Lead not found' }, 404)
  const l = lead as Record<string, unknown>

  // ── Pull conversation history ─────────────────────────────────────
  // 1. Original cold email send(s) — from cs_outreach_sends
  const { data: sends } = await admin
    .from('cs_outreach_sends')
    .select('subject, body, sent_at')
    .eq('lead_id', body.lead_id)
    .order('sent_at', { ascending: true })
  const sendsList = (sends ?? []) as { subject: string | null; body: string | null; sent_at: string }[]

  // 2. Prior replies to this lead — from cs_replies (chronological)
  const { data: priorReplies } = await admin
    .from('cs_replies')
    .select('body, drafted_response, draft_sent_at, received_at, classification')
    .eq('lead_id', body.lead_id)
    .order('received_at', { ascending: true })
  const priorList = (priorReplies ?? []) as {
    body: string
    drafted_response: string | null
    draft_sent_at: string | null
    received_at: string
    classification: string | null
  }[]

  // ── Resolve the correct booking link (industry-aware, settings-driven) ─
  const { data: linkSettings } = await admin
    .from('cs_settings')
    .select('calendly_link, calendly_link_grace')
    .eq('id', 1)
    .maybeSingle()
  const bookingLink = calendlyLinkForIndustry(
    (l.industry as string | null) ?? null,
    linkSettings as { calendly_link?: string | null; calendly_link_grace?: string | null } | null,
  )

  // ── Build conversation history for prompt ──────────────────────────
  const history: string[] = []
  history.push(`# LEAD CONTEXT`)
  history.push(`Company: ${l.company_name}`)
  if (l.contact_name) history.push(`Contact: ${l.contact_name}`)
  if (l.industry) history.push(`Industry: ${l.industry}`)
  if (l.city || l.state) history.push(`Location: ${l.city ?? ''} ${l.state ?? ''}`.trim())
  if (l.icp_score != null) history.push(`ICP score: ${l.icp_score}`)
  if (l.icp_score_reason) history.push(`Why this lead: ${l.icp_score_reason}`)
  if (l.notes) history.push(`Notes: ${l.notes}`)
  history.push('')
  history.push(`# BOOKING LINK`)
  history.push(`If you propose a meeting, use this exact Calendly link: ${bookingLink}`)
  history.push('')
  history.push(`# CONVERSATION HISTORY`)
  history.push('')

  // Render each send + reply in chronological order
  for (const s of sendsList) {
    history.push(`--- JOSH SENT (${s.sent_at}) ---`)
    if (s.subject) history.push(`Subject: ${s.subject}`)
    history.push(s.body ?? '')
    history.push('')
  }

  for (const r of priorList) {
    history.push(`--- THEY REPLIED (${r.received_at}) — classified as ${r.classification ?? 'unclassified'} ---`)
    history.push(r.body)
    history.push('')
    if (r.drafted_response && r.draft_sent_at) {
      history.push(`--- JOSH RESPONDED (${r.draft_sent_at}) ---`)
      history.push(r.drafted_response)
      history.push('')
    } else if (r.drafted_response) {
      history.push(`(Ada drafted a response that was not yet sent: "${r.drafted_response}")`)
      history.push('')
    }
  }

  // The new inbound reply
  history.push(`--- THEY JUST REPLIED (now) — DRAFT YOUR RESPONSE ---`)
  history.push(`From: ${body.from_name ?? body.from_email} <${body.from_email}>`)
  if (body.subject) history.push(`Subject: ${body.subject}`)
  history.push(body.body)
  history.push('')
  history.push('Now classify this reply and draft your response. Call save_drafted_reply.')

  const userMessage = history.join('\n')

  // ── Call Anthropic ─────────────────────────────────────────────────
  const anthropicBody = {
    model: MODEL,
    max_tokens: 1500,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT + '\n\n' + COMMANDSITE_KB,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: TOOLS,
    tool_choice: { type: 'tool', name: 'save_drafted_reply' },
    messages: [{ role: 'user', content: userMessage }],
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(anthropicBody),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return json({ error: `Anthropic ${res.status}: ${text.slice(0, 500)}` }, 502)
  }

  // deno-lint-ignore no-explicit-any
  const data = await res.json() as { content?: Array<{ type: string; name?: string; input?: any }> }
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_drafted_reply')
  if (!toolUse?.input) return json({ error: 'Ada did not call save_drafted_reply' }, 502)

  const ada = toolUse.input as {
    classification: string
    classification_confidence: number
    classification_reason: string
    drafted_response: string
    suggested_action: string
    reasoning: string
  }

  // ── Save to cs_replies ─────────────────────────────────────────────
  const autoHandled = ada.suggested_action === 'auto_handle'
    && ['oof', 'unsubscribe', 'negative'].includes(ada.classification)
    && ada.classification_confidence >= 0.85

  const replyPayload = {
    lead_id: body.lead_id,
    from_email: body.from_email,
    from_name: body.from_name ?? null,
    subject: body.subject ?? null,
    body: body.body,
    classification: ada.classification,
    classification_confidence: ada.classification_confidence,
    classification_reason: ada.classification_reason,
    classification_model: MODEL,
    classified_at: new Date().toISOString(),
    drafted_response: ada.drafted_response,
    drafted_at: new Date().toISOString(),
    auto_handled: autoHandled,
    auto_handled_action: autoHandled
      ? (ada.classification === 'oof' ? 'OOF — set reminder for return date'
        : ada.classification === 'unsubscribe' ? 'Added to suppression list'
        : 'Marked negative + archived')
      : null,
    auto_handled_at: autoHandled ? new Date().toISOString() : null,
    needs_review: !autoHandled,
    raw_payload: { source: body.reply_id ? 'inbox_poll' : 'manual_paste', suggested_action: ada.suggested_action, reasoning: ada.reasoning },
  }

  let replyId: string
  if (body.reply_id) {
    // UPDATE path: gmail-inbox-poll already inserted the bare row; we
    // just fill in classification + drafted_response.
    const { error: updErr } = await admin
      .from('cs_replies')
      .update({
        classification: ada.classification,
        classification_confidence: ada.classification_confidence,
        classification_reason: ada.classification_reason,
        classification_model: MODEL,
        classified_at: new Date().toISOString(),
        drafted_response: ada.drafted_response,
        drafted_at: new Date().toISOString(),
        auto_handled: autoHandled,
        auto_handled_action: autoHandled
          ? (ada.classification === 'oof' ? 'OOF — set reminder for return date'
            : ada.classification === 'unsubscribe' ? 'Added to suppression list'
            : 'Marked negative + archived')
          : null,
        auto_handled_at: autoHandled ? new Date().toISOString() : null,
        needs_review: !autoHandled,
      } as never)
      .eq('id', body.reply_id)
    if (updErr) return json({ error: `DB update: ${updErr.message}` }, 500)
    replyId = body.reply_id
  } else {
    // INSERT path: manual paste flow (no prior row)
    const { data: inserted, error: insErr } = await admin
      .from('cs_replies').insert(replyPayload as never).select('id').single()
    if (insErr) return json({ error: `DB write: ${insErr.message}` }, 500)
    replyId = (inserted as { id: string }).id
  }

  // Lead status updates
  const newStatus =
    ada.classification === 'positive' || ada.classification === 'interested'
      ? 'replied'
      : ada.classification === 'unsubscribe' || (ada.classification === 'negative' && ada.classification_confidence >= 0.8)
        ? 'disqualified'
        : (l.status === 'contacted' || l.status === 'queued' || l.status === 'new')
          ? 'replied'
          : l.status as string
  if (newStatus !== l.status) {
    await admin.from('cs_leads').update({ status: newStatus } as never).eq('id', body.lead_id)
  }

  return json({
    reply_id: replyId,
    classification: ada.classification,
    classification_confidence: ada.classification_confidence,
    classification_reason: ada.classification_reason,
    drafted_response: ada.drafted_response,
    suggested_action: ada.suggested_action,
    reasoning: ada.reasoning,
    auto_handled: autoHandled,
  })
})
