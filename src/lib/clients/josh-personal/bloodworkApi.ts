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
import type { BloodworkContext } from './targets'

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
  }
}
