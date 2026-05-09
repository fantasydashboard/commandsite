<script setup lang="ts">
/**
 * Josh Personal — onboarding wizard.
 *
 * Multi-step modal that collects everything Sage needs to be a real
 * AI assistant instead of a generic stat tracker. Each step is small
 * + focused so it never feels like a slog.
 *
 * Steps:
 *   1. Body baseline (height, age, sex)
 *   2. Goal (cut/recomp/maintain/bulk + target weight + deadline)
 *   3. Activity + workouts (level, frequency, split, when)
 *   4. Food prefs (likes, dislikes, eating window, cooking skill)
 *   5. Injuries + equipment
 *   6. Review computed targets + save
 *
 * Saves to personal_profile via useProfile().save() which also
 * computes calorie + macro targets from the inputs.
 */
import { ref, computed, watch } from 'vue'
import AssistantMark from '@/components/AssistantMark.vue'
import {
  useProfile,
  emptyDraft,
  PRIMARY_GOAL_OPTIONS,
  COOKING_SKILL_OPTIONS,
  SPLIT_OPTIONS,
  WORKOUT_TIME_OPTIONS,
  COMMON_HOME_EQUIPMENT,
  COMMON_CUISINES,
  COMMON_INJURY_BODY_PARTS,
  type ProfileDraft,
} from '@/lib/clients/josh-personal/profileApi'
import { computeTargets, ACTIVITY_LEVEL_LABELS } from '@/lib/clients/josh-personal/targets'

const props = defineProps<{
  open: boolean
  /** Most recent weight from Apple Health (used to compute targets at save time). */
  currentWeightLbs: number | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const { save } = useProfile()

const draft = ref<ProfileDraft>(emptyDraft())
const step = ref(1)
const TOTAL_STEPS = 6
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

// Reset to step 1 on each open so re-opens don't drop the user mid-wizard.
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    step.value = 1
    errorMsg.value = null
  }
})

// Convert height ft/in inputs into cm for storage.
const heightFeet = ref(5)
const heightInches = ref(10)
watch([heightFeet, heightInches], ([ft, inch]) => {
  draft.value.height_cm = Math.round((ft * 12 + inch) * 2.54)
}, { immediate: true })

// Set on load: if Josh's current weight isn't entered as a target yet, default to it
watch(() => props.currentWeightLbs, (w) => {
  if (w && !draft.value.target_weight_lbs) {
    draft.value.target_weight_lbs = Math.round(w - 5)  // suggest small cut by default
  }
}, { immediate: true })

// Live preview of computed targets shown on step 6.
const previewTargets = computed(() => {
  if (!props.currentWeightLbs || !draft.value.height_cm || !draft.value.age) return null
  return computeTargets(
    {
      height_cm: draft.value.height_cm,
      age: draft.value.age,
      sex_at_birth: draft.value.sex_at_birth,
      primary_goal: draft.value.primary_goal,
      activity_level: draft.value.activity_level,
      weekly_loss_rate_lbs: draft.value.weekly_loss_rate_lbs,
      body_fat_pct: draft.value.body_fat_pct,
    },
    { weight_lbs: props.currentWeightLbs },
    {},  // bloodwork integration: deferred until Phase 4 (PDF upload)
  )
})

// Step validation — only allow Next if required fields filled
const canAdvance = computed(() => {
  if (step.value === 1) {
    return draft.value.height_cm > 0 && draft.value.age > 0
  }
  if (step.value === 2) {
    return !!draft.value.primary_goal
  }
  if (step.value === 3) {
    return !!draft.value.activity_level && draft.value.workouts_per_week_target > 0
  }
  // Steps 4 + 5 are all optional fields
  return true
})

// ── Handlers ──────────────────────────────────────────────────────────

function next() {
  if (!canAdvance.value) return
  if (step.value < TOTAL_STEPS) step.value++
}

function back() {
  if (step.value > 1) step.value--
  errorMsg.value = null
}

function close() {
  if (submitting.value) return
  emit('close')
}

async function onSave() {
  if (!props.currentWeightLbs) {
    errorMsg.value = 'No weight reading found in Apple Health. Step on a scale and sync, then come back.'
    return
  }
  submitting.value = true
  errorMsg.value = null
  const result = await save(draft.value, props.currentWeightLbs, {})
  submitting.value = false
  if (!result.ok) {
    errorMsg.value = result.error ?? 'Failed to save profile'
    return
  }
  emit('saved')
  emit('close')
}

// ── Multi-add helpers (food lists, equipment, injuries) ──────────────

const newFoodDisliked = ref('')
function addDisliked() {
  const v = newFoodDisliked.value.trim().toLowerCase()
  if (v && !draft.value.foods_disliked.includes(v)) {
    draft.value.foods_disliked.push(v)
  }
  newFoodDisliked.value = ''
}
function removeDisliked(food: string) {
  draft.value.foods_disliked = draft.value.foods_disliked.filter((f) => f !== food)
}

const newFoodAvoided = ref('')
function addAvoided() {
  const v = newFoodAvoided.value.trim().toLowerCase()
  if (v && !draft.value.foods_avoided.includes(v)) {
    draft.value.foods_avoided.push(v)
  }
  newFoodAvoided.value = ''
}
function removeAvoided(food: string) {
  draft.value.foods_avoided = draft.value.foods_avoided.filter((f) => f !== food)
}

function toggleCuisine(c: string) {
  if (draft.value.cuisines_loved.includes(c)) {
    draft.value.cuisines_loved = draft.value.cuisines_loved.filter((x) => x !== c)
  } else {
    draft.value.cuisines_loved.push(c)
  }
}

function toggleEquipment(e: string) {
  if (draft.value.home_equipment.includes(e)) {
    draft.value.home_equipment = draft.value.home_equipment.filter((x) => x !== e)
  } else {
    draft.value.home_equipment.push(e)
  }
}

const newInjuryPart = ref('')
const newInjuryNote = ref('')
function addInjury() {
  const part = newInjuryPart.value.trim()
  if (!part) return
  draft.value.injuries.push({
    body_part: part,
    note: newInjuryNote.value.trim(),
    since: new Date().toISOString().slice(0, 10),
    revisit_at: null,
  })
  newInjuryPart.value = ''
  newInjuryNote.value = ''
}
function removeInjury(idx: number) {
  draft.value.injuries.splice(idx, 1)
}

const stepLabels = [
  '', 'Body', 'Goal', 'Activity', 'Food', 'Limits', 'Review',
]
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-ink/60"
        @click.self="close"
      >
        <div
          class="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-card bg-surface-raised shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          <!-- ── Header w/ progress ────────────────────────────────── -->
          <div class="px-6 py-4 border-b border-divider bg-surface-elevated">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <AssistantMark class="h-5 w-5 text-brand" />
                  <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
                    Tell Sage about yourself
                  </span>
                </div>
                <h2 class="text-lg font-semibold text-ink">
                  Step {{ step }} of {{ TOTAL_STEPS }} · {{ stepLabels[step] }}
                </h2>
              </div>
              <button
                type="button"
                class="text-ink-muted hover:text-ink text-2xl leading-none p-1 -mr-2 disabled:opacity-30"
                :disabled="submitting"
                @click="close"
              >×</button>
            </div>
            <!-- Progress bar -->
            <div class="mt-3 flex items-center gap-1.5">
              <div
                v-for="i in TOTAL_STEPS"
                :key="i"
                class="h-1 flex-1 rounded-full transition-colors"
                :class="i <= step ? 'bg-brand' : 'bg-brand/15'"
              />
            </div>
          </div>

          <!-- ── Body — varies per step ────────────────────────────── -->
          <div class="flex-1 overflow-y-auto px-6 py-5">

            <!-- Step 1: Body baseline -->
            <div v-if="step === 1" class="space-y-4">
              <p class="text-sm text-ink-muted">
                Sage uses these to calculate your BMR (Mifflin-St Jeor) and macro targets. We don't share this anywhere.
              </p>

              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Height</label>
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-1">
                    <input
                      v-model.number="heightFeet"
                      type="number"
                      min="3"
                      max="8"
                      class="input w-16 text-center"
                    />
                    <span class="text-sm text-ink-muted">ft</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <input
                      v-model.number="heightInches"
                      type="number"
                      min="0"
                      max="11"
                      class="input w-16 text-center"
                    />
                    <span class="text-sm text-ink-muted">in</span>
                  </div>
                  <span class="text-[11px] text-ink-disabled">= {{ draft.height_cm }} cm</span>
                </div>
              </div>

              <div class="grid sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Age</label>
                  <input v-model.number="draft.age" type="number" min="13" max="100" class="input" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Sex (BMR formula)</label>
                  <select v-model="draft.sex_at_birth" class="input">
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">
                  Body fat % <span class="text-ink-muted font-normal">(optional — refines lean-mass calc)</span>
                </label>
                <input v-model.number="draft.body_fat_pct" type="number" min="3" max="60" step="0.1" class="input w-32" placeholder="e.g. 18" />
              </div>
            </div>

            <!-- Step 2: Goal -->
            <div v-else-if="step === 2" class="space-y-4">
              <p class="text-sm text-ink-muted">
                Your primary direction. Sage shapes everything around this.
              </p>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="opt in PRIMARY_GOAL_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="text-left rounded-card border p-3 transition-all"
                  :class="draft.primary_goal === opt.value
                    ? 'border-brand bg-brand/5 ring-2 ring-brand/30'
                    : 'border-divider hover:border-brand/40'"
                  @click="draft.primary_goal = opt.value"
                >
                  <div class="font-semibold text-ink">{{ opt.label }}</div>
                  <div class="text-[11px] text-ink-muted mt-0.5">{{ opt.detail }}</div>
                </button>
              </div>

              <div v-if="draft.primary_goal === 'cut' || draft.primary_goal === 'bulk'" class="grid sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Target weight (lbs)</label>
                  <input v-model.number="draft.target_weight_lbs" type="number" class="input" :placeholder="`current ${currentWeightLbs ?? '—'}`" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Target deadline</label>
                  <input v-model="draft.target_deadline" type="date" class="input" />
                </div>
              </div>

              <div v-if="draft.primary_goal === 'cut'" class="pt-2">
                <label class="block text-xs font-semibold text-ink mb-1.5">
                  Cut rate
                  <span class="text-ink-muted font-normal">— how aggressive</span>
                </label>
                <select v-model.number="draft.weekly_loss_rate_lbs" class="input">
                  <option :value="0.5">0.5 lb/week (conservative · best for muscle retention)</option>
                  <option :value="0.75">0.75 lb/week (moderate · good balance)</option>
                  <option :value="1.0">1.0 lb/week (aggressive · faster, more risk)</option>
                  <option :value="1.5">1.5 lb/week (very aggressive · short-term only)</option>
                </select>
                <p class="text-[11px] text-ink-muted mt-1">
                  Aggressive cuts risk muscle loss + adherence drop. Sage recommends 0.5-0.75 lb/week for most cuts.
                </p>
              </div>
            </div>

            <!-- Step 3: Activity + workouts -->
            <div v-else-if="step === 3" class="space-y-4">
              <p class="text-sm text-ink-muted">
                Sage uses this to calculate your TDEE (total daily energy expenditure). Honest is better than aspirational.
              </p>

              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Overall activity level</label>
                <div class="space-y-1.5">
                  <button
                    v-for="(meta, key) in ACTIVITY_LEVEL_LABELS"
                    :key="key"
                    type="button"
                    class="w-full text-left rounded-card border p-2.5 transition-all"
                    :class="draft.activity_level === key
                      ? 'border-brand bg-brand/5 ring-2 ring-brand/30'
                      : 'border-divider hover:border-brand/40'"
                    @click="draft.activity_level = key as typeof draft.activity_level"
                  >
                    <div class="font-semibold text-ink text-sm">{{ meta.label }}</div>
                    <div class="text-[11px] text-ink-muted">{{ meta.detail }}</div>
                  </button>
                </div>
              </div>

              <div class="grid sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Workouts per week (target)</label>
                  <input v-model.number="draft.workouts_per_week_target" type="number" min="0" max="14" class="input w-24" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Session length (min)</label>
                  <input v-model.number="draft.session_duration_min" type="number" min="10" max="180" class="input w-24" />
                </div>
              </div>

              <div class="grid sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Preferred split</label>
                  <select v-model="draft.preferred_split" class="input">
                    <option v-for="o in SPLIT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">When you usually train</label>
                  <select v-model="draft.preferred_workout_time" class="input">
                    <option v-for="o in WORKOUT_TIME_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Step 4: Food prefs -->
            <div v-else-if="step === 4" class="space-y-4">
              <p class="text-sm text-ink-muted">
                Sage's meal plans respect your reality. Skip anything you don't care about — she'll learn over time too.
              </p>

              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Foods you don't like</label>
                <div class="flex items-center gap-2">
                  <input
                    v-model="newFoodDisliked"
                    type="text"
                    class="input flex-1"
                    placeholder="e.g. cilantro, mushrooms"
                    @keyup.enter="addDisliked"
                  />
                  <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold" @click="addDisliked">Add</button>
                </div>
                <div v-if="draft.foods_disliked.length > 0" class="flex flex-wrap gap-1.5 mt-2">
                  <span v-for="f in draft.foods_disliked" :key="f" class="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[11px]">
                    {{ f }}
                    <button type="button" class="opacity-60 hover:opacity-100" @click="removeDisliked(f)">×</button>
                  </span>
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Foods you avoid (medical / religious / moral)</label>
                <div class="flex items-center gap-2">
                  <input
                    v-model="newFoodAvoided"
                    type="text"
                    class="input flex-1"
                    placeholder="e.g. pork, shellfish, gluten"
                    @keyup.enter="addAvoided"
                  />
                  <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold" @click="addAvoided">Add</button>
                </div>
                <div v-if="draft.foods_avoided.length > 0" class="flex flex-wrap gap-1.5 mt-2">
                  <span v-for="f in draft.foods_avoided" :key="f" class="inline-flex items-center gap-1 rounded-full bg-warn/10 text-warn px-2 py-0.5 text-[11px]">
                    {{ f }}
                    <button type="button" class="opacity-60 hover:opacity-100" @click="removeAvoided(f)">×</button>
                  </span>
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Cuisines you enjoy</label>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="c in COMMON_CUISINES"
                    :key="c"
                    type="button"
                    class="rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors capitalize"
                    :class="draft.cuisines_loved.includes(c)
                      ? 'bg-brand text-white border-brand'
                      : 'bg-surface text-ink border-divider hover:border-brand/40'"
                    @click="toggleCuisine(c)"
                  >{{ c.replace('_', ' ') }}</button>
                </div>
              </div>

              <div class="grid sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">First meal time</label>
                  <input v-model="draft.eating_window_start" type="time" class="input" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Last meal time</label>
                  <input v-model="draft.eating_window_end" type="time" class="input" />
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Cooking skill</label>
                <select v-model="draft.cooking_skill" class="input">
                  <option v-for="o in COOKING_SKILL_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
            </div>

            <!-- Step 5: Injuries + equipment -->
            <div v-else-if="step === 5" class="space-y-4">
              <p class="text-sm text-ink-muted">
                Sage routes around limitations and works with what you actually have.
              </p>

              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Current injuries / limitations</label>
                <div class="flex items-center gap-2">
                  <select v-model="newInjuryPart" class="input flex-1">
                    <option value="">Select body part…</option>
                    <option v-for="p in COMMON_INJURY_BODY_PARTS" :key="p" :value="p">{{ p.replace('_', ' ') }}</option>
                  </select>
                  <input
                    v-model="newInjuryNote"
                    type="text"
                    class="input flex-1"
                    placeholder="e.g. avoid OHP for 4 weeks"
                  />
                  <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold" @click="addInjury">Add</button>
                </div>
                <ul v-if="draft.injuries.length > 0" class="space-y-1.5 mt-2">
                  <li
                    v-for="(inj, i) in draft.injuries"
                    :key="i"
                    class="flex items-center justify-between gap-2 rounded-md border border-divider px-3 py-1.5 text-xs"
                  >
                    <span>
                      <strong class="text-ink capitalize">{{ inj.body_part.replace('_', ' ') }}</strong>
                      <span class="text-ink-muted ml-1.5">{{ inj.note }}</span>
                    </span>
                    <button type="button" class="text-danger text-[11px] font-medium" @click="removeInjury(i)">Remove</button>
                  </li>
                </ul>
              </div>

              <div class="space-y-2">
                <label class="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input v-model="draft.has_commercial_gym" type="checkbox" class="h-4 w-4 rounded border-divider" />
                  I have a commercial gym membership
                </label>
                <label class="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input v-model="draft.has_home_gym" type="checkbox" class="h-4 w-4 rounded border-divider" />
                  I have a home gym setup
                </label>
              </div>

              <div v-if="draft.has_home_gym">
                <label class="block text-xs font-semibold text-ink mb-1.5">Home equipment available</label>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="e in COMMON_HOME_EQUIPMENT"
                    :key="e"
                    type="button"
                    class="rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors capitalize"
                    :class="draft.home_equipment.includes(e)
                      ? 'bg-brand text-white border-brand'
                      : 'bg-surface text-ink border-divider hover:border-brand/40'"
                    @click="toggleEquipment(e)"
                  >{{ e.replace('_', ' ') }}</button>
                </div>
              </div>
            </div>

            <!-- Step 6: Review computed targets + save -->
            <div v-else-if="step === 6" class="space-y-4">
              <p class="text-sm text-ink-muted">
                Here's what Sage calculated from your profile + Apple Health data. You can edit anything by going back.
              </p>

              <div v-if="!currentWeightLbs" class="rounded-card border border-warn/30 bg-warn/5 p-3 text-sm text-warn">
                ⚠️ No weight reading found in Apple Health. Step on a scale and sync, then return — Sage needs current weight to calculate calorie + macro targets.
              </div>

              <div v-else-if="previewTargets" class="space-y-3">
                <!-- Energy -->
                <div class="card p-4">
                  <div class="flex items-baseline justify-between mb-2">
                    <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Daily energy</div>
                    <div class="text-2xl font-bold text-ink tabular-nums">
                      {{ previewTargets.daily_cal_target.toLocaleString() }}<span class="text-sm font-normal text-ink-muted ml-1">kcal/day</span>
                    </div>
                  </div>
                  <p class="text-[11px] text-ink-muted leading-relaxed">{{ previewTargets.rationale.energy }}</p>
                </div>

                <!-- Macros grid -->
                <div class="grid sm:grid-cols-3 gap-3">
                  <div class="card p-3">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Protein</div>
                    <div class="text-xl font-bold text-ink tabular-nums">{{ previewTargets.protein_g }}g</div>
                    <p class="text-[10px] text-ink-muted mt-1 leading-snug">{{ previewTargets.rationale.protein }}</p>
                  </div>
                  <div class="card p-3">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Fat</div>
                    <div class="text-xl font-bold text-ink tabular-nums">{{ previewTargets.fat_g_target }}g</div>
                    <p class="text-[10px] text-ink-muted mt-1 leading-snug">{{ previewTargets.rationale.fat }}</p>
                  </div>
                  <div class="card p-3">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Carbs</div>
                    <div class="text-xl font-bold text-ink tabular-nums">{{ previewTargets.carbs_g }}g</div>
                    <p class="text-[10px] text-ink-muted mt-1 leading-snug">{{ previewTargets.rationale.carbs }}</p>
                  </div>
                </div>

                <!-- Sat fat ceiling (the key blood-work-aware one) -->
                <div class="card p-3 border-warn/20">
                  <div class="flex items-baseline justify-between">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-warn">Sat fat ceiling</div>
                    <div class="text-lg font-bold text-warn tabular-nums">≤ {{ previewTargets.sat_fat_g_ceiling }}g/day</div>
                  </div>
                  <p class="text-[11px] text-ink-muted mt-1 leading-snug">{{ previewTargets.rationale.sat_fat }}</p>
                </div>

                <!-- Hydration + fiber -->
                <div class="grid sm:grid-cols-2 gap-3">
                  <div class="card p-3">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Water</div>
                    <div class="text-base font-semibold text-ink">{{ previewTargets.water_oz }} oz/day</div>
                  </div>
                  <div class="card p-3">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Fiber</div>
                    <div class="text-base font-semibold text-ink">{{ previewTargets.fiber_g }}g/day</div>
                  </div>
                </div>

                <p class="text-[11px] text-ink-disabled italic mt-2">
                  These are baseline targets. Sage adjusts daily based on workout vs. rest day, current bloodwork, and your real-world adherence.
                </p>
              </div>

              <p v-if="errorMsg" class="text-sm text-danger mt-2">{{ errorMsg }}</p>
            </div>
          </div>

          <!-- ── Footer — back / next / save ───────────────────────── -->
          <div class="flex items-center justify-between gap-3 px-6 py-4 border-t border-divider bg-surface-elevated">
            <button
              v-if="step > 1"
              type="button"
              class="btn-ghost !px-3 !text-xs"
              :disabled="submitting"
              @click="back"
            >← Back</button>
            <span v-else></span>

            <div class="flex items-center gap-2">
              <button
                v-if="step < TOTAL_STEPS"
                type="button"
                class="btn-primary !text-sm"
                :disabled="!canAdvance"
                @click="next"
              >Next</button>
              <button
                v-else
                type="button"
                class="btn-primary !text-sm"
                :disabled="submitting || !currentWeightLbs"
                @click="onSave"
              >
                <span v-if="submitting">Saving…</span>
                <span v-else>Save profile</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
