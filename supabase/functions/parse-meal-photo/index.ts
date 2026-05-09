// Josh Personal · parse-meal-photo Edge Function
// ---------------------------------------------------------------------------
// Snap a meal photo, get back a structured macro estimate + an entry
// in personal_meal_log. Fastest possible food logging path — beats
// typing meal descriptions in chat by a wide margin.
//
// Sage uses Sonnet 4.6 with vision to:
//   1. Identify each food on the plate
//   2. Estimate portion sizes (cooked weights, cups, oz)
//   3. Sum macros for the whole plate
//   4. Save to personal_meal_log via tool-use for structured output
//
// Note: photo macro estimates are approximations. Sage flags low-
// confidence estimates in the response so the UI can ask Josh to
// verify. Future polish: GPT-4-style reasoning trace ("I see roughly
// 6oz salmon based on plate diameter").
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    {
//            image_base64: string,      // base64 PNG/JPG, ≤ 4MB raw
//            note?: string,             // optional extra context
//            meal_slot?: 'breakfast' | 'lunch' | 'dinner' | 'snack',
//          }
// Returns: { meal: { id, description, estimated_*, ... },
//            confidence: 'high' | 'medium' | 'low',
//            sage_notes: string }
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
const MAX_IMAGE_BYTES = 4 * 1024 * 1024  // 4MB raw before base64

const SYSTEM_PROMPT = `You are Sage, Josh's personal AI health coach. He just snapped a photo of a meal he's about to eat (or just ate). Identify everything on the plate, estimate portion sizes, and produce a single concise macro estimate for the whole meal.

# WHAT TO DO

1. **Look at the photo carefully.** Identify each distinct food + its approximate portion. Use plate diameter, utensil sizes, and visible ingredients to gauge quantity.

2. **Estimate macros for each food**, then sum to a plate-level total.

3. **Write a one-line description** of what's on the plate as Josh would describe it — concise, specific, no vague language ("big lunch with carbs and stuff" → bad; "Chipotle bowl: double chicken, brown rice, fajita peppers, salsa" → good).

4. **Rate your confidence**:
   - **high**: clear photo, all foods identifiable, portions easy to gauge
   - **medium**: most foods identifiable but a key portion is ambiguous
   - **low**: blurry / dark / partially obscured / hard to tell what something is

5. **Note caveats** in sage_notes — what assumptions you made, what's uncertain. Josh trusts you to be honest about limits.

# RULES

- Use the meal_slot the user provided. If they didn't, infer from time of day or skip.
- The note field (if provided) is extra context Josh wanted to share — incorporate it (e.g. "had this for lunch with a Diet Coke" → add the Diet Coke into your tally).
- Macro estimates: be REALISTIC, not punishingly low. A 7oz cooked sirloin is ~340 cal, not "around 250."
- For cooked weights, assume standard restaurant or home prep unless visible evidence says otherwise (e.g. dry-rub vs. sauce).
- If you can't identify something with confidence, INCLUDE it in description as "[best guess]" but DON'T silently exclude it from macros.

# CALL THE TOOL

Call save_meal_estimate with the structured output. The frontend renders Josh a confirmation screen where he can edit before final save — your numbers are a starting point, not final.`

const TOOLS = [
  {
    name: 'save_meal_estimate',
    description: 'Save your macro estimate for this meal photo.',
    input_schema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'One-line meal description as Josh would say it. Specific. Includes everything visible + the note context.',
        },
        meal_slot: {
          type: 'string',
          enum: ['breakfast', 'lunch', 'dinner', 'snack'],
          description: 'breakfast / lunch / dinner / snack — use the user\'s value if provided, otherwise infer.',
        },
        estimated_cal: { type: 'number', description: 'Total calories for the whole plate.' },
        estimated_protein_g: { type: 'number' },
        estimated_fat_g: { type: 'number' },
        estimated_sat_fat_g: { type: 'number' },
        estimated_carbs_g: { type: 'number' },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'How confident you are in the estimate.',
        },
        sage_notes: {
          type: 'string',
          description: 'Caveats, assumptions, anything ambiguous. ~30-80 words. Honest > optimistic.',
        },
      },
      required: ['description', 'estimated_cal', 'estimated_protein_g', 'confidence', 'sage_notes'],
    },
  },
]

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
  const userId = userData.user.id

  // Body
  let body: { image_base64?: string; note?: string; meal_slot?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!body.image_base64 || typeof body.image_base64 !== 'string') {
    return json({ error: 'image_base64 (string) is required' }, 400)
  }

  // Strip data: prefix if present, sniff media type from prefix
  const dataMatch = body.image_base64.match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/)
  let mediaType = 'image/jpeg'
  let imageBase64 = body.image_base64
  if (dataMatch) {
    mediaType = dataMatch[1]
    imageBase64 = dataMatch[3]
  }
  // Normalize "image/jpg" to "image/jpeg" for Anthropic
  if (mediaType === 'image/jpg') mediaType = 'image/jpeg'

  const rawBytes = Math.floor((imageBase64.length * 3) / 4)
  if (rawBytes > MAX_IMAGE_BYTES) {
    return json({
      error: `Image too large (${(rawBytes / 1024 / 1024).toFixed(1)}MB). Max 4MB. Try a lower-quality phone snap.`,
    }, 413)
  }

  // Build message: photo + optional note + meal slot hint
  const userTextParts: string[] = []
  if (body.meal_slot) userTextParts.push(`Meal slot: ${body.meal_slot}`)
  if (body.note) userTextParts.push(`Note from Josh: ${body.note}`)
  userTextParts.push('Identify everything on the plate, estimate portions, give me macros for the whole meal. Then call save_meal_estimate.')

  const anthropicBody = {
    model: MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: TOOLS,
    tool_choice: { type: 'tool', name: 'save_meal_estimate' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          { type: 'text', text: userTextParts.join('\n\n') },
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
    return json({ error: `Anthropic ${res.status}: ${text.slice(0, 500)}` }, 502)
  }

  // deno-lint-ignore no-explicit-any
  const data = await res.json() as { content?: Array<{ type: string; name?: string; input?: any }> }
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_meal_estimate')
  if (!toolUse?.input) return json({ error: 'Sage did not call save_meal_estimate' }, 502)

  const est = toolUse.input

  // Save to personal_meal_log
  const payload = {
    user_id: userId,
    description: est.description,
    meal_slot: est.meal_slot ?? body.meal_slot ?? null,
    estimated_cal: est.estimated_cal ?? null,
    estimated_protein_g: est.estimated_protein_g ?? null,
    estimated_fat_g: est.estimated_fat_g ?? null,
    estimated_sat_fat_g: est.estimated_sat_fat_g ?? null,
    estimated_carbs_g: est.estimated_carbs_g ?? null,
    source: 'chat',
  }
  const { data: inserted, error: e } = await admin
    .from('personal_meal_log')
    .insert(payload as never)
    .select()
    .single()
  if (e) return json({ error: `DB write: ${e.message}` }, 500)

  return json({
    meal: inserted,
    confidence: est.confidence,
    sage_notes: est.sage_notes,
  })
})
