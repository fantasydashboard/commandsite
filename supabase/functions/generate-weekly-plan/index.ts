// Josh Personal · generate-weekly-plan Edge Function
// ---------------------------------------------------------------------------
// Sage's Saturday morning weekly plan generator. Reads everything she
// has on Josh — profile (food prefs, injuries, equipment, eating
// window, split), calculated targets (cal, protein, fat, sat fat
// ceiling), latest bloodwork concerns, last 7 days metrics, active
// goals — and drafts a 7-day plan: meals + workouts + aggregated
// shopping list + biomarker-driven swap rationale.
//
// The plan respects: cal target, protein target, sat fat ceiling,
// foods avoided, foods disliked, injuries, equipment, eating window,
// preferred split. Where Sage has to make a tradeoff (e.g. "you said
// no tofu but I need a vegetarian dinner option for variety"), she
// flags it in the swaps list so Josh sees the reasoning.
//
// Auth:    Authorization: Bearer <admin user JWT>     (manual / on-demand)
//      OR  X-Cron-Secret: <WEEKLY_PLAN_CRON_SECRET>   (Saturday cron later)
// Body:    { week_starting?: 'YYYY-MM-DD', revision_request?: string }
//          revision_request: free-text Josh feedback ("swap fish for chicken",
//          "more carbs Tuesday", "less repetitive"). When present, Sage
//          loads the existing plan for that week + applies the requested
//          changes, preserving everything else.
// Returns: { plan: { ...row }, generated: 'manual' | 'cron' }
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          WEEKLY_PLAN_CRON_SECRET (optional)

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are Sage, Josh's personal AI health coach. You're drafting his weekly meal + workout plan — the one he reviews Saturday morning before grocery shopping.

Your job: a complete, executable 7-day plan that respects his real biology + real preferences + real bloodwork. Not a generic template. Specific meals he can actually cook + a workout split that respects his real injuries and equipment.

# OUTPUT — call save_weekly_plan with:

1. **strategy** (1-2 paragraphs, ~80-150 words) — Why this plan looks the way it does. Reference specific data: deficit target, sat fat tightening from current LDL, protein bumps if he's been under-hitting, volume changes based on HRV trend, etc. Voice: direct + cited, not corporate.

2. **days** — Array of 7 day objects, Mon → Sun. Each day:
   - day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"
   - date: ISO date "YYYY-MM-DD"
   - workout: short name like "Push", "Pull", "Legs", "Full body", "Cardio", or null for rest day
   - workout_detail: one-line summary of the session if not rest
   - workout_exercises: array of {name, sets (e.g. "4 × 6"), load (e.g. "185 lbs"), notes (optional, like "Add 5 lbs vs last session")}
   - meals: { breakfast, lunch, dinner, snacks } each with {name, cal, protein, detail (1-line ingredient list)}
   - totalCal: integer (sum of meal calories)
   - totalProtein: integer (sum of meal protein)

3. **shopping_list** — Aggregated grocery items. Array of {name, qty (e.g. "24 oz", "2 lbs", "1 dozen"), category (one of: "Proteins" | "Carbs & Grains" | "Produce" | "Pantry" | "Dairy" | "Other")}. See SHOPPING LIST AGGREGATION rules below — read those before writing this section.

4. **swaps** — Array of biomarker-driven changes Sage made vs. her default plan. Each {day (e.g. "Mon, Thu, Sat" or "Daily"), change (e.g. "Olive-oil-poached salmon (instead of butter-poached)"), why (e.g. "LDL flagged, sat fat ceiling 14g/day")}. If no swaps were needed, return an empty array.

5. **totals** — Summary stats: { avg_cal, avg_protein, workout_days, deficit_vs_maintain, shopping_count, shopping_estimate_usd }. Estimate shopping cost based on quantities + typical US grocery prices.

# RULES (HARD CONSTRAINTS, NEVER VIOLATE)

- Daily calorie target: hit user's daily_cal_target ± 100 cal per day. Slight variation Mon vs Sat is fine if average lands.
- Protein target: every day ≥ 90% of user's protein_g target. Critical during a cut.
- Sat fat ceiling: WEEKLY total ≤ (sat_fat_g_ceiling × 7). Distribute unevenly is OK if weekly cap holds.
- Foods avoided: NEVER include any item from foods_avoided (medical/religious/moral — non-negotiable).
- Foods disliked: AVOID where reasonable. If you must use one (e.g. variety reasons), flag it as a swap with explicit rationale.
- Injuries: NEVER program exercises that load the injured body part contrary to the note (e.g. "right shoulder — avoid OHP").
- Equipment: only program movements doable with the listed equipment + commercial gym (if has_commercial_gym is true, you can use anything; if false, only home_equipment).
- Eating window: meals scheduled within eating_window_start → eating_window_end. Snacks can be outside if needed but flag.
- Workout split: respect preferred_split. If "push_pull_legs" → 6-day rotation if workouts/wk = 6, 3-day rotation if = 3. If "upper_lower" → alternate. If "custom" → use your judgment based on workouts/wk + recovery.

# VOICE FOR strategy + swaps.why

- Direct, evidence-based. Reference his actual numbers.
- Use first person ("I'm pulling sat fat to 14g this week because LDL is at 148")
- No buzzwords, no cheerleading, no em dashes inside sentences (use commas/periods)
- Specific over general ("0.5 lb/wk cut at 500 cal/day deficit" not "moderate calorie deficit")

# SHOPPING LIST AGGREGATION (READ THIS BEFORE WRITING shopping_list)

The shopping list is the #1 spot Sage gets wrong. Follow this procedure exactly.

**Step 1 — extract a flat list of (ingredient, raw quantity) tuples from EVERY meal detail you wrote.**
- Walk through days[].meals.*.detail one at a time.
- If a detail says "MAKE DOUBLE BATCH (5 oz × 2 portions)", that's TWO portions of 5 oz = 10 oz total. The "Reserve 1 portion for Tue lunch" line means the next day's meal IS the second portion — DO NOT count it again.
- "Leftover X" meals contribute ZERO new ingredients. The leftover is already counted in the meal that prepared it.
- Per-portion quantities ("1 cup per portion") multiply by the portion count, not by the days served.

**Step 2 — sum identical ingredients across the week.**
- Combine like items: "ground turkey" Mon lunch + "ground turkey" Fri dinner = ONE entry, summed.
- Convert to one consistent unit (oz for meat, cups/oz for produce, eggs as count).

**Step 3 — round UP to the nearest practical purchase unit.**
- Salmon needs 12 oz → write "12 oz" (not "16 oz to be safe").
- Ground turkey needs 20 oz → write "1.25 lbs" or "1.5 lbs" (round to next 0.25 lb), NOT 2.5 lbs.
- Berries need 6 oz → write "6 oz" (or smallest container size, usually 6 oz clamshell).
- DON'T pad. Padding compounds across 30+ items into hundreds of dollars of waste.

**Step 4 — filter ruthlessly.**
- If an ingredient does NOT appear in any day's meal detail, it does NOT go on the shopping list. No exceptions.
- "Common pantry items he probably has" is NOT a reason to add an item. Only list what the meals require.

**Step 5 — quantity is FOR ONE PERSON unless told otherwise.**
- This plan is for Josh, not a family. 4 oz raw chicken = ONE serving for ONE meal for ONE person.

**Step 6 — annotation field.** When you write the qty string, include a parenthetical that shows WHERE the quantity came from. This is a debugging aid for you AND a check for Josh.
- Good: "1.25 lbs (Mon lunch 10 oz + Fri dinner 10 oz)"
- Bad: "2.5 lbs (Mon lunch ×2 + Fri dinner ×2 + leftover portions)"  ← double-counts leftovers, also lies about total

If the annotation math doesn't add up to the qty, the qty is wrong. Recompute.

# MEAL DESIGN PRINCIPLES

- Real meals he can cook. Recipe-level detail in the "detail" field (ingredients + portions).
- Repeat ingredients across days for grocery efficiency (e.g. salmon Mon + Thu + Sat = one Costco purchase).
- Variety enough that it doesn't feel like prison food. ~4-5 distinct dinners per week.
- Lean on cuisines from cuisines_loved. Default to Mediterranean if list is empty.
- Snacks are usually high-protein (Greek yogurt, cottage cheese, whey + nuts) since they're easiest way to hit protein target.

# WORKOUT DESIGN PRINCIPLES (research-backed, 20-30 min sessions)

## Time budget — non-negotiable

Josh trains in a 20-30 minute window. Real sessions, not lifestyle "I'd like 90 min" wishes. Every plan respects this hard constraint.

**The math:** with ~90 sec rest between sets, a 25-min session fits:
- 1 compound lift (3-4 sets, slower) → ~12 min
- 2-3 accessory lifts (3 sets each, faster) → ~13 min

That's it. Don't program 6 exercises in a 25-min session — he'll either skip 2 of them or rush form. Better to program 3-4 hard exercises he'll actually finish.

## Day templates (use these as the skeleton; vary specifics by week)

**Push day (25 min):**
1. Bench press OR overhead press — 3-4 sets × 5-8 reps (the compound)
2. Dips OR incline DB press — 3 sets × 8-10
3. Lateral raise — 3 sets × 12-15
4. Tricep pushdown OR overhead extension — 3 sets × 10-12

**Pull day (25 min):**
1. Weighted pull-up OR barbell row — 3-4 sets × 5-8 (the compound)
2. Seated cable row OR chest-supported row — 3 sets × 8-10
3. Face pull — 3 sets × 12-15
4. Bicep curl (BB or DB) — 3 sets × 8-12

**Legs day (25 min):**
1. Back squat OR front squat — 3-4 sets × 5-8 (the compound)
2. Romanian deadlift — 3 sets × 6-8
3. Walking lunge OR Bulgarian split squat — 3 sets × 8-10 per leg
4. Standing calf raise — 3 sets × 12-15

**Full body (cardio days, ~25 min):**
- 4-5 compound movements at moderate intensity, 2-3 sets each, shorter rest (~60 sec). Pick from: goblet squat, kettlebell swing, push-up variant, row variant, plank carry.

**Cardio / Zone 2 day:** 20-30 min steady-state (incline walk, bike, row). Target HR around (220 - age) × 0.65. No need to program specific exercises — just the duration + target HR.

## Progressive overload — read last week's logged sets

If the user message includes a RECENT WORKOUT LOG section, treat it as ground truth and progress conservatively:

- **All sets at RPE ≤8 last week** → add 5 lbs to top set (or 1 rep if at the high end of rep range).
- **Last set was RPE 9-10** → hold the weight, focus on adding 1 rep next session.
- **Couldn't hit the prescribed reps** (e.g., planned 5 but got 3) → drop weight 5-10 lbs.
- **No log for this exercise** → start at "experience-appropriate conservative" (40% bodyweight for novice bench, 60% for intermediate, etc.) and use a 10 rep set to gauge.
- **Skipped last session** → repeat the prior session's load — don't progress when missing weeks.

Always write the `notes` field on workout_exercises to explain the load choice when it's a progression: e.g. "Add 5 lbs vs last Mon (all sets RPE 7-8, room to push)" or "Hold from last week — top set was RPE 9, get the rep first".

## Match his split

- workouts_per_week=4 → push, pull, legs, full-body OR push, pull, legs, cardio
- workouts_per_week=6 → push, pull, legs, push, pull, legs (PPL twice)
- workouts_per_week=3 → push, pull, legs
- workouts_per_week=2 → upper, lower
- If "custom" in preferred_split, balance major muscle groups across the week
- Always 1+ true rest day per week regardless of count

If HRV trended down 10%+ from baseline, swap one strength day for cardio/recovery and explain in strategy.

If something genuinely conflicts (e.g. "he wants 6 workouts/wk but his HRV is trending down"), program 5 with a deload day, and explain it in strategy.

# REVISIONS

If the user message contains an EXISTING PLAN + a REVISION REQUEST, you are NOT building from scratch. Treat the existing plan as the baseline. Apply ONLY the changes Josh asked for. Preserve every meal, exercise, and detail he didn't object to.

After applying the change:
- Re-aggregate the shopping_list from the updated days (combine duplicates the same way).
- Recalculate totals (avg_cal, avg_protein, workout_days).
- Re-check hard constraints — if the revision pushed any day out of cal/protein/sat-fat range, adjust the changed item's portions or pair it with a complementary swap and note this in strategy.
- In the strategy field, lead with one sentence on the change made ("Swapped fish for chicken across the week as requested. Same protein hit, marginally lower omega-3 intake — flagging for next bloodwork."). Do NOT rewrite the strategy from scratch.
- swaps: only NEW swaps added because of this revision get added; preserve the existing biomarker-driven swaps too.`

interface WorkoutLogSet { weight: number | null; reps: number | null; rpe: number | null }
interface WorkoutLogExercise { name: string; sets: WorkoutLogSet[]; notes?: string }
interface WorkoutLogEntry {
  workout_date: string
  workout_type: string
  status: string
  actual_exercises: WorkoutLogExercise[]
}

interface PlanContext {
  week_starting: string
  date_label: string
  profile: Record<string, unknown> | null
  targets: Record<string, unknown> | null
  bloodwork_latest: { drawn_at: string; markers: Record<string, number> } | null
  active_concerns: { label: string; value: string; range: string }[]
  metrics_summary: {
    sleep_7d_avg: number | null
    hrv_7d_avg: number | null
    weight_current: number | null
    weight_30d_change: number | null
    workout_days_last_7: number
  }
  goals: { label: string; status: string; detail: string }[]
  recent_workout_log: WorkoutLogEntry[]
}

function buildUserMessage(ctx: PlanContext): string {
  const lines: string[] = []
  lines.push(`# WEEK STARTING`)
  lines.push(`Week of ${ctx.date_label} (Mon ${ctx.week_starting})`)
  lines.push('')

  if (ctx.profile) {
    const p = ctx.profile as Record<string, unknown>
    lines.push(`# PROFILE`)
    lines.push(`- Goal: ${p.primary_goal} (target ${p.target_weight_lbs ?? '—'} lbs by ${p.target_deadline ?? '—'}, ${p.weekly_loss_rate_lbs ?? '—'} lb/wk rate)`)
    lines.push(`- Activity: ${p.activity_level} · ${p.workouts_per_week_target} workouts/wk target · ${p.session_duration_min}min sessions`)
    lines.push(`- Split preference: ${p.preferred_split} · trains ${p.preferred_workout_time}`)
    lines.push(`- Eating window: ${p.eating_window_start ?? '—'} → ${p.eating_window_end ?? '—'} · cooks at ${p.cooking_skill} level`)

    const fa = (p.foods_avoided as string[] | undefined) ?? []
    const fd = (p.foods_disliked as string[] | undefined) ?? []
    const cl = (p.cuisines_loved as string[] | undefined) ?? []
    if (fa.length > 0) lines.push(`- AVOID (hard): ${fa.join(', ')}`)
    if (fd.length > 0) lines.push(`- Disliked (avoid where reasonable): ${fd.join(', ')}`)
    if (cl.length > 0) lines.push(`- Cuisines loved: ${cl.join(', ')}`)

    const inj = (p.injuries as { body_part: string; note: string }[] | undefined) ?? []
    if (inj.length > 0) {
      lines.push(`- INJURIES (route around): ${inj.map((i) => `${i.body_part} (${i.note})`).join('; ')}`)
    }

    lines.push(`- Equipment: home_gym=${p.has_home_gym}, commercial_gym=${p.has_commercial_gym}`)
    if (p.has_home_gym) {
      const eq = (p.home_equipment as string[] | undefined) ?? []
      lines.push(`  Home equipment: ${eq.join(', ') || 'none listed'}`)
    }
    lines.push('')
  }

  if (ctx.targets) {
    const t = ctx.targets as Record<string, unknown>
    lines.push(`# CALCULATED TARGETS`)
    lines.push(`- daily_cal_target: ${t.daily_cal_target} (${t.deficit_or_surplus_kcal} vs maintenance ${t.tdee_kcal})`)
    lines.push(`- protein_g: ${t.protein_g} (${t.protein_per_lb}g/lb)`)
    lines.push(`- fat_g_target: ${t.fat_g_target} (floor ${t.fat_g_min})`)
    lines.push(`- sat_fat_g_ceiling: ≤${t.sat_fat_g_ceiling}g/day → ${(t.sat_fat_g_ceiling as number) * 7}g/week max`)
    lines.push(`- carbs_g (remainder): ${t.carbs_g}`)
    lines.push(`- fiber_g: ${t.fiber_g}`)
    lines.push('')
  }

  if (ctx.active_concerns.length > 0) {
    lines.push(`# ACTIVE BLOODWORK CONCERNS`)
    for (const c of ctx.active_concerns) {
      lines.push(`- ${c.label}: ${c.value} (target ${c.range})`)
    }
    lines.push('')
  }

  lines.push(`# RECENT METRICS (last 7 days)`)
  const m = ctx.metrics_summary
  if (m.sleep_7d_avg != null) lines.push(`- Sleep avg: ${m.sleep_7d_avg.toFixed(1)}h`)
  if (m.hrv_7d_avg != null) lines.push(`- HRV avg: ${m.hrv_7d_avg} ms`)
  if (m.weight_current != null) {
    const change = m.weight_30d_change != null ? ` (${m.weight_30d_change > 0 ? '+' : ''}${m.weight_30d_change.toFixed(1)} lbs / 30d)` : ''
    lines.push(`- Weight: ${m.weight_current} lbs${change}`)
  }
  lines.push(`- Workouts last 7 days: ${m.workout_days_last_7}`)
  lines.push('')

  if (ctx.goals.length > 0) {
    lines.push(`# ACTIVE GOALS`)
    for (const g of ctx.goals) {
      lines.push(`- ${g.label} — ${g.status} — ${g.detail}`)
    }
    lines.push('')
  }

  // Recent workout log — fuel for progressive-overload decisions
  if (ctx.recent_workout_log.length > 0) {
    lines.push(`# RECENT WORKOUT LOG (last 14 days, newest first)`)
    lines.push(`Use this for progressive overload. Each set: weight × reps @ RPE (RPE optional). "—" = not logged.`)
    for (const w of ctx.recent_workout_log) {
      lines.push(`\n## ${w.workout_date} · ${w.workout_type} · ${w.status}`)
      for (const ex of w.actual_exercises) {
        const setStrs = ex.sets
          .filter((s) => s.weight !== null || s.reps !== null)
          .map((s) => `${s.weight ?? '—'}×${s.reps ?? '—'}${s.rpe ? ` @${s.rpe}` : ''}`)
        if (setStrs.length === 0) continue
        lines.push(`  - ${ex.name}: ${setStrs.join(', ')}`)
      }
    }
    lines.push('')
  } else {
    lines.push(`# RECENT WORKOUT LOG`)
    lines.push(`No prior logged sessions. Start at experience-appropriate conservative loads and let Josh log this week's actuals.`)
    lines.push('')
  }

  lines.push(`Now draft Josh's full week. Call save_weekly_plan.`)
  return lines.join('\n')
}

const TOOLS = [
  {
    name: 'save_weekly_plan',
    description: "Save Josh's full week: strategy + 7 days + shopping list + swaps + totals.",
    input_schema: {
      type: 'object',
      properties: {
        strategy: { type: 'string', description: 'Why this plan looks the way it does. ~80-150 words. Reference his actual numbers.' },
        days: {
          type: 'array',
          minItems: 7,
          maxItems: 7,
          items: {
            type: 'object',
            properties: {
              day: { type: 'string', enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
              date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
              workout: { type: ['string', 'null'], description: 'Short name like "Push", or null for rest day' },
              workout_detail: { type: ['string', 'null'] },
              workout_exercises: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    sets: { type: 'string', description: 'e.g. "4 × 6"' },
                    load: { type: 'string', description: 'e.g. "185 lbs", "BW", "50s"' },
                    notes: { type: 'string' },
                  },
                  required: ['name', 'sets', 'load'],
                },
              },
              meals: {
                type: 'object',
                properties: {
                  breakfast: { type: 'object', properties: { name: { type: 'string' }, cal: { type: 'number' }, protein: { type: 'number' }, detail: { type: 'string' } }, required: ['name', 'cal', 'protein', 'detail'] },
                  lunch:     { type: 'object', properties: { name: { type: 'string' }, cal: { type: 'number' }, protein: { type: 'number' }, detail: { type: 'string' } }, required: ['name', 'cal', 'protein', 'detail'] },
                  dinner:    { type: 'object', properties: { name: { type: 'string' }, cal: { type: 'number' }, protein: { type: 'number' }, detail: { type: 'string' } }, required: ['name', 'cal', 'protein', 'detail'] },
                  snacks:    { type: 'object', properties: { name: { type: 'string' }, cal: { type: 'number' }, protein: { type: 'number' }, detail: { type: 'string' } }, required: ['name', 'cal', 'protein', 'detail'] },
                },
                required: ['breakfast', 'lunch', 'dinner', 'snacks'],
              },
              totalCal: { type: 'number' },
              totalProtein: { type: 'number' },
            },
            required: ['day', 'date', 'workout', 'meals', 'totalCal', 'totalProtein'],
          },
        },
        shopping_list: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              qty: { type: 'string', description: 'e.g. "24 oz (3 servings)"' },
              category: { type: 'string', enum: ['Proteins', 'Carbs & Grains', 'Produce', 'Pantry', 'Dairy', 'Other'] },
            },
            required: ['name', 'qty', 'category'],
          },
        },
        swaps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              day: { type: 'string', description: 'e.g. "Mon, Thu, Sat" or "Daily"' },
              change: { type: 'string' },
              why: { type: 'string' },
            },
            required: ['day', 'change', 'why'],
          },
        },
        totals: {
          type: 'object',
          properties: {
            avg_cal: { type: 'number' },
            avg_protein: { type: 'number' },
            workout_days: { type: 'number' },
            deficit_vs_maintain: { type: 'number' },
            shopping_count: { type: 'number' },
            shopping_estimate_usd: { type: 'number' },
          },
          required: ['avg_cal', 'avg_protein', 'workout_days', 'deficit_vs_maintain', 'shopping_count', 'shopping_estimate_usd'],
        },
      },
      required: ['strategy', 'days', 'shopping_list', 'swaps', 'totals'],
    },
  },
]

function nextMondayIso(): string {
  const d = new Date()
  const dayOfWeek = d.getDay()  // 0 Sun, 1 Mon, ..., 6 Sat
  const daysUntilMonday = dayOfWeek === 1 ? 0 : (dayOfWeek === 0 ? 1 : 8 - dayOfWeek)
  d.setDate(d.getDate() + daysUntilMonday)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

// deno-lint-ignore no-explicit-any
async function assemblePlanContext(admin: any, userId: string, weekStartingIso: string): Promise<PlanContext> {
  const dateLabel = new Date(weekStartingIso + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const { data: profile } = await admin
    .from('personal_profile').select('*').eq('user_id', userId).maybeSingle()
  const targets = (profile as { computed_targets: unknown } | null)?.computed_targets ?? null

  const { data: bloodwork } = await admin
    .from('personal_bloodwork_panels')
    .select('drawn_at, markers')
    .eq('user_id', userId)
    .order('drawn_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const concerns: PlanContext['active_concerns'] = []
  if (bloodwork) {
    const m = (bloodwork as { markers: Record<string, number> }).markers
    const checks: { key: string; label: string; max?: number; min?: number; range: string }[] = [
      { key: 'ldl_mg_dl',           label: 'LDL high',           max: 130, range: '<130' },
      { key: 'a1c_pct',             label: 'A1C elevated',       max: 5.7, range: '<5.7' },
      { key: 'triglycerides_mg_dl', label: 'Triglycerides high', max: 150, range: '<150' },
      { key: 'vit_d_ng_ml',         label: 'Vitamin D low',      min: 30,  range: '>30' },
      { key: 'crp_mg_l',            label: 'CRP elevated',       max: 3.0, range: '<3.0' },
    ]
    for (const c of checks) {
      const v = m[c.key]
      if (typeof v !== 'number') continue
      if (c.max != null && v > c.max) concerns.push({ label: c.label, value: `${v}`, range: c.range })
      if (c.min != null && v < c.min) concerns.push({ label: c.label, value: `${v}`, range: c.range })
    }
  }

  function daysAgoIso(n: number): string {
    const d = new Date()
    d.setDate(d.getDate() - n)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }

  // deno-lint-ignore no-explicit-any
  async function fetchSeries(metricType: string, sinceIso: string): Promise<{ value: number; recorded_at: string }[]> {
    const { data } = await admin
      .from('personal_metrics')
      .select('value, recorded_at')
      .eq('metric_type', metricType)
      .gte('recorded_at', sinceIso)
      .order('recorded_at', { ascending: false })
    return ((data ?? []) as { value: number | string; recorded_at: string }[]).map((r) => ({
      value: Number(r.value),
      recorded_at: r.recorded_at,
    }))
  }

  const since7 = daysAgoIso(7)
  const since30 = daysAgoIso(30)

  const [sleep7d, hrv7d, weight30d, exerciseTime] = await Promise.all([
    fetchSeries('sleep_asleep', since7),
    fetchSeries('heart_rate_variability', since7),
    fetchSeries('weight_body_mass', since30),
    fetchSeries('apple_exercise_time', since7),
  ])

  const sleepAvg = sleep7d.length > 0 ? Number((sleep7d.reduce((s, r) => s + r.value, 0) / sleep7d.length).toFixed(1)) : null
  const hrvAvg = hrv7d.length > 0 ? Math.round(hrv7d.reduce((s, r) => s + r.value, 0) / hrv7d.length) : null
  const weightCurrent = weight30d[0] ? Number(weight30d[0].value.toFixed(1)) : null
  const weight30dAgo = weight30d[weight30d.length - 1] ? Number(weight30d[weight30d.length - 1].value.toFixed(1)) : null
  const weight30dChange = (weightCurrent != null && weight30dAgo != null) ? Number((weightCurrent - weight30dAgo).toFixed(1)) : null

  // Workout days: count days in last 7 with >= 20 min exercise
  const exerciseByDay = new Map<string, number>()
  for (const r of exerciseTime) {
    const d = r.recorded_at.slice(0, 10)
    exerciseByDay.set(d, (exerciseByDay.get(d) ?? 0) + r.value)
  }
  let workoutDays = 0
  for (const v of exerciseByDay.values()) if (v >= 20) workoutDays++

  const goals: PlanContext['goals'] = []
  if (profile && (profile as { target_weight_lbs?: number; target_deadline?: string; primary_goal: string }).target_weight_lbs) {
    const p = profile as { target_weight_lbs: number; target_deadline: string | null; primary_goal: string }
    if (weightCurrent != null) {
      goals.push({
        label: `${p.primary_goal === 'cut' ? 'Cut to' : 'Reach'} ${p.target_weight_lbs} lbs${p.target_deadline ? ` by ${p.target_deadline}` : ''}`,
        status: p.primary_goal === 'cut' && weight30dChange != null && weight30dChange < 0 ? 'on track' : 'check pace',
        detail: `currently ${weightCurrent} lbs · ${(weightCurrent - p.target_weight_lbs).toFixed(1)} lbs to go`,
      })
    }
  }

  // Recent workout log — last 14 days of completed/in-progress sessions
  // so the model can apply progressive overload on a per-exercise basis.
  const fourteenAgo = new Date()
  fourteenAgo.setDate(fourteenAgo.getDate() - 14)
  const { data: workoutLogRows } = await admin
    .from('personal_workouts')
    .select('workout_date, workout_type, status, actual_exercises')
    .eq('user_id', userId)
    .gte('workout_date', fourteenAgo.toISOString().slice(0, 10))
    .in('status', ['completed', 'in_progress'])
    .order('workout_date', { ascending: false })
    .limit(14)
  const workoutLog: WorkoutLogEntry[] = (workoutLogRows ?? []) as unknown as WorkoutLogEntry[]

  return {
    week_starting: weekStartingIso,
    date_label: dateLabel,
    profile,
    targets,
    bloodwork_latest: bloodwork as PlanContext['bloodwork_latest'],
    active_concerns: concerns,
    metrics_summary: {
      sleep_7d_avg: sleepAvg,
      hrv_7d_avg: hrvAvg,
      weight_current: weightCurrent,
      weight_30d_change: weight30dChange,
      workout_days_last_7: workoutDays,
    },
    goals,
    recent_workout_log: workoutLog,
  }
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

  const cronSecret = req.headers.get('X-Cron-Secret') ?? req.headers.get('x-cron-secret') ?? ''
  const expectedCron = Deno.env.get('WEEKLY_PLAN_CRON_SECRET') ?? ''
  const isCron = expectedCron && cronSecret === expectedCron

  let userIds: string[] = []
  let trigger: 'manual' | 'cron' = 'manual'

  if (isCron) {
    trigger = 'cron'
    const { data: admins } = await admin.from('users').select('id').eq('role', 'admin')
    const adminIds = ((admins ?? []) as { id: string }[]).map((u) => u.id)
    const { data: profiles } = await admin
      .from('personal_profile').select('user_id').in('user_id', adminIds)
    userIds = ((profiles ?? []) as { user_id: string }[]).map((p) => p.user_id)
  } else {
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!jwt) return json({ error: 'Missing authorization' }, 401)
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
    const { data: caller } = await admin
      .from('users').select('role').eq('id', userData.user.id).maybeSingle()
    if (!caller || (caller as { role: string }).role !== 'admin') return json({ error: 'Admin only' }, 403)
    userIds = [userData.user.id]
  }

  if (userIds.length === 0) return json({ generated: trigger, plans: [], message: 'No admin users with profiles' })

  // Body
  let body: { week_starting?: string; revision_request?: string }
  try { body = await req.json() } catch { body = {} }
  const weekStarting = body.week_starting ?? nextMondayIso()
  const revisionRequest = (body.revision_request ?? '').trim() || null

  const plans: { user_id: string; week_starting: string; status: 'ok' | 'error'; error?: string }[] = []

  for (const userId of userIds) {
    try {
      const ctx = await assemblePlanContext(admin, userId, weekStarting)
      let userMessage = buildUserMessage(ctx)

      // Revision mode: load the existing plan and inject it + Josh's request
      if (revisionRequest) {
        const { data: existing } = await admin
          .from('personal_weekly_plans')
          .select('strategy, days, shopping_list, swaps, totals')
          .eq('user_id', userId)
          .eq('week_starting', weekStarting)
          .maybeSingle()
        if (!existing) {
          plans.push({ user_id: userId, week_starting: weekStarting, status: 'error', error: 'No existing plan to revise — generate one first' })
          continue
        }
        const e = existing as Record<string, unknown>
        userMessage += `\n\n# EXISTING PLAN (revise this — preserve what wasn't called out)\n` +
          `Current strategy: ${e.strategy ?? '—'}\n\n` +
          `Days:\n${JSON.stringify(e.days, null, 2)}\n\n` +
          `Existing swaps:\n${JSON.stringify(e.swaps, null, 2)}\n\n` +
          `# JOSH'S REVISION REQUEST\n${revisionRequest}\n\n` +
          `Apply Josh's request. Preserve everything else. Re-aggregate shopping_list + totals. Call save_weekly_plan with the revised plan.`
      }

      const anthropicBody = {
        model: MODEL,
        max_tokens: 8000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        tool_choice: { type: 'tool', name: 'save_weekly_plan' },
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
        plans.push({ user_id: userId, week_starting: weekStarting, status: 'error', error: `Anthropic ${res.status}: ${text.slice(0, 250)}` })
        continue
      }

      // deno-lint-ignore no-explicit-any
      const data = await res.json() as { content?: Array<{ type: string; name?: string; input?: any }> }
      const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'save_weekly_plan')
      if (!toolUse?.input) {
        plans.push({ user_id: userId, week_starting: weekStarting, status: 'error', error: 'Sage did not call save_weekly_plan' })
        continue
      }

      const planRow = {
        user_id: userId,
        week_starting: weekStarting,
        strategy: toolUse.input.strategy,
        days: toolUse.input.days,
        shopping_list: toolUse.input.shopping_list ?? [],
        swaps: toolUse.input.swaps ?? [],
        totals: toolUse.input.totals,
        generated_at: new Date().toISOString(),
        generated_by: trigger,
        model: MODEL,
        context_snapshot: ctx as unknown,
        approved_at: null,  // user must review + approve
      }

      const { error: upsertErr } = await admin
        .from('personal_weekly_plans')
        .upsert(planRow as never, { onConflict: 'user_id,week_starting' })

      if (upsertErr) {
        plans.push({ user_id: userId, week_starting: weekStarting, status: 'error', error: `DB write: ${upsertErr.message}` })
      } else {
        plans.push({ user_id: userId, week_starting: weekStarting, status: 'ok' })
      }
    } catch (err) {
      plans.push({ user_id: userId, week_starting: weekStarting, status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  return json({ generated: trigger, week_starting: weekStarting, plans })
})
