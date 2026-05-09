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
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Client } from '@/types/database'
import AssistantMark from '@/components/AssistantMark.vue'
import JoshPersonalOnboardingModal from '@/components/JoshPersonalOnboardingModal.vue'
import JoshPersonalSageChatPanel from '@/components/JoshPersonalSageChatPanel.vue'
import {
  TODAY_LABEL,
  STEPS_DAILY_TARGET,
  sageActivity,
  activeConcerns,
  todayPlan,
  trendArrow,
} from '@/lib/clients/josh-personal/health'
import { useHealthData } from '@/lib/clients/josh-personal/healthData'
import { useProfile } from '@/lib/clients/josh-personal/profileApi'
import { useMorningBrief } from '@/lib/clients/josh-personal/morningBriefApi'
import { useWeeklyPlan } from '@/lib/clients/josh-personal/weeklyPlanApi'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const { snapshot } = useHealthData()
const { hasProfile, targets, loading: profileLoading } = useProfile()
const { brief, generating: briefGenerating, isStale: briefIsStale, regenerate: regenerateBrief } = useMorningBrief()
const { todaySlice: realTodaySlice } = useWeeklyPlan()

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

const stepsProgress = computed(() => {
  const raw = String(snapshot.value.steps.value).replace(/,/g, '')
  const n = parseInt(raw, 10) || 0
  return Math.min(1, n / STEPS_DAILY_TARGET)
})

// Ask Sage chat — real agent loop with tools
const chatOpen = ref(false)
</script>

<template>
  <div class="space-y-5">
    <!-- ── Sage activity strip ──────────────────────────────────────── -->
    <section class="card overflow-hidden p-0 border border-brand/30">
      <div class="flex items-start gap-3 bg-brand/5 px-5 py-3 border-b border-brand/20">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-brand flex-shrink-0">
          <AssistantMark class="h-5 w-5" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-0.5">
            <span class="text-sm font-semibold text-ink">Sage's role on this page</span>
            <span class="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
              <span>🌿</span>
              <span>Health Coach</span>
            </span>
          </div>
          <p class="text-xs text-ink-muted leading-relaxed">
            Your daily AI coach. She reads your Apple Watch, blood work, and profile to tell you what to focus on today.
          </p>
        </div>
      </div>
      <div class="px-5 py-3 bg-surface-raised">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
          Sage's recent activity here
        </div>
        <ul class="space-y-1.5">
          <li v-for="(a, i) in sageActivity" :key="i" class="flex items-start gap-2 text-xs">
            <span class="text-base shrink-0 leading-none mt-0.5">{{ a.icon }}</span>
            <span class="flex-1 min-w-0">
              <span class="font-semibold text-ink">{{ a.label }}</span>
              <span class="text-ink-muted">  {{ a.detail }}</span>
            </span>
            <span class="text-[10px] text-ink-disabled shrink-0">{{ a.ago }}</span>
          </li>
        </ul>
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

    <!-- ── Profile-driven targets (when profile exists) ─────────────── -->
    <section v-if="hasProfile && targets" class="card p-0 overflow-hidden">
      <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
            Your targets · calculated from your profile
          </div>
          <div class="font-semibold text-ink mt-0.5">
            {{ targets.daily_cal_target.toLocaleString() }} kcal · {{ targets.protein_g }}g protein · ≤ {{ targets.sat_fat_g_ceiling }}g sat fat
          </div>
        </div>
        <button
          type="button"
          class="text-xs text-brand font-medium hover:underline"
          @click="onboardingOpen = true"
        >Edit profile</button>
      </header>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-divider">
        <div class="bg-surface px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Calories</div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ targets.daily_cal_target.toLocaleString() }}</div>
          <div class="text-[10px] text-ink-muted mt-0.5">
            {{ targets.deficit_or_surplus_kcal !== 0
              ? `${targets.deficit_or_surplus_kcal > 0 ? '+' : ''}${targets.deficit_or_surplus_kcal} vs TDEE`
              : 'maintenance' }}
          </div>
        </div>
        <div class="bg-surface px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Protein</div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ targets.protein_g }}g</div>
          <div class="text-[10px] text-ink-muted mt-0.5">{{ targets.protein_per_lb }}g/lb bodyweight</div>
        </div>
        <div class="bg-surface px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Fat / Carbs</div>
          <div class="text-base font-bold text-ink tabular-nums">{{ targets.fat_g_target }}g · {{ targets.carbs_g }}g</div>
          <div class="text-[10px] text-ink-muted mt-0.5">target / remainder</div>
        </div>
        <div class="bg-surface px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-warn">Sat fat ceiling</div>
          <div class="text-xl font-bold text-warn tabular-nums">≤ {{ targets.sat_fat_g_ceiling }}g</div>
          <div class="text-[10px] text-ink-muted mt-0.5">
            {{ targets.computed_from.has_bloodwork_concerns ? 'tightened by bloodwork' : 'general ceiling' }}
          </div>
        </div>
      </div>
      <div
        v-if="targets.computed_from.bloodwork_adjustments.length > 0"
        class="px-4 py-2 bg-warn/5 border-t border-warn/10 text-[11px] text-warn"
      >
        <strong class="font-semibold">Sage's blood-work guardrails:</strong>
        {{ targets.computed_from.bloodwork_adjustments.join(' · ') }}
      </div>
    </section>

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

    <!-- ── Today header + snapshot ──────────────────────────────────── -->
    <div>
      <div class="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 class="text-xl font-semibold text-ink">Today · {{ TODAY_LABEL }}</h2>
          <p class="text-xs text-ink-muted mt-0.5">Apple Watch + Apple Health, synced this morning.</p>
        </div>
        <button class="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-semibold hover:opacity-90">
          + Quick log
        </button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div class="card p-3">
          <div class="kpi-label">Sleep</div>
          <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.sleep.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.sleep.unit }}</span></div>
          <div class="text-[11px] text-success mt-0.5">{{ trendArrow(snapshot.sleep.trend) }} {{ snapshot.sleep.delta }}</div>
        </div>
        <div class="card p-3">
          <div class="kpi-label">Steps · 10k goal</div>
          <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.steps.value }}</div>
          <div class="mt-1.5 h-1 w-full bg-brand/15 rounded-full overflow-hidden">
            <div class="h-full rounded-full bg-brand transition-all" :style="{ width: `${stepsProgress * 100}%` }" />
          </div>
          <div class="text-[11px] text-ink-muted mt-1">{{ Math.round(stepsProgress * 100) }}% to 10k</div>
        </div>
        <div class="card p-3">
          <div class="kpi-label">Weight</div>
          <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.weight.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.weight.unit }}</span></div>
          <div class="text-[11px] text-success mt-0.5">{{ trendArrow(snapshot.weight.trend) }} {{ snapshot.weight.delta }}</div>
        </div>
        <div class="card p-3">
          <div class="kpi-label">HRV (morning)</div>
          <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.hrv.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.hrv.unit }}</span></div>
          <div class="text-[11px] text-success mt-0.5">{{ trendArrow(snapshot.hrv.trend) }} {{ snapshot.hrv.delta }}</div>
        </div>
        <div class="card p-3">
          <div class="kpi-label">Streak</div>
          <div class="text-2xl font-bold tabular-nums text-ink">{{ snapshot.streak.value }}<span class="text-sm font-normal text-ink-muted ml-0.5">{{ snapshot.streak.unit }}</span></div>
          <div class="text-[11px] text-ink-muted mt-0.5">{{ snapshot.streak.delta }}</div>
        </div>
      </div>
    </div>

    <!-- ── Today's plan slice (workout + meals from current week) ──── -->
    <div v-if="today" class="grid gap-4 lg:grid-cols-2">
      <section class="card p-0 overflow-hidden">
        <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Today's workout</div>
            <div class="font-semibold text-ink mt-0.5">
              <span v-if="today.workout">{{ today.workout }}</span>
              <span v-else class="text-ink-muted">Rest day</span>
            </div>
          </div>
          <button v-if="today.workout" class="rounded-md border border-divider text-ink bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:border-brand">
            Mark done
          </button>
        </header>
        <ul v-if="today.workoutExercises && today.workoutExercises.length > 0" class="divide-y divide-divider">
          <li v-for="ex in today.workoutExercises" :key="ex.name" class="px-4 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="font-semibold text-ink text-sm">{{ ex.name }}</div>
              <div v-if="ex.notes" class="text-[11px] text-ink-muted mt-0.5">{{ ex.notes }}</div>
            </div>
            <div class="text-right shrink-0">
              <div class="font-mono text-sm text-ink tabular-nums">{{ ex.sets }}</div>
              <div class="text-[11px] text-ink-muted tabular-nums">{{ ex.load }}</div>
            </div>
          </li>
        </ul>
        <div v-else class="px-4 py-6 text-center text-xs text-ink-muted">
          Recovery day. Walk, hydrate, sleep. Sage will check HRV in the morning.
        </div>
      </section>

      <section class="card p-0 overflow-hidden">
        <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Today's meals</div>
            <div class="font-semibold text-ink mt-0.5">
              {{ today.totalCal.toLocaleString() }} cal · {{ today.totalProtein }}g protein
            </div>
            <div class="text-[11px] text-ink-muted mt-0.5">From this week's plan · view all on Plan tab</div>
          </div>
        </header>
        <ul class="divide-y divide-divider">
          <li v-for="(meal, slot) in today.meals" :key="slot" class="px-4 py-3">
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold text-ink text-sm capitalize">{{ slot }}</span>
              <span class="text-[11px] text-ink-muted tabular-nums">{{ meal.cal }} cal · {{ meal.protein }}g p</span>
            </div>
            <div class="text-sm text-ink mt-0.5">{{ meal.name }}</div>
            <p class="text-xs text-ink-muted mt-0.5 leading-snug">{{ meal.detail }}</p>
          </li>
        </ul>
      </section>
    </div>

    <!-- ── Active concerns reminder ────────────────────────────────── -->
    <section v-if="activeConcerns.length > 0" class="card p-3 border-warn/30">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3">
          <span class="text-base">⚠️</span>
          <div>
            <div class="text-xs font-semibold text-ink">
              {{ activeConcerns.length }} active concern{{ activeConcerns.length === 1 ? '' : 's' }} from your last blood draw
            </div>
            <div class="text-[11px] text-ink-muted">
              {{ activeConcerns.map(c => c.label).join(' · ') }}
            </div>
          </div>
        </div>
        <RouterLink
          v-slot="{ navigate }"
          :to="{ query: { tab: 'bloodwork' } }"
          custom
        >
          <button type="button" class="text-xs font-medium text-brand hover:underline" @click="navigate">View bloodwork →</button>
        </RouterLink>
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
    <JoshPersonalSageChatPanel :open="chatOpen" @close="chatOpen = false" />

    <!-- ── Onboarding wizard modal ─────────────────────────────────── -->
    <JoshPersonalOnboardingModal
      :open="onboardingOpen"
      :current-weight-lbs="currentWeightLbs"
      @close="onboardingOpen = false"
      @saved="onboardingOpen = false"
    />
  </div>
</template>
