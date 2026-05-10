// CommandSite · draft-post-call-followup Edge Function
// ---------------------------------------------------------------------------
// After a discovery call, Josh fills in 3 quick fields:
//   - interest_level: hot / warm / lukewarm / cold
//   - specific_concern: their main objection or hesitation (optional)
//   - next_step: what was agreed (proposal, technical follow-up, etc.)
//
// Ada drafts the recap + next-step email tailored to those notes,
// the lead's profile, the conversation history, and the CommandSite KB.
// Saves to cs_deals.post_call_followup_draft.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    {
//            deal_id: string,
//            interest_level: 'hot' | 'warm' | 'lukewarm' | 'cold',
//            specific_concern?: string,
//            next_step: string,
//            extra_notes?: string
//          }
// Returns: { draft, generated_at, model }
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { COMMANDSITE_KB } from '../_shared/commandsite-kb.ts'

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

const SYSTEM_PROMPT = `You are Ada. You're drafting a post-discovery-call follow-up email AS Josh — recipients should think Josh wrote it.

Josh just got off a call with a prospect. He filled in 3 quick fields about how the call went. Use those + the conversation history + the CommandSite KB to draft a recap + next-step email.

# OUTPUT FORMAT

Call save_followup with:
- **subject** (string, ~6-10 words) — specific to what was discussed, NOT generic "Following up"
- **body** (string, ~80-150 words) — Josh's voice, specific to THIS call

# THE EMAIL'S JOB

The email should:
1. **Briefly recap** what they covered on the call (1-2 lines, references something specific they discussed)
2. **Address the concern** if there was one (NOT defensively — just acknowledge + give the relevant data point)
3. **Confirm the next step** explicitly (with a date/timeframe if applicable)
4. **Stay in Josh's voice** — direct, conversational, no buzzwords, signs off "— Josh"

# TAILORING TO INTEREST LEVEL

- **hot**: short, momentum-keeping. "Great call — sending the proposal Tuesday as discussed. Let me know if questions before then. — Josh"
- **warm**: friendly, low-pressure follow-up that re-states the value + clear next step
- **lukewarm**: helpful nudge with a specific concrete thing for them to do (try the demo, etc.) + soft re-engage timeframe
- **cold**: gracious, brief, leaves the door open ("happy to circle back if anything changes")

# RULES

- Never quote pricing in the email.
- No buzzwords. No em dashes inside body prose. No "I hope this helps" type fluff. No bold/italic.
- Sign off "— Josh"
- Subject is ~6-10 words, specific to THIS call (not "Following up" — bad. "Premium Electric — 3 things from our call" — good).`

const TOOLS = [
  {
    name: 'save_followup',
    description: 'Save the post-call follow-up email draft.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: '~6-10 words. Specific to THIS call. Not "Following up".' },
        body: { type: 'string', description: '~80-150 words. Josh\'s voice. Recap + concern + next step. Sign off "— Josh".' },
      },
      required: ['subject', 'body'],
    },
  },
]

interface FollowupRequest {
  deal_id: string
  interest_level: 'hot' | 'warm' | 'lukewarm' | 'cold'
  specific_concern?: string
  next_step: string
  extra_notes?: string
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
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return json({ error: 'Missing authorization' }, 401)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
  const { data: caller } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle()
  if (!caller || (caller as { role: string }).role !== 'admin') return json({ error: 'Admin only' }, 403)

  let body: FollowupRequest
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.deal_id || !body.interest_level || !body.next_step) {
    return json({ error: 'deal_id, interest_level, next_step required' }, 400)
  }

  const { data: deal } = await admin
    .from('cs_deals').select('*').eq('id', body.deal_id).maybeSingle()
  if (!deal) return json({ error: 'Deal not found' }, 404)
  const d = deal as Record<string, unknown>

  // Pull lead context + conversation history if linked
  const leadId = d.lead_id as string | null
  let leadContext = ''
  let conversationContext = ''

  if (leadId) {
    const { data: lead } = await admin
      .from('cs_leads')
      .select('company_name, contact_name, contact_email, industry, city, state, icp_score_reason, notes')
      .eq('id', leadId).maybeSingle()
    if (lead) {
      const l = lead as Record<string, unknown>
      const lines = [`Company: ${l.company_name}`]
      if (l.contact_name) lines.push(`Contact: ${l.contact_name}`)
      if (l.industry) lines.push(`Industry: ${l.industry}`)
      if (l.city || l.state) lines.push(`Location: ${l.city ?? ''} ${l.state ?? ''}`.trim())
      if (l.icp_score_reason) lines.push(`Why this lead: ${l.icp_score_reason}`)
      leadContext = lines.join('\n')
    }
    const { data: replies } = await admin
      .from('cs_replies').select('body, drafted_response, draft_sent_at, received_at')
      .eq('lead_id', leadId).order('received_at', { ascending: true })
    const lines: string[] = []
    for (const r of (replies ?? []) as { body: string; drafted_response: string | null; draft_sent_at: string | null; received_at: string }[]) {
      lines.push(`THEM (${r.received_at}): ${r.body}`)
      if (r.drafted_response && r.draft_sent_at) lines.push(`JOSH (${r.draft_sent_at}): ${r.drafted_response}`)
    }
    conversationContext = lines.length > 0 ? lines.join('\n\n') : 'No email exchanges before the call.'
  } else {
    leadContext = `Direct inbound — no prior cs_lead. Contact: ${d.contact_name} <${d.contact_email}>, ${d.company_name}${d.industry ? ` (${d.industry})` : ''}.`
    conversationContext = 'No prior conversation.'
  }

  const userMessage = [
    `# THE PROSPECT`,
    leadContext,
    '',
    `# PRIOR CONVERSATION (cold-email exchanges before the call)`,
    conversationContext,
    '',
    `# JOSH'S NOTES FROM THE CALL`,
    `Interest level: ${body.interest_level}`,
    body.specific_concern ? `Specific concern they raised: ${body.specific_concern}` : 'No specific concern raised',
    `Next step agreed: ${body.next_step}`,
    body.extra_notes ? `Extra context Josh added: ${body.extra_notes}` : '',
    '',
    `Now draft the post-call follow-up email. Call save_followup.`,
  ].filter(Boolean).join('\n')

  const anthropicBody = {
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT + '\n\n' + COMMANDSITE_KB,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: TOOLS,
    tool_choice: { type: 'tool', name: 'save_followup' },
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
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_followup')
  if (!toolUse?.input) return json({ error: 'Ada did not call save_followup' }, 502)

  const draft = toolUse.input as { subject: string; body: string }

  // Save draft + the notes Josh provided
  const updPayload = {
    post_call_notes: {
      interest_level: body.interest_level,
      specific_concern: body.specific_concern ?? null,
      next_step: body.next_step,
      extra_notes: body.extra_notes ?? null,
      logged_at: new Date().toISOString(),
    },
    post_call_followup_draft: `Subject: ${draft.subject}\n\n${draft.body}`,
    post_call_followup_drafted_at: new Date().toISOString(),
    // Move stage if the call indicated movement
    stage: body.interest_level === 'hot' || body.interest_level === 'warm' ? 'demo_done' : 'demo_done',
  }
  const { error: updErr } = await admin
    .from('cs_deals').update(updPayload as never).eq('id', body.deal_id)
  if (updErr) return json({ error: `DB write: ${updErr.message}` }, 500)

  return json({
    subject: draft.subject,
    body: draft.body,
    generated_at: new Date().toISOString(),
    model: MODEL,
  })
})
