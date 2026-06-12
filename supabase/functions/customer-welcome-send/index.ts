// CommandSite customer-welcome-send Edge Function
// ---------------------------------------------------------------------------
// First-touch email after a customer signs. Drafts a persona-aware
// welcome (Ada for service businesses, Grace for churches) and sends
// it through the connected Gmail account. Recorded in cs_customers
// so we don't double-send and the dashboard can show "welcome sent."
//
// Auth:    Bearer admin JWT — service role bypasses
// Body:    { customer_id: string, force?: boolean }
//          force=true re-drafts and re-sends even if already sent.
// Returns: { ok: true, customer_id, sent_to, message_id, drafted_at }
//          { ok: false, error }
//
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { logClientEvent } from '../_shared/client-events.ts'

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

interface Contact {
  name?: string
  role?: string
  email?: string
  primary?: boolean
}

interface Customer {
  id: string
  org_name: string
  slug: string
  persona_type: 'ada' | 'grace'
  industry: string | null
  city: string | null
  state: string | null
  tier: string
  monthly_rate_cents: number
  setup_fee_cents: number
  founding_partner: boolean
  contacts: Contact[]
  enabled_roles: string[]
  persona_name_override: string | null
  welcome_sent_at: string | null
}

function pickPrimaryEmail(contacts: Contact[]): { email: string; name: string } | null {
  const primary = contacts.find((c) => c.primary && c.email) ?? contacts.find((c) => c.email)
  if (!primary?.email) return null
  return { email: primary.email, name: primary.name ?? '' }
}

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function buildPrompt(customer: Customer, founderName: string, founderSig: string): string {
  const personaName = customer.persona_name_override ?? (customer.persona_type === 'grace' ? 'Grace' : 'Ada')
  const recipient = pickPrimaryEmail(customer.contacts)
  const persona = customer.persona_type
  const tier = customer.tier
  const monthly = fmtMoney(customer.monthly_rate_cents)
  const setup = fmtMoney(customer.setup_fee_cents)
  const founding = customer.founding_partner ? 'founding-partner ' : ''
  const enabled = customer.enabled_roles.length > 0
    ? customer.enabled_roles.join(', ')
    : (persona === 'grace' ? 'guest follow-up + member care + volunteer coordination' : 'call-handling + quote follow-up + review collection')

  const personaContext = persona === 'grace'
    ? `Grace is your church's AI ministry assistant — she handles guest follow-up, watches Planning Center for prayer requests, helps coordinate volunteers, and never sleeps through a Sunday morning. The first week we'll get her tied into your Planning Center, your phone tree, and your team's existing rhythm. Week two she's live.`
    : `Ada is your shop's AI employee — she catches missed calls, follows up on every quote, asks satisfied customers for reviews, and reactivates dormant ones. The first week we'll get her tied into your CRM, your Google Business Profile, and your phone tree. Week two she's live and earning.`

  return `You are ${founderName}, founder of CommandSite, writing the very first email to a customer who just signed. They paid ${setup} setup + ${monthly}/month on the ${founding}${tier} tier.

Customer: ${customer.org_name}${customer.city ? ` (${customer.city}${customer.state ? `, ${customer.state}` : ''})` : ''}
Industry: ${customer.industry ?? 'unknown'}
Recipient: ${recipient?.name || 'their primary contact'} (${recipient?.email})
Persona signed up: ${personaName} (${persona})
Roles enabled: ${enabled}

${personaContext}

Write the welcome email. Voice: warm and direct, founder-to-customer. First person ("I'm so glad you're here"). NOT corporate. NO marketing-speak. Treat them like the partner they are.

Structure (loose — don't use headers):
1. Genuine welcome — name them and the persona by name
2. What happens next — short, concrete: "Over the next week I'll reach out to get [3-4 specific things — for ${persona === 'grace' ? 'church: Planning Center API key, member directory, your weekly bulletin format' : 'service: CRM access, GBP, the after-hours number routing'}]. Should take ~30 min of your time total."
3. What to expect from week 2 onward — they should feel the persona working
4. The reply opening: "Hit reply if anything's unclear, or if there's a wrinkle I should know about before we set things up."
5. Sign off: "${founderSig}"

Constraints:
- Plain text. No HTML, no markdown headers, no bullet lists. Paragraphs only.
- Under 200 words.
- No em dashes inside body prose. (Sign-off "${founderSig}" is allowed as is.)
- Use a comma-opener, not "Hey [Name]!". Say "Hey [Name]," — comma, no exclamation.
- Don't restate what they bought. They know.
- Subject line: short, personal, names the persona. Examples: "Ada's joining your team" / "Grace is in" / "Welcome — let's get Ada set up". Keep under 50 characters.

Return JSON: { "subject": string, "body": string }. JSON only, no preamble.`
}

async function draftWelcome(customer: Customer, founderName: string, founderSig: string): Promise<{ subject: string; body: string }> {
  const prompt = buildPrompt(customer, founderName, founderSig)
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
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  }
  const data = await res.json() as { content?: Array<{ type: string; text?: string }> }
  const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
  // Pull the first JSON object out — model sometimes wraps in code fences
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object in model response')
  const parsed = JSON.parse(match[0]) as { subject?: string; body?: string }
  if (!parsed.subject || !parsed.body) throw new Error('Missing subject or body in draft')
  return { subject: parsed.subject.trim(), body: parsed.body.trim() }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST' }, 405)

  let body: { customer_id?: string; force?: boolean }
  try { body = await req.json() } catch { return json({ ok: false, error: 'Invalid JSON' }, 400) }
  if (!body.customer_id) return json({ ok: false, error: 'customer_id required' }, 400)

  // Auth: admin or service role
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const isServiceRole = token === SERVICE_ROLE_KEY
  if (!isServiceRole) {
    if (!token) return json({ ok: false, error: 'Missing auth' }, 401)
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ ok: false, error: 'Invalid auth' }, 401)
    const { data: profile } = await userClient
      .from('users').select('role').eq('id', userData.user.id).maybeSingle()
    if ((profile as { role?: string } | null)?.role !== 'admin') {
      return json({ ok: false, error: 'Admin only' }, 403)
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Load customer + settings
  const [{ data: customerData, error: cErr }, { data: settingsData }] = await Promise.all([
    admin.from('cs_customers').select('*').eq('id', body.customer_id).maybeSingle(),
    admin.from('cs_settings').select('founder_name, email_signature, gmail_refresh_token').eq('id', 1).maybeSingle(),
  ])

  if (cErr) return json({ ok: false, error: `Customer read: ${cErr.message}` }, 500)
  if (!customerData) return json({ ok: false, error: 'Customer not found' }, 404)
  const customer = customerData as Customer

  if (customer.welcome_sent_at && !body.force) {
    return json({ ok: false, error: 'Already sent — pass { force: true } to resend', already_sent_at: customer.welcome_sent_at }, 409)
  }

  const settings = (settingsData ?? { founder_name: 'Josh', email_signature: '— Josh', gmail_refresh_token: null }) as { founder_name: string | null; email_signature: string | null; gmail_refresh_token: string | null }
  if (!settings.gmail_refresh_token) {
    return json({ ok: false, error: 'Gmail not connected — connect from Settings before activating customers' }, 400)
  }

  const recipient = pickPrimaryEmail(customer.contacts)
  if (!recipient?.email) {
    return json({ ok: false, error: 'No primary contact email on customer' }, 400)
  }

  // Draft via Claude
  let draft: { subject: string; body: string }
  try {
    draft = await draftWelcome(customer, settings.founder_name ?? 'Josh', settings.email_signature ?? '— Josh')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await admin.from('cs_customers').update({ welcome_send_error: `Draft: ${msg}` }).eq('id', customer.id)
    return json({ ok: false, error: `Draft failed: ${msg}` }, 502)
  }

  // Send through gmail-send
  const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/gmail-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      to: recipient.email,
      subject: draft.subject,
      body: draft.body,
      // Transactional 1:1 email — not subject to the cold-outreach send window.
      bypass_send_window: true,
    }),
  })

  if (!sendRes.ok) {
    const errText = await sendRes.text()
    await admin.from('cs_customers').update({ welcome_send_error: `Send: ${sendRes.status} ${errText}` }).eq('id', customer.id)
    return json({ ok: false, error: `gmail-send returned ${sendRes.status}: ${errText}` }, 502)
  }

  const sent = await sendRes.json() as { ok?: boolean; message_id?: string; error?: string }
  if (!sent.ok) {
    await admin.from('cs_customers').update({ welcome_send_error: `Send: ${sent.error ?? 'unknown'}` }).eq('id', customer.id)
    return json({ ok: false, error: sent.error ?? 'gmail-send returned no ok' }, 502)
  }

  const sentAt = new Date().toISOString()
  await admin.from('cs_customers').update({
    welcome_sent_at: sentAt,
    welcome_email_subject: draft.subject,
    welcome_email_body: draft.body,
    welcome_send_error: null,
  }).eq('id', customer.id)

  // Best-effort: record this in the per-customer event log. Cost is
  // null because gmail-send is free; the Anthropic spend for the draft
  // is captured separately by the welcome_drafted event (when that
  // gets wired into the drafter call earlier in this function).
  await logClientEvent(admin, {
    customer_id: customer.id,
    event_kind: 'welcome_sent',
    payload: {
      recipient_email: recipient.email,
      subject: draft.subject,
      message_id: sent.message_id,
    },
    source: 'customer-welcome-send',
  })

  return json({
    ok: true,
    customer_id: customer.id,
    sent_to: recipient.email,
    message_id: sent.message_id,
    drafted_at: sentAt,
  })
})
