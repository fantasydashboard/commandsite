// CommandSite · draft-ufd-reply Edge Function
// ---------------------------------------------------------------------------
// Bones reads an inbound UFD reply and drafts the response. Mirrors
// what draft-reply does for CommandSite cold outreach, but tuned for
// UFD's B2C trial lifecycle context. Drafts AS Josh (founder), never
// names Bones in the body.
//
// Auth:    Admin JWT or service role
// Body:    { gmail_message_id: string } | { reply_id: string }
// Returns: { ok, drafted_response, classification, classification_confidence }

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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are drafting a reply email FROM JOSH DANIEL (solo founder of Ultimate Fantasy Dashboard, a fantasy football product whose flagship feature is shareable analytics cards) to a UFD trial user who replied to one of the lifecycle emails.

You are NOT Bones (the AI assistant). You are drafting AS Josh. The recipient should think Josh personally read their message and replied. No mentions of AI, no mentions of automation.

# JOSH'S VOICE
- Conversational opener: "Hey [first name]," with a comma (if name known) or "Hey," (if unknown)
- First-person, founder-to-user warmth
- Match the reply's length and tone — if they wrote 1 sentence, you write 1-2 sentences. If they wrote a long question, you write a thoughtful long-ish answer
- Address EXACTLY what they said — don't deflect, don't generic-reply
- Sign off "— Josh"
- No em dashes inside body prose (signoff "— Josh" is the only allowed dash)
- No marketing speak, no "thanks for reaching out!", no exclamation marks beyond one max, no emoji
- No "I hope this finds you well", no "circling back"

# CLASSIFICATION + RESPONSE PATTERNS

**feedback** — they shared an opinion about UFD ("loved this", "the cards don't work for keepers", "could use better trade analyzer")
  → Thank them genuinely for the specific point. If actionable, say what you'll do with it. Don't overpromise.

**question** — they asked something ("how do I connect Sleeper?", "does this work for dynasty?")
  → Answer it directly. If you don't have a great answer, be honest ("not yet, but I'm working on it" / "Sleeper API is on the roadmap").

**support** — they're stuck ("can't log in", "league won't connect")
  → Acknowledge the problem. Ask one specific clarifying question. Offer to look at their account if they share details.

**cancel** — they want to cancel or downgrade
  → No friction. Acknowledge, confirm you'll handle it (or point to the right place). Light "if anything changes" close.

**praise** — pure compliment
  → Brief genuine thanks + one question back ("what's the one thing you'd hate to lose?" or "what's the next thing you'd want?") to extract more signal.

**oof / unsubscribe** — auto-replies or removal requests
  → No reply drafted. Set classification + return — caller will handle.

# UFD CONTEXT (use only if relevant to their reply)
- UFD generates shareable cards: player breakdowns, trade analysis, waiver picks, power rankings
- 7-day trial → monthly or annual subscription
- Connects to ESPN, Yahoo, Sleeper
- Multi-sport: NFL, NBA, MLB, NHL
- Solo-founder product — you read every email yourself

# OUTPUT FORMAT
Return JSON only, no preamble:
{
  "classification": "feedback" | "question" | "support" | "cancel" | "praise" | "oof" | "unsubscribe" | "unclassified",
  "classification_confidence": 0-1,
  "classification_reason": "one-line explanation",
  "drafted_response": "the email body (or empty string if oof/unsubscribe)"
}`

interface ReqBody {
  gmail_message_id?: string
  reply_id?: string
}

interface UfdReplyRow {
  id: string
  user_email: string
  user_name: string | null
  reply_to_step: string | null
  from_email: string
  from_name: string | null
  subject: string | null
  body: string
}

async function callClaude(userContext: string): Promise<{
  classification: string
  classification_confidence: number
  classification_reason: string
  drafted_response: string
}> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContext }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const data = await res.json() as { content?: Array<{ type: string; text?: string }> }
  const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in model response')
  return JSON.parse(match[0])
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  // Auth: admin JWT or service role
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const isServiceRole = token === SERVICE_ROLE_KEY
  if (!isServiceRole) {
    if (!token) return json({ error: 'Missing auth' }, 401)
    const { data: userData } = await admin.auth.getUser(token)
    if (!userData?.user) return json({ error: 'Invalid auth' }, 401)
    const { data: profile } = await admin
      .from('users').select('role').eq('id', userData.user.id).maybeSingle()
    if ((profile as { role?: string } | null)?.role !== 'admin') {
      return json({ error: 'Admin only' }, 403)
    }
  }

  let body: ReqBody
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.gmail_message_id && !body.reply_id) {
    return json({ error: 'gmail_message_id or reply_id required' }, 400)
  }

  // Load the reply row
  let query = admin.from('ufd_replies').select('*')
  if (body.gmail_message_id) query = query.eq('gmail_message_id', body.gmail_message_id)
  else query = query.eq('id', body.reply_id!)
  const { data: replyRow, error: loadErr } = await query.maybeSingle()
  if (loadErr) return json({ error: `Load: ${loadErr.message}` }, 500)
  if (!replyRow) return json({ error: 'Reply not found' }, 404)
  const reply = replyRow as UfdReplyRow

  // Build user context for Claude
  const firstName = (reply.user_name ?? '').split(' ')[0] || ''
  const userContext = `# THE INBOUND REPLY

From: ${reply.from_name ?? ''} <${reply.from_email}>
User name in our system: ${reply.user_name ?? 'unknown'}
First name to use in opener: ${firstName || '(unknown — use "Hey,")'}
Subject: ${reply.subject ?? '(no subject)'}
Replying to lifecycle step: ${reply.reply_to_step ?? 'unknown'}

# THEIR MESSAGE

${reply.body}

# YOUR JOB

Classify their reply and draft Josh's response per the system prompt.`

  let result
  try {
    result = await callClaude(userContext)
  } catch (err) {
    return json({ error: `Draft failed: ${err instanceof Error ? err.message : String(err)}` }, 502)
  }

  // Auto-handle OOF / unsubscribe
  const autoHandled = result.classification === 'oof' || result.classification === 'unsubscribe'
  const now = new Date().toISOString()

  await admin
    .from('ufd_replies')
    .update({
      classification: result.classification,
      classification_confidence: result.classification_confidence,
      classification_reason: result.classification_reason,
      classification_model: MODEL,
      classified_at: now,
      drafted_response: autoHandled ? null : result.drafted_response,
      drafted_at: autoHandled ? null : now,
      auto_handled: autoHandled,
      auto_handled_action: autoHandled
        ? (result.classification === 'oof' ? 'OOF auto-acknowledged' : 'Unsubscribe request flagged')
        : null,
      auto_handled_at: autoHandled ? now : null,
      needs_review: !autoHandled,
    })
    .eq('id', reply.id)

  return json({
    ok: true,
    reply_id: reply.id,
    classification: result.classification,
    classification_confidence: result.classification_confidence,
    drafted_response: autoHandled ? null : result.drafted_response,
  })
})
