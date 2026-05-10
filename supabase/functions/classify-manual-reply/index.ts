// CommandSite · classify-manual-reply Edge Function
// ---------------------------------------------------------------------------
// Phase 1 outreach helper. Josh pastes a reply he received in Gmail
// (since we're not on Smartlead yet so no webhook). Function calls
// Claude Haiku 4.5 to classify it (positive / objection / interested /
// oof / unsubscribe / negative / neutral) + suggests a one-line reply.
// Saves to cs_replies. Returns the classification for the UI.
//
// Why Haiku not Sonnet: classification is bounded — we just need the
// label + confidence + a short reasoning. Haiku does this in 1-2 sec
// for ~$0.001/call. Sonnet would be overkill.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    {
//            lead_id?: string,        // optional — if omitted, reply is logged
//                                     //   without a lead link (rare)
//            from_email: string,
//            from_name?: string,
//            subject?: string,
//            body: string,            // the reply text
//          }
// Returns: {
//            classification: string,
//            classification_confidence: number,
//            classification_reason: string,
//            suggested_reply?: string,
//            reply_id: string,        // newly inserted cs_replies row
//          }
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `You are a cold-email reply classifier for CommandSite, a SaaS that sells AI employees ("Ada") to small service businesses (HVAC, plumbing, electrical, etc.).

Classify each inbound reply into ONE category:

- **positive**: clearly interested, asking for more info, wants a meeting, says "send me a calendar link"
- **interested**: softer than positive — "tell me more" / "what does it do" / "interesting, how much"
- **objection**: not no, but pushing back. Pricing concern, timing, "we already have X." Winnable with the right framing.
- **oof**: out of office auto-reply. "I'm on vacation until..."
- **unsubscribe**: clear ask to stop. "Remove me." "Take me off your list."
- **negative**: clear no. "Not interested." "Stop emailing me." (no rage = negative; rage = negative)
- **neutral**: hard to tell — vague reply, off-topic, or just acknowledgment.

For each, also output a confidence (0-1) and a one-line reasoning. If positive or interested, draft a short suggested_reply (~30-60 words) that:
- Directly addresses what they said
- Includes the right Calendly link: services prospects → "https://calendly.com/josh-commandsite/30-min-discovery-services-walkthrough", churches/ministry → "https://calendly.com/josh-commandsite/30-min-discovery-church-walkthrough"
- Is conversational, no buzzwords, no em dashes inside sentences
- Sounds like Josh (founder of CommandSite) wrote it

For objections, draft a suggested_reply that addresses their specific concern with one specific data point or one short reframe + a soft CTA.

For oof/unsubscribe/negative/neutral: NO suggested_reply.

Call save_reply_classification with the result.`

const TOOLS = [
  {
    name: 'save_reply_classification',
    description: "Save the reply classification + optional suggested reply.",
    input_schema: {
      type: 'object',
      properties: {
        classification: {
          type: 'string',
          enum: ['positive', 'interested', 'objection', 'oof', 'unsubscribe', 'negative', 'neutral'],
        },
        classification_confidence: { type: 'number', minimum: 0, maximum: 1 },
        classification_reason: { type: 'string', description: 'One line — what specifically about the reply put it in this category.' },
        suggested_reply: { type: 'string', description: 'For positive/interested/objection only. ~30-60 words. Conversational, includes Calendly placeholder if booking-relevant.' },
      },
      required: ['classification', 'classification_confidence', 'classification_reason'],
    },
  },
]

interface ClassifyRequest {
  lead_id?: string
  from_email: string
  from_name?: string
  subject?: string
  body: string
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return json({ error: 'Missing authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured (supabase keys)' }, 500)
  if (!anthropicKey) return json({ error: 'Server misconfigured (anthropic key)' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
  const { data: caller } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle()
  if (!caller || (caller as { role: string }).role !== 'admin') return json({ error: 'Admin only' }, 403)

  let body: ClassifyRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!body.body || typeof body.body !== 'string') return json({ error: 'body (reply text) required' }, 400)
  if (!body.from_email || typeof body.from_email !== 'string') return json({ error: 'from_email required' }, 400)

  // Build prompt with the lead's prior outreach context if available
  const contextLines: string[] = []
  if (body.lead_id) {
    const { data: lead } = await admin
      .from('cs_leads')
      .select('company_name, industry, city, state, draft_cold_email_subject, draft_cold_email_body')
      .eq('id', body.lead_id)
      .maybeSingle()
    if (lead) {
      const l = lead as {
        company_name: string; industry: string | null; city: string | null; state: string | null
        draft_cold_email_subject: string | null; draft_cold_email_body: string | null
      }
      contextLines.push(`Lead: ${l.company_name}${l.industry ? ` (${l.industry})` : ''}${l.city && l.state ? `, ${l.city} ${l.state}` : ''}`)
      if (l.draft_cold_email_subject) contextLines.push(`Original cold email subject: ${l.draft_cold_email_subject}`)
      if (l.draft_cold_email_body) contextLines.push(`Original cold email body (excerpt): ${l.draft_cold_email_body.slice(0, 400)}...`)
    }
  }

  const userMessage = [
    contextLines.length > 0 ? `# CONTEXT\n${contextLines.join('\n')}` : '',
    '',
    `# REPLY RECEIVED`,
    `From: ${body.from_name ?? body.from_email} <${body.from_email}>`,
    body.subject ? `Subject: ${body.subject}` : '',
    '',
    body.body,
    '',
    'Classify this reply. Call save_reply_classification.',
  ].filter(Boolean).join('\n')

  const anthropicBody = {
    model: MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: TOOLS,
    tool_choice: { type: 'tool', name: 'save_reply_classification' },
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
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_reply_classification')
  if (!toolUse?.input) return json({ error: 'Claude did not call save_reply_classification' }, 502)

  const cls = toolUse.input as {
    classification: string
    classification_confidence: number
    classification_reason: string
    suggested_reply?: string
  }

  // Insert into cs_replies. needs_review = true when human judgment
  // helps (positive / interested / objection / neutral). Auto-handled
  // categories (oof / unsubscribe / negative) get auto_handled=true
  // when confidence is high.
  const autoHandled = (['oof', 'unsubscribe', 'negative'].includes(cls.classification)
    && cls.classification_confidence >= 0.8)
  const needsReview = !autoHandled

  const replyPayload = {
    lead_id: body.lead_id ?? null,
    from_email: body.from_email,
    from_name: body.from_name ?? null,
    subject: body.subject ?? null,
    body: body.body,
    classification: cls.classification,
    classification_confidence: cls.classification_confidence,
    classification_reason: cls.classification_reason,
    classification_model: MODEL,
    classified_at: new Date().toISOString(),
    auto_handled: autoHandled,
    auto_handled_action: autoHandled
      ? (cls.classification === 'oof' ? 'OOF — set reminder for return date'
        : cls.classification === 'unsubscribe' ? 'added to suppression list'
        : 'marked negative, archived')
      : null,
    auto_handled_at: autoHandled ? new Date().toISOString() : null,
    needs_review: needsReview,
    raw_payload: { source: 'manual_paste', suggested_reply: cls.suggested_reply ?? null },
  }

  const { data: inserted, error: insErr } = await admin
    .from('cs_replies').insert(replyPayload as never).select('id').single()
  if (insErr) return json({ error: `DB write: ${insErr.message}` }, 500)

  // If we have a lead_id and the reply is positive/interested, flip
  // the lead's status to 'replied' so it shows up in the right bucket.
  if (body.lead_id && (cls.classification === 'positive' || cls.classification === 'interested')) {
    await admin
      .from('cs_leads')
      .update({ status: 'replied' } as never)
      .eq('id', body.lead_id)
  }

  return json({
    classification: cls.classification,
    classification_confidence: cls.classification_confidence,
    classification_reason: cls.classification_reason,
    suggested_reply: cls.suggested_reply ?? null,
    auto_handled: autoHandled,
    needs_review: needsReview,
    reply_id: (inserted as { id: string }).id,
  })
})
