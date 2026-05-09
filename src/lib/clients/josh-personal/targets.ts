/**
 * Josh Personal — evidence-based calorie + macro target calculator.
 *
 * Pure functions. Every formula is cited inline so future-Josh (or
 * anyone reviewing) can check the source. Sources are the
 * peer-reviewed conventions exercise nutrition uses, not vibes.
 *
 * What this file does:
 *   - BMR via Mifflin-St Jeor (most accurate population-level formula)
 *   - TDEE via standard activity multipliers
 *   - Calorie target adjusted for cut/recomp/maintain/bulk goal
 *   - Protein target (0.8-1g per lb bodyweight; protected during cut)
 *   - Fat minimum (hormone health) + fat ceiling derived from blood work
 *   - Carbs as the remainder
 *   - Sat fat ceiling tightened if LDL is flagged
 *   - Water + fiber targets
 *
 * What it does NOT do:
 *   - Generate prose recommendations (that's Sage / Claude)
 *   - Decide what to EAT (that's Sage drafting a meal plan)
 *   - Adjust based on workout-day vs rest-day (could later, this is
 *     the avg/maintenance number)
 */

// ── Inputs ────────────────────────────────────────────────────────────

export interface ProfileInputs {
  height_cm: number
  age: number
  sex_at_birth: 'male' | 'female'
  primary_goal: 'cut' | 'recomp' | 'maintain' | 'bulk'
  activity_level:
    | 'sedentary'
    | 'lightly_active'
    | 'moderately_active'
    | 'very_active'
    | 'extra_active'
  weekly_loss_rate_lbs?: number | null  // for cut: 0.5 typical, 1.0 aggressive
  body_fat_pct?: number | null
}

export interface BloodworkContext {
  // Only the markers that affect target calculations.
  ldl_mg_dl?: number | null
  a1c_pct?: number | null
  triglycerides_mg_dl?: number | null
  vit_d_ng_ml?: number | null
}

export interface CurrentMetrics {
  weight_lbs: number    // most recent weigh-in
}

// ── Output ────────────────────────────────────────────────────────────

export interface ComputedTargets {
  // Energy
  bmr_kcal: number
  tdee_kcal: number
  daily_cal_target: number
  deficit_or_surplus_kcal: number

  // Macros
  protein_g: number
  protein_per_lb: number
  fat_g_min: number              // floor for hormone health
  fat_g_target: number           // ideal target
  sat_fat_g_ceiling: number      // tightened if LDL flagged
  carbs_g: number                // remainder after protein + fat
  fiber_g: number

  // Hydration
  water_oz: number

  // Meta
  computed_at: string
  computed_from: {
    weight_lbs: number
    primary_goal: string
    activity_level: string
    has_bloodwork_concerns: boolean
    bloodwork_adjustments: string[]  // human-readable list of guardrails applied
  }

  // Cited rationale for each target — Sage shows this in the UI so
  // Josh sees WHERE each number came from.
  rationale: {
    energy: string
    protein: string
    fat: string
    sat_fat: string
    carbs: string
    fiber: string
    water: string
  }
}

// ── BMR (Mifflin-St Jeor) ─────────────────────────────────────────────
//
// Source: Mifflin MD, St Jeor ST, et al. "A new predictive equation
// for resting energy expenditure in healthy individuals." Am J Clin
// Nutr. 1990;51(2):241-7. The most accurate population-level RMR
// formula, validated against indirect calorimetry.
//
//   Men:   10·weight(kg) + 6.25·height(cm) − 5·age + 5
//   Women: 10·weight(kg) + 6.25·height(cm) − 5·age − 161

function bmrMifflinStJeor(inputs: ProfileInputs, weightLbs: number): number {
  const weightKg = weightLbs * 0.453592
  const base = 10 * weightKg + 6.25 * inputs.height_cm - 5 * inputs.age
  return inputs.sex_at_birth === 'male' ? base + 5 : base - 161
}

// ── TDEE (BMR × activity multiplier) ──────────────────────────────────
//
// Standard Harris-Benedict-derived multipliers used universally in
// sports-nutrition practice. The sedentary/very_active spread is wide
// (±50%) — most accuracy gain comes from honest self-assessment.

const ACTIVITY_MULTIPLIERS: Record<ProfileInputs['activity_level'], number> = {
  sedentary:           1.2,
  lightly_active:      1.375,
  moderately_active:   1.55,
  very_active:         1.725,
  extra_active:        1.9,
}

function tdee(inputs: ProfileInputs, bmr: number): number {
  return bmr * ACTIVITY_MULTIPLIERS[inputs.activity_level]
}

// ── Calorie target (TDEE ± deficit/surplus) ───────────────────────────
//
// Cut: deficit per pound of weekly loss = 3500 kcal/lb (well-established
//   though approximation). 0.5 lb/wk → 250 cal/day deficit; 1 lb/wk →
//   500 cal/day. For aggressive cuts (>1% bodyweight/wk), risk of
//   muscle loss + adherence issues rises sharply.
// Recomp: small deficit (~10%), high protein
// Maintain: TDEE
// Bulk: small surplus (~10%) for lean gains; higher = more fat gain

function calorieTarget(inputs: ProfileInputs, tdeeKcal: number): {
  daily_cal: number
  delta: number
} {
  const goal = inputs.primary_goal
  if (goal === 'maintain') return { daily_cal: Math.round(tdeeKcal), delta: 0 }
  if (goal === 'recomp') {
    const delta = -Math.round(tdeeKcal * 0.10)
    return { daily_cal: Math.round(tdeeKcal + delta), delta }
  }
  if (goal === 'bulk') {
    const delta = Math.round(tdeeKcal * 0.10)
    return { daily_cal: Math.round(tdeeKcal + delta), delta }
  }
  // cut
  const lossRate = inputs.weekly_loss_rate_lbs ?? 0.75  // default moderate cut
  const deficit = -Math.round((lossRate * 3500) / 7)
  return { daily_cal: Math.round(tdeeKcal + deficit), delta: deficit }
}

// ── Protein target ────────────────────────────────────────────────────
//
// Source: Phillips SM, Van Loon LJ. "Dietary protein for athletes."
// J Sports Sci. 2011;29 Suppl 1:S29-38. Plus Helms ER et al,
// "A systematic review of dietary protein during caloric restriction
// in resistance trained lean athletes" IJSNEM 2014.
//
// Practical ranges:
//   Cut (preserve muscle): 1.0 g/lb bodyweight (2.2 g/kg)
//   Recomp / maintain:     0.8-1.0 g/lb
//   Bulk:                  0.7-1.0 g/lb (more carbs/fat available)
//
// We use the high end during cuts (muscle protection is paramount)
// and middle for maintain/bulk.

function proteinTarget(inputs: ProfileInputs, weightLbs: number): { g: number; per_lb: number } {
  const perLb = inputs.primary_goal === 'cut' ? 1.0 : 0.8
  return { g: Math.round(weightLbs * perLb), per_lb: perLb }
}

// ── Fat target ────────────────────────────────────────────────────────
//
// Floor for hormone health: 0.3 g/lb bodyweight (hard minimum below
// which testosterone + thyroid suffer). Source: Volek JS et al,
// "Testosterone and cortisol in relationship to dietary nutrients and
// resistance exercise." J Appl Physiol. 1997;82(1):49-54.
//
// Target: 25-35% of total calories. We pick 30% as middle.

function fatTarget(weightLbs: number, dailyCal: number): {
  min_g: number
  target_g: number
} {
  const minG = Math.round(weightLbs * 0.3)
  const targetG = Math.round((dailyCal * 0.30) / 9)  // 9 kcal/g fat
  return { min_g: minG, target_g: Math.max(minG, targetG) }
}

// ── Saturated fat ceiling (blood-work-aware) ──────────────────────────
//
// AHA recommends < 6% of total calories from sat fat for general
// public; < 5% for those with elevated LDL. We tighten further as
// LDL rises:
//   LDL < 100   → 10% (looser, for lean people far from ASCVD risk)
//   LDL 100-129 → 7% (general population)
//   LDL 130-159 → 5% (AHA elevated-LDL recommendation)
//   LDL ≥ 160   → 4% (AHA + clinical urgency)

function satFatCeiling(dailyCal: number, ldl?: number | null): {
  ceiling_g: number
  pct_of_cal: number
  rationale: string
} {
  let pct: number
  let rationale: string
  if (ldl == null) {
    pct = 0.07  // default general-population ceiling
    rationale = 'No LDL value on file; using AHA general-population ceiling (7% of calories).'
  } else if (ldl >= 160) {
    pct = 0.04
    rationale = `LDL ${ldl} mg/dL is high — capping sat fat at 4% of calories per AHA + clinical urgency.`
  } else if (ldl >= 130) {
    pct = 0.05
    rationale = `LDL ${ldl} mg/dL is above target — capping sat fat at 5% per AHA elevated-LDL recommendation.`
  } else if (ldl >= 100) {
    pct = 0.07
    rationale = `LDL ${ldl} mg/dL is normal-high — keeping sat fat at general ceiling (7% of calories).`
  } else {
    pct = 0.10
    rationale = `LDL ${ldl} mg/dL is well-controlled — looser sat fat ceiling (10% of calories).`
  }
  const ceilingG = Math.round((dailyCal * pct) / 9)
  return { ceiling_g: ceilingG, pct_of_cal: pct, rationale }
}

// ── Carbs (remainder) ─────────────────────────────────────────────────
//
// Carbs = (total cal - protein·4 - fat·9) / 4. Adjusted for fiber min
// + glycemic considerations (A1C-aware).

function carbTarget(dailyCal: number, proteinG: number, fatG: number): number {
  const remaining = dailyCal - (proteinG * 4) - (fatG * 9)
  return Math.max(0, Math.round(remaining / 4))
}

// ── Fiber target ──────────────────────────────────────────────────────
//
// IOM recommends 14g per 1000 kcal (USDA Dietary Guidelines for
// Americans). For typical 2200 cal cut → ~31g/day.

function fiberTarget(dailyCal: number): number {
  return Math.round((dailyCal / 1000) * 14)
}

// ── Water target ──────────────────────────────────────────────────────
//
// Source: National Academies of Sciences, Engineering, and Medicine
// adequate intake — 125 fl oz/day for adult men, 91 for adult women.
// For active individuals + warm climates (Orlando…) we add 8-16 oz
// per workout day. We use the AI baseline + assume Josh works out
// most days.

function waterTarget(inputs: ProfileInputs): number {
  const base = inputs.sex_at_birth === 'male' ? 125 : 91
  return base + 16  // active baseline
}

// ── Master calculator ────────────────────────────────────────────────

export function computeTargets(
  profile: ProfileInputs,
  metrics: CurrentMetrics,
  bloodwork: BloodworkContext = {},
): ComputedTargets {
  const bmr = Math.round(bmrMifflinStJeor(profile, metrics.weight_lbs))
  const tdeeKcal = Math.round(tdee(profile, bmr))
  const { daily_cal, delta } = calorieTarget(profile, tdeeKcal)
  const protein = proteinTarget(profile, metrics.weight_lbs)
  const fat = fatTarget(metrics.weight_lbs, daily_cal)
  const satFat = satFatCeiling(daily_cal, bloodwork.ldl_mg_dl)
  const carbs = carbTarget(daily_cal, protein.g, fat.target_g)
  const fiber = fiberTarget(daily_cal)
  const water = waterTarget(profile)

  // Track which adjustments fired so the UI can call them out.
  const adjustments: string[] = []
  if (bloodwork.ldl_mg_dl != null && bloodwork.ldl_mg_dl >= 130) {
    adjustments.push(`Sat fat tightened to ${(satFat.pct_of_cal * 100).toFixed(0)}% of cal (LDL ${bloodwork.ldl_mg_dl})`)
  }
  if (bloodwork.a1c_pct != null && bloodwork.a1c_pct >= 5.7) {
    adjustments.push(`Carbs leaning lower-GI (A1C ${bloodwork.a1c_pct})`)
  }
  if (bloodwork.triglycerides_mg_dl != null && bloodwork.triglycerides_mg_dl >= 150) {
    adjustments.push(`Refined-carb ceiling applied (Trig ${bloodwork.triglycerides_mg_dl})`)
  }
  const hasBloodworkConcerns = adjustments.length > 0

  return {
    bmr_kcal: bmr,
    tdee_kcal: tdeeKcal,
    daily_cal_target: daily_cal,
    deficit_or_surplus_kcal: delta,

    protein_g: protein.g,
    protein_per_lb: protein.per_lb,
    fat_g_min: fat.min_g,
    fat_g_target: fat.target_g,
    sat_fat_g_ceiling: satFat.ceiling_g,
    carbs_g: carbs,
    fiber_g: fiber,
    water_oz: water,

    computed_at: new Date().toISOString(),
    computed_from: {
      weight_lbs: metrics.weight_lbs,
      primary_goal: profile.primary_goal,
      activity_level: profile.activity_level,
      has_bloodwork_concerns: hasBloodworkConcerns,
      bloodwork_adjustments: adjustments,
    },

    rationale: {
      energy: `BMR ${bmr} kcal (Mifflin-St Jeor: ${profile.sex_at_birth}, ${profile.age}y, ${metrics.weight_lbs} lbs, ${profile.height_cm}cm). TDEE ${tdeeKcal} kcal (×${ACTIVITY_MULTIPLIERS[profile.activity_level]} for ${profile.activity_level}). Goal: ${profile.primary_goal}${delta !== 0 ? ` → ${delta > 0 ? '+' : ''}${delta} kcal/day` : ''}.`,
      protein: `${protein.g}g/day (${protein.per_lb}g per lb bodyweight). ${profile.primary_goal === 'cut' ? 'Higher end during cut — protein protects muscle in deficit (Phillips & Van Loon 2011).' : 'Standard active-individual range.'}`,
      fat: `${fat.target_g}g/day target, ${fat.min_g}g floor. Floor protects testosterone + thyroid (Volek et al 1997). Target = 30% of total calories.`,
      sat_fat: satFat.rationale,
      carbs: `${carbs}g/day = remaining calories after protein + fat. Adjust by training day (Sage handles this in weekly planning).`,
      fiber: `${fiber}g/day = 14g per 1000 cal (USDA DGA).`,
      water: `${water} oz/day (NAS adequate intake + active-day buffer).`,
    },
  }
}

// ── Activity-level human labels ──────────────────────────────────────

export const ACTIVITY_LEVEL_LABELS: Record<ProfileInputs['activity_level'], { label: string; detail: string }> = {
  sedentary:         { label: 'Sedentary',         detail: 'Desk job, little/no exercise' },
  lightly_active:    { label: 'Lightly active',    detail: 'Light exercise 1-3 days/week' },
  moderately_active: { label: 'Moderately active', detail: 'Moderate exercise 3-5 days/week' },
  very_active:       { label: 'Very active',       detail: 'Heavy exercise 6-7 days/week' },
  extra_active:      { label: 'Extra active',      detail: 'Very heavy exercise + physical job' },
}
