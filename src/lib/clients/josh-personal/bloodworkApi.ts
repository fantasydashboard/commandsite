/**
 * Josh Personal — bloodwork composable.
 *
 * Wraps personal_bloodwork_panels (manual entry now, PDF upload
 * later — same schema). Handles loading the latest panel, deriving
 * which markers are out of range, and translating that into the
 * BloodworkContext shape the targets calculator expects.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { computeTargets, type BloodworkContext, type ComputedTargets, type ProfileInputs } from './targets'

export interface BloodworkPanel {
  id: string
  user_id: string
  drawn_at: string         // ISO date string (YYYY-MM-DD)
  drawn_by: string | null
  notes: string | null
  markers: Record<string, number | null>
  sage_read: string | null
  created_at: string
  updated_at: string
}

// ── Marker registry ────────────────────────────────────────────────
//
// Defines every marker the form supports + its display name + units +
// "in-range" boundaries (used to flag concerns at save time and color
// the value pill in the UI). Sources: AHA, ADA, Endocrine Society
// reference ranges. These are the conservative population-level
// thresholds — individual labs may use slightly different ranges.

export interface MarkerDef {
  key: string                // matches markers jsonb key
  label: string              // human-readable
  unit: string
  category: 'lipids' | 'glucose' | 'thyroid' | 'hormones' | 'inflammation' | 'liver' | 'cbc' | 'vitamins' | 'kidney' | 'other'
  // Range bounds. For markers where higher is concerning, set max.
  // For markers where lower is concerning, set min. Set both for
  // bidirectional ranges (TSH, etc.). null = no bound on that side.
  range_min: number | null
  range_max: number | null
  rangeNote: string          // human-readable target string for the UI
}

export const MARKERS: MarkerDef[] = [
  // Lipids
  { key: 'ldl_mg_dl',           label: 'LDL Cholesterol',     unit: 'mg/dL', category: 'lipids',       range_min: null, range_max: 130, rangeNote: '<130' },
  { key: 'hdl_mg_dl',           label: 'HDL Cholesterol',     unit: 'mg/dL', category: 'lipids',       range_min: 40,   range_max: null, rangeNote: '>40' },
  { key: 'triglycerides_mg_dl', label: 'Triglycerides',       unit: 'mg/dL', category: 'lipids',       range_min: null, range_max: 150, rangeNote: '<150' },
  { key: 'total_cholesterol_mg_dl', label: 'Total Cholesterol', unit: 'mg/dL', category: 'lipids',     range_min: null, range_max: 200, rangeNote: '<200' },

  // Glucose
  { key: 'a1c_pct',             label: 'Hemoglobin A1C',      unit: '%',     category: 'glucose',      range_min: null, range_max: 5.7, rangeNote: '<5.7' },
  { key: 'fasting_glucose_mg_dl', label: 'Fasting Glucose',   unit: 'mg/dL', category: 'glucose',      range_min: 70,   range_max: 99,   rangeNote: '70-99' },

  // Thyroid
  { key: 'tsh_miu_l',           label: 'TSH',                 unit: 'mIU/L', category: 'thyroid',      range_min: 0.4,  range_max: 4.5,  rangeNote: '0.4-4.5' },

  // Hormones
  { key: 'total_testosterone_ng_dl', label: 'Total Testosterone', unit: 'ng/dL', category: 'hormones', range_min: 264, range_max: 916,  rangeNote: '264-916' },
  { key: 'free_testosterone_pg_ml',  label: 'Free Testosterone',  unit: 'pg/mL', category: 'hormones', range_min: 9,   range_max: 30,   rangeNote: '9-30' },
  { key: 'cortisol_morning_ug_dl',   label: 'Morning Cortisol',   unit: 'µg/dL', category: 'hormones', range_min: 6,   range_max: 23,   rangeNote: '6-23' },

  // Inflammation
  { key: 'crp_mg_l',            label: 'CRP (inflammation)',  unit: 'mg/L',  category: 'inflammation', range_min: null, range_max: 3.0,  rangeNote: '<3.0' },

  // Liver
  { key: 'alt_u_l',             label: 'ALT',                 unit: 'U/L',   category: 'liver',        range_min: null, range_max: 55,   rangeNote: '<55' },
  { key: 'ast_u_l',             label: 'AST',                 unit: 'U/L',   category: 'liver',        range_min: null, range_max: 48,   rangeNote: '<48' },

  // CBC essentials
  { key: 'hemoglobin_g_dl',     label: 'Hemoglobin',          unit: 'g/dL',  category: 'cbc',          range_min: 13.5, range_max: 17.5, rangeNote: '13.5-17.5' },

  // Vitamins
  { key: 'vit_d_ng_ml',         label: 'Vitamin D (25-OH)',   unit: 'ng/mL', category: 'vitamins',     range_min: 30,   range_max: 100,  rangeNote: '30-100' },
  { key: 'vit_b12_pg_ml',       label: 'Vitamin B12',         unit: 'pg/mL', category: 'vitamins',     range_min: 200,  range_max: 1100, rangeNote: '200-1100' },
  { key: 'ferritin_ng_ml',      label: 'Ferritin',            unit: 'ng/mL', category: 'vitamins',     range_min: 30,   range_max: 400,  rangeNote: '30-400' },

  // Kidney
  { key: 'creatinine_mg_dl',    label: 'Creatinine',          unit: 'mg/dL', category: 'kidney',       range_min: 0.74, range_max: 1.35, rangeNote: '0.74-1.35' },
  { key: 'egfr',                label: 'eGFR',                unit: 'mL/min', category: 'kidney',      range_min: 60,   range_max: null, rangeNote: '>60' },
]

export const CATEGORY_LABELS: Record<MarkerDef['category'], string> = {
  lipids: 'Lipids',
  glucose: 'Glucose',
  thyroid: 'Thyroid',
  hormones: 'Hormones',
  inflammation: 'Inflammation',
  liver: 'Liver',
  cbc: 'Complete Blood Count',
  vitamins: 'Vitamins / Minerals',
  kidney: 'Kidney',
  other: 'Other',
}

export type MarkerStatus = 'good' | 'warn' | 'danger' | 'unknown'

/** Classify a marker value against its range. */
export function markerStatus(def: MarkerDef, value: number | null | undefined): MarkerStatus {
  if (value == null || isNaN(value)) return 'unknown'
  // Severity: anything 20% past the bound = danger, otherwise warn.
  if (def.range_min != null && value < def.range_min) {
    const pctBelow = (def.range_min - value) / def.range_min
    return pctBelow >= 0.2 ? 'danger' : 'warn'
  }
  if (def.range_max != null && value > def.range_max) {
    const pctAbove = (value - def.range_max) / def.range_max
    return pctAbove >= 0.2 ? 'danger' : 'warn'
  }
  return 'good'
}

/** Pull the BloodworkContext shape from a panel for targets.ts. */
export function panelToTargetsContext(panel: BloodworkPanel | null): BloodworkContext {
  if (!panel) return {}
  const m = panel.markers
  return {
    ldl_mg_dl: typeof m.ldl_mg_dl === 'number' ? m.ldl_mg_dl : null,
    a1c_pct: typeof m.a1c_pct === 'number' ? m.a1c_pct : null,
    triglycerides_mg_dl: typeof m.triglycerides_mg_dl === 'number' ? m.triglycerides_mg_dl : null,
    vit_d_ng_ml: typeof m.vit_d_ng_ml === 'number' ? m.vit_d_ng_ml : null,
  }
}

/** Derived "active concerns" list for the UI from a panel's markers. */
export interface DerivedConcern {
  marker_key: string
  marker_label: string
  value: number
  unit: string
  range: string
  status: MarkerStatus
}

export function deriveConcerns(panel: BloodworkPanel | null): DerivedConcern[] {
  if (!panel) return []
  const out: DerivedConcern[] = []
  for (const def of MARKERS) {
    const v = panel.markers[def.key]
    if (typeof v !== 'number') continue
    const status = markerStatus(def, v)
    if (status === 'warn' || status === 'danger') {
      out.push({
        marker_key: def.key,
        marker_label: def.label,
        value: v,
        unit: def.unit,
        range: def.rangeNote,
        status,
      })
    }
  }
  return out
}

// ── Composable ────────────────────────────────────────────────────────

export function useBloodwork() {
  const panels = ref<BloodworkPanel[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      panels.value = []
      loading.value = false
      return
    }
    const { data, error: e } = await supabase
      .from('personal_bloodwork_panels')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('drawn_at', { ascending: false })
    if (e) error.value = e.message
    else panels.value = (data ?? []) as unknown as BloodworkPanel[]
    loading.value = false
  }

  async function savePanel(input: {
    drawn_at: string
    drawn_by: string | null
    notes: string | null
    markers: Record<string, number | null>
  }): Promise<{ ok: boolean; error?: string }> {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return { ok: false, error: 'Not signed in' }

    // Strip null/empty values from markers so we don't store noise
    const cleanMarkers: Record<string, number> = {}
    for (const [k, v] of Object.entries(input.markers)) {
      if (typeof v === 'number' && !isNaN(v)) cleanMarkers[k] = v
    }

    const payload = {
      user_id: userData.user.id,
      drawn_at: input.drawn_at,
      drawn_by: input.drawn_by,
      notes: input.notes,
      markers: cleanMarkers,
    }
    const { error: e } = await supabase
      .from('personal_bloodwork_panels')
      .insert(payload as never)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  // ── Closed-loop: when bloodwork changes, recompute targets + diff ──
  //
  // Without this, uploading new bloodwork doesn't actually move any
  // numbers — the calorie / sat-fat / protein targets stored on the
  // profile stay frozen until the operator opens the onboarding wizard
  // and re-saves. That breaks the pitch ("Sage adjusts your targets
  // when your bloodwork moves") in the literal sense.
  //
  // What this does, in order:
  //   1. Read the latest panel (just-saved) + current profile.
  //   2. Pull a current-weight reading from snapshot.weight (today's
  //      reading, or the most recent personal_metrics row).
  //   3. Call computeTargets() with the fresh bloodwork context.
  //   4. Diff against profile.computed_targets (what was stored).
  //   5. Persist the new targets back to the profile.
  //   6. Return a structured diff so the UI can show "sat fat ceiling
  //      moved from 12g to 14g, daily cal moved from 1,837 to 1,852".
  //
  // No-ops gracefully when profile is missing or no bloodwork exists.

  interface TargetChange {
    key: keyof ComputedTargets | 'bloodwork_adjustments'
    label: string
    before: number | string | null
    after: number | string | null
    unit: string
    direction: 'tighter' | 'looser' | 'changed' | 'neutral'
  }

  interface RecomputeResult {
    ok: boolean
    error?: string
    changes: TargetChange[]
    newTargets?: ComputedTargets
  }

  async function recomputeTargetsAfterBloodwork(): Promise<RecomputeResult> {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return { ok: false, error: 'Not signed in', changes: [] }

    // 1. Profile (need it for body inputs + the old targets to diff against).
    const { data: profile, error: profErr } = await supabase
      .from('personal_profile')
      .select('*')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (profErr) return { ok: false, error: `Profile read failed: ${profErr.message}`, changes: [] }
    if (!profile) {
      // No profile yet → can't compute. Not an error; just nothing to do.
      return { ok: true, changes: [] }
    }
    const p = profile as Record<string, unknown>

    // 2. Current weight — pull the most recent weight metric.
    const { data: weightRows } = await supabase
      .from('personal_metrics')
      .select('value, recorded_at')
      .eq('user_id', userData.user.id)
      .eq('metric_type', 'weight')
      .order('recorded_at', { ascending: false })
      .limit(1)
    const weightVal = ((weightRows ?? []) as { value: number | string }[])[0]?.value
    const currentWeightLbs = typeof weightVal === 'number'
      ? weightVal
      : (typeof weightVal === 'string' ? parseFloat(weightVal) : NaN)
    if (isNaN(currentWeightLbs)) {
      return { ok: true, changes: [] }  // no weight, can't compute
    }

    // 3. Bloodwork context from the latest panel.
    const latest = panels.value[0] ?? null
    const bw = panelToTargetsContext(latest)

    // 4. Compute new targets.
    const inputs: ProfileInputs = {
      height_cm: Number(p.height_cm ?? 0),
      age: Number(p.age ?? 0),
      sex_at_birth: (p.sex_at_birth as 'male' | 'female') ?? 'male',
      primary_goal: (p.primary_goal as ProfileInputs['primary_goal']) ?? 'maintain',
      activity_level: (p.activity_level as ProfileInputs['activity_level']) ?? 'moderately_active',
      weekly_loss_rate_lbs: (p.weekly_loss_rate_lbs as number | null) ?? null,
      body_fat_pct: (p.body_fat_pct as number | null) ?? null,
    }
    const newTargets = computeTargets(inputs, { weight_lbs: currentWeightLbs }, bw)

    // 5. Diff against what was stored.
    const old = (p.computed_targets ?? null) as ComputedTargets | null
    const changes = diffTargets(old, newTargets)

    // 6. Persist.
    const { error: updErr } = await supabase
      .from('personal_profile')
      .update({ computed_targets: newTargets } as never)
      .eq('user_id', userData.user.id)
    if (updErr) return { ok: false, error: `Profile update failed: ${updErr.message}`, changes }

    return { ok: true, changes, newTargets }
  }

  /** Build a clean diff of the meaningful target fields. Skips fields
   *  that didn't change (or changed by < 1 unit — rounding noise). */
  function diffTargets(
    before: ComputedTargets | null,
    after: ComputedTargets,
  ): TargetChange[] {
    const out: TargetChange[] = []
    const fields: Array<{ key: keyof ComputedTargets; label: string; unit: string; tightenIsLower?: boolean }> = [
      { key: 'daily_cal_target',   label: 'Daily calorie target', unit: 'kcal' },
      { key: 'protein_g',          label: 'Protein target',       unit: 'g' },
      { key: 'sat_fat_g_ceiling',  label: 'Sat fat ceiling',      unit: 'g', tightenIsLower: true },
      { key: 'fat_g_target',       label: 'Fat target',           unit: 'g' },
      { key: 'carbs_g',            label: 'Carbs',                unit: 'g' },
      { key: 'fiber_g',            label: 'Fiber',                unit: 'g' },
      { key: 'water_oz',           label: 'Water',                unit: 'oz' },
    ]
    for (const f of fields) {
      const b = before ? Number(before[f.key]) : null
      const a = Number(after[f.key])
      if (b === null) {
        out.push({ key: f.key, label: f.label, before: null, after: a, unit: f.unit, direction: 'neutral' })
        continue
      }
      if (Math.abs(a - b) < 1) continue
      const direction: TargetChange['direction'] = f.tightenIsLower
        ? (a < b ? 'tighter' : 'looser')
        : (a > b ? 'changed' : 'changed')
      out.push({ key: f.key, label: f.label, before: b, after: a, unit: f.unit, direction })
    }

    // Bloodwork adjustments list — show which guardrails changed.
    const beforeAdj = (before?.computed_from?.bloodwork_adjustments ?? []).join(' · ')
    const afterAdj  = after.computed_from.bloodwork_adjustments.join(' · ')
    if (beforeAdj !== afterAdj) {
      out.push({
        key: 'bloodwork_adjustments',
        label: 'Sage\'s blood-work guardrails',
        before: beforeAdj || 'none',
        after: afterAdj || 'none',
        unit: '',
        direction: 'changed',
      })
    }

    return out
  }

  async function deletePanel(id: string): Promise<{ ok: boolean; error?: string }> {
    const { error: e } = await supabase
      .from('personal_bloodwork_panels')
      .delete()
      .eq('id', id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  const latestPanel = computed<BloodworkPanel | null>(() => panels.value[0] ?? null)
  const activeConcerns = computed<DerivedConcern[]>(() => deriveConcerns(latestPanel.value))
  const hasAnyPanel = computed(() => panels.value.length > 0)

  onMounted(load)

  return {
    panels,
    latestPanel,
    activeConcerns,
    hasAnyPanel,
    loading,
    error,
    load,
    savePanel,
    deletePanel,
    recomputeTargetsAfterBloodwork,
  }
}
