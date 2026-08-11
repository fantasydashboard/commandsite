<script setup lang="ts">
/**
 * Focal Point - "Where visitors fall out" (Front Desk & Guests).
 *
 * The assimilation milestones for everyone whose FIRST visit was in the last 12
 * months, in journey order, each as a share of that same starting group.
 *
 * ── Why every bar uses ONE shared denominator ──────────────────────────────
 * A step-over-step conversion rate ("of those who finished Starting Point, how
 * many met the pastor") is NOT computable from this data, and quietly produces
 * false numbers if you try. These milestones are independent Planning Center
 * workflows, not nested stages: someone can attend Meet the Pastor without ever
 * finishing Starting Point, and plenty join a Growth Group without serving. On
 * the real figures that arithmetic yields 46/45 = 102% for one hop and
 * 57/17 = 335% for another. Most rows would look plausible and be wrong, which
 * is worse than the two that look obviously broken.
 *
 * A true conversion rate requires intersecting the actual people (of THOSE 64,
 * how many later did X). That needs person-level rows, which the aggregate
 * source deliberately does not carry. Until that lands, every bar is measured
 * against the same "first visit" group and the note in the template says so.
 *
 * Bars therefore do NOT descend monotonically: more people are in a group (57)
 * than have met the pastor (50). That is a real finding about their process,
 * not a rendering bug.
 *
 * Source is assimilation.ts: aggregate counts only, no PII, so there is no
 * click-through to names yet. Follows the congregation lens like the rest of
 * the page.
 */
import { computed } from 'vue'
import { assimilation, type Milestones } from '@/lib/clients/focal-point/assimilation'
import { useCongregationLens } from '@/stores/congregationLens'

const lens = useCongregationLens()
const m = computed<Milestones>(() => assimilation[lens.scope])

interface Step {
  key: keyof Omit<Milestones, 'visited'>
  label: string
  sub: string
}

// Journey order, the sequence the church actually walks someone through.
// Group before serving: belonging generally precedes volunteering, and the
// counts agree (group 57 vs serving 17).
const STEPS: Step[] = [
  { key: 'completedSP', label: 'Completed Starting Point', sub: 'finished the intro next-steps' },
  { key: 'metPastor', label: 'Met the Pastor', sub: 'came to a Meet the Pastor' },
  { key: 'group', label: 'Joined a Growth Group', sub: 'in a group now' },
  { key: 'serving', label: 'Started serving', sub: 'joined a team' },
]

const pct = (n: number) => Math.round((n / Math.max(1, m.value.visited)) * 100)

const steps = computed(() =>
  STEPS.map((s) => ({ ...s, count: m.value[s.key], pct: pct(m.value[s.key]) })),
)

// The drop out of the very first step is the leak worth naming: it is the one
// hop where the two sets ARE nested (everyone in the cohort visited), so this
// percentage is honest in a way step-over-step rates would not be.
const firstStep = computed(() => steps.value[0])
const firstStepDrop = computed(() => 100 - firstStep.value.pct)
const notReached = computed(() => m.value.visited - firstStep.value.count)

const scopeLabel = computed(() =>
  lens.scope === 'all' ? 'across both congregations' : `in the ${lens.scope} congregation`,
)
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Where visitors fall out</span>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Last 12 months
      </span>
    </div>

    <h3 class="mt-1 text-base font-semibold text-ink">How far your visitors get</h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      Of the <span class="font-semibold text-ink">{{ m.visited }}</span> people whose first visit
      was in the last 12 months {{ scopeLabel }}, how many have reached each step.
      Every bar is measured against that same group.
    </p>
    <p class="mt-1.5 max-w-2xl text-[11px] text-ink-disabled">
      A different population from the numbers above: those count guests currently in the
      Starting Point workflow, this counts everyone who first visited in the last year.
    </p>

    <!-- Baseline. Shown as a full bar so every step below is read against
         something concrete rather than an invisible 100%. -->
    <div class="mt-5">
      <div class="mb-1 flex items-baseline justify-between gap-3">
        <span class="text-sm font-medium text-ink">First visit</span>
        <span class="shrink-0 text-xs tabular-nums text-ink-muted">
          <span class="font-semibold text-ink">{{ m.visited }}</span>
          <span class="ml-1 text-ink-disabled">100%</span>
        </span>
      </div>
      <div class="h-3 w-full max-w-[38rem] overflow-hidden rounded-full bg-surface-elevated">
        <div class="h-full w-full rounded-full bg-brand/25"></div>
      </div>
      <div class="mt-0.5 text-[11px] text-ink-disabled">everyone who signed in for the first time</div>
    </div>

    <ul class="mt-4 space-y-4 border-t border-divider pt-4">
      <li v-for="s in steps" :key="s.key">
        <div class="mb-1 flex items-baseline justify-between gap-3">
          <span class="text-sm font-medium text-ink">{{ s.label }}</span>
          <span class="shrink-0 text-xs tabular-nums text-ink-muted">
            <span class="font-semibold text-ink">{{ s.count }}</span>
            <span class="ml-1 text-ink-disabled">{{ s.pct }}% of first visits</span>
          </span>
        </div>
        <div class="h-3 w-full max-w-[38rem] overflow-hidden rounded-full bg-surface-elevated">
          <div
            class="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
            :style="{ width: Math.max(1.5, s.pct) + '%' }"
          ></div>
        </div>
        <div class="mt-0.5 text-[11px] text-ink-disabled">{{ s.sub }}</div>
      </li>
    </ul>

    <div class="mt-5 rounded-lg border border-brand/20 bg-surface-elevated/60 px-4 py-3">
      <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Grace's read</span>
      <p class="mt-1 text-[13px] leading-relaxed text-ink">
        The drop happens immediately: <span class="font-semibold">{{ firstStepDrop }}%</span> never
        complete Starting Point, which is <span class="font-semibold">{{ notReached }}</span> people
        who visited and then went quiet. Nothing further down the list can improve until that first
        handoff does, because every later step draws from the people who clear this one.
      </p>
    </div>

    <p class="mt-2 text-[11px] leading-relaxed text-ink-disabled">
      These are independent milestones, not a strict funnel, so they do not always descend:
      more people are in a Growth Group than have met the pastor, because Meet the Pastor is
      its own workflow rather than a gate on the way to a group. Percentages are all of the
      same first-visit group for that reason. A snapshot of where people are now, so the
      newest visitors are still early and these climb as a cohort matures. Aggregate counts
      only, so there are no names behind these bars yet.
    </p>
  </section>
</template>
