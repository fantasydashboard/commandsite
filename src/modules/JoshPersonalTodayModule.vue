<script setup lang="ts">
/**
 * Josh Personal — Today (was Health).
 *
 * The AI-assistant landing. Three states:
 *   1. Loading → spinner
 *   2. No profile → CTA to open the onboarding wizard
 *   3. Profile present → render targets card + snapshot KPIs +
 *      today's plan slice + active concerns reminder.
 *
 * The morning brief (Sage's daily action plan) lands in the next
 * session — for now, what's here is the foundation that the brief
 * will plug into.
 */
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import type { Client } from '@/types/database'
import { supabase } from '@/lib/supabase'
import AssistantMark from '@/components/AssistantMark.vue'
import JoshPersonalOnboardingModal from '@/components/JoshPersonalOnboardingModal.vue'
import JoshPersonalSageChatPanel from '@/components/JoshPersonalSageChatPanel.vue'
import JoshPersonalMealPhotoModal from '@/components/JoshPersonalMealPhotoModal.vue'
import JoshPersonalWorkoutPanel from '@/components/JoshPersonalWorkoutPanel.vue'
import JoshPersonalWeightTrendCard from '@/components/JoshPersonalWeightTrendCard.vue'
import JoshPersonalNowCard from '@/components/JoshPersonalNowCard.vue'
import JoshPersonalQuickLogPopover from '@/components/JoshPersonalQuickLogPopover.vue'
import JoshPersonalDailyRings from '@/components/JoshPersonalDailyRings.vue'
import JoshPersonalHydrationCard from '@/components/JoshPersonalHydrationCard.vue'
import JoshPersonalDaySchedule from '@/components/JoshPersonalDaySchedule.vue'
import JoshPersonalExperimentsCard from '@/components/JoshPersonalExperimentsCard.vue'
import JoshPersonalPatternsCard from '@/components/JoshPersonalPatternsCard.vue'
import {
  TODAY_LABEL,
  STEPS_DAILY_TARGET,
  activeConcerns,
  todayPlan,
} from '@/lib/clients/josh-personal/health'
import { useHealthData } from '@/lib/clients/josh-personal/healthData'
import { useProfile } from '@/lib/clients/josh-personal/profileApi'
import { useMorningBrief } from '@/lib/clients/josh-personal/morningBriefApi'
import { useWeeklyPlan } from '@/lib/clients/josh-personal/weeklyPlanApi'
import { useMealLog } from '@/lib/clients/josh-personal/mealLogApi'
import { useNowState, type NowAction } from '@/lib/clients/josh-personal/nowStateApi'
import { useExperiments } from '@/lib/clients/josh-personal/experimentsApi'
import { usePatterns } from '@/lib/clients/josh-personal/patternsApi'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const { snapshot, dailyWeight, trends } = useHealthData()
const { profile, hasProfile, targets, loading: profileLoading } = useProfile()
const { brief, generating: briefGenerating, isStale: briefIsStale, regenerate: regenerateBrief } = useMorningBrief()
const { todaySlice: realTodaySlice } = useWeeklyPlan()
const { todayMeals, todayTotals, recentDays, totalLogged, load: reloadMealLog, deleteMeal, logMeal } = useMealLog()
const { state: nowState, loading: nowLoading, refreshing: nowRefreshing, refresh: refreshNow, refreshedAgo: nowRefreshedAgo, isStale: nowIsStale } = useNowState()
const { active: activeExperiments, recentlyCompleted: completedExperiments, daysRemaining: experimentDaysRemaining, progressPct: experimentProgressPct, load: reloadExperiments } = useExperiments()
const { ordered: orderedPatterns, load: reloadPatterns } = usePatterns()

// ── Pattern → Sage chat handoff ─────────────────────────────────────
const chatSeedPrompt = ref<string | null>(null)
function discussPattern(prompt: string) {
  chatSeedPrompt.value = prompt
  chatOpen.value = true
}

// ── Today's water + sleep helpers (read directly from personal_metrics) ──
// useHealthData gives us snapshot.sleep + dailyHrvAvg trends, but not
// today's water sum. Pull it here so the rings + hydration card stay
// live as Sage / quick-log writes new rows.
const todayWaterOz = ref<number>(0)
async function loadTodayWater() {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('personal_metrics')
    .select('value')
    .eq('metric_type', 'water_intake')
    .gte('recorded_at', start.toISOString())
  todayWaterOz.value = ((data ?? []) as { value: number | string }[])
    .reduce((s, r) => s + Number(r.value), 0)
}
onMounted(loadTodayWater)
async function reloadAfterMetricWrite() {
  await loadTodayWater()
}

async function onDeleteMeal(id: string) {
  if (!window.confirm('Delete this meal entry?')) return
  await deleteMeal(id)
}

async function onLogPlanned(payload: {
  description: string
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  estimated_cal: number | null
  estimated_protein_g: number | null
}) {
  const r = await logMeal(payload)
  if (!r.ok) console.warn('[today] manual meal log failed:', r.error)
}
const showRecent = ref(false)

// ── Today's steps from snapshot (string like "8,247" → number) ──
const todayStepsNumeric = computed<number>(() => {
  const raw = String(snapshot.value.steps.value).replace(/,/g, '')
  const n = parseInt(raw, 10)
  return isNaN(n) ? 0 : n
})

// ── Last-night sleep hours (number) ──
const lastNightSleep = computed<number | null>(() => {
  const v = snapshot.value.sleep.value
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }
  return null
})

// ── Target lookups with safe fallbacks ──
type TargetsShape = {
  daily_cal_target: number
  protein_g: number
  water_oz?: number
}
const safeTargets = computed<TargetsShape>(() => {
  const t = targets.value as TargetsShape | null
  return {
    daily_cal_target: t?.daily_cal_target ?? 2200,
    protein_g: t?.protein_g ?? 180,
    water_oz: t?.water_oz ?? 96,
  }
})
const sleepTargetHours = computed<number>(() => {
  const v = (profile.value as { sleep_target_hours?: number } | null)?.sleep_target_hours
  return typeof v === 'number' && v > 0 ? v : 7.5
})

// ── Micro-insights derived from the 56-day trend window ──
const microInsights = computed<string[]>(() => {
  const out: string[] = []
  const t = trends.value
  if (!t) return out

  // HRV last 7 vs prior 7
  const hrv = t.hrv?.values ?? []
  if (hrv.length >= 14) {
    const recent7 = hrv.slice(-7)
    const prior7 = hrv.slice(-14, -7)
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
    const recentAvg = avg(recent7)
    const priorAvg = avg(prior7)
    if (priorAvg > 0) {
      const pctDiff = ((recentAvg - priorAvg) / priorAvg) * 100
      if (Math.abs(pctDiff) >= 5) {
        const dir = pctDiff > 0 ? 'up' : 'down'
        out.push(`HRV ${dir} ${Math.abs(pctDiff).toFixed(0)}% week-over-week (${Math.round(recentAvg)}ms vs ${Math.round(priorAvg)}ms).`)
      }
    }
  }

  // Steps last 7 vs prior 7
  const steps = t.steps?.values ?? []
  if (steps.length >= 14) {
    const recent7 = steps.slice(-7)
    const prior7 = steps.slice(-14, -7)
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
    const recentAvg = avg(recent7)
    const priorAvg = avg(prior7)
    if (priorAvg > 0) {
      const pctDiff = ((recentAvg - priorAvg) / priorAvg) * 100
      if (Math.abs(pctDiff) >= 10) {
        const dir = pctDiff > 0 ? 'up' : 'down'
        out.push(`Steps ${dir} ${Math.abs(pctDiff).toFixed(0)}% this week (avg ${Math.round(recentAvg).toLocaleString()}/day).`)
      }
    }
  }

  // Sleep 7-day avg vs target
  const sleep = t.sleep?.values ?? []
  if (sleep.length >= 7) {
    const avg7 = sleep.slice(-7).reduce((s, v) => s + v, 0) / 7
    const tgt = sleepTargetHours.value
    if (avg7 < tgt - 0.4) {
      out.push(`Averaging ${avg7.toFixed(1)}h sleep — ${(tgt - avg7).toFixed(1)}h under target.`)
    } else if (avg7 > tgt + 0.3) {
      out.push(`Averaging ${avg7.toFixed(1)}h sleep — on or above target.`)
    }
  }
  return out.slice(0, 3)
})

// ── Quick-log popover ──
const quickLogOpen = ref(false)
function openQuickLog() { quickLogOpen.value = true }
async function onQuickLogged(kind: 'weight' | 'water' | 'mood' | 'bp') {
  await reloadAfterMetricWrite()
  // No-op for kinds we don't currently re-derive from. Future: scroll to relevant card.
  void kind
}

// ── Now-card actions ──
function onNowAction(action: NowAction) {
  if (action.kind === 'log_water') {
    const oz = Number((action.payload as { oz?: number } | undefined)?.oz ?? 16)
    // Use the silent water-log path then refresh totals
    import('@/lib/clients/josh-personal/nowStateApi').then(async (m) => {
      await m.logWaterOz(oz)
      await reloadAfterMetricWrite()
    })
  } else if (action.kind === 'log_weight' || action.kind === 'log_mood') {
    openQuickLog()
  } else if (action.kind === 'open_chat') {
    chatOpen.value = true
  } else if (action.kind === 'open_plan') {
    // Plan is a sibling tab — best-effort navigate via query string used elsewhere.
    window.location.hash = ''  // no-op; routing handled by tab UI in DashboardLayout
  }
}

// ── Planned-meals shape for the merged day-schedule (normalize from
//      "snacks" plan-key vs the underlying mock) ──
type PlanSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks'
const plannedTodayMeals = computed<Partial<Record<PlanSlot, { name: string; cal: number; protein: number; detail: string; servings?: number }>> | null>(() => {
  const t = realTodaySlice.value ?? todayPlan()
  if (!t || !t.meals) return null
  const m = t.meals as Record<string, { name: string; cal: number; protein: number; detail: string; servings?: number }>
  return {
    breakfast: m.breakfast,
    lunch: m.lunch,
    dinner: m.dinner,
    snacks: m.snacks,
  }
})

// ── Weight-goal progress (for the "bigger goals" strip) ───────────────
//
// Compute progress toward the user's target weight. Uses snapshot's
// current weight + profile's target_weight_lbs + target_deadline.
// Status logic:
//   - On track: trending toward target at >= required pace
//   - At risk:  trending toward target but slower than required pace
//   - Off track: not trending toward target (or already at target)

interface WeightGoalProgress {
  current: number
  target: number
  toGo: number             // positive = lbs to lose (cut), negative = lbs to gain
  pctRemaining: number     // % of journey still ahead (assumes start = current + delta-30d)
  pctComplete: number      // 100 - pctRemaining
  daysLeft: number | null
  weeksLeft: number | null
  requiredPaceLbsWk: number | null
  status: 'on-track' | 'at-risk' | 'off-track' | 'achieved'
  statusLabel: string
  detail: string
}

const weightGoal = computed<WeightGoalProgress | null>(() => {
  if (!profile.value) return null
  const target = profile.value.target_weight_lbs
  if (!target) return null

  const v = snapshot.value.weight.value
  const current = typeof v === 'number' ? v : parseFloat(String(v))
  if (isNaN(current)) return null

  const goal = profile.value.primary_goal
  const isCut = goal === 'cut'
  const toGo = isCut ? current - target : target - current

  // Already there?
  if (toGo <= 0.5 && toGo >= -0.5) {
    return {
      current, target, toGo: 0, pctComplete: 100, pctRemaining: 0,
      daysLeft: null, weeksLeft: null, requiredPaceLbsWk: null,
      status: 'achieved', statusLabel: 'Goal hit', detail: `You're at your target weight.`,
    }
  }

  // Time math
  let daysLeft: number | null = null
  let weeksLeft: number | null = null
  let requiredPace: number | null = null
  if (profile.value.target_deadline) {
    const deadline = new Date(profile.value.target_deadline + 'T00:00:00')
    const now = new Date()
    daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    weeksLeft = daysLeft / 7
    if (weeksLeft > 0) {
      requiredPace = Math.abs(toGo) / weeksLeft
    }
  }

  // Use 30-day delta as a proxy for pace (snapshot.weight.delta has it
  // as a string like "-2.1 lbs / 30d"). Parse it best-effort.
  let recentPaceLbsWk: number | null = null
  const deltaStr = String(snapshot.value.weight.delta ?? '')
  const m = deltaStr.match(/(-?[\d.]+)\s*lbs?\s*\/\s*30d/i)
  if (m) {
    const delta30d = parseFloat(m[1])
    recentPaceLbsWk = delta30d / (30 / 7)  // weekly pace from 30-day delta
  }

  // Status
  let status: WeightGoalProgress['status'] = 'on-track'
  let statusLabel = 'On track'
  if (recentPaceLbsWk == null) {
    statusLabel = 'No recent trend'
    status = 'at-risk'
  } else {
    const movingRightWay = isCut ? recentPaceLbsWk < 0 : recentPaceLbsWk > 0
    if (!movingRightWay) {
      status = 'off-track'
      statusLabel = isCut ? 'Weight not dropping' : 'Weight not climbing'
    } else if (requiredPace != null && Math.abs(recentPaceLbsWk) < requiredPace * 0.6) {
      status = 'at-risk'
      statusLabel = 'Behind pace'
    }
  }

  // Progress estimate: assume "start" = current + (toGo × 1.5) so the
  // bar shows meaningful progress even without explicit start weight.
  // Future: store a starting weight on profile for accurate %.
  const journey = Math.abs(toGo) * 2
  const completed = journey - Math.abs(toGo)
  const pctComplete = Math.max(0, Math.min(100, Math.round((completed / journey) * 100)))

  // Detail line
  const parts: string[] = []
  parts.push(`${Math.abs(toGo).toFixed(1)} lbs to ${isCut ? 'lose' : 'gain'}`)
  if (weeksLeft != null && weeksLeft > 0) parts.push(`${Math.ceil(weeksLeft)} wks left`)
  if (requiredPace != null) parts.push(`need ${requiredPace.toFixed(2)} lb/wk`)
  if (recentPaceLbsWk != null) parts.push(`actual ${Math.abs(recentPaceLbsWk).toFixed(2)} lb/wk`)

  return {
    current, target, toGo, pctComplete, pctRemaining: 100 - pctComplete,
    daysLeft, weeksLeft, requiredPaceLbsWk: requiredPace,
    status, statusLabel,
    detail: parts.join(' · '),
  }
})

function weightGoalStatusBadge(s: WeightGoalProgress['status']): string {
  if (s === 'on-track')  return 'bg-success/15 text-success'
  if (s === 'at-risk')   return 'bg-warn/15 text-warn'
  if (s === 'off-track') return 'bg-danger/15 text-danger'
  return 'bg-success/15 text-success'
}

const briefRegenError = ref<string | null>(null)
async function onRegenerateBrief() {
  briefRegenError.value = null
  const result = await regenerateBrief()
  if (!result.ok) {
    briefRegenError.value = result.error ?? 'Failed to regenerate brief'
    setTimeout(() => { briefRegenError.value = null }, 8000)
  }
}

function formatBriefDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const onboardingOpen = ref(false)

// Best-effort current weight: try the snapshot first (today's reading),
// otherwise the latest from profile metrics.
const currentWeightLbs = computed<number | null>(() => {
  const v = snapshot.value.weight.value
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    if (!isNaN(n)) return n
  }
  return null
})

// Prefer the real plan's today-slice when available, fall through to mock
const today = computed(() => realTodaySlice.value ?? todayPlan())

interface PlannedWorkoutExercise { name: string; sets: string; load: string; notes?: string }
const todayPlannedExercises = computed<PlannedWorkoutExercise[]>(() => {
  const raw = (today.value?.workoutExercises ?? []) as Array<Record<string, unknown>>
  return raw.map((ex) => ({
    name: String(ex.name ?? ''),
    sets: String(ex.sets ?? ''),
    load: String(ex.load ?? ''),
    notes: ex.notes ? String(ex.notes) : undefined,
  }))
})

// Ask Sage chat — real agent loop with tools
const chatOpen = ref(false)
function onChatClose() {
  chatOpen.value = false
  // Clear any seed so the next manual open starts blank
  chatSeedPrompt.value = null
}
function onChatDataChanged(payload: { tools: string[] }) {
  reloadMealLog()
  // If Sage dismissed a pattern or completed an experiment, refresh those too
  reloadPatterns()
  void payload
}

// Snap-meal photo modal
const mealPhotoOpen = ref(false)
</script>

<template>
  <div class="space-y-5">
    <!-- ── Now card (time-aware hero from Sage) ───────────────────── -->
    <JoshPersonalNowCard
      v-if="hasProfile"
      :state="nowState"
      :loading="nowLoading"
      :refreshing="nowRefreshing"
      :refreshed-ago="nowRefreshedAgo"
      :is-stale="nowIsStale"
      @refresh="refreshNow"
      @action="onNowAction"
    />

    <!-- ── Active concerns strip ─────────────────────────────────── -->
    <section v-if="activeConcerns.length > 0" class="card p-3 border-warn/30">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-base shrink-0">⚠️</span>
          <div class="min-w-0">
            <div class="text-xs font-semibold text-ink">
              {{ activeConcerns.length }} active concern{{ activeConcerns.length === 1 ? '' : 's' }} from your last blood draw
            </div>
            <div class="text-[11px] text-ink-muted truncate">
              {{ activeConcerns.map(c => `${c.label} (${c.value})`).join(' · ') }}
            </div>
          </div>
        </div>
        <RouterLink v-slot="{ navigate }" :to="{ query: { tab: 'bloodwork' } }" custom>
          <button type="button" class="text-xs font-medium text-brand hover:underline shrink-0" @click="navigate">View bloodwork →</button>
        </RouterLink>
      </div>
    </section>

    <!-- ── Onboarding CTA (when no profile yet) ─────────────────────── -->
    <section
      v-if="!profileLoading && !hasProfile"
      class="rounded-card border-2 border-brand bg-brand/5 p-6"
    >
      <div class="flex items-start gap-4">
        <AssistantMark class="h-8 w-8 text-brand mt-0.5 shrink-0" />
        <div class="flex-1">
          <h3 class="text-lg font-bold text-ink mb-1">Tell Sage about yourself first</h3>
          <p class="text-sm text-ink-muted mb-3">
            Sage needs ~5 minutes of context to give you real recommendations instead of generic ones. Height, age, your goal, what you eat, what you don't, injuries, equipment. Apple Health gives her the rest.
          </p>
          <p class="text-xs text-ink-muted mb-4">
            She'll calculate your baseline calorie + macro targets using <strong class="text-ink">Mifflin-St Jeor (BMR)</strong> + standard TDEE math, and apply <strong class="text-ink">AHA blood-work-aware guardrails</strong> (e.g. tighter saturated-fat ceiling if your LDL is elevated).
          </p>
          <button
            type="button"
            class="rounded-md bg-brand text-white px-4 py-2 text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
            @click="onboardingOpen = true"
          >
            <AssistantMark class="h-4 w-4 text-white" />
            Start onboarding · 5 min
          </button>
        </div>
      </div>
    </section>

    <!-- ── Targets summary (one-line, links to onboarding) ──────────── -->
    <section v-if="hasProfile && targets" class="card p-3">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="min-w-0">
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Targets · calculated from your profile</div>
          <div class="text-sm font-semibold text-ink mt-0.5 tabular-nums">
            {{ targets.daily_cal_target.toLocaleString() }} kcal · {{ targets.protein_g }}g protein · ≤ {{ targets.sat_fat_g_ceiling }}g sat fat
            <span class="text-ink-muted text-xs font-normal ml-1">·
              {{ targets.deficit_or_surplus_kcal !== 0
                ? `${targets.deficit_or_surplus_kcal > 0 ? '+' : ''}${targets.deficit_or_surplus_kcal} vs TDEE`
                : 'maintenance' }}
            </span>
          </div>
          <div
            v-if="targets.computed_from.bloodwork_adjustments.length > 0"
            class="text-[11px] text-warn mt-1"
          >
            <strong class="font-semibold">Sage's blood-work guardrails:</strong>
            {{ targets.computed_from.bloodwork_adjustments.join(' · ') }}
          </div>
        </div>
        <button
          type="button"
          class="text-xs text-brand font-medium hover:underline shrink-0"
          @click="onboardingOpen = true"
        >Edit profile</button>
      </div>
    </section>

    <!-- ── Bigger goal: weight trend (line graph) ─────────────────── -->
    <JoshPersonalWeightTrendCard
      v-if="weightGoal"
      :current="weightGoal.current"
      :target="weightGoal.target"
      :series="dailyWeight"
      :target-deadline="profile?.target_deadline ?? null"
      :primary-goal="profile?.primary_goal"
      :status-label="weightGoal.statusLabel"
      :status-badge-class="weightGoalStatusBadge(weightGoal.status)"
      :detail="weightGoal.detail"
    />

    <!-- ── Sage's morning brief ───────────────────────────────────── -->
    <section
      v-if="hasProfile && brief"
      class="rounded-card border-2 border-brand/40 bg-brand/5 overflow-hidden"
    >
      <header class="flex items-start justify-between gap-3 px-5 py-4 border-b border-brand/20 bg-brand/10">
        <div class="flex items-start gap-3 min-w-0">
          <AssistantMark class="h-6 w-6 text-brand mt-0.5 shrink-0" />
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
                Sage's brief · {{ formatBriefDate(brief.brief_date) }}
              </span>
              <span
                v-if="briefIsStale"
                class="rounded-full bg-warn/15 text-warn px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              >stale · regenerate for today</span>
            </div>
            <p v-if="brief.headline" class="text-base font-semibold text-ink leading-snug">
              {{ brief.headline }}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="rounded-md border border-brand/40 text-brand bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-brand/10 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
          :disabled="briefGenerating"
          @click="onRegenerateBrief"
        >
          <AssistantMark class="h-3.5 w-3.5 text-brand" />
          <span v-if="briefGenerating">Sage is writing…</span>
          <span v-else>Regenerate</span>
        </button>
      </header>

      <div class="grid sm:grid-cols-2 gap-px bg-divider">
        <div v-if="brief.todays_focus" class="bg-surface px-5 py-4">
          <div class="flex items-center gap-1.5 mb-2">
            <span class="text-base">🟢</span>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Today's focus</span>
          </div>
          <p class="text-sm text-ink leading-relaxed whitespace-pre-line">{{ brief.todays_focus }}</p>
        </div>
        <div v-if="brief.watch_out_for" class="bg-surface px-5 py-4">
          <div class="flex items-center gap-1.5 mb-2">
            <span class="text-base">⚠️</span>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Watch out for</span>
          </div>
          <p class="text-sm text-ink leading-relaxed whitespace-pre-line">{{ brief.watch_out_for }}</p>
        </div>
        <div v-if="brief.patterns_noticed" class="bg-surface px-5 py-4">
          <div class="flex items-center gap-1.5 mb-2">
            <span class="text-base">📈</span>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Pattern Sage noticed</span>
          </div>
          <p class="text-sm text-ink leading-relaxed whitespace-pre-line">{{ brief.patterns_noticed }}</p>
        </div>
        <div v-if="brief.goal_check" class="bg-surface px-5 py-4">
          <div class="flex items-center gap-1.5 mb-2">
            <span class="text-base">💪</span>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Goal check</span>
          </div>
          <p class="text-sm text-ink leading-relaxed whitespace-pre-line">{{ brief.goal_check }}</p>
        </div>
      </div>
    </section>

    <!-- ── Empty-state for brief when profile exists but no brief yet ─ -->
    <section
      v-else-if="hasProfile && !brief && !briefGenerating"
      class="card p-4 border-brand/20"
    >
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-start gap-3">
          <AssistantMark class="h-5 w-5 text-brand mt-0.5" />
          <div>
            <div class="text-sm font-semibold text-ink">Generate today's brief</div>
            <p class="text-xs text-ink-muted mt-0.5">
              Sage will read your profile, latest bloodwork, and last 7 days of metrics, then write your action plan for today.
            </p>
          </div>
        </div>
        <button
          type="button"
          class="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
          :disabled="briefGenerating"
          @click="onRegenerateBrief"
        >
          <AssistantMark class="h-3.5 w-3.5 text-white" />
          <span v-if="briefGenerating">Generating…</span>
          <span v-else>Generate brief</span>
        </button>
      </div>
    </section>

    <!-- Brief generation in progress -->
    <section
      v-else-if="briefGenerating"
      class="card p-4 border-brand/20 bg-brand/[0.02]"
    >
      <div class="flex items-center gap-3">
        <AssistantMark class="h-5 w-5 text-brand" />
        <div>
          <div class="text-sm font-semibold text-ink">Sage is writing your brief…</div>
          <p class="text-xs text-ink-muted mt-0.5">Reading your data, looking for patterns, drafting your action plan.</p>
        </div>
      </div>
    </section>

    <p v-if="briefRegenError" class="text-sm text-danger">{{ briefRegenError }}</p>

    <!-- ── Patterns Sage noticed (nightly detector) ────────────────── -->
    <JoshPersonalPatternsCard
      :patterns="orderedPatterns"
      @discuss="discussPattern"
    />

    <!-- ── Experiments (active + recently completed) ───────────────── -->
    <JoshPersonalExperimentsCard
      v-if="hasProfile"
      :active="activeExperiments"
      :recently-completed="completedExperiments"
      :days-remaining="experimentDaysRemaining"
      :progress-pct="experimentProgressPct"
      @reload="reloadExperiments"
    />

    <!-- ── Today header + Quick log button ────────────────────────── -->
    <div class="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-xl font-semibold text-ink">Today · {{ TODAY_LABEL }}</h2>
        <p class="text-xs text-ink-muted mt-0.5">Apple Watch + Apple Health, synced this morning.</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="card p-2 px-3 flex items-center gap-2">
          <span class="text-[10px] uppercase tracking-wider text-ink-muted">Streak</span>
          <span class="text-sm font-bold tabular-nums text-ink">{{ snapshot.streak.value }}<span class="text-[10px] font-normal text-ink-muted ml-0.5">{{ snapshot.streak.unit }}</span></span>
        </div>
        <button
          type="button"
          class="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-semibold hover:opacity-90"
          @click="openQuickLog"
        >+ Quick log</button>
      </div>
    </div>

    <!-- ── Goal-aware daily rings + micro-insights ──────────────── -->
    <JoshPersonalDailyRings
      :calories-value="todayTotals.cal"
      :calories-target="safeTargets.daily_cal_target"
      :protein-value="todayTotals.protein_g"
      :protein-target="safeTargets.protein_g"
      :steps-value="todayStepsNumeric"
      :steps-target="STEPS_DAILY_TARGET"
      :water-value="todayWaterOz"
      :water-target="safeTargets.water_oz ?? 96"
      :sleep-value="lastNightSleep"
      :sleep-target="sleepTargetHours"
      :micro-insights="microInsights"
    />

    <!-- ── Hydration tap-log ──────────────────────────────────────── -->
    <JoshPersonalHydrationCard
      :today-oz="todayWaterOz"
      :target-oz="safeTargets.water_oz ?? 96"
      @logged="reloadAfterMetricWrite"
    />

    <!-- ── Today: plan vs actual (merged) ─────────────────────────── -->
    <JoshPersonalDaySchedule
      :planned-meals="plannedTodayMeals"
      :logged-meals="todayMeals"
      :show-plan-fallback-hint="true"
      @delete-meal="onDeleteMeal"
      @log-planned="onLogPlanned"
    />

    <!-- ── Today's workout ────────────────────────────────────────── -->
    <JoshPersonalWorkoutPanel
      v-if="today"
      :workout="today.workout ?? null"
      :exercises="todayPlannedExercises"
    />

    <!-- ── Snap meal + recent days expander ───────────────────────── -->
    <section class="card p-3">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="text-[11px] text-ink-muted">
          Log meals via Ask Sage chat or snap a photo →
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 inline-flex items-center gap-1"
            @click="mealPhotoOpen = true"
          >📷 Snap meal</button>
          <button
            v-if="totalLogged > todayMeals.length"
            type="button"
            class="text-xs text-brand font-medium hover:underline"
            @click="showRecent = !showRecent"
          >{{ showRecent ? 'Hide' : 'Show' }} past 14d</button>
        </div>
      </div>
      <div v-if="showRecent && recentDays.length > 0" class="border-t border-divider mt-3 pt-3 divide-y divide-divider">
        <div v-for="day in recentDays" :key="day.day" class="py-3 first:pt-0">
          <div class="flex items-baseline justify-between mb-1.5">
            <div class="text-xs font-semibold text-ink">{{ day.dayLabel }}</div>
            <div class="text-[11px] text-ink-muted tabular-nums">
              {{ day.totals.cal.toLocaleString() }} cal · {{ day.totals.protein.toFixed(0) }}g p · {{ day.items.length }} {{ day.items.length === 1 ? 'meal' : 'meals' }}
            </div>
          </div>
          <ul class="space-y-1">
            <li v-for="m in day.items" :key="m.id" class="text-[11px] text-ink-muted leading-snug">
              <span class="text-ink-disabled mr-1">{{ new Date(m.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }}</span>
              <span class="text-ink capitalize">{{ m.meal_slot ?? 'meal' }}:</span>
              {{ m.description }}
              <span v-if="m.estimated_cal" class="text-ink-disabled tabular-nums ml-1">({{ m.estimated_cal }} cal)</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ── Floating Ask Sage ───────────────────────────────────────── -->
    <button
      type="button"
      class="fixed bottom-6 right-6 z-40 rounded-full bg-brand text-white shadow-2xl px-4 py-3 text-sm font-semibold hover:opacity-90 inline-flex items-center gap-2"
      @click="chatOpen = !chatOpen"
    >
      <AssistantMark class="h-4 w-4 text-white" />
      Ask Sage
    </button>
    <JoshPersonalSageChatPanel
      :open="chatOpen"
      :seed-prompt="chatSeedPrompt"
      @close="onChatClose"
      @data-changed="onChatDataChanged"
    />

    <!-- ── Snap-meal photo modal ───────────────────────────────────── -->
    <JoshPersonalMealPhotoModal
      :open="mealPhotoOpen"
      @close="mealPhotoOpen = false"
      @logged="reloadMealLog"
    />

    <!-- ── Onboarding wizard modal ─────────────────────────────────── -->
    <JoshPersonalOnboardingModal
      :open="onboardingOpen"
      :current-weight-lbs="currentWeightLbs"
      @close="onboardingOpen = false"
      @saved="onboardingOpen = false"
    />

    <!-- ── Quick log popover ───────────────────────────────────────── -->
    <JoshPersonalQuickLogPopover
      :open="quickLogOpen"
      @close="quickLogOpen = false"
      @logged="onQuickLogged"
    />
  </div>
</template>
