<script setup lang="ts">
/**
 * Josh Personal — "Plan next" multi-step popover.
 *
 * Step 1 — Review (only if there's an unreviewed prior plan)
 *   For each meal Josh 👎'd in-week, structured Qs: reaction · reason ·
 *   ingredient · notes. Plus one open free-text "anything else?"
 *
 * Step 2 — Window
 *   Start date · length in days · which meal slots to include
 *
 * Step 3 — Servings
 *   Per-slot servings (1-20). Defaults to last plan's choices.
 *
 * Step 4 — Generate
 *   Fires generate-weekly-plan with the full payload.
 */
import { ref, computed, watch, onMounted } from 'vue'
import AssistantMark from '@/components/AssistantMark.vue'
import type { WeeklyPlan, MealSlot, MealFeedbackRow } from '@/lib/clients/josh-personal/weeklyPlanApi'

const props = defineProps<{
  open: boolean
  /** The currently-loaded plan (used to pull last week's serving defaults). */
  currentPlan: WeeklyPlan | null
  /** A prior unreviewed plan, if any. If null, Step 1 is skipped. */
  priorUnreviewed: WeeklyPlan | null
  /** Existing inline-react feedback for the prior plan, prefills Step 1 Qs. */
  priorFeedback: MealFeedbackRow[]
  generating: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit-review', payload: {
    plan_id: string
    day_idx: number
    meal_slot: MealSlot
    meal_name: string | null
    reaction: 'loved' | 'liked' | 'neutral' | 'never_again'
    reason_category?: string
    flagged_ingredient?: string
    notes?: string
  }): Promise<{ ok: boolean }>
  (e: 'mark-reviewed', planId: string): Promise<{ ok: boolean }>
  (e: 'generate', payload: {
    start_date: string
    length_days: number
    servings_by_slot: Record<MealSlot, number>
    included_slots: MealSlot[]
    weekly_preferences: string
  }): Promise<{ ok: boolean; error?: string }>
}>()

const STEPS = ['review', 'window', 'servings', 'preferences', 'generate'] as const
type StepKey = typeof STEPS[number]
const step = ref<StepKey>('review')
const error = ref<string | null>(null)

// ── Derived: which meals from the prior plan need review? ───────────
// Anything Josh inline-reacted to during the week. (We don't force him
// to rate every meal — only the flagged ones.)
const reviewItems = computed(() => {
  if (!props.priorUnreviewed) return []
  const seen = new Set<string>()
  const items: Array<{
    plan_id: string
    day_idx: number
    meal_slot: MealSlot
    meal_name: string
    initial_reaction: 'loved' | 'never_again'
  }> = []
  for (const fb of props.priorFeedback) {
    if (fb.source !== 'inline') continue
    if (fb.reaction !== 'loved' && fb.reaction !== 'never_again') continue
    const key = `${fb.day_idx}-${fb.meal_slot}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({
      plan_id: fb.plan_id,
      day_idx: fb.day_idx,
      meal_slot: fb.meal_slot,
      meal_name: fb.meal_name ?? '(meal)',
      initial_reaction: fb.reaction,
    })
  }
  return items
})

// One row of "answers" per review item, plus an "anything else" free text.
interface ReviewAnswer {
  reaction: 'loved' | 'liked' | 'neutral' | 'never_again'
  reason_category: string
  flagged_ingredient: string
  notes: string
  skip: boolean
}
const reviewAnswers = ref<Record<string, ReviewAnswer>>({})
const reviewExtraNotes = ref('')

// Init defaults once review items are known
watch(reviewItems, (items) => {
  for (const it of items) {
    const key = `${it.day_idx}-${it.meal_slot}`
    if (!reviewAnswers.value[key]) {
      reviewAnswers.value[key] = {
        reaction: it.initial_reaction,
        reason_category: '',
        flagged_ingredient: '',
        notes: '',
        skip: false,
      }
    }
  }
}, { immediate: true })

// ── Step 2 — Window ─────────────────────────────────────────────────

function nextMondayIso(): string {
  const d = new Date()
  const dow = d.getDay()
  const daysUntilMon = dow === 1 ? 0 : (dow === 0 ? 1 : 8 - dow)
  d.setDate(d.getDate() + daysUntilMon)
  return d.toISOString().slice(0, 10)
}

const startDate = ref<string>(nextMondayIso())
const lengthDays = ref<number>(7)
const slotsIncluded = ref<Record<MealSlot, boolean>>({
  breakfast: true, lunch: true, dinner: true, snacks: true,
})

// ── Step 3 — Servings ────────────────────────────────────────────────

const servings = ref<Record<MealSlot, number>>({
  breakfast: 1, lunch: 1, dinner: 1, snacks: 1,
})

// ── Step 4 — Preferences (per-week, transient) ───────────────────────
// Free-form text Josh adds at plan-creation time. Examples:
//   "more grilled protein, less rice"
//   "no fish this week — bad batch last time"
//   "try one Thai meal"
//   "easy on the dishes, sheet-pan stuff"
// Passed straight into the generate-weekly-plan prompt. Separate from
// the persistent foods_avoided/cuisines_loved on personal_profile which
// applies every week.
const weeklyPreferences = ref('')

const PREFERENCE_SUGGESTIONS = [
  'more grilled protein',
  'less rice / fewer carbs',
  'easy cleanup (sheet-pan, one-pot)',
  'no fish this week',
  'add one Thai or Vietnamese meal',
  'leftovers-friendly for the work week',
  'spicy is fine',
  'something new for dinner Friday',
]

function addSuggestion(text: string) {
  const cur = weeklyPreferences.value.trim()
  weeklyPreferences.value = cur ? `${cur}\n${text}` : text
}

// Prefill from last plan when opened
watch(() => props.open, (open) => {
  if (!open) return
  // Decide starting step based on whether there's anything to review
  step.value = (props.priorUnreviewed && reviewItems.value.length > 0) ? 'review' : 'window'
  error.value = null
  // Reset window defaults
  startDate.value = nextMondayIso()
  lengthDays.value = 7
  slotsIncluded.value = { breakfast: true, lunch: true, dinner: true, snacks: true }
  // Reset weekly preferences — they're transient, not persisted
  weeklyPreferences.value = ''
  // Prefill servings from last plan if present
  if (props.currentPlan?.servings_by_slot) {
    servings.value = { ...props.currentPlan.servings_by_slot }
  }
  if (props.currentPlan?.included_slots) {
    const inc = new Set(props.currentPlan.included_slots)
    slotsIncluded.value = {
      breakfast: inc.has('breakfast'),
      lunch: inc.has('lunch'),
      dinner: inc.has('dinner'),
      snacks: inc.has('snacks'),
    }
  }
}, { immediate: false })

onMounted(() => {
  if (props.currentPlan?.servings_by_slot) {
    servings.value = { ...props.currentPlan.servings_by_slot }
  }
})

const includedSlots = computed<MealSlot[]>(() =>
  (Object.entries(slotsIncluded.value) as [MealSlot, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => k),
)

const canAdvanceWindow = computed(() => {
  if (!startDate.value) return false
  if (lengthDays.value < 1 || lengthDays.value > 30) return false
  if (includedSlots.value.length === 0) return false
  return true
})

// ── Step transitions ────────────────────────────────────────────────

async function advanceFromReview() {
  if (!props.priorUnreviewed) {
    step.value = 'window'
    return
  }
  error.value = null
  // Submit each answered (non-skipped) review row
  for (const it of reviewItems.value) {
    const key = `${it.day_idx}-${it.meal_slot}`
    const ans = reviewAnswers.value[key]
    if (!ans || ans.skip) continue
    const r = await emit('submit-review', {
      plan_id: it.plan_id,
      day_idx: it.day_idx,
      meal_slot: it.meal_slot,
      meal_name: it.meal_name,
      reaction: ans.reaction,
      reason_category: ans.reason_category || undefined,
      flagged_ingredient: ans.flagged_ingredient.trim() || undefined,
      notes: ans.notes.trim() || undefined,
    })
    if (!r.ok) {
      error.value = 'Failed to save review — try again'
      return
    }
  }
  // Save the "anything else" note as a synthetic feedback row pinned
  // to day_idx=0, meal_slot='dinner' with source review, only if non-empty.
  if (reviewExtraNotes.value.trim()) {
    const r = await emit('submit-review', {
      plan_id: props.priorUnreviewed.id,
      day_idx: 0,
      meal_slot: 'dinner',
      meal_name: '(week-level note)',
      reaction: 'neutral',
      notes: reviewExtraNotes.value.trim(),
    })
    if (!r.ok) {
      error.value = 'Failed to save your note'
      return
    }
  }
  // Mark the plan reviewed
  const m = await emit('mark-reviewed', props.priorUnreviewed.id)
  if (!m.ok) {
    error.value = 'Could not mark prior plan as reviewed'
    return
  }
  step.value = 'window'
}

async function onGenerate() {
  error.value = null
  step.value = 'generate'
  const r = await emit('generate', {
    start_date: startDate.value,
    length_days: lengthDays.value,
    servings_by_slot: servings.value,
    included_slots: includedSlots.value,
    weekly_preferences: weeklyPreferences.value.trim(),
  })
  if (!r.ok) {
    error.value = r.error ?? 'Plan generation failed'
    step.value = 'preferences'  // let them retry from preferences (their last edit point)
    return
  }
  emit('close')
}

function close() { emit('close') }

const REASON_OPTIONS = [
  { value: 'taste', label: 'Taste' },
  { value: 'ingredient', label: 'One ingredient' },
  { value: 'prep_effort', label: 'Too much prep' },
  { value: 'portion', label: 'Portion size' },
  { value: 'not_my_thing', label: 'Not my thing' },
  { value: 'other', label: 'Other' },
]
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-100"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8">
      <div class="w-full max-w-2xl mx-4 card p-0 overflow-hidden shadow-2xl">
        <!-- Header -->
        <header class="px-5 py-3 border-b border-divider bg-brand/5 flex items-start justify-between gap-3">
          <div class="flex items-center gap-2">
            <AssistantMark class="h-5 w-5 text-brand" />
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Plan next</div>
              <div class="font-semibold text-ink text-sm">
                <span v-if="step === 'review'">Step 1 of 5 · Quick review</span>
                <span v-else-if="step === 'window'">Step 2 of 5 · Window</span>
                <span v-else-if="step === 'servings'">Step 3 of 5 · Servings</span>
                <span v-else-if="step === 'preferences'">Step 4 of 5 · This week's preferences</span>
                <span v-else>Generating…</span>
              </div>
            </div>
          </div>
          <button type="button" class="text-ink-muted hover:text-ink text-2xl leading-none" @click="close">×</button>
        </header>

        <!-- Body -->
        <div class="px-5 py-5">

          <!-- ── Step 1: Review ───────────────────────────────────────── -->
          <div v-if="step === 'review'">
            <p class="text-sm text-ink-muted mb-4">
              Before we plan next, quick review of last week. Just the meals you flagged mid-week.
            </p>
            <div v-if="reviewItems.length === 0" class="rounded-card bg-canvas border border-divider p-4 text-sm text-ink-muted">
              No meals were flagged during the week. Anything notable I should know about before I draft the next plan?
              <textarea
                v-model="reviewExtraNotes"
                rows="3"
                placeholder="e.g. 'the chili recipe was great, repeat it' or 'too much repetition on chicken'"
                class="mt-3 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none resize-none"
              />
            </div>
            <ul v-else class="space-y-3">
              <li
                v-for="it in reviewItems"
                :key="`${it.day_idx}-${it.meal_slot}`"
                class="rounded-card border border-divider bg-surface-raised p-3"
              >
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-ink-muted">
                      Day {{ it.day_idx + 1 }} · {{ it.meal_slot }}
                    </div>
                    <div class="font-semibold text-ink text-sm">{{ it.meal_name }}</div>
                  </div>
                  <label class="text-xs text-ink-muted inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      :checked="reviewAnswers[`${it.day_idx}-${it.meal_slot}`]?.skip ?? false"
                      class="h-3.5 w-3.5"
                      @change="(e) => {
                        const k = `${it.day_idx}-${it.meal_slot}`
                        if (reviewAnswers[k]) reviewAnswers[k].skip = (e.target as HTMLInputElement).checked
                      }"
                    />
                    Skip
                  </label>
                </div>
                <div v-if="!reviewAnswers[`${it.day_idx}-${it.meal_slot}`]?.skip" class="grid sm:grid-cols-2 gap-2">
                  <div>
                    <label class="text-[10px] uppercase tracking-wider text-ink-muted">Reaction</label>
                    <select
                      v-model="reviewAnswers[`${it.day_idx}-${it.meal_slot}`].reaction"
                      class="mt-0.5 w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                    >
                      <option value="loved">Loved it</option>
                      <option value="liked">Liked it</option>
                      <option value="neutral">Neutral</option>
                      <option value="never_again">Never again</option>
                    </select>
                  </div>
                  <div>
                    <label class="text-[10px] uppercase tracking-wider text-ink-muted">Reason</label>
                    <select
                      v-model="reviewAnswers[`${it.day_idx}-${it.meal_slot}`].reason_category"
                      class="mt-0.5 w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                    >
                      <option value="">—</option>
                      <option v-for="r in REASON_OPTIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="text-[10px] uppercase tracking-wider text-ink-muted">Ingredient (optional)</label>
                    <input
                      v-model="reviewAnswers[`${it.day_idx}-${it.meal_slot}`].flagged_ingredient"
                      placeholder="e.g. dill, mushrooms"
                      class="mt-0.5 w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label class="text-[10px] uppercase tracking-wider text-ink-muted">Notes (optional)</label>
                    <input
                      v-model="reviewAnswers[`${it.day_idx}-${it.meal_slot}`].notes"
                      placeholder="anything else"
                      class="mt-0.5 w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>
              </li>
            </ul>
            <div v-if="reviewItems.length > 0" class="mt-4">
              <label class="text-[10px] uppercase tracking-wider text-ink-muted">Anything else about last week?</label>
              <textarea
                v-model="reviewExtraNotes"
                rows="2"
                placeholder="(optional) e.g. 'too much repetition on chicken'"
                class="mt-0.5 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none resize-none"
              />
            </div>
          </div>

          <!-- ── Step 2: Window ───────────────────────────────────────── -->
          <div v-else-if="step === 'window'">
            <p class="text-sm text-ink-muted mb-4">Pick the window and which meal slots Sage should plan.</p>
            <div class="grid sm:grid-cols-2 gap-3">
              <div>
                <label class="text-[10px] uppercase tracking-wider text-ink-muted">Start date</label>
                <input
                  v-model="startDate"
                  type="date"
                  class="mt-0.5 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label class="text-[10px] uppercase tracking-wider text-ink-muted">Length (days)</label>
                <input
                  v-model.number="lengthDays"
                  type="number"
                  min="1"
                  max="30"
                  class="mt-0.5 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            </div>
            <div class="mt-4">
              <div class="text-[10px] uppercase tracking-wider text-ink-muted mb-1.5">Include meal slots</div>
              <div class="flex flex-wrap gap-2">
                <label
                  v-for="slot in (['breakfast','lunch','dinner','snacks'] as MealSlot[])"
                  :key="slot"
                  class="inline-flex items-center gap-2 rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink cursor-pointer hover:border-brand"
                  :class="slotsIncluded[slot] ? 'border-brand bg-brand/5' : ''"
                >
                  <input type="checkbox" v-model="slotsIncluded[slot]" class="h-3.5 w-3.5" />
                  <span class="capitalize">{{ slot }}</span>
                </label>
              </div>
            </div>
          </div>

          <!-- ── Step 3: Servings ─────────────────────────────────────── -->
          <div v-else-if="step === 'servings'">
            <p class="text-sm text-ink-muted mb-4">
              How many portions per slot this week? Macros stay yours (per one serving); the shopping list scales by this.
            </p>
            <div class="grid sm:grid-cols-2 gap-3">
              <template v-for="slot in (['breakfast','lunch','dinner','snacks'] as MealSlot[])" :key="slot">
                <div v-if="slotsIncluded[slot]">
                  <label class="text-[10px] uppercase tracking-wider text-ink-muted capitalize">{{ slot }}</label>
                  <input
                    v-model.number="servings[slot]"
                    type="number"
                    min="1"
                    max="20"
                    class="mt-0.5 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
              </template>
            </div>
            <p class="text-[11px] text-ink-muted mt-3">
              Defaults pulled from your last plan. For a family dinner week, bump dinner to your household size.
            </p>
          </div>

          <!-- ── Step 4: This week's preferences ─────────────────────── -->
          <div v-else-if="step === 'preferences'">
            <label class="block text-[11px] uppercase tracking-wider text-ink-muted mb-2">
              Anything Sage should know about THIS week?
            </label>
            <textarea
              v-model="weeklyPreferences"
              rows="4"
              placeholder="E.g., more grilled protein, no fish, try one Thai dinner, easy on the dishes…"
              class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none resize-y"
            />
            <p class="text-[11px] text-ink-muted mt-1.5 leading-snug">
              One thought per line. Optional — leave blank if nothing comes to mind. Persistent preferences (foods avoided, cuisines loved) come from your profile and apply every week.
            </p>

            <div class="mt-3">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">Quick adds</div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="s in PREFERENCE_SUGGESTIONS"
                  :key="s"
                  type="button"
                  class="rounded-full border border-divider bg-surface-raised px-2 py-0.5 text-[11px] text-ink-muted hover:border-brand hover:text-brand"
                  @click="addSuggestion(s)"
                >+ {{ s }}</button>
              </div>
            </div>
          </div>

          <!-- ── Step 5: Generating ──────────────────────────────────── -->
          <div v-else class="py-6 text-center">
            <div class="inline-flex items-center gap-2 text-ink">
              <AssistantMark class="h-5 w-5 text-brand animate-pulse" />
              <span class="text-sm">Sage is drafting your plan…</span>
            </div>
            <p class="text-[11px] text-ink-muted mt-2">Usually 30-60 seconds. You can close this; the plan will land on the page.</p>
          </div>

          <p v-if="error" class="text-xs text-danger mt-4">{{ error }}</p>
        </div>

        <!-- Footer -->
        <footer class="px-5 py-3 border-t border-divider bg-surface-elevated flex items-center justify-between gap-2">
          <button type="button" class="text-xs text-ink-muted hover:text-ink" @click="close">Cancel</button>
          <div class="flex items-center gap-2">
            <button
              v-if="step === 'review'"
              type="button"
              class="rounded-md bg-brand text-white px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              @click="advanceFromReview"
            >Next</button>
            <button
              v-else-if="step === 'window'"
              type="button"
              class="rounded-md bg-brand text-white px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              :disabled="!canAdvanceWindow"
              @click="step = 'servings'"
            >Next</button>
            <button
              v-else-if="step === 'servings'"
              type="button"
              class="rounded-md bg-brand text-white px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              @click="step = 'preferences'"
            >Next</button>
            <button
              v-else-if="step === 'preferences'"
              type="button"
              class="rounded-md bg-brand text-white px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              :disabled="generating"
              @click="onGenerate"
            >Generate plan</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>
