// CommandSite deal-won-handoff Edge Function
// ---------------------------------------------------------------------------
// Fires the moment a cs_deals row flips to stage='closed_won'. Auto-creates
// the cs_customers row in 'signed' onboarding stage, copies contact +
// company info from the deal, and sends a personal "thanks for saying yes,
// here's what happens next" email drafted by Claude in Josh's voice.
//
// Idempotent: if a customer already exists for this deal_id, the function
// short-circuits and returns the existing customer id without re-sending.
//
// Auth:    Authorization: Bearer <admin user JWT> OR service role key
// Body:    { deal_id: string, force?: boolean }
// Returns: {
//            ok: boolean,
//            customer_id?: string,
//            created?: boolean,           // false if it was already there
//            welcome_sent?: boolean,
//            welcome_error?: string,
//            error?: string,
//          }
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

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

// ── Persona inference ───────────────────────────────────────────────────
// Service businesses → Ada. Church / ministry → Grace. Heuristic only;
// the operator can flip it post-creation if we guess wrong.
function inferPersona(industry: string | null | undefined): 'ada' | 'grace' {
  if (!industry) return 'ada'
  const lower = industry.toLowerCase()
  const churchSignals = ['church', 'ministry', 'congregation', 'parish', 'temple', 'faith', 'religious']
  if (churchSignals.some((sig) => lower.includes(sig))) return 'grace'
  return 'ada'
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'customer'
}

// ── Welcome draft ───────────────────────────────────────────────────────
function buildPrompt(args: {
  orgName: string
  contactName: string | null
  persona: 'ada' | 'grace'
  industry: string | null
  city: string | null
  state: string | null
  monthlyRateCents: number
  founderName: string
  founderSig: string
  calendlyUrl: string | null
  stripeUrl: string | null
}): string {
  const personaName = args.persona === 'grace' ? 'Grace' : 'Ada'
  const personaContext = args.persona === 'grace'
    ? 'AI ministry assistant for your church'
    : 'AI employee for your business'

  const nextSteps = args.persona === 'grace'
    ? '(1) get payment squared away so we can lock in your founding-partner rate, (2) a 45-minute kickoff call where we walk through how your team will use Grace day-to-day, (3) Grace reaches out to your staff with a few discovery questions so she learns your church\'s voice'
    : '(1) get payment squared away so we can lock in your founding-partner rate, (2) a 45-minute kickoff call where we walk through how your team will use Ada day-to-day, (3) Ada reaches out to interview you about your services, customers, and where time disappears'

  const paymentLine = args.stripeUrl
    ? `Payment link: ${args.stripeUrl}`
    : 'I\'ll send a payment link separately within the day.'

  const calendlyLine = args.calendlyUrl
    ? `Kickoff call link: ${args.calendlyUrl}`
    : 'I\'ll send a Calendly link separately to book the kickoff call.'

  return `You are drafting a personal, warm "thanks for saying yes" email from ${args.founderName} at CommandSite to a customer who just signed up. They have not paid yet — payment is the very next step.

Customer:
- Org: ${args.orgName}
- Primary contact: ${args.contactName ?? '(no name on file)'}
- Persona they signed up for: ${personaName} (${personaContext})
- Industry: ${args.industry ?? '(unspecified)'}
- Location: ${[args.city, args.state].filter(Boolean).join(', ') || '(unspecified)'}
- Monthly rate: $${Math.round(args.monthlyRateCents / 100)}/mo

Draft a SHORT email (3-4 short paragraphs, under 180 words total).

Structure:
1. Genuine "thanks for saying yes" — warm, personal, not corporate. Name them and the persona by name. One sentence that shows you remember why they're a fit (lean on their industry / location).
2. What's next, numbered or in flowing prose: ${nextSteps}
3. ${paymentLine}
4. ${calendlyLine}
5. Reply-friendly close: "Hit reply if anything's unclear or you need a different cadence." Then sign off with: "${args.founderSig}"

Constraints:
- Plain text only. No HTML, no markdown headers, no bullet lists, no emojis.
- Under 180 words.
- No em dashes inside body prose. The sign-off "${args.founderSig}" is allowed as is.
- Use a comma-opener: "Hey [Name]," — comma, no exclamation.
- Don't oversell. Don't re-pitch the product. They already bought.
- Subject line: short, warm, names them or the persona. Under 50 chars. Examples: "Welcome aboard, [Name]" / "Locking in ${personaName} for [Org]" / "${personaName}'s on the way to [Org]".

Return JSON: { "subject": string, "body": string }. JSON only, no preamble or code fences.`
}

async function draftSignedWelcome(args: Parameters<typeof buildPrompt>[0]): Promise<{ subject: string; body: string }> {
  const prompt = buildPrompt(args)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  }
  const data = await res.json() as { content?: Array<{ type: string; text?: string }> }
  const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object in model response')
  const parsed = JSON.parse(match[0]) as { subject?: string; body?: string }
  if (!parsed.subject || !parsed.body) throw new Error('Missing subject or body in draft')
  return { subject: parsed.subject.trim(), body: parsed.body.trim() }
}

// ── Main handler ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST' }, 405)

  let body: { deal_id?: string; force?: boolean }
  try { body = await req.json() } catch { return json({ ok: false, error: 'Invalid JSON' }, 400) }
  if (!body.deal_id) return json({ ok: false, error: 'deal_id required' }, 400)

  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const isServiceRole = token === SERVICE_ROLE_KEY

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  if (!isServiceRole) {
    if (!token) return json({ ok: false, error: 'Missing Authorization' }, 401)
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData.user) return json({ ok: false, error: 'Invalid session' }, 401)
    const { data: profile } = await admin
      .from('users')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!profile || (profile as { role?: string }).role !== 'admin') {
      return json({ ok: false, error: 'Admin only' }, 403)
    }
  }

  // ── 1. Load the deal
  const { data: dealData, error: dealErr } = await admin
    .from('cs_deals')
    .select('id, company_name, contact_name, contact_email, contact_title, industry, city, state, stage, estimated_arr_cents')
    .eq('id', body.deal_id)
    .maybeSingle()

  if (dealErr || !dealData) {
    return json({ ok: false, error: `Deal not found: ${dealErr?.message ?? 'no row'}` }, 404)
  }

  const deal = dealData as {
    id: string
    company_name: string
    contact_name: string
    contact_email: string | null
    contact_title: string | null
    industry: string | null
    city: string | null
    state: string | null
    stage: string
    estimated_arr_cents: number
  }

  if (deal.stage !== 'closed_won' && !body.force) {
    return json({ ok: false, error: `Deal is not closed_won (stage=${deal.stage}). Pass force:true to override.` }, 400)
  }

  // ── 2. Idempotency: already promoted?
  const { data: existing } = await admin
    .from('cs_customers')
    .select('id, signed_welcome_sent_at')
    .eq('deal_id', deal.id)
    .maybeSingle()

  if (existing) {
    return json({
      ok: true,
      customer_id: (existing as { id: string }).id,
      created: false,
      welcome_sent: !!(existing as { signed_welcome_sent_at?: string }).signed_welcome_sent_at,
      message: 'Customer already exists for this deal',
    })
  }

  // ── 3. Create the customer
  const persona = inferPersona(deal.industry)
  // Estimated MRR from deal.estimated_arr_cents (split over 12 months). The
  // operator will refine the exact terms in the customer detail page.
  const monthlyRateCents = Math.round((deal.estimated_arr_cents ?? 0) / 12)

  // Slug uniqueness — append a numeric suffix if needed
  let slug = slugify(deal.company_name)
  for (let i = 0; i < 10; i++) {
    const { data: clash } = await admin
      .from('cs_customers')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!clash) break
    slug = `${slugify(deal.company_name)}-${i + 2}`
  }

  const contacts = deal.contact_name
    ? [{
        name: deal.contact_name,
        role: deal.contact_title ?? 'Primary',
        email: deal.contact_email ?? '',
        phone: '',
        primary: true,
      }]
    : []

  const nowIso = new Date().toISOString()

  const { data: insertedData, error: insertErr } = await admin
    .from('cs_customers')
    .insert({
      deal_id: deal.id,
      org_name: deal.company_name,
      slug,
      persona_type: persona,
      industry: deal.industry,
      city: deal.city,
      state: deal.state,
      tier: 'standard',
      founding_partner: true,
      billing_period: 'monthly',
      monthly_rate_cents: monthlyRateCents,
      status: 'onboarding',
      onboarding_stage: 'signed',
      stage_entered_at: nowIso,
      signed_at: nowIso,
      contacts,
      enabled_roles: [],
      languages: ['English'],
      integrations: {},
    } as never)
    .select('id')
    .single()

  if (insertErr || !insertedData) {
    return json({ ok: false, error: `Customer insert failed: ${insertErr?.message ?? 'no row'}` }, 500)
  }

  const customerId = (insertedData as { id: string }).id

  // ── 4. Load founder identity from cs_settings. Stripe payment link
  //     isn't on cs_settings yet — for now we omit it and Josh sends
  //     the Stripe link manually (or we add a settings field later).
  const { data: settingsRow } = await admin
    .from('cs_settings')
    .select('founder_name, email_signature, calendly_link')
    .eq('id', 1)
    .maybeSingle()
  const settings = (settingsRow ?? {}) as {
    founder_name?: string
    email_signature?: string
    calendly_link?: string
  }
  const founderName = settings.founder_name ?? 'Josh'
  const founderSig = settings.email_signature ?? '— Josh\nCommandSite'
  const calendlyUrl = settings.calendly_link ?? null
  const stripeUrl: string | null = null

  // ── 5. Draft + send the signed-welcome email. Fail-soft: the customer
  //     exists even if the email fails; Josh can retry from the UI later.
  let welcomeSent = false
  let welcomeError: string | undefined
  let subject: string | undefined
  let bodyText: string | undefined

  if (!deal.contact_email) {
    welcomeError = 'No contact_email on deal — cannot send signed-welcome.'
  } else {
    try {
      const drafted = await draftSignedWelcome({
        orgName: deal.company_name,
        contactName: deal.contact_name,
        persona,
        industry: deal.industry,
        city: deal.city,
        state: deal.state,
        monthlyRateCents,
        founderName,
        founderSig,
        calendlyUrl,
        stripeUrl,
      })
      subject = drafted.subject
      bodyText = drafted.body

      // Send via gmail-send (tenant='commandsite' → josh@commandsite.io)
      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/gmail-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          to: deal.contact_email,
          subject,
          body: bodyText,
          tenant: 'commandsite',
        }),
      })
      const sendJson = await sendRes.json() as { ok?: boolean; error?: string }
      if (!sendRes.ok || !sendJson.ok) {
        welcomeError = `gmail-send: ${sendJson.error ?? sendRes.statusText}`
      } else {
        welcomeSent = true
      }
    } catch (err) {
      welcomeError = err instanceof Error ? err.message : String(err)
    }
  }

  await admin
    .from('cs_customers')
    .update({
      signed_welcome_sent_at: welcomeSent ? new Date().toISOString() : null,
      signed_welcome_subject: subject ?? null,
      signed_welcome_body: bodyText ?? null,
      signed_welcome_error: welcomeError ?? null,
    } as never)
    .eq('id', customerId)

  return json({
    ok: true,
    customer_id: customerId,
    created: true,
    welcome_sent: welcomeSent,
    welcome_error: welcomeError,
    persona,
    slug,
  })
})
