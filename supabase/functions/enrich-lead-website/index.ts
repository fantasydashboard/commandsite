// CommandSite enrich-lead-website Edge Function
// ---------------------------------------------------------------------------
// Takes existing cs_leads rows that have a company_url, fetches the page,
// strips HTML, and asks Claude Haiku to pull the "boring specifics" that
// cold-email openers thrive on: named owner, named team members, recent
// named projects, specific services listed, a featured testimonial quote,
// years in business. Stores the result in cs_leads.website_extract for
// draft-cold-email to quote from.
//
// Why Haiku: this is an extract-only pass, no generation. Speed and cost
// matter; quality bar is low ("pull what's actually on the page, don't
// invent"). Haiku is the right tool.
//
// Honesty rule: the prompt is explicit that the model should OMIT any
// field with no data and never write placeholder phrases like "Not
// available". The drafter downstream relies on the extract being
// strictly factual, since it's a top-priority source for the opener.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    { lead_ids: string[] }
// Returns: {
//            results: { [lead_id]: { status: 'extracted' | 'empty' | 'error', extract?, error? } },
//            counts: { extracted, empty, errors },
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

const MODEL = 'claude-haiku-4-5-20251001'
const FETCH_TIMEOUT_MS = 10_000
const PER_LEAD_RAW_CHAR_CAP = 8000
const BATCH_SIZE = 5
const INTER_BATCH_MS = 250

const SYSTEM_PROMPT = `You extract "boring specifics" from a remodeler's website page text. The output is used as the evidence line in a cold email opener, so it must be strictly factual.

Look for, in priority order:
- Named owner (first name + role if visible)
- Named team members (designers, project managers, installers; first name + role)
- Recent or featured projects (location, room type, or homeowner name if mentioned)
- Specific services listed (tile, cabinetry, countertops, etc.)
- A featured testimonial quote, verbatim if short
- Years in business or founding year

Output a compact plain-text block, 80 to 350 words. Use these labels in this order: "Owner:", "Team:", "Recent projects:", "Services:", "Testimonial:", "Years in business:". OMIT any label whose value isn't clearly on the page. Never write "Not available" or "Not mentioned" or any placeholder. Never invent. Quote testimonials verbatim or omit them.

If the page text has nothing usable (parked domain, login wall, vendor template with no specifics), return an empty string.

NO em dashes anywhere in the extract. Use commas, periods, or parens.

Call save_website_extract with the result.`

const TOOLS = [
  {
    name: 'save_website_extract',
    description: 'Save the extracted personalization brief for this lead. Empty string is OK if nothing usable was found.',
    input_schema: {
      type: 'object',
      properties: {
        extract: {
          type: 'string',
          description: 'Plain-text personalization brief, labeled fields, omit fields with no data. Empty string if nothing usable.',
        },
      },
      required: ['extract'],
    },
  },
]

type LeadRow = { id: string; company_url: string | null; company_name: string }

async function fetchAndStripHtml(url: string): Promise<string> {
  // Normalize: tolerate URLs without scheme.
  const safeUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(safeUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CommandSiteBot/1.0; +https://commandsite.io)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim()
    return stripped.slice(0, PER_LEAD_RAW_CHAR_CAP)
  } finally {
    clearTimeout(timer)
  }
}

async function extractWithClaude(
  pageText: string,
  companyName: string,
  anthropicKey: string,
): Promise<string> {
  if (!pageText || pageText.length < 80) return ''

  const userMessage = `Company: ${companyName}\n\nPage text:\n${pageText}\n\nExtract the boring specifics. Call save_website_extract.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      tool_choice: { type: 'tool', name: 'save_website_extract' },
      messages: [{ role: 'user', content: userMessage }],
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 200)}`)
  }
  // deno-lint-ignore no-explicit-any
  const data = await res.json() as { content?: Array<{ type: string; name?: string; input?: any }> }
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_website_extract')
  const extract = (toolUse?.input?.extract ?? '') as string
  return extract.trim()
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

  let body: { lead_ids?: string[] }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  const leadIds = Array.isArray(body.lead_ids) ? body.lead_ids.filter((id) => typeof id === 'string') : []
  if (leadIds.length === 0) return json({ error: 'lead_ids required' }, 400)
  if (leadIds.length > 60) return json({ error: 'max 60 lead_ids per request' }, 400)

  const { data: rows, error: fetchErr } = await admin
    .from('cs_leads')
    .select('id, company_url, company_name')
    .in('id', leadIds)
  if (fetchErr) return json({ error: `DB read: ${fetchErr.message}` }, 500)

  const leads = (rows ?? []) as LeadRow[]
  const results: Record<string, { status: 'extracted' | 'empty' | 'error'; extract?: string; error?: string }> = {}
  const counts = { extracted: 0, empty: 0, errors: 0 }

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(async (lead) => {
      if (!lead.company_url) {
        results[lead.id] = { status: 'error', error: 'no company_url' }
        counts.errors += 1
        return
      }
      try {
        const pageText = await fetchAndStripHtml(lead.company_url)
        const extract = await extractWithClaude(pageText, lead.company_name, anthropicKey)
        if (!extract) {
          // Set the extract to empty string (not null) so we know we
          // checked vs. never checked. The drafter treats empty same as
          // missing, and the eligibility filter on the frontend skips
          // anything that's been checked.
          await admin
            .from('cs_leads')
            .update({ website_extract: '' } as never)
            .eq('id', lead.id)
          results[lead.id] = { status: 'empty' }
          counts.empty += 1
          return
        }
        const { error: updErr } = await admin
          .from('cs_leads')
          .update({ website_extract: extract } as never)
          .eq('id', lead.id)
        if (updErr) {
          results[lead.id] = { status: 'error', error: updErr.message }
          counts.errors += 1
          return
        }
        results[lead.id] = { status: 'extracted', extract }
        counts.extracted += 1
      } catch (err) {
        results[lead.id] = { status: 'error', error: err instanceof Error ? err.message : String(err) }
        counts.errors += 1
      }
    }))
    if (i + BATCH_SIZE < leads.length) {
      await new Promise((r) => setTimeout(r, INTER_BATCH_MS))
    }
  }

  return json({ results, counts })
})
