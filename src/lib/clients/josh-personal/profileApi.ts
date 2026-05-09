/**
 * Josh Personal — profile composable.
 *
 * Wraps the personal_profile table — load, save, and computes targets
 * via the targets.ts library when profile + latest weight + bloodwork
 * change. The composable returns reactive state any module can use to
 * decide "show onboarding wizard?" vs "render dashboard with targets".
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { computeTargets, type ComputedTargets, type ProfileInputs, type BloodworkContext } from './targets'

export interface PersonalProfile {
  user_id: string
  height_cm: number
  age: number
  sex_at_birth: 'male' | 'female'
  body_fat_pct: number | null
  primary_goal: 'cut' | 'recomp' | 'maintain' | 'bulk'
  target_weight_lbs: number | null
  target_deadline: string | null
  weekly_loss_rate_lbs: number | null
  activity_level: ProfileInputs['activity_level']
  workouts_per_week_target: number
  preferred_split: string | null
  preferred_workout_time: string | null
  session_duration_min: number | null
  foods_disliked: string[]
  foods_avoided: string[]
  cuisines_loved: string[]
  eating_window_start: string | null
  eating_window_end: string | null
  cooking_skill: 'none' | 'basic' | 'comfortable' | 'enthusiast' | null
  meal_prep_day: string
  injuries: { body_part: string; note: string; since: string; revisit_at: string | null }[]
  has_home_gym: boolean
  home_equipment: string[]
  has_commercial_gym: boolean
  conditions: string[]
  medications: string[]
  sleep_target_hours: number
  typical_bedtime: string | null
  computed_targets: ComputedTargets | null
  sage_initial_read: string | null
  created_at: string
  updated_at: string
}

export type ProfileDraft = Omit<PersonalProfile, 'user_id' | 'computed_targets' | 'sage_initial_read' | 'created_at' | 'updated_at'>

/** Empty draft used as the wizard's starting state. */
export function emptyDraft(): ProfileDraft {
  return {
    height_cm: 0,
    age: 0,
    sex_at_birth: 'male',
    body_fat_pct: null,
    primary_goal: 'cut',
    target_weight_lbs: null,
    target_deadline: null,
    weekly_loss_rate_lbs: 0.75,
    activity_level: 'moderately_active',
    workouts_per_week_target: 4,
    preferred_split: 'push_pull_legs',
    preferred_workout_time: 'morning',
    session_duration_min: 45,
    foods_disliked: [],
    foods_avoided: [],
    cuisines_loved: [],
    eating_window_start: null,
    eating_window_end: null,
    cooking_skill: 'comfortable',
    meal_prep_day: 'saturday',
    injuries: [],
    has_home_gym: false,
    home_equipment: [],
    has_commercial_gym: true,
    conditions: [],
    medications: [],
    sleep_target_hours: 7.5,
    typical_bedtime: null,
  }
}

export function useProfile() {
  const profile = ref<PersonalProfile | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      profile.value = null
      loading.value = false
      return
    }
    const { data, error: e } = await supabase
      .from('personal_profile')
      .select('*')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (e) {
      error.value = e.message
    } else {
      profile.value = (data ?? null) as PersonalProfile | null
    }
    loading.value = false
  }

  /**
   * Save the profile (insert if missing, update if present). Computes
   * targets from current weight + latest bloodwork before writing so
   * the dashboard never has to compute on render.
   */
  async function save(
    draft: ProfileDraft,
    currentWeightLbs: number,
    bloodwork: BloodworkContext = {},
  ): Promise<{ ok: boolean; error?: string }> {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return { ok: false, error: 'Not signed in' }

    const targets = computeTargets(
      {
        height_cm: draft.height_cm,
        age: draft.age,
        sex_at_birth: draft.sex_at_birth,
        primary_goal: draft.primary_goal,
        activity_level: draft.activity_level,
        weekly_loss_rate_lbs: draft.weekly_loss_rate_lbs,
        body_fat_pct: draft.body_fat_pct,
      },
      { weight_lbs: currentWeightLbs },
      bloodwork,
    )

    const payload = {
      user_id: userData.user.id,
      ...draft,
      computed_targets: targets,
    }

    // Cast through unknown — personal_profile isn't in the generated
    // Database types yet (would require regenerating via supabase gen
    // types). Same pattern other modules in the codebase use.
    const { error: e } = await supabase
      .from('personal_profile')
      .upsert(payload as never, { onConflict: 'user_id' })

    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  const hasProfile = computed(() => profile.value !== null)
  const targets = computed(() => profile.value?.computed_targets ?? null)

  onMounted(load)

  return { profile, loading, error, hasProfile, targets, load, save }
}

// ── UI labels for picker fields ───────────────────────────────────────

export const PRIMARY_GOAL_OPTIONS = [
  { value: 'cut',      label: 'Cut',      detail: 'Lose fat while preserving muscle' },
  { value: 'recomp',   label: 'Recomp',   detail: 'Slow lean gain + slow fat loss' },
  { value: 'maintain', label: 'Maintain', detail: 'Hold weight, focus on performance' },
  { value: 'bulk',     label: 'Bulk',     detail: 'Gain weight + muscle deliberately' },
] as const

export const COOKING_SKILL_OPTIONS = [
  { value: 'none',          label: 'I don\'t cook' },
  { value: 'basic',          label: 'Basic — rice, eggs, sheet-pan dinners' },
  { value: 'comfortable',    label: 'Comfortable — most recipes' },
  { value: 'enthusiast',     label: 'Enthusiast — I enjoy cooking' },
] as const

export const SPLIT_OPTIONS = [
  { value: 'push_pull_legs', label: 'Push / Pull / Legs (3 or 6 days)' },
  { value: 'upper_lower',    label: 'Upper / Lower (4 days)' },
  { value: 'full_body',      label: 'Full body (3 days)' },
  { value: 'custom',         label: 'Custom — let Sage figure it out' },
] as const

export const WORKOUT_TIME_OPTIONS = [
  { value: 'morning', label: 'Morning' },
  { value: 'midday',  label: 'Midday' },
  { value: 'evening', label: 'Evening' },
] as const

export const COMMON_HOME_EQUIPMENT = [
  'dumbbells', 'kettlebells', 'barbell', 'squat_rack', 'bench',
  'pull_up_bar', 'trap_bar', 'cable_machine', 'rower', 'treadmill',
  'bike', 'sled', 'resistance_bands',
]

export const COMMON_CUISINES = [
  'mediterranean', 'mexican', 'italian', 'asian', 'american',
  'middle_eastern', 'indian', 'japanese', 'thai', 'bbq',
]

export const COMMON_INJURY_BODY_PARTS = [
  'left_shoulder', 'right_shoulder', 'left_knee', 'right_knee',
  'lower_back', 'left_elbow', 'right_elbow', 'wrist', 'hip', 'ankle',
]
