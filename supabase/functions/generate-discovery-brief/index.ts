// CommandSite · generate-discovery-brief Edge Function
// ---------------------------------------------------------------------------
// Pre-call brief Ada writes for Josh ~2 hrs before each discovery
// call. Reads everything we know about the prospect — lead profile,
// reviews / signals from Ada's scoring, full reply thread, the
// CommandSite knowledge base — and outputs a short brief Josh can
// read in 2 minutes:
//
//   - Headline: who they are + the one-line story
//   - Their pain: what their reviews/replies suggest
//   - 3 questions to ask: targeted to validate the pain + uncover scope
//   - 1 thing to lead with: the single hook most likely to land for THIS prospect
//   - Risks: anything Sage / Ada noticed that could derail the call
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    { deal_id: string }
// Returns: { brief: string, generated_at, model }
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

const SYSTEM_PROMPT = `You are Ada, prepping Josh for a 15-minute discovery call. He's about to talk to a prospect from his cold-email outreach. Write a brief he can read in 90 seconds that gets him into the call sharp.

# OUTPUT FORMAT — call save_brief with these fields

- **headline** (1 line): "Who they are + the one-thing story." e.g. "Mike at Premium Electric — owner-operator, 6 reviews mention missed calls, latent prospect"
- **the_pain** (~50-90 words): What their reviews/replies/profile suggest is hurting. Be specific — quote review text or reply phrases when possible.
- **questions_to_ask** (array of exactly 3): Targeted questions to validate the pain + uncover scope. Conversational, not interrogation-style.
- **lead_with** (~30-60 words): The ONE hook most likely to land for THIS prospect. Specific. Not generic value prop.
- **risks** (~30-60 words): Anything that could derail the call — competitor mentions, pricing sensitivity, weak ICP fit signals, common objection types they're likely to raise. Or "nothing notable" if clean.

# VOICE

- Tactical, not flowery. Josh is reading this 90 seconds before the call starts.
- Reference specific data — review excerpts, reply phrases, ICP score reasoning.
- First person ("I'd lead with X" / "I noticed in their reply they said Y")
- No buzzwords. No em dashes inside sentences.

Use the knowledge base to know what CommandSite actually does + which objection patterns to anticipate.`

const TOOLS = [
  {
    name: 'save_brief',
    description: 'Save the discovery-call brief.',
    input_schema: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        the_pain: { type: 'string' },
        questions_to_ask: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'string' },
        },
        lead_with: { type: 'string' },
        risks: { type: 'string' },
      },
      required: ['headline', 'the_pain', 'questions_to_ask', 'lead_with', 'risks'],
    },
  },
]

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

  let body: { deal_id?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.deal_id) return json({ error: 'deal_id required' }, 400)

  // ── Pull deal + linked lead context ───────────────────────────────
  const { data: deal } = await admin
    .from('cs_deals')
    .select('*')
    .eq('id', body.deal_id)
    .maybeSingle()
  if (!deal) return json({ error: 'Deal not found' }, 404)

  const d = deal as Record<string, unknown>
  const leadId = d.lead_id as string | null

  let leadContext = ''
  let conversationContext = ''

  if (leadId) {
    const { data: lead } = await admin
      .from('cs_leads')
      .select('company_name, contact_name, contact_email, industry, city, state, icp_score, icp_score_reason, notes, draft_cold_email_subject, draft_cold_email_body, review_excerpts')
      .eq('id', leadId)
      .maybeSingle()
    if (lead) {
      const l = lead as Record<string, unknown>
      const lines = [`Company: ${l.company_name}`]
      if (l.contact_name) lines.push(`Contact: ${l.contact_name}`)
      if (l.industry) lines.push(`Industry: ${l.industry}`)
      if (l.city || l.state) lines.push(`Location: ${l.city ?? ''} ${l.state ?? ''}`.trim())
      if (l.icp_score) lines.push(`ICP score: ${l.icp_score}`)
      if (l.icp_score_reason) lines.push(`Why this lead: ${l.icp_score_reason}`)
      if (l.notes) lines.push(`Notes: ${l.notes}`)

      // Recent reviews from Ada's scoring
      if (Array.isArray(l.review_excerpts) && (l.review_excerpts as unknown[]).length > 0) {
        lines.push('Recent review excerpts:')
        for (const r of (l.review_excerpts as { text: string; rating: number | null; relative_time: string | null }[]).slice(0, 5)) {
          lines.push(`  - "${r.text.slice(0, 250)}" (${r.rating ?? '?'}★, ${r.relative_time ?? 'unknown date'})`)
        }
      }

      leadContext = lines.join('\n')
    }

    // Pull the cold email + reply thread
    const { data: sends } = await admin
      .from('cs_outreach_sends')
      .select('subject, body, sent_at')
      .eq('lead_id', leadId)
      .order('sent_at', { ascending: true })
    const { data: replies } = await admin
      .from('cs_replies')
      .select('body, drafted_response, draft_sent_at, received_at, classification')
      .eq('lead_id', leadId)
      .order('received_at', { ascending: true })

    const convoLines: string[] = []
    for (const s of (sends ?? []) as { subject: string | null; body: string | null; sent_at: string }[]) {
      convoLines.push(`\n--- JOSH SENT (${s.sent_at}) ---`)
      if (s.subject) convoLines.push(`Subject: ${s.subject}`)
      convoLines.push(s.body ?? '')
    }
    for (const r of (replies ?? []) as { body: string; drafted_response: string | null; draft_sent_at: string | null; received_at: string; classification: string | null }[]) {
      convoLines.push(`\n--- THEY REPLIED (${r.received_at}) — ${r.classification ?? 'unclassified'} ---`)
      convoLines.push(r.body)
      if (r.drafted_response && r.draft_sent_at) {
        convoLines.push(`\n--- JOSH RESPONDED (${r.draft_sent_at}) ---`)
        convoLines.push(r.drafted_response)
      }
    }
    conversationContext = convoLines.length > 0 ? convoLines.join('\n') : 'No prior conversation (cold inbound booking)'
  } else {
    leadContext = `Cold inbound booking — no prior cs_lead record. Contact: ${d.contact_name} <${d.contact_email}>, ${d.company_name}${d.industry ? ` (${d.industry})` : ''}${d.city && d.state ? ` in ${d.city}, ${d.state}` : ''}.`
    conversationContext = 'No prior conversation — this is the first interaction.'
  }

  const userMessage = `# DEAL\n` +
    `Scheduled: ${d.scheduled_at}\n` +
    `Duration: ${d.scheduled_call_duration_min ?? 15} min\n\n` +
    `# LEAD CONTEXT\n${leadContext}\n\n` +
    `# CONVERSATION HISTORY\n${conversationContext}\n\n` +
    `Now write the brief. Call save_brief.`

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
    tool_choice: { type: 'tool', name: 'save_brief' },
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
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_brief')
  if (!toolUse?.input) return json({ error: 'Ada did not call save_brief' }, 502)

  const brief = toolUse.input as {
    headline: string
    the_pain: string
    questions_to_ask: string[]
    lead_with: string
    risks: string
  }

  // Format brief as readable text — store in cs_deals.discovery_brief
  const briefText = [
    `**${brief.headline}**`,
    '',
    `## The pain`,
    brief.the_pain,
    '',
    `## Questions to ask`,
    ...brief.questions_to_ask.map((q, i) => `${i + 1}. ${q}`),
    '',
    `## Lead with`,
    brief.lead_with,
    '',
    `## Risks`,
    brief.risks,
  ].join('\n')

  const { error: updErr } = await admin
    .from('cs_deals')
    .update({
      discovery_brief: briefText,
      discovery_brief_generated_at: new Date().toISOString(),
    } as never)
    .eq('id', body.deal_id)

  if (updErr) return json({ error: `DB write: ${updErr.message}` }, 500)

  return json({
    brief: briefText,
    structured: brief,
    generated_at: new Date().toISOString(),
    model: MODEL,
  })
})
