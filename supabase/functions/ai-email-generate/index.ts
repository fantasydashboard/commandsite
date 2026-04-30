// CommandSite ai-email-generate Edge Function
// ---------------------------------------------------------------------------
// AI Marketing — Email channel writer. Generates STRUCTURED content (subject,
// eyebrow, headline, body sections, CTA) — never raw HTML — then renders it
// into a per-client email "skeleton" so the polished design baseline is
// locked in and unbreakable.
//
// For UFD specifically the skeleton mirrors their existing brand emails:
// dark theme, green accents, 600px table layout, Helvetica Neue.
//
// Auth:   Authorization: Bearer <supabase-user-jwt> (admin or client member)
// Body:   {
//           client_id?: string,
//           topic?: string,         // freeform topic / angle
//           template_key?: string,  // optional: starting from an existing template
//           cta_url?: string,       // override default CTA destination
//         }
// Secrets: ANTHROPIC_API_KEY

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

// Tool-shape that Claude is forced to fill out. Mirrors the structure of
// UFD's polished trial emails: eyebrow → headline → lede → 2-4 sections →
// CTA. Sections can carry highlight color so we get UFD's accent-card look.
const CREATE_EMAIL_TOOL = {
  name: 'create_email',
  description: 'Compose a single email for human review',
  input_schema: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Inbox-friendly, scannable, hook in first 30 chars' },
      preview_text: {
        type: 'string',
        description: 'Inbox preview (the gray text after the subject), 50-90 chars',
      },
      eyebrow: {
        type: 'string',
        description: 'Tiny ALL-CAPS label above headline (e.g., "GETTING STARTED")',
      },
      headline: {
        type: 'string',
        description: 'Big H1, one strong line — like a magazine cover headline',
      },
      lede: {
        type: 'string',
        description: 'Opening paragraph that hooks. Plain prose, no list-y stuff.',
      },
      sections: {
        type: 'array',
        description: '2-4 body sections. Each becomes a card or callout in the layout.',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string', description: 'Optional section heading' },
            body: { type: 'string', description: 'Section body — can be a couple sentences' },
            highlight_color: {
              type: 'string',
              enum: ['green', 'cyan', 'amber', 'purple', 'pink', 'none'],
              description: 'Accent treatment. "none" = plain card, others = colored callout',
            },
            emoji: { type: 'string', description: 'Optional leading emoji for the section' },
          },
          required: ['body'],
        },
      },
      cta_label: { type: 'string', description: 'Big button text, e.g. "VIEW MY POWER RANKINGS"' },
      cta_url: { type: 'string', description: 'Where the CTA button points' },
      cta_subtext: {
        type: 'string',
        description: 'Tiny gray line under the button (e.g., "Takes 60 seconds")',
      },
      footer_note: {
        type: 'string',
        description: 'Optional small italic sentence above the CTA — context/reassurance',
      },
    },
    required: ['subject', 'headline', 'lede', 'sections', 'cta_label', 'cta_url'],
  },
}

interface EmailContent {
  subject: string
  preview_text?: string
  eyebrow?: string
  headline: string
  lede: string
  sections: {
    heading?: string
    body: string
    highlight_color?: 'green' | 'cyan' | 'amber' | 'purple' | 'pink' | 'none'
    emoji?: string
  }[]
  cta_label: string
  cta_url: string
  cta_subtext?: string
  footer_note?: string
}

// ---------------------------------------------------------------------------
// UFD email skeleton renderer. Mirrors the design language pulled from
// UFD's existing transactional emails. Built as inline-styled tables so it
// renders consistently across email clients (Gmail, Outlook, Apple Mail).
//
// Other clients later: swap this for a different skeleton (or pick from a
// set) — the structured content shape stays the same.
// ---------------------------------------------------------------------------
const HIGHLIGHT_COLORS: Record<string, { bg: string; border: string; heading: string }> = {
  green:  { bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.22)',  heading: '#86efac' },
  cyan:   { bg: 'rgba(6,182,212,0.06)',  border: 'rgba(6,182,212,0.22)',  heading: '#67e8f9' },
  amber:  { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.22)', heading: '#fbbf24' },
  purple: { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)', heading: '#a78bfa' },
  pink:   { bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.22)', heading: '#f9a8d4' },
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderUfdEmail(content: EmailContent, opts: { logoUrl?: string; brandUrl?: string } = {}): string {
  const logo = opts.logoUrl ?? 'https://ultimatefantasydashboard.com/UFD_V8.png'
  const brandUrl = opts.brandUrl ?? 'https://ultimatefantasydashboard.com'

  const sections = (content.sections ?? [])
    .map((s) => {
      const color = HIGHLIGHT_COLORS[s.highlight_color ?? 'none']
      const heading = s.heading
        ? `<div style="font-size:13px;font-weight:800;color:${color?.heading ?? '#fff'};letter-spacing:0.04em;margin-bottom:6px;">${s.emoji ? escapeHtml(s.emoji) + ' ' : ''}${escapeHtml(s.heading)}</div>`
        : s.emoji
        ? `<div style="font-size:18px;margin-bottom:6px;">${escapeHtml(s.emoji)}</div>`
        : ''
      const bodyHtml = `<div style="font-size:13px;color:#9ca3af;line-height:1.7;">${escapeHtml(s.body).replace(/\n/g, '<br>')}</div>`
      if (color) {
        return `
<div style="background:${color.bg};border:1px solid ${color.border};border-radius:10px;padding:14px 16px;margin:0 0 12px;">
  ${heading}${bodyHtml}
</div>`
      }
      return `
<div style="background:#11131a;border:1px solid #1e2130;border-radius:10px;padding:14px 16px;margin:0 0 12px;">
  ${heading}${bodyHtml}
</div>`
    })
    .join('')

  const eyebrow = content.eyebrow
    ? `<p style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#22c55e;margin:0 0 10px;">${escapeHtml(content.eyebrow)}</p>`
    : ''

  const footerNote = content.footer_note
    ? `<p style="font-size:13px;color:#6b7280;font-style:italic;margin:0 0 24px;">${escapeHtml(content.footer_note)}</p>`
    : ''

  const ctaSubtext = content.cta_subtext
    ? `<p style="font-size:11px;color:#374151;text-align:center;margin:0;">${escapeHtml(content.cta_subtext)}</p>`
    : ''

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#05060a;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#05060a;">
<tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0a0c14;border:1px solid #1e2130;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#0a0c14;border-bottom:2px solid #22c55e;padding:16px 28px;text-align:center;">
    <a href="${escapeHtml(brandUrl)}" style="text-decoration:none;"><img src="${escapeHtml(logo)}" height="26" alt="Ultimate Fantasy Dashboard" style="display:inline-block;border:0;"></a>
  </td></tr>
  <tr><td style="padding:36px 32px 28px;background:#0a0c14;">
    ${eyebrow}
    <h1 style="font-size:27px;font-weight:900;color:#fff;line-height:1.1;letter-spacing:-0.02em;margin:0 0 18px;">${escapeHtml(content.headline)}</h1>
    <p style="font-size:14px;color:#9ca3af;line-height:1.75;margin:0 0 16px;">${escapeHtml(content.lede)}</p>
    ${sections}
    <hr style="border:none;border-top:1px solid #1e2130;margin:22px 0;">
    ${footerNote}
    <div style="text-align:center;margin:0 0 8px;">
      <a href="${escapeHtml(content.cta_url)}" style="display:inline-block;background:#22c55e;color:#0a0c14;font-size:14px;font-weight:800;letter-spacing:0.05em;padding:14px 36px;border-radius:10px;text-decoration:none;">${escapeHtml(content.cta_label)} →</a>
    </div>
    ${ctaSubtext}
  </td></tr>
  <tr><td style="background:#080a10;padding:14px 28px;border-top:1px solid #1e2130;text-align:center;font-size:11px;color:#374151;">
    ultimatefantasydashboard.com &nbsp;·&nbsp; <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#374151;text-decoration:none;">Unsubscribe</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

// deno-lint-ignore no-explicit-any
function buildSystemPrompt(profile: any, lessons: any[], skeletonHint: string): string {
  const lines: string[] = [
    `You are an expert email copywriter for ${profile.business_name || 'this business'}.`,
    '',
    'BRAND PROFILE',
    '─────────────',
  ]
  if (profile.description) lines.push(`What we do: ${profile.description}`)
  if (profile.voice) lines.push(`Voice: ${profile.voice}`)
  if (profile.audience) lines.push(`Audience: ${profile.audience}`)
  if (profile.dos?.length) {
    lines.push('Do:')
    for (const d of profile.dos) lines.push(`  • ${d}`)
  }
  if (profile.donts?.length) {
    lines.push("Don't:")
    for (const d of profile.donts) lines.push(`  • ${d}`)
  }
  if (lessons.length > 0) {
    lines.push('')
    lines.push('LESSONS LEARNED')
    lines.push('───────────────')
    for (const l of lessons.slice(0, 6)) {
      lines.push(`  • ${typeof l === 'string' ? l : JSON.stringify(l)}`)
    }
  }
  lines.push('')
  lines.push('EMAIL DESIGN')
  lines.push('────────────')
  lines.push(skeletonHint)
  lines.push('')
  lines.push('YOUR JOB')
  lines.push('────────')
  lines.push(
    'Write a single email that fits this brand voice. Output STRUCTURED CONTENT only via the create_email tool — do not write HTML. The server renders your content into a polished, on-brand layout.',
  )
  lines.push('')
  lines.push('Best practices:')
  lines.push('- Subject line: scannable, hook in first 30 chars, no exclamation stuffing.')
  lines.push('- Preview text: continues the subject, not a duplicate.')
  lines.push('- Headline: one decisive line. Specific beats clever.')
  lines.push('- Lede: 2-3 sentences max. Hook the reader.')
  lines.push('- Sections: 2-4 cards. Each one earns its place. Mix highlight colors only when it adds clarity.')
  lines.push('- CTA: action verb, specific destination promise, all-caps reads stronger.')

  return lines.join('\n')
}

const UFD_SKELETON_HINT = `
The email will render in a dark-themed, mobile-friendly layout:
- Dark background (#05060a) with a card body (#0a0c14)
- A green accent (#22c55e) for the eyebrow line + CTA button
- Header bar with the UFD logo
- Body sections render as plain cards by default; pick a highlight_color
  on a section if you want it to feel like a callout
- Footer with unsubscribe is added automatically
You write the words; the layout is locked in. Don't reference colors or
HTML — write content as if for a magazine.
`.trim()

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

  let body: { client_id?: string; topic?: string; template_key?: string; cta_url?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body fine */
  }

  const clientId =
    caller.role === 'admin' ? body.client_id ?? caller.client_id : caller.client_id
  if (!clientId) return json({ error: 'Cannot determine target client' }, 400)

  const topic = (body.topic ?? '').trim()

  const { data: profile, error: profileErr } = await admin
    .from('client_brand_profiles')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (profileErr) return json({ error: `Profile read: ${profileErr.message}` }, 500)
  if (!profile) return json({ error: 'Brand profile not set up. Fill it in first.' }, 400)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'Anthropic API key not configured on server' }, 500)

  const systemPrompt = buildSystemPrompt(
    profile,
    Array.isArray(profile.lessons_learned) ? profile.lessons_learned : [],
    UFD_SKELETON_HINT,
  )

  const userPrompt = topic
    ? `Write an email about: ${topic}\n\nSubmit via the create_email tool.`
    : `Write an on-brand email drawing from the topic list and recent lessons. Submit via the create_email tool.`

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [CREATE_EMAIL_TOOL],
      tool_choice: { type: 'tool', name: 'create_email' },
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
    (b: any) => b.type === 'tool_use' && b.name === 'create_email',
  )
  if (!toolBlock) return json({ error: 'Model returned no email' }, 502)

  const content = toolBlock.input as EmailContent
  if (body.cta_url) content.cta_url = body.cta_url
  const html = renderUfdEmail(content)

  const ai_meta = {
    model: result.model,
    tokens_in: result.usage?.input_tokens,
    tokens_out: result.usage?.output_tokens,
    stop_reason: result.stop_reason,
    topic: topic || null,
  }

  // Persist as a draft so it's reviewable + editable in the UI.
  const { data: draft, error: insertErr } = await admin
    .from('email_drafts')
    .insert({
      client_id: clientId,
      topic: topic || content.subject,
      content,
      html,
      subject: content.subject,
      preview_text: content.preview_text ?? null,
      status: 'draft',
      ai_meta,
    })
    .select('*')
    .single()
  if (insertErr) return json({ error: `Insert: ${insertErr.message}` }, 500)

  return json({ draft, content, html })
})
