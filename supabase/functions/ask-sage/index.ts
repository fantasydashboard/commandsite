// Josh Personal · ask-sage Edge Function
// ---------------------------------------------------------------------------
// The chat agent. Sage with tools. Multi-turn conversation, server-
// side tool-use loop, returns final assistant text + tool trace.
//
// Use cases this enables (the "real AI assistant" feeling):
//   - "Going to Longhorn for dinner: <url>" → fetch_url + read_targets +
//     read_active_concerns → specific menu recommendation
//   - "I'm sore today, swap workouts" → read_weekly_plan + propose alt
//   - "Why is my LDL not dropping?" → read_recent_metrics + reason
//   - "Sage, log: ate 3 eggs and oatmeal" → log_meal with macro estimates
//
// V1 is non-streaming: POST → run loop → return final response. The
// frontend shows "Sage is using fetch_url..." indicators from the tool
// trace. Streaming SSE is a v2 polish.
//
// Auth:    Authorization: Bearer <admin user JWT>
// Body:    { messages: ChatMessage[] }   // multi-turn conversation
// Returns: { assistant_text: string, tool_trace: ToolCall[], stop_reason }
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
const MAX_TOOL_TURNS = 5     // cap to prevent runaway agent loops
const MAX_FETCH_BYTES = 200_000  // strip huge pages down
const ANTHROPIC_TIMEOUT_MS = 60_000  // per-call ceiling — without this a hung Anthropic request locks the loop until the edge function's own hard timeout

// ── Sage system prompt ──────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Sage, Josh's personal AI health coach. You're chatting with him through his dashboard.

# WHO JOSH IS

Josh is a 30-something founder building CommandSite. You've already worked with him for weeks — you know his profile, his calculated targets, his bloodwork concerns, his weekly plan, his recent metrics. Use the tools below to access any of that data when you need it.

# YOUR TOOLS

## Read

- **fetch_url**: server-side fetch a webpage and return its text content. Use this for restaurant menus, recipe pages, news articles, anything Josh shares a link to.
- **read_targets**: pull Josh's calculated daily targets (cal, protein, fat, sat fat ceiling, water, etc.). Always check these before recommending food quantities.
- **read_active_concerns**: pull bloodwork-derived concerns (LDL high, A1C elevated, etc.). Use these as hard constraints — never recommend something that violates them without flagging the tradeoff.
- **read_recent_metrics(days)**: pull last N days of sleep / HRV / weight / steps / workout days. Use when reasoning about recovery, energy, weight trends.
- **read_weekly_plan**: pull this week's planned meals + workouts + remaining days. Use when something is about to replace a planned meal/workout.
- **read_meal_log(days?)**: pull meals Josh has logged. Default 1 (today only). Pass higher days for trend questions ("am I hitting protein this week?").
- **read_profile**: pull Josh's profile (food prefs, avoidances, injuries, equipment). Use when constraints aren't already in your context.
- **read_target_changes(limit?)**: see recent target/profile changes (yours and manual). Use when Josh asks "what did you change?" or before proposing a change you might already have made.
- **read_ingredient_prefs**: get the current learned ingredient verdicts (never_again / caution / loved). Use when Josh asks "what have you learned?" / "what am I avoiding?" or before suggesting an ingredient you're unsure about.
- **read_active_experiments**: list Josh's currently-running experiments (target changes or lifestyle tests with success criteria and an end date). Read this before proposing new experiments so you don't duplicate, and to remind Josh what's mid-flight.
- **read_patterns_detected(include_dismissed?)**: list patterns the nightly detector has flagged (sleep deviation, HRV deviation, weight pace stalled, adherence drift, sat-fat breaches, BP threshold, workout gaps, water chronic-under). Each row has evidence_data with raw numbers and an optional suggested_experiment template. Read this when Josh asks "what have you noticed?" or when he taps a pattern chip on the Today page (the chat input will be pre-filled with "Tell me about: …").
- **read_sage_observations**: Josh's long-term observations you've persisted ("under-eats protein at breakfast 15/20 days", "weight stalls when sleep <6h"). Read these at the start of any deep-context turn so you have continuity beyond the immediate context window.

## Write — silent (do without asking)

- **log_meal**: write a meal Josh told you he ate. Always estimate macros from the description. Trigger on "log:", "I ate", "had X for lunch".
- **log_metric(metric_type, value, unit?, recorded_at?)**: write any single observation to the metrics table. Use for things Apple Health can't auto-track or that Josh tells you directly. Common types: weight_body_mass (lbs), water_intake (oz), blood_pressure_systolic + blood_pressure_diastolic (mmHg), body_fat_pct, mood_rating (1-10), waist_inches. Trigger on "log: weight 178", "had 32oz water", "BP was 122/78", "mood today is a 7".
- **submit_meal_feedback(plan_id, day_idx, meal_slot, reaction, reason_category?, flagged_ingredient?, notes?)**: record Josh's reaction to a meal from a plan. Trigger when Josh mentions a meal from his plan ("that salmon last night was meh", "loved the chili recipe", "the Tuesday lunch was way too oily"). Source is set to "chat" automatically. After logging, if reaction is never_again or loved and there is a flagged_ingredient, also call read_ingredient_prefs next turn so you can mention the running list of learned preferences.

## Write — proposal-required (NEVER call without explicit confirmation)

- **update_target(target_key, new_value, reason)**: change one of Josh's daily targets (water_oz, sat_fat_g_ceiling, daily_cal, protein_g, fat_g_target, fiber_g, sleep_target_hours). Mutates personal_profile.computed_targets and writes an audit row.
- **update_profile(field, new_value, reason)**: change one of Josh's profile fields (foods_avoided, foods_disliked, cuisines_loved, eating_window_start, eating_window_end, sleep_target_hours, typical_bedtime, primary_goal, target_weight_lbs, target_deadline, weekly_loss_rate_lbs).
- **revert_target_change(change_id)**: undo a prior change by id (you'll usually only call this if Josh asks you to).
- **propose_experiment(title, hypothesis, category, decision_summary, primary_metric, duration_days, success_criteria, target_change_id?, baseline_snapshot?)**: create a structured N=1 experiment that tracks whether a decision delivered the predicted outcome. Use whenever you propose a target change worth testing OR when Josh wants to try something lifestyle-shaped ("eat dinner by 7pm for 2 weeks"). target_change_id is set to the change_id you just got from update_target so the change and experiment are linked.
- **complete_experiment(id, verdict, verdict_notes, end_value?)**: mark an experiment as ended with a verdict. Use when an experiment's end_date has arrived and you and Josh are reviewing the outcome.
- **abandon_experiment(id, reason)**: end an experiment early without a verdict. Use when Josh wants to stop the test for any reason (life event, doesn't feel right).
- **dismiss_pattern(id, reason?)**: mark a detected pattern as dismissed so it stops surfacing on the Today page. Use after you've discussed it AND either turned it into an experiment OR Josh has decided it's not worth acting on right now. Don't dismiss patterns just because they were read — only when there's a real outcome.
- **save_sage_observation(body, tags?, confidence?, evidence_refs?)**: write a long-term note about Josh that future-you (in another session) should know. Use SPARINGLY — only durable observations, not in-the-moment specifics. Examples worth saving: "Skips workouts when sleep < 6h (correlation across 4 weeks)" / "Salmon dishes always log loved" / "Mid-week dinners run 200+ cal over plan." Do NOT save: today's macros, this week's weight, conversation summary.
- **archive_sage_observation(id, reason?)**: mark an observation as no longer relevant (e.g. when fresh data refutes it).

Call tools whenever you need data. Don't guess. If Josh asks "what should I eat for dinner" and you don't already know his targets + remaining macros, call read_targets and read_meal_log first.

# RESPONSE STYLE

- Direct, specific, evidence-based. Reference his actual numbers.
- First person ("I'd order the sirloin" / "I'd skip dessert today")
- Conversational but informed — you know his data, sound like it.
- No buzzwords, no cheerleading, no em dashes inside sentences (use commas/periods).
- When making a recommendation, tie it to specific numbers (calorie budget, sat fat ceiling, protein target).
- When there's a tradeoff (e.g. "this dish is over your sat fat for the day"), flag it explicitly with the alternative.
- It's OK to say "I don't know" or "I'd need more info" — better than guessing.

# WHAT NOT TO DO

- Don't make medical diagnoses ("you have X condition"). Flag markers, don't diagnose.
- Don't give exercise advice that contradicts his listed injuries (read_profile if uncertain).
- Don't override his goals — you can suggest a tighter approach, but his goals are his.
- Don't be sycophantic. He doesn't need "great question!" — just answer.
- If a tool returns an error or empty result, tell Josh honestly and ask what's missing.

# DISCUSSING DETECTED PATTERNS

When Josh starts a message with "Tell me about: …" or asks "what have you noticed?", a pattern was likely tapped on the Today page. Pattern surface protocol:

1. Call read_patterns_detected to load undismissed patterns. Find the one matching Josh's prompt (by title or topic).
2. **Explain it in your own words first** — don't just paraphrase the title. Cite the evidence_data numbers. Tie it to his profile/concerns when relevant ("the weight stall matters more during a cut because muscle loss accelerates").
3. **Offer the next step.** If suggested_experiment is present, propose it (with a hypothesis frame). If not, suggest 1-2 actions Josh could take or things to investigate.
4. **Wait for Josh's response.** Don't auto-create an experiment. Don't auto-dismiss the pattern. Both are explicit confirmations from him.
5. **Once acted on**, dismiss the pattern with dismiss_pattern so it stops surfacing. The reason field on dismiss should reference the experiment_id created OR Josh's stated decision ("declined this round").

If multiple patterns are active and Josh asks generically ("what have you noticed?"), summarize the top 2-3 by severity in one paragraph each. Don't dump everything.

# EXPERIMENT-FIRST THINKING

When Josh's data points to a meaningful target or behavior change, frame the recommendation as an EXPERIMENT, not just an edit. Coaches who get results think in hypotheses + measurable outcomes, not "rules that should work in general."

Pair every testable target change with an experiment:

1. State the **hypothesis** explicitly: "If I lower sat fat to 14g, your LDL will drop to ≤130 by your next draw."
2. Pick ONE **primary_metric** that proves or refutes the hypothesis (ldl_mg_dl, weight_body_mass, hrv_14d_avg, sleep_7d_avg, etc.). Other metrics can sit in baseline_snapshot for context.
3. Pick a **duration** that matches the metric's response time:
   - Bloodwork outcomes: 60-90 days (the next draw)
   - Weight: 14-30 days
   - HRV / sleep: 14-21 days
   - Adherence-only outcomes (e.g. "stay under sat fat ceiling 6/7 days"): 7-14 days
4. State **success_criteria** numerically. "LDL ≤130 mg/dL" beats "LDL improves." If the criterion is a comparison ("HRV up ≥10% from current 7-day avg"), include the current value so the answer is unambiguous later.
5. When the change is also a target/profile mutation: after Josh confirms, call update_target FIRST to get a change_id, then call propose_experiment with that change_id so the audit chain links the experiment to the underlying edit.
6. For lifestyle experiments without a target mutation ("eat dinner by 7pm for 14 days"), call propose_experiment with target_change_id omitted. The decision_summary captures what's changing.

Don't experiment on everything. Save the structure for changes where the outcome matters and you'd want to verify it worked. A small water-target tweak doesn't need an experiment; a sat-fat ceiling change driven by elevated LDL does.

When read_active_experiments shows experiments mid-flight, factor them in. Don't propose a conflicting experiment. Don't propose ANY new change to a metric another experiment is testing — wait for that to complete.

# DECISION PROTOCOL — propose-first for target/profile changes

This is the single most important rule: **never call update_target, update_profile, or revert_target_change without Josh saying yes first.** The pattern is:

1. **Diagnose with reads.** Pull whatever you need (read_targets, read_active_concerns, read_recent_metrics, read_target_changes).
2. **Propose in plain language.** State the current value, the new value, and why. Quote the constraint or data driving the change.
3. **Wait.** End your turn. Do NOT call the write tool yet.
4. **On the next turn, if Josh confirms** ("yes" / "do it" / "go ahead" / "make the change") → call the tool, then confirm in one sentence what you changed.
5. **If Josh modifies the proposal** ("make it 14 not 12") → propose the modified version, wait again. Don't infer consent from a counter-proposal.

Concrete example:

  Josh: "I've been drinking more water lately, can you check?"
  You: [call read_recent_metrics] [call read_targets] "Your water target is 96oz. You averaged 72oz the last 7 days you logged. Want me to lower the target to 80oz so it's a closer stretch goal, or keep it at 96 and we work toward it?"
  Josh: "lower to 80"
  You: [call update_target("water_oz", 80, "Josh asked to lower from 96 because he was averaging 72 the last week.")] "Done. Water target is now 80oz/day."

Counter-example (DON'T do this):

  Josh: "I've been drinking more water"
  You: [call update_target("water_oz", 100, ...)] "I bumped your target to 100oz."   ← WRONG. No proposal. No confirmation.

Logging is different — log_meal and log_metric are silent. "Log my weight 178" → just call log_metric and confirm in one sentence. Don't ask permission to record data.

# CRITICAL TOOL-LOOP RULES (prevent infinite loops)

- After calling **log_meal** or **log_metric** and getting a successful result (ok: true), CONFIRM TO JOSH (e.g. "Logged: 178 lbs, +0.3 from last reading.") and STOP. Do NOT call the same write tool again in the same response. Do NOT call additional tools to "verify" — trust the result.
- After calling **update_target** or **update_profile** successfully, CONFIRM in one sentence and STOP. Do not re-read the target to verify the write took.
- After calling any tool that returns an **error**, tell Josh exactly what the error said in plain language and ASK HIM what to do. Do NOT silently retry the same tool with different inputs.
- Maximum 4 tools per single response. If you find yourself reaching for a 5th tool, stop and answer with what you have.
- Each unique tool should be called at most ONCE per response unless Josh explicitly asks for multiple lookups.`

// ── Tool schemas ────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'fetch_url',
    description: 'Fetch a webpage and return its plain-text content. Use for restaurant menus, recipes, news articles, anything Josh shares a URL for. Strips HTML, caps at ~200KB.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL starting with https://' },
      },
      required: ['url'],
    },
  },
  {
    name: 'read_targets',
    description: 'Pull Josh\'s calculated daily targets (calories, protein, fat, sat fat ceiling, carbs, fiber, water). Always check before recommending food quantities.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_active_concerns',
    description: 'Pull bloodwork-derived active concerns (e.g. LDL high → sat fat ceiling 14g). Use as hard constraints when recommending food.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_recent_metrics',
    description: 'Pull last N days of Apple Health metrics: sleep, HRV, weight, steps, workout days. Use for recovery / energy / trend reasoning.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'How many days back (1-30). Default 7.' },
      },
    },
  },
  {
    name: 'read_weekly_plan',
    description: 'Pull this week\'s planned meals + workouts. Use when something is about to replace a planned item, or when assessing how today\'s plan looks.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_meal_log',
    description: 'Pull meals Josh has logged (with macro estimates). Default 1 day (today only). Use higher days for trend questions ("am I averaging 180g protein?").',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'How many days back including today (1-30). Default 1.' },
      },
    },
  },
  {
    name: 'read_target_changes',
    description: 'Pull recent target/profile changes (yours and manual). Use when Josh asks "what did you change?" or to avoid duplicating a change you already proposed.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max rows (1-50). Default 10.' },
      },
    },
  },
  {
    name: 'read_profile',
    description: 'Pull Josh\'s profile: foods avoided/disliked, cuisines loved, injuries, equipment, eating window, cooking skill.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'log_meal',
    description: 'Save a meal Josh ate to his log. ALWAYS provide estimated macros from the description (calories, protein, fat, sat fat). Sage estimates these based on typical portions of the foods named.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What Josh said he ate, in his words. e.g. "7oz sirloin, side salad, broccoli at Longhorn"' },
        meal_slot:   { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
        estimated_cal:        { type: 'number' },
        estimated_protein_g:  { type: 'number' },
        estimated_fat_g:      { type: 'number' },
        estimated_sat_fat_g:  { type: 'number' },
        estimated_carbs_g:    { type: 'number' },
      },
      required: ['description', 'estimated_cal', 'estimated_protein_g'],
    },
  },
  {
    name: 'read_ingredient_prefs',
    description: 'Pull the current learned ingredient verdicts (never_again, caution, loved) that influence weekly plan generation.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'submit_meal_feedback',
    description: 'Record Josh\'s reaction to a meal from one of his plans. Use when Josh mentions a meal from his plan ("the salmon was meh", "loved the chili"). Source is auto-set to "chat". When reaction is never_again or loved AND flagged_ingredient is provided, this also updates personal_ingredient_prefs so Sage uses the learning in the next plan.',
    input_schema: {
      type: 'object',
      properties: {
        plan_id:           { type: 'string', description: 'The plan id (from read_weekly_plan).' },
        day_idx:           { type: 'number', description: '0-based index into the plan window. Mon=0 for a Mon-start week.' },
        meal_slot:         { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snacks'] },
        meal_name:         { type: 'string', description: 'Optional. Snapshot of the meal name at feedback time.' },
        reaction:          { type: 'string', enum: ['loved', 'liked', 'neutral', 'never_again'] },
        reason_category:   { type: 'string', enum: ['taste', 'ingredient', 'prep_effort', 'portion', 'not_my_thing', 'other'] },
        flagged_ingredient:{ type: 'string', description: 'If the issue was one ingredient, name it. Used to update ingredient prefs.' },
        notes:             { type: 'string' },
      },
      required: ['plan_id', 'day_idx', 'meal_slot', 'reaction'],
    },
  },
  {
    name: 'log_metric',
    description: 'Record a single observation to the metrics table. Use for things Apple Health does not auto-track or that Josh tells you directly. Allowed metric_type values: weight_body_mass (lbs), water_intake (oz), blood_pressure_systolic (mmHg), blood_pressure_diastolic (mmHg), body_fat_pct, mood_rating (1-10), waist_inches, resting_heart_rate (bpm). Source is set to "sage" automatically.',
    input_schema: {
      type: 'object',
      properties: {
        metric_type: {
          type: 'string',
          enum: [
            'weight_body_mass', 'water_intake', 'blood_pressure_systolic', 'blood_pressure_diastolic',
            'body_fat_pct', 'mood_rating', 'waist_inches', 'resting_heart_rate',
          ],
        },
        value: { type: 'number' },
        unit: { type: 'string', description: 'Optional. Inferred from metric_type if omitted.' },
        recorded_at: { type: 'string', description: 'Optional ISO timestamp. Defaults to now.' },
      },
      required: ['metric_type', 'value'],
    },
  },
  {
    name: 'update_target',
    description: 'PROPOSAL-REQUIRED. Change one of Josh\'s daily targets in personal_profile.computed_targets. NEVER call without Josh first confirming the proposal in the previous turn. Allowed target_key values: water_oz, sat_fat_g_ceiling, daily_cal, protein_g, fat_g_target, fiber_g, sleep_target_hours.',
    input_schema: {
      type: 'object',
      properties: {
        target_key: {
          type: 'string',
          enum: ['water_oz', 'sat_fat_g_ceiling', 'daily_cal', 'protein_g', 'fat_g_target', 'fiber_g', 'sleep_target_hours'],
        },
        new_value: { type: 'number' },
        reason: { type: 'string', description: 'Plain-language reason this change is being made (1-2 sentences). Stored on the audit row.' },
      },
      required: ['target_key', 'new_value', 'reason'],
    },
  },
  {
    name: 'update_profile',
    description: 'PROPOSAL-REQUIRED. Change one safe field on Josh\'s profile. NEVER call without Josh first confirming the proposal. Allowed field values: foods_avoided, foods_disliked, cuisines_loved, eating_window_start, eating_window_end, sleep_target_hours, typical_bedtime, primary_goal, target_weight_lbs, target_deadline, weekly_loss_rate_lbs.',
    input_schema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: [
            'foods_avoided', 'foods_disliked', 'cuisines_loved',
            'eating_window_start', 'eating_window_end',
            'sleep_target_hours', 'typical_bedtime',
            'primary_goal', 'target_weight_lbs', 'target_deadline', 'weekly_loss_rate_lbs',
          ],
        },
        new_value: { description: 'New value. Strings for text fields, numbers for numeric, arrays of strings for foods_*/cuisines_loved.' },
        reason: { type: 'string' },
      },
      required: ['field', 'new_value', 'reason'],
    },
  },
  {
    name: 'revert_target_change',
    description: 'Undo a previous target/profile change by id (from read_target_changes). Restores old_value and chains the reversal as a new audit row.',
    input_schema: {
      type: 'object',
      properties: {
        change_id: { type: 'string', description: 'The id from a prior personal_target_changes row.' },
      },
      required: ['change_id'],
    },
  },
  {
    name: 'read_active_experiments',
    description: "List Josh's currently-running N=1 experiments (status='active') with hypothesis, primary metric, success criteria, end date, days remaining.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'propose_experiment',
    description: 'Create a structured experiment that tracks whether a decision delivered the predicted outcome. Use after Josh confirms a target change worth testing, or for lifestyle experiments without a target mutation. Sets status=active, baseline snapshot captured now.',
    input_schema: {
      type: 'object',
      properties: {
        title:            { type: 'string', description: 'Short label, e.g. "Lower sat fat to 14g/day"' },
        hypothesis:       { type: 'string', description: '"If I do X, then Y will happen" — what you expect to observe.' },
        category:         { type: 'string', enum: ['nutrition', 'sleep', 'activity', 'hydration', 'supplement', 'recovery', 'other'] },
        decision_summary: { type: 'string', description: 'What changed. e.g. "Set sat_fat_g_ceiling from 20g to 14g". For lifestyle: "Move dinner to before 7pm."' },
        primary_metric:   { type: 'string', description: "One metric that proves/refutes. Common: ldl_mg_dl, weight_body_mass, hrv_14d_avg, sleep_7d_avg, a1c_pct, triglycerides_mg_dl, mood_rating, water_intake_oz_avg." },
        duration_days:    { type: 'number', description: '1-365. Match metric response time.' },
        success_criteria: { type: 'string', description: '"LDL ≤130 mg/dL at next draw" — numeric and unambiguous.' },
        target_change_id: { type: 'string', description: 'Optional — the change_id from a just-completed update_target/update_profile call.' },
        baseline_snapshot:{ type: 'object', description: 'Optional richer baseline ({ldl: 168, hdl: 52}). If omitted, the function snapshots primary_metric from current data.' },
      },
      required: ['title', 'hypothesis', 'category', 'decision_summary', 'primary_metric', 'duration_days', 'success_criteria'],
    },
  },
  {
    name: 'complete_experiment',
    description: "End an experiment with a verdict. Use when end_date arrived and you and Josh are reviewing the result. Captures end_snapshot from current data.",
    input_schema: {
      type: 'object',
      properties: {
        id:            { type: 'string' },
        verdict:       { type: 'string', enum: ['confirmed', 'partial', 'refuted', 'inconclusive'] },
        verdict_notes: { type: 'string', description: '1-3 sentences on what happened and why you read it that way.' },
        end_value:     { type: 'number', description: 'Optional — explicit end value if you have one Josh told you about (e.g. new bloodwork LDL).' },
      },
      required: ['id', 'verdict', 'verdict_notes'],
    },
  },
  {
    name: 'abandon_experiment',
    description: 'End an experiment early without a verdict. Use when Josh wants to stop the test for any reason.',
    input_schema: {
      type: 'object',
      properties: {
        id:     { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['id', 'reason'],
    },
  },
  {
    name: 'read_patterns_detected',
    description: "List patterns flagged by the nightly detector. Returns title, severity, evidence_summary, and a suggested_experiment template when one was generated.",
    input_schema: {
      type: 'object',
      properties: {
        include_dismissed: { type: 'boolean', description: 'Default false. Set true to also see patterns Josh has already dismissed.' },
      },
    },
  },
  {
    name: 'dismiss_pattern',
    description: 'Mark a detected pattern as dismissed so it stops surfacing on the Today page. Call AFTER acting on it (created an experiment OR Josh declined).',
    input_schema: {
      type: 'object',
      properties: {
        id:     { type: 'string', description: 'The pattern id from read_patterns_detected.' },
        reason: { type: 'string', description: 'Optional — what was decided ("converted to experiment X" or "declined").' },
      },
      required: ['id'],
    },
  },
  {
    name: 'read_sage_observations',
    description: "Pull Josh's long-term observations you've persisted across sessions.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'save_sage_observation',
    description: "Persist a long-term observation about Josh. Use sparingly — durable patterns only, not in-the-moment specifics.",
    input_schema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: '1-3 sentences max. The observation itself.' },
        tags: { type: 'array', items: { type: 'string' }, description: "Free-form tags ['nutrition', 'breakfast']." },
        confidence: { type: 'string', enum: ['hunch', 'pattern', 'confirmed'], description: "Default 'pattern'." },
        evidence_refs: { type: 'array', items: { type: 'object' }, description: 'Optional links to pattern/experiment ids that drove this.' },
      },
      required: ['body'],
    },
  },
  {
    name: 'archive_sage_observation',
    description: 'Mark an observation as archived (no longer relevant). Use when fresh data refutes it OR Josh disagrees.',
    input_schema: {
      type: 'object',
      properties: {
        id:     { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['id'],
    },
  },
]

// ── Tool implementations ────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function execTool(name: string, input: any, admin: any, userId: string): Promise<unknown> {
  switch (name) {
    case 'fetch_url': {
      const url = String(input.url ?? '').trim()
      if (!url.startsWith('http')) return { error: 'URL must start with http:// or https://' }
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 12_000)
        const res = await fetch(url, {
          headers: {
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
          },
          signal: controller.signal,
          redirect: 'follow',
        })
        clearTimeout(timeout)
        if (!res.ok) return { error: `Fetch failed: ${res.status} ${res.statusText}` }
        const ct = res.headers.get('content-type') ?? ''
        const text = await res.text()
        const truncated = text.slice(0, MAX_FETCH_BYTES)
        // Strip HTML if response is HTML — quick + dirty regex pass.
        let body = truncated
        if (/text\/html|application\/xhtml/i.test(ct)) {
          body = truncated
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim()
        }
        return {
          url,
          content_type: ct,
          extracted_length: body.length,
          truncated_at_bytes: text.length > MAX_FETCH_BYTES,
          body: body.slice(0, MAX_FETCH_BYTES),
        }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    }

    case 'read_targets': {
      const { data } = await admin
        .from('personal_profile').select('computed_targets').eq('user_id', userId).maybeSingle()
      const t = (data as { computed_targets: unknown } | null)?.computed_targets
      if (!t) return { error: 'No profile / targets on file. Tell Josh to complete onboarding.' }
      return t
    }

    case 'read_active_concerns': {
      const { data: bw } = await admin
        .from('personal_bloodwork_panels').select('drawn_at, markers')
        .eq('user_id', userId).order('drawn_at', { ascending: false }).limit(1).maybeSingle()
      if (!bw) return { error: 'No bloodwork panels on file.' }
      const m = (bw as { markers: Record<string, number> }).markers
      const concerns: { label: string; value: string; range: string; constraint: string }[] = []
      if (typeof m.ldl_mg_dl === 'number' && m.ldl_mg_dl > 130) {
        concerns.push({
          label: 'LDL high', value: `${m.ldl_mg_dl} mg/dL`, range: '<130',
          constraint: 'Saturated fat <20g/day; tighter if LDL ≥160. Swap butter→olive oil, red meat ≤2x/week.',
        })
      }
      if (typeof m.a1c_pct === 'number' && m.a1c_pct >= 5.7) {
        concerns.push({
          label: 'A1C elevated', value: `${m.a1c_pct}%`, range: '<5.7',
          constraint: 'Lower-GI carbs, no added sugar, fiber up.',
        })
      }
      if (typeof m.triglycerides_mg_dl === 'number' && m.triglycerides_mg_dl > 150) {
        concerns.push({
          label: 'Triglycerides high', value: `${m.triglycerides_mg_dl} mg/dL`, range: '<150',
          constraint: 'Refined-carb ceiling, alcohol moderation.',
        })
      }
      if (typeof m.vit_d_ng_ml === 'number' && m.vit_d_ng_ml < 30) {
        concerns.push({
          label: 'Vitamin D low', value: `${m.vit_d_ng_ml} ng/mL`, range: '>30',
          constraint: 'Continue 2k IU/day + sunlight exposure.',
        })
      }
      return { drawn_at: (bw as { drawn_at: string }).drawn_at, concerns }
    }

    case 'read_recent_metrics': {
      const days = Math.max(1, Math.min(30, Number(input.days ?? 7)))
      const since = new Date()
      since.setDate(since.getDate() - days)
      since.setHours(0, 0, 0, 0)
      const sinceIso = since.toISOString()

      async function fetchSeries(metric: string) {
        const { data } = await admin
          .from('personal_metrics').select('value, recorded_at')
          .eq('metric_type', metric).gte('recorded_at', sinceIso)
          .order('recorded_at', { ascending: false })
        return ((data ?? []) as { value: number | string; recorded_at: string }[])
          .map((r) => ({ value: Number(r.value), recorded_at: r.recorded_at }))
      }

      const [sleep, hrv, weight, steps, exercise] = await Promise.all([
        fetchSeries('sleep_asleep'),
        fetchSeries('heart_rate_variability'),
        fetchSeries('weight_body_mass'),
        fetchSeries('step_count'),
        fetchSeries('apple_exercise_time'),
      ])

      const sleepAvg = sleep.length > 0 ? Number((sleep.reduce((s, r) => s + r.value, 0) / sleep.length).toFixed(1)) : null
      const hrvAvg = hrv.length > 0 ? Math.round(hrv.reduce((s, r) => s + r.value, 0) / hrv.length) : null
      const weightLatest = weight[0]?.value ?? null
      const weightOldest = weight[weight.length - 1]?.value ?? null
      const stepsByDay = new Map<string, number>()
      for (const r of steps) {
        const d = r.recorded_at.slice(0, 10)
        stepsByDay.set(d, (stepsByDay.get(d) ?? 0) + r.value)
      }
      const stepsAvg = stepsByDay.size > 0 ? Math.round(Array.from(stepsByDay.values()).reduce((s, v) => s + v, 0) / stepsByDay.size) : null
      const exerciseByDay = new Map<string, number>()
      for (const r of exercise) {
        const d = r.recorded_at.slice(0, 10)
        exerciseByDay.set(d, (exerciseByDay.get(d) ?? 0) + r.value)
      }
      let workoutDays = 0
      for (const v of exerciseByDay.values()) if (v >= 20) workoutDays++

      return {
        days_back: days,
        sleep: { avg_hours: sleepAvg, last_night_hours: sleep[0]?.value ?? null, sample_count: sleep.length },
        hrv: { avg_ms: hrvAvg, today_ms: hrv[0]?.value ?? null, sample_count: hrv.length },
        weight: { latest_lbs: weightLatest, oldest_lbs_in_window: weightOldest, change_lbs: weightLatest != null && weightOldest != null ? Number((weightLatest - weightOldest).toFixed(1)) : null },
        steps: { avg_per_day: stepsAvg, sample_count: stepsByDay.size },
        workouts: { days_with_20min_plus: workoutDays },
      }
    }

    case 'read_weekly_plan': {
      const { data } = await admin
        .from('personal_weekly_plans').select('*')
        .eq('user_id', userId).order('week_starting', { ascending: false }).limit(1).maybeSingle()
      if (!data) return { error: 'No weekly plan on file. Tell Josh to generate one on the Plan tab.' }
      const today = new Date().toISOString().slice(0, 10)
      const todaySlice = (data as { days: { date: string }[] }).days.find((d) => d.date === today)
      return {
        week_starting: (data as { week_starting: string }).week_starting,
        approved: (data as { approved_at: string | null }).approved_at != null,
        today_slice: todaySlice ?? null,
        full_week: (data as { days: unknown }).days,
        strategy: (data as { strategy: string | null }).strategy,
      }
    }

    case 'read_meal_log': {
      const days = Math.max(1, Math.min(30, Number(input.days ?? 1)))
      const since = new Date()
      since.setDate(since.getDate() - (days - 1))
      since.setHours(0, 0, 0, 0)
      const { data } = await admin
        .from('personal_meal_log')
        .select('id, logged_at, description, meal_slot, estimated_cal, estimated_protein_g, estimated_fat_g, estimated_sat_fat_g, estimated_carbs_g, source')
        .eq('user_id', userId)
        .gte('logged_at', since.toISOString())
        .order('logged_at', { ascending: true })
      const rows = (data ?? []) as Array<{
        logged_at: string
        estimated_cal: number | null
        estimated_protein_g: number | null
        estimated_fat_g: number | null
        estimated_sat_fat_g: number | null
        estimated_carbs_g: number | null
      }>
      // Today totals (always useful for "remaining macros today" questions)
      const todayKey = new Date().toISOString().slice(0, 10)
      const todayRows = rows.filter((r) => r.logged_at.slice(0, 10) === todayKey)
      const todayTotals = {
        cal: todayRows.reduce((s, r) => s + (r.estimated_cal ?? 0), 0),
        protein_g: todayRows.reduce((s, r) => s + (r.estimated_protein_g ?? 0), 0),
        fat_g: todayRows.reduce((s, r) => s + (r.estimated_fat_g ?? 0), 0),
        sat_fat_g: todayRows.reduce((s, r) => s + (r.estimated_sat_fat_g ?? 0), 0),
      }
      // Window totals (for trend questions)
      const windowTotals = {
        cal: rows.reduce((s, r) => s + (r.estimated_cal ?? 0), 0),
        protein_g: rows.reduce((s, r) => s + (r.estimated_protein_g ?? 0), 0),
        fat_g: rows.reduce((s, r) => s + (r.estimated_fat_g ?? 0), 0),
        sat_fat_g: rows.reduce((s, r) => s + (r.estimated_sat_fat_g ?? 0), 0),
      }
      return {
        days_back: days,
        meals: rows,
        totals_so_far_today: todayTotals,
        totals_window: windowTotals,
        avg_per_day: days > 1 ? {
          cal: Math.round(windowTotals.cal / days),
          protein_g: Math.round(windowTotals.protein_g / days),
          fat_g: Math.round(windowTotals.fat_g / days),
          sat_fat_g: Math.round(windowTotals.sat_fat_g / days),
        } : null,
      }
    }

    case 'read_target_changes': {
      const limit = Math.max(1, Math.min(50, Number(input.limit ?? 10)))
      const { data, error: e } = await admin
        .from('personal_target_changes')
        .select('id, changed_at, scope, field_key, old_value, new_value, reason, source, reverted_at, reverted_by_id')
        .eq('user_id', userId)
        .order('changed_at', { ascending: false })
        .limit(limit)
      if (e) return { error: `read_target_changes: ${e.message}` }
      return { changes: data ?? [] }
    }

    case 'read_profile': {
      const { data } = await admin
        .from('personal_profile').select(`
          height_cm, age, sex_at_birth, primary_goal, target_weight_lbs, target_deadline,
          weekly_loss_rate_lbs, activity_level, workouts_per_week_target, preferred_split,
          preferred_workout_time, session_duration_min, foods_disliked, foods_avoided,
          cuisines_loved, eating_window_start, eating_window_end, cooking_skill,
          injuries, has_home_gym, home_equipment, has_commercial_gym
        `).eq('user_id', userId).maybeSingle()
      if (!data) return { error: 'No profile on file.' }
      return data
    }

    case 'log_meal': {
      const payload = {
        user_id: userId,
        description: String(input.description ?? '').trim(),
        meal_slot: input.meal_slot ?? null,
        estimated_cal: input.estimated_cal ?? null,
        estimated_protein_g: input.estimated_protein_g ?? null,
        estimated_fat_g: input.estimated_fat_g ?? null,
        estimated_sat_fat_g: input.estimated_sat_fat_g ?? null,
        estimated_carbs_g: input.estimated_carbs_g ?? null,
        source: 'chat',
      }
      const { data, error: e } = await admin
        .from('personal_meal_log').insert(payload).select('id').single()
      if (e) return { error: `Failed to log: ${e.message}` }
      return { ok: true, meal_id: (data as { id: string }).id, logged: payload }
    }

    case 'read_ingredient_prefs': {
      const { data, error: e } = await admin
        .from('personal_ingredient_prefs')
        .select('ingredient, verdict, reasons, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(200)
      if (e) return { error: `read_ingredient_prefs: ${e.message}` }
      const rows = (data ?? []) as { ingredient: string; verdict: string; reasons: string[] }[]
      return {
        loved: rows.filter((r) => r.verdict === 'loved').map((r) => r.ingredient),
        never_again: rows.filter((r) => r.verdict === 'never_again').map((r) => ({ ingredient: r.ingredient, reasons: r.reasons })),
        caution: rows.filter((r) => r.verdict === 'caution').map((r) => ({ ingredient: r.ingredient, reasons: r.reasons })),
      }
    }

    case 'submit_meal_feedback': {
      const planId = String(input.plan_id ?? '').trim()
      const dayIdx = Number(input.day_idx)
      const slot = String(input.meal_slot ?? '')
      const reaction = String(input.reaction ?? '')
      if (!planId) return { error: 'plan_id is required' }
      if (!Number.isFinite(dayIdx) || dayIdx < 0 || dayIdx > 30) return { error: 'day_idx must be 0-30' }
      if (!['breakfast', 'lunch', 'dinner', 'snacks'].includes(slot)) return { error: 'meal_slot must be breakfast/lunch/dinner/snacks' }
      if (!['loved', 'liked', 'neutral', 'never_again'].includes(reaction)) return { error: 'reaction must be loved/liked/neutral/never_again' }

      const row = {
        user_id: userId,
        plan_id: planId,
        day_idx: dayIdx,
        meal_slot: slot,
        meal_name: input.meal_name ?? null,
        reaction,
        reason_category: input.reason_category ?? null,
        flagged_ingredient: input.flagged_ingredient ?? null,
        notes: input.notes ?? null,
        source: 'chat',
      }
      const { data, error: e } = await admin
        .from('personal_meal_feedback').insert(row).select('id').single()
      if (e) return { error: `submit_meal_feedback failed: ${e.message}` }
      const feedbackId = (data as { id: string }).id

      // Side-effect: if reaction is strong + we know an ingredient, update
      // the derived verdict. Skip for neutral/liked — those don't carry
      // enough signal to change a verdict by themselves.
      const ingredient = (input.flagged_ingredient as string | undefined)?.trim().toLowerCase()
      if (ingredient && (reaction === 'never_again' || reaction === 'loved')) {
        const verdict = reaction === 'never_again' ? 'never_again' : 'loved'
        const { data: existing } = await admin
          .from('personal_ingredient_prefs')
          .select('id, evidence_ids, reasons')
          .eq('user_id', userId).eq('ingredient', ingredient).maybeSingle()
        const newReason = (input.reason_category ?? '') + (input.notes ? `: ${input.notes}` : '')
        const reasonsNext = newReason.trim()
          ? [newReason.trim(), ...(((existing as { reasons?: string[] } | null)?.reasons ?? []))].slice(0, 5)
          : (((existing as { reasons?: string[] } | null)?.reasons ?? []))
        const evidenceNext = [feedbackId, ...(((existing as { evidence_ids?: string[] } | null)?.evidence_ids ?? []))].slice(0, 5)
        if (existing) {
          await admin.from('personal_ingredient_prefs').update({
            verdict, evidence_ids: evidenceNext, reasons: reasonsNext,
          }).eq('id', (existing as { id: string }).id)
        } else {
          await admin.from('personal_ingredient_prefs').insert({
            user_id: userId, ingredient, verdict, evidence_ids: evidenceNext, reasons: reasonsNext,
          })
        }
      }

      return { ok: true, feedback_id: feedbackId, ingredient_pref_updated: !!ingredient && (reaction === 'never_again' || reaction === 'loved') }
    }

    case 'log_metric': {
      const ALLOWED = new Set([
        'weight_body_mass', 'water_intake', 'blood_pressure_systolic', 'blood_pressure_diastolic',
        'body_fat_pct', 'mood_rating', 'waist_inches', 'resting_heart_rate',
      ])
      const DEFAULT_UNIT: Record<string, string> = {
        weight_body_mass: 'lbs', water_intake: 'oz',
        blood_pressure_systolic: 'mmHg', blood_pressure_diastolic: 'mmHg',
        body_fat_pct: '%', mood_rating: 'rating', waist_inches: 'in', resting_heart_rate: 'bpm',
      }
      const metricType = String(input.metric_type ?? '')
      if (!ALLOWED.has(metricType)) {
        return { error: `metric_type must be one of: ${[...ALLOWED].join(', ')}` }
      }
      const value = Number(input.value)
      if (!Number.isFinite(value)) return { error: 'value must be a number' }
      const recordedAt = (() => {
        if (!input.recorded_at) return new Date().toISOString()
        const d = new Date(String(input.recorded_at))
        return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
      })()
      const row = {
        metric_type: metricType,
        value,
        unit: input.unit ?? DEFAULT_UNIT[metricType] ?? null,
        recorded_at: recordedAt,
        source: 'sage',
        raw_payload: { logged_via: 'ask-sage', user_input: input },
      }
      const { data, error: e } = await admin
        .from('personal_metrics').insert(row).select('id').single()
      if (e) return { error: `log_metric failed: ${e.message}` }
      return { ok: true, metric_id: (data as { id: string }).id, logged: row }
    }

    case 'update_target': {
      const ALLOWED = new Set([
        'water_oz', 'sat_fat_g_ceiling', 'daily_cal', 'protein_g',
        'fat_g_target', 'fiber_g', 'sleep_target_hours',
      ])
      const key = String(input.target_key ?? '')
      if (!ALLOWED.has(key)) {
        return { error: `target_key must be one of: ${[...ALLOWED].join(', ')}` }
      }
      const newValue = Number(input.new_value)
      if (!Number.isFinite(newValue)) return { error: 'new_value must be a number' }
      const reason = String(input.reason ?? '').trim()
      if (!reason) return { error: 'reason is required (1-2 sentences explaining why)' }

      // Read current targets so we have old_value for the audit row.
      const { data: profile } = await admin
        .from('personal_profile').select('computed_targets').eq('user_id', userId).maybeSingle()
      const targets = ((profile as { computed_targets: Record<string, unknown> } | null)?.computed_targets) ?? {}
      const oldValue = targets[key] ?? null

      // Audit row first — if it fails we never mutate the profile.
      const { data: audit, error: auditErr } = await admin
        .from('personal_target_changes').insert({
          user_id: userId, scope: 'target', field_key: key,
          old_value: oldValue, new_value: newValue, reason, source: 'sage',
        }).select('id').single()
      if (auditErr) return { error: `audit log failed: ${auditErr.message}` }

      const nextTargets = { ...targets, [key]: newValue, updated_at: new Date().toISOString() }
      const { error: upErr } = await admin
        .from('personal_profile').update({ computed_targets: nextTargets }).eq('user_id', userId)
      if (upErr) return { error: `update_target write failed: ${upErr.message}`, audit_id: (audit as { id: string }).id }
      return {
        ok: true,
        change_id: (audit as { id: string }).id,
        target_key: key,
        old_value: oldValue,
        new_value: newValue,
      }
    }

    case 'update_profile': {
      const ALLOWED = new Set([
        'foods_avoided', 'foods_disliked', 'cuisines_loved',
        'eating_window_start', 'eating_window_end',
        'sleep_target_hours', 'typical_bedtime',
        'primary_goal', 'target_weight_lbs', 'target_deadline', 'weekly_loss_rate_lbs',
      ])
      const field = String(input.field ?? '')
      if (!ALLOWED.has(field)) {
        return { error: `field must be one of: ${[...ALLOWED].join(', ')}` }
      }
      const reason = String(input.reason ?? '').trim()
      if (!reason) return { error: 'reason is required (1-2 sentences explaining why)' }
      const newValue = input.new_value

      // Read current value for the audit row.
      const { data: profile } = await admin
        .from('personal_profile').select(field).eq('user_id', userId).maybeSingle()
      // deno-lint-ignore no-explicit-any
      const oldValue = (profile as any)?.[field] ?? null

      const { data: audit, error: auditErr } = await admin
        .from('personal_target_changes').insert({
          user_id: userId, scope: 'profile', field_key: field,
          old_value: oldValue, new_value: newValue, reason, source: 'sage',
        }).select('id').single()
      if (auditErr) return { error: `audit log failed: ${auditErr.message}` }

      const { error: upErr } = await admin
        .from('personal_profile').update({ [field]: newValue }).eq('user_id', userId)
      if (upErr) return { error: `update_profile write failed: ${upErr.message}`, audit_id: (audit as { id: string }).id }
      return {
        ok: true,
        change_id: (audit as { id: string }).id,
        field,
        old_value: oldValue,
        new_value: newValue,
      }
    }

    case 'read_active_experiments': {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error: e } = await admin
        .from('personal_experiments')
        .select('id, title, hypothesis, category, decision_summary, primary_metric, start_date, duration_days, end_date, baseline_value, success_criteria, status')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('end_date', { ascending: true })
      if (e) return { error: `read_active_experiments: ${e.message}` }
      const rows = (data ?? []) as Array<{ end_date: string; start_date: string; [k: string]: unknown }>
      const withDays = rows.map((r) => {
        const endMs = new Date(r.end_date + 'T00:00:00').getTime()
        const todayMs = new Date(today + 'T00:00:00').getTime()
        const daysRemaining = Math.ceil((endMs - todayMs) / (24 * 60 * 60 * 1000))
        return { ...r, days_remaining: daysRemaining, ready_for_verdict: daysRemaining <= 0 }
      })
      return { experiments: withDays }
    }

    case 'propose_experiment': {
      const title = String(input.title ?? '').trim()
      const hypothesis = String(input.hypothesis ?? '').trim()
      const category = String(input.category ?? '')
      const decisionSummary = String(input.decision_summary ?? '').trim()
      const primaryMetric = String(input.primary_metric ?? '').trim()
      const successCriteria = String(input.success_criteria ?? '').trim()
      const durationDays = Number(input.duration_days)
      if (!title || !hypothesis || !decisionSummary || !primaryMetric || !successCriteria) {
        return { error: 'title, hypothesis, decision_summary, primary_metric, success_criteria all required' }
      }
      if (!['nutrition', 'sleep', 'activity', 'hydration', 'supplement', 'recovery', 'other'].includes(category)) {
        return { error: 'category must be one of: nutrition, sleep, activity, hydration, supplement, recovery, other' }
      }
      if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 365) {
        return { error: 'duration_days must be between 1 and 365' }
      }

      // Snapshot the baseline. If primary_metric is something we can
      // pull from personal_metrics directly, grab a recent value/avg.
      let baselineValue: number | null = null
      const baselineSnapshot: Record<string, unknown> = (input.baseline_snapshot as Record<string, unknown> | undefined) ?? {}
      // Map of metric-key shortcuts to (metric_type, aggregation)
      const SNAPSHOT_QUERIES: Record<string, { metric: string; aggregation: 'latest' | 'avg7' | 'avg14' }> = {
        ldl_mg_dl:               { metric: 'ldl_mg_dl', aggregation: 'latest' },
        a1c_pct:                 { metric: 'a1c_pct', aggregation: 'latest' },
        triglycerides_mg_dl:     { metric: 'triglycerides_mg_dl', aggregation: 'latest' },
        weight_body_mass:        { metric: 'weight_body_mass', aggregation: 'latest' },
        hrv_14d_avg:             { metric: 'heart_rate_variability', aggregation: 'avg14' },
        sleep_7d_avg:            { metric: 'sleep_asleep', aggregation: 'avg7' },
        water_intake_oz_avg:     { metric: 'water_intake', aggregation: 'avg7' },
      }
      const q = SNAPSHOT_QUERIES[primaryMetric]
      if (q) {
        // Pull from personal_metrics
        const days = q.aggregation === 'avg14' ? 14 : 7
        const since = new Date()
        since.setDate(since.getDate() - days)
        since.setHours(0, 0, 0, 0)
        const { data: metricRows } = await admin
          .from('personal_metrics').select('value, recorded_at')
          .eq('metric_type', q.metric)
          .gte('recorded_at', since.toISOString())
          .order('recorded_at', { ascending: false })
        const rows = ((metricRows ?? []) as { value: number | string }[]).map((r) => Number(r.value))
        if (rows.length > 0) {
          if (q.aggregation === 'latest') baselineValue = rows[0]
          else baselineValue = rows.reduce((s, v) => s + v, 0) / rows.length
          baselineSnapshot[primaryMetric] = baselineValue
        }
      }
      // Also try bloodwork markers as a fallback for non-metric biomarkers
      if (baselineValue == null) {
        const { data: bw } = await admin
          .from('personal_bloodwork_panels').select('markers')
          .eq('user_id', userId).order('drawn_at', { ascending: false }).limit(1).maybeSingle()
        const markers = (bw as { markers?: Record<string, number> } | null)?.markers
        if (markers && typeof markers[primaryMetric] === 'number') {
          baselineValue = markers[primaryMetric]
          baselineSnapshot[primaryMetric] = baselineValue
        }
      }

      const row = {
        user_id: userId,
        title, hypothesis, category, decision_summary: decisionSummary,
        target_change_id: input.target_change_id ?? null,
        start_date: new Date().toISOString().slice(0, 10),
        duration_days: durationDays,
        primary_metric: primaryMetric,
        baseline_value: baselineValue,
        baseline_snapshot: baselineSnapshot,
        success_criteria: successCriteria,
        status: 'active' as const,
        source: 'sage' as const,
      }
      const { data, error: e } = await admin
        .from('personal_experiments').insert(row).select('id, end_date').single()
      if (e) return { error: `propose_experiment: ${e.message}` }
      return {
        ok: true,
        experiment_id: (data as { id: string }).id,
        end_date: (data as { end_date: string }).end_date,
        baseline_value: baselineValue,
      }
    }

    case 'complete_experiment': {
      const id = String(input.id ?? '').trim()
      const verdict = String(input.verdict ?? '')
      const verdictNotes = String(input.verdict_notes ?? '').trim()
      if (!id) return { error: 'id is required' }
      if (!['confirmed', 'partial', 'refuted', 'inconclusive'].includes(verdict)) {
        return { error: 'verdict must be confirmed/partial/refuted/inconclusive' }
      }
      if (!verdictNotes) return { error: 'verdict_notes is required (1-3 sentences)' }

      // Read the experiment so we know what to snapshot at end.
      const { data: exp, error: readErr } = await admin
        .from('personal_experiments').select('id, primary_metric, baseline_snapshot')
        .eq('id', id).eq('user_id', userId).maybeSingle()
      if (readErr) return { error: `complete_experiment read: ${readErr.message}` }
      if (!exp) return { error: 'experiment not found' }

      // Auto-capture end_snapshot the same way baselines work above.
      const e = exp as { primary_metric: string; baseline_snapshot: Record<string, unknown> }
      let endValue: number | null = typeof input.end_value === 'number' ? input.end_value : null
      const endSnapshot: Record<string, unknown> = {}
      if (endValue == null) {
        // Try to pull from metrics or bloodwork the same way
        const SNAPSHOT_QUERIES: Record<string, { metric: string; aggregation: 'latest' | 'avg7' | 'avg14' }> = {
          ldl_mg_dl: { metric: 'ldl_mg_dl', aggregation: 'latest' },
          a1c_pct: { metric: 'a1c_pct', aggregation: 'latest' },
          triglycerides_mg_dl: { metric: 'triglycerides_mg_dl', aggregation: 'latest' },
          weight_body_mass: { metric: 'weight_body_mass', aggregation: 'latest' },
          hrv_14d_avg: { metric: 'heart_rate_variability', aggregation: 'avg14' },
          sleep_7d_avg: { metric: 'sleep_asleep', aggregation: 'avg7' },
          water_intake_oz_avg: { metric: 'water_intake', aggregation: 'avg7' },
        }
        const q = SNAPSHOT_QUERIES[e.primary_metric]
        if (q) {
          const days = q.aggregation === 'avg14' ? 14 : 7
          const since = new Date(); since.setDate(since.getDate() - days); since.setHours(0, 0, 0, 0)
          const { data: rows } = await admin
            .from('personal_metrics').select('value, recorded_at')
            .eq('metric_type', q.metric)
            .gte('recorded_at', since.toISOString())
            .order('recorded_at', { ascending: false })
          const vals = ((rows ?? []) as { value: number | string }[]).map((r) => Number(r.value))
          if (vals.length > 0) {
            endValue = q.aggregation === 'latest' ? vals[0] : vals.reduce((s, v) => s + v, 0) / vals.length
          }
        }
        if (endValue == null) {
          const { data: bw } = await admin
            .from('personal_bloodwork_panels').select('markers')
            .eq('user_id', userId).order('drawn_at', { ascending: false }).limit(1).maybeSingle()
          const markers = (bw as { markers?: Record<string, number> } | null)?.markers
          if (markers && typeof markers[e.primary_metric] === 'number') {
            endValue = markers[e.primary_metric]
          }
        }
      }
      if (endValue != null) endSnapshot[e.primary_metric] = endValue

      const { error: upErr } = await admin.from('personal_experiments').update({
        status: 'completed',
        verdict, verdict_notes: verdictNotes,
        end_value: endValue, end_snapshot: endSnapshot,
        ended_at: new Date().toISOString(),
      } as never).eq('id', id)
      if (upErr) return { error: `complete_experiment: ${upErr.message}` }
      return { ok: true, experiment_id: id, end_value: endValue, verdict }
    }

    case 'read_patterns_detected': {
      const includeDismissed = Boolean(input.include_dismissed)
      let query = admin
        .from('personal_patterns_detected')
        .select('id, pattern_type, window_key, title, evidence_summary, evidence_data, severity, suggested_experiment, detected_at, dismissed_at, experiment_id')
        .eq('user_id', userId)
      if (!includeDismissed) query = query.is('dismissed_at', null)
      const { data, error: e } = await query.order('detected_at', { ascending: false }).limit(50)
      if (e) return { error: `read_patterns_detected: ${e.message}` }
      return { patterns: data ?? [] }
    }

    case 'dismiss_pattern': {
      const id = String(input.id ?? '').trim()
      if (!id) return { error: 'id is required' }
      const reason = String(input.reason ?? '').trim()
      const { error: e } = await admin
        .from('personal_patterns_detected')
        .update({ dismissed_at: new Date().toISOString() } as never)
        .eq('id', id).eq('user_id', userId)
      if (e) return { error: `dismiss_pattern: ${e.message}` }
      return { ok: true, pattern_id: id, reason: reason || null }
    }

    case 'read_sage_observations': {
      const { data, error: e } = await admin
        .from('personal_sage_observations')
        .select('id, body, tags, confidence, evidence_refs, set_at')
        .eq('user_id', userId).eq('status', 'active')
        .order('set_at', { ascending: false }).limit(50)
      if (e) return { error: `read_sage_observations: ${e.message}` }
      return { observations: data ?? [] }
    }

    case 'save_sage_observation': {
      const body = String(input.body ?? '').trim()
      if (!body) return { error: 'body is required' }
      const tags = Array.isArray(input.tags) ? input.tags.map((t: unknown) => String(t)) : []
      const confidence = ['hunch', 'pattern', 'confirmed'].includes(String(input.confidence)) ? input.confidence : 'pattern'
      const evidence = Array.isArray(input.evidence_refs) ? input.evidence_refs : []
      const { data, error: e } = await admin
        .from('personal_sage_observations').insert({
          user_id: userId, body, tags, confidence, evidence_refs: evidence,
        }).select('id').single()
      if (e) return { error: `save_sage_observation: ${e.message}` }
      return { ok: true, observation_id: (data as { id: string }).id }
    }

    case 'archive_sage_observation': {
      const id = String(input.id ?? '').trim()
      if (!id) return { error: 'id is required' }
      const { error: e } = await admin.from('personal_sage_observations').update({
        status: 'archived', archived_at: new Date().toISOString(),
      } as never).eq('id', id).eq('user_id', userId)
      if (e) return { error: `archive_sage_observation: ${e.message}` }
      return { ok: true, observation_id: id }
    }

    case 'abandon_experiment': {
      const id = String(input.id ?? '').trim()
      const reason = String(input.reason ?? '').trim()
      if (!id) return { error: 'id is required' }
      if (!reason) return { error: 'reason is required' }
      const { error: e } = await admin.from('personal_experiments').update({
        status: 'abandoned',
        verdict_notes: `Abandoned: ${reason}`,
        ended_at: new Date().toISOString(),
      } as never).eq('id', id).eq('user_id', userId)
      if (e) return { error: `abandon_experiment: ${e.message}` }
      return { ok: true, experiment_id: id }
    }

    case 'revert_target_change': {
      const changeId = String(input.change_id ?? '').trim()
      if (!changeId) return { error: 'change_id is required' }

      const { data: orig, error: readErr } = await admin
        .from('personal_target_changes')
        .select('id, scope, field_key, old_value, new_value, reverted_at')
        .eq('id', changeId).eq('user_id', userId).maybeSingle()
      if (readErr) return { error: `revert read failed: ${readErr.message}` }
      if (!orig) return { error: 'change_id not found' }
      const o = orig as { id: string; scope: string; field_key: string; old_value: unknown; new_value: unknown; reverted_at: string | null }
      if (o.reverted_at) return { error: 'that change was already reverted' }

      // Write the reversal row first (so the audit chain is visible
      // even if the mutation step then fails).
      const reversalReason = `Reverted change ${o.id} — restored ${o.field_key} to previous value`
      const { data: reversal, error: revInsertErr } = await admin
        .from('personal_target_changes').insert({
          user_id: userId, scope: o.scope, field_key: o.field_key,
          old_value: o.new_value, new_value: o.old_value,
          reason: reversalReason, source: 'sage',
        }).select('id').single()
      if (revInsertErr) return { error: `revert audit failed: ${revInsertErr.message}` }

      // Stamp the original as reverted.
      await admin.from('personal_target_changes')
        .update({ reverted_at: new Date().toISOString(), reverted_by_id: (reversal as { id: string }).id })
        .eq('id', o.id)

      // Apply the actual revert to the profile.
      if (o.scope === 'target') {
        const { data: profile } = await admin
          .from('personal_profile').select('computed_targets').eq('user_id', userId).maybeSingle()
        const targets = ((profile as { computed_targets: Record<string, unknown> } | null)?.computed_targets) ?? {}
        const nextTargets = { ...targets, [o.field_key]: o.old_value, updated_at: new Date().toISOString() }
        const { error: upErr } = await admin
          .from('personal_profile').update({ computed_targets: nextTargets }).eq('user_id', userId)
        if (upErr) return { error: `revert write failed: ${upErr.message}` }
      } else {
        // scope === 'profile'
        const { error: upErr } = await admin
          .from('personal_profile').update({ [o.field_key]: o.old_value }).eq('user_id', userId)
        if (upErr) return { error: `revert write failed: ${upErr.message}` }
      }

      return {
        ok: true,
        reverted_change_id: o.id,
        new_audit_id: (reversal as { id: string }).id,
        scope: o.scope, field_key: o.field_key, restored_to: o.old_value,
      }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ── Main: agent loop ──────────────────────────────────────────────

interface ToolCall {
  name: string
  input: unknown
  result: unknown
  duration_ms: number
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

  // Auth: admin JWT
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return json({ error: 'Missing authorization' }, 401)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401)
  const { data: caller } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle()
  if (!caller || (caller as { role: string }).role !== 'admin') return json({ error: 'Admin only' }, 403)
  const userId = userData.user.id

  // Body
  // deno-lint-ignore no-explicit-any
  let body: { messages: any[] }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: 'messages array required' }, 400)
  }

  // deno-lint-ignore no-explicit-any
  const messages: any[] = body.messages.slice()
  const toolTrace: ToolCall[] = []

  // Agent loop
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const anthropicBody = {
      model: MODEL,
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
    }

    const anthropicController = new AbortController()
    const anthropicTimeout = setTimeout(() => anthropicController.abort('timeout'), ANTHROPIC_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(anthropicBody),
        signal: anthropicController.signal,
      })
    } catch (err) {
      const wasTimeout = err instanceof DOMException && err.name === 'AbortError'
      return json({
        error: wasTimeout
          ? `Anthropic call timed out after ${ANTHROPIC_TIMEOUT_MS / 1000}s on turn ${turn + 1}`
          : `Anthropic fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        tool_trace: toolTrace,
      }, 504)
    } finally {
      clearTimeout(anthropicTimeout)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return json({ error: `Anthropic ${res.status}: ${text.slice(0, 500)}`, tool_trace: toolTrace }, 502)
    }

    const data = await res.json() as {
      // deno-lint-ignore no-explicit-any
      content: any[]
      stop_reason: string
      usage?: { input_tokens: number; output_tokens: number }
    }

    // Append assistant message to history
    messages.push({ role: 'assistant', content: data.content })

    // If no tool use, we're done — extract final text
    if (data.stop_reason !== 'tool_use') {
      // deno-lint-ignore no-explicit-any
      const textBlocks = data.content.filter((c: any) => c.type === 'text')
      // deno-lint-ignore no-explicit-any
      const finalText = textBlocks.map((b: any) => b.text).join('\n').trim()
      return json({
        assistant_text: finalText,
        tool_trace: toolTrace,
        stop_reason: data.stop_reason,
        usage: data.usage,
      })
    }

    // tool_use stop — execute the tool calls and feed results back
    // deno-lint-ignore no-explicit-any
    const toolUseBlocks = data.content.filter((c: any) => c.type === 'tool_use')
    // deno-lint-ignore no-explicit-any
    const toolResults: any[] = []
    for (const block of toolUseBlocks) {
      const start = Date.now()
      const result = await execTool(block.name, block.input, admin, userId)
      const duration = Date.now() - start
      toolTrace.push({ name: block.name, input: block.input, result, duration_ms: duration })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  // Hit the loop cap without a clean end_turn
  return json({
    assistant_text: '(Sage hit the tool-call cap before finishing — try rephrasing.)',
    tool_trace: toolTrace,
    stop_reason: 'max_turns',
  })
})
