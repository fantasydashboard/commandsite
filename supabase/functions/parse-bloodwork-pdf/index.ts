// Josh Personal · parse-bloodwork-pdf Edge Function
// ---------------------------------------------------------------------------
// Path B for bloodwork ingestion: instead of typing values manually,
// drop a Quest / LabCorp / etc. PDF and Claude Sonnet 4.6 (with native
// PDF document support) reads it, extracts every numeric marker, maps
// known ones to the canonical keys our targets calculator uses, and
// passes through anything it doesn't recognize verbatim so we don't
// lose data.
//
// Why this matters: a typical Quest panel has 30-50 markers, our
// manual form covers 20. The PDF parse captures the whole panel.
// Future Sage prompts can reference markers we hadn't anticipated.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    { pdf_base64: string }   // base64-encoded PDF, ≤ 4MB raw
// Returns: { drawn_at, drawn_by, notes, markers: { [key]: number },
//            unmapped: [{ key, lab_name, value, unit, range }],
//            extraction_notes: string }
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

const MODEL = 'claude-sonnet-4-6'

// Hard cap on raw PDF size — 4MB pre-base64. Beyond this Claude's
// response gets very slow and the function approaches its 150s wall.
const MAX_PDF_BYTES = 4 * 1024 * 1024

// ── Canonical key registry ──────────────────────────────────────────
// Mirrors the front-end MARKERS array in bloodworkApi.ts. Only the
// keys + common lab-report aliases are listed here so the prompt
// stays compact. Claude maps "LDL-C" / "LDL Direct" / "LDL Calculated"
// → "ldl_mg_dl" and so on. Anything unmapped passes through verbatim.
const CANONICAL_HINT = `
LIPIDS:
- ldl_mg_dl (LDL Cholesterol, LDL-C, LDL Direct, LDL Calculated)
- hdl_mg_dl (HDL Cholesterol, HDL)
- triglycerides_mg_dl (Triglycerides)
- total_cholesterol_mg_dl (Total Cholesterol, Cholesterol Total)

GLUCOSE:
- a1c_pct (Hemoglobin A1c, HbA1c, Glycohemoglobin, A1c)
- fasting_glucose_mg_dl (Glucose, Glucose Fasting, Fasting Glucose)

THYROID:
- tsh_miu_l (TSH, Thyroid Stimulating Hormone)

HORMONES:
- total_testosterone_ng_dl (Testosterone Total, Total Testosterone, Testosterone)
- free_testosterone_pg_ml (Testosterone Free, Free Testosterone)
- cortisol_morning_ug_dl (Cortisol Morning, Morning Cortisol, Cortisol AM, Cortisol)

INFLAMMATION:
- crp_mg_l (CRP, C-Reactive Protein, hs-CRP, hsCRP)

LIVER:
- alt_u_l (ALT, SGPT, Alanine Aminotransferase)
- ast_u_l (AST, SGOT, Aspartate Aminotransferase)

CBC:
- hemoglobin_g_dl (Hemoglobin, HGB, Hb)

VITAMINS / MINERALS:
- vit_d_ng_ml (Vitamin D, 25-OH Vitamin D, 25-Hydroxyvitamin D, Vit D)
- vit_b12_pg_ml (Vitamin B12, B12, Cobalamin)
- ferritin_ng_ml (Ferritin)

KIDNEY:
- creatinine_mg_dl (Creatinine, Creat)
- egfr (eGFR, Estimated GFR, GFR Estimate)
`

const SYSTEM_PROMPT = `You are a medical lab report parser. The user will attach a PDF of a blood panel from a clinical lab (Quest, LabCorp, Sonora Quest, etc.). Extract EVERY numeric marker on the report, the collection date, and the lab name.

For markers that match a canonical key in the list below, use the EXACT canonical key. For markers that don't match any canonical key, generate a snake_case key from the lab's marker name + the unit (e.g. "Apolipoprotein B" with units "mg/dL" → "apolipoprotein_b_mg_dl"). This way nothing on the report is lost — Sage can use the canonical-mapped ones for guardrails and reference the others later.

${CANONICAL_HINT}

Rules:
- Only extract NUMERIC markers. Skip qualitative results (e.g. "Negative", "Not Detected").
- If a marker has multiple results on the same panel (e.g. duplicates), use the most recent / final one.
- For ratios that are themselves numeric (e.g. "Cholesterol/HDL Ratio"), include them with snake_case keys.
- The "value" field is just the number — do NOT include units in it. Units go in their own field.
- For the "drawn_at" date, use the COLLECTION date if present, otherwise the report date. Format YYYY-MM-DD.
- For "drawn_by", use the lab's name (e.g. "Quest Diagnostics", "LabCorp", "Sonora Quest Laboratories").
- Use "extraction_notes" to flag anything weird — e.g. "Two LDL values present (calculated + direct), used direct" or "Some markers missing units in PDF".

Call the save_extracted_panel tool with the structured result.`

const TOOLS = [
  {
    name: 'save_extracted_panel',
    description: 'Save the extracted bloodwork panel data.',
    input_schema: {
      type: 'object',
      properties: {
        drawn_at: {
          type: 'string',
          description: 'Collection date in YYYY-MM-DD format. If only month/year is shown, use the 1st of the month.',
        },
        drawn_by: {
          type: 'string',
          description: 'Lab name (e.g. "Quest Diagnostics").',
        },
        notes: {
          type: 'string',
          description: 'Optional notes — type of panel ("Comprehensive Metabolic Panel", "Annual Physical"), or other context found on the report.',
        },
        markers: {
          type: 'array',
          description: 'Every numeric marker on the report.',
          items: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'Canonical snake_case key (use exact key from canonical list when applicable, otherwise snake_case the lab name + unit).',
              },
              lab_name: {
                type: 'string',
                description: 'Marker name as printed on the report.',
              },
              value: {
                type: 'number',
                description: 'Numeric value. No units in this field.',
              },
              unit: {
                type: 'string',
                description: 'Units string (e.g. "mg/dL", "mIU/L", "%").',
              },
              reference_range: {
                type: 'string',
                description: 'Lab\'s printed reference range (e.g. "<130", "0.4-4.5", "30-100").',
              },
              flagged_by_lab: {
                type: 'boolean',
                description: 'True if the lab itself marked this as out of range (high/low/abnormal).',
              },
            },
            required: ['key', 'lab_name', 'value', 'unit'],
          },
        },
        extraction_notes: {
          type: 'string',
          description: 'Anything weird — duplicate markers, missing units, ambiguous values, etc.',
        },
      },
      required: ['drawn_at', 'drawn_by', 'markers'],
    },
  },
]

interface ExtractedMarker {
  key: string
  lab_name: string
  value: number
  unit: string
  reference_range?: string
  flagged_by_lab?: boolean
}

interface ExtractedPanel {
  drawn_at: string
  drawn_by: string
  notes?: string
  markers: ExtractedMarker[]
  extraction_notes?: string
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Auth: admin only
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
  const { data: caller } = await admin
    .from('users')
    .select('id, role')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!caller || (caller as { role: string }).role !== 'admin') return json({ error: 'Admin only' }, 403)

  // Parse body
  let body: { pdf_base64?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!body.pdf_base64 || typeof body.pdf_base64 !== 'string') {
    return json({ error: 'pdf_base64 (string) is required' }, 400)
  }

  // Decode + size check the PDF
  const pdfBase64 = body.pdf_base64.replace(/^data:application\/pdf;base64,/, '')
  const rawBytes = Math.floor((pdfBase64.length * 3) / 4)  // approx
  if (rawBytes > MAX_PDF_BYTES) {
    return json({
      error: `PDF too large (${(rawBytes / 1024 / 1024).toFixed(1)}MB). Max 4MB. Try saving the report at lower quality or splitting it.`,
    }, 413)
  }

  // Call Claude with the PDF as a document content block
  const anthropicBody = {
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: TOOLS,
    tool_choice: { type: 'tool', name: 'save_extracted_panel' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: 'Extract every numeric marker from this bloodwork panel. Use canonical keys where they match.',
          },
        ],
      },
    ],
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
    return json({
      error: `Anthropic ${res.status}: ${text.slice(0, 500)}`,
    }, 502)
  }

  const data = await res.json() as {
    content?: Array<{ type: string; name?: string; input?: ExtractedPanel }>
  }
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_extracted_panel')
  if (!toolUse?.input) {
    return json({ error: 'Claude did not call save_extracted_panel' }, 502)
  }
  const extracted = toolUse.input

  // Reshape: split into markers (canonical-keyed dict) + unmapped list.
  // Canonical keys = ones the front-end MARKERS registry recognizes.
  // We pass through everything unmapped so the front-end can show
  // "additional markers extracted" in the review screen.
  const KNOWN_CANONICAL_KEYS = new Set([
    'ldl_mg_dl', 'hdl_mg_dl', 'triglycerides_mg_dl', 'total_cholesterol_mg_dl',
    'a1c_pct', 'fasting_glucose_mg_dl',
    'tsh_miu_l',
    'total_testosterone_ng_dl', 'free_testosterone_pg_ml', 'cortisol_morning_ug_dl',
    'crp_mg_l',
    'alt_u_l', 'ast_u_l',
    'hemoglobin_g_dl',
    'vit_d_ng_ml', 'vit_b12_pg_ml', 'ferritin_ng_ml',
    'creatinine_mg_dl', 'egfr',
  ])

  const markers: Record<string, number> = {}
  const unmapped: ExtractedMarker[] = []
  for (const m of extracted.markers) {
    if (KNOWN_CANONICAL_KEYS.has(m.key)) {
      markers[m.key] = m.value
    } else {
      // Still store in markers JSONB under its generated snake_case
      // key — the front-end will render it under "additional markers"
      markers[m.key] = m.value
      unmapped.push(m)
    }
  }

  return json({
    drawn_at: extracted.drawn_at,
    drawn_by: extracted.drawn_by,
    notes: extracted.notes ?? null,
    markers,
    unmapped,
    extraction_notes: extracted.extraction_notes ?? null,
    raw_extracted: extracted.markers,  // full lab-name + range info for UI display
  })
})
