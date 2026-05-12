<script setup lang="ts">
/**
 * Church pitch deck — 10 slides for ministry discovery calls.
 *
 * Tuned for pastors / ministry leaders, not service-business owners.
 * Different math (visitors who don't return, drift detection,
 * pastor's hours), different alternative-cost framing (church admin,
 * comms director, ChMS stack), different voice (stewardship +
 * partnership, not ROI + leak).
 *
 * Same URL routing — PitchDeckPage decides which deck to render
 * based on lead industry. Keyboard nav + speaker-notes toggle work
 * the same way.
 */
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'

interface LeadInput {
  company_name: string
  contact_name: string | null
  city: string | null
  state: string | null
  review_excerpts: { text: string; rating: number | null; relative_time: string | null }[] | null
  tags: string[] | null
}

const props = defineProps<{ lead: LeadInput | null }>()

// Slide state
const slideIdx = ref(0)
const SLIDE_COUNT = 10
const showNotes = ref(false)

// Slide 8 (pricing reveal) — two-step within-slide reveal.
// Step 0: standard rate only, centered, no founding column.
// Step 1: standard strikes through, founding rate slides in.
const PRICING_SLIDE = 8
const pricingRevealStep = ref(0)
const PRICING_REVEAL_MAX = 1

// ── Personalization tokens (with sensible fallbacks) ─────────────────
const churchName = computed(() => props.lead?.company_name ?? '[Their Church]')
const pastorFirst = computed(() => {
  const n = props.lead?.contact_name ?? ''
  return n ? n.split(' ')[0] : '[Pastor first name]'
})
const founderFirst = 'Josh'

// Top reviews (if scraped from Google)
const topReviews = computed(() => (props.lead?.review_excerpts ?? []).slice(0, 4))

// ── Pricing — auto-pick tier based on lead tags ───────────────────
// Tag the lead with 'tier-large' for multi-congregation / 800+ attendance
// churches; otherwise Standard tier applies. Add 'tier-compact' for
// under-150-attendance churches if needed.
const tags = computed<string[]>(() => props.lead?.tags ?? [])
const isLargeChurch = computed(() => tags.value.includes('tier-large') || tags.value.includes('tier-multi-congregation'))
const isCompactChurch = computed(() => tags.value.includes('tier-compact'))

const pricing = computed(() => {
  if (isLargeChurch.value) {
    // Multi-congregation / large church (~800+ weekly attendance)
    return {
      tier: 'Founding partner · multi-congregation rate',
      stdSetup: '$2,199',
      stdMonthly: '$999',
      setup: '$1,249',
      monthly: '$599',
      // Anchor shown in the solutions table (slide 7), one tier above
      // the actual founding price so the pricing reveal on slide 8 feels
      // like a real deal, not just the floor.
      solutionsTeaser: '$699',
      annualPrepay: '$5,990 (saves another $1,198)',
      lockMonths: 12,
      year1Cost: 1249 + 599 * 12,         // $8,437
      year1CostStandard: 2199 + 999 * 12, // $14,187
      year1Savings: (2199 + 999 * 12) - (1249 + 599 * 12), // $5,750
    }
  }
  if (isCompactChurch.value) {
    // Under 150 weekly attendance
    return {
      tier: 'Founding partner · compact rate',
      stdSetup: '$499',
      stdMonthly: '$299',
      setup: '$249',
      monthly: '$149',
      solutionsTeaser: '$199',
      annualPrepay: '$1,490 (saves another $298)',
      lockMonths: 12,
      year1Cost: 249 + 149 * 12,         // $2,037
      year1CostStandard: 499 + 299 * 12, // $4,087
      year1Savings: (499 + 299 * 12) - (249 + 149 * 12), // $2,050
    }
  }
  // Default — Standard church (150-400 weekly attendance)
  return {
    tier: 'Founding partner · ministry rate',
    stdSetup: '$999',
    stdMonthly: '$499',
    setup: '$499',
    monthly: '$299',
    solutionsTeaser: '$399',
    annualPrepay: '$2,990 (saves another $498)',
    lockMonths: 12,
    year1Cost: 499 + 299 * 12,         // $4,087
    year1CostStandard: 999 + 499 * 12, // $6,987
    year1Savings: (999 + 499 * 12) - (499 + 299 * 12), // $2,900
  }
})

// ── Demo URL — Cornerstone template branded as their church ─────────
const demoUrl = computed(() => {
  const params = new URLSearchParams({ demo_company: churchName.value })
  if (props.lead?.city) params.set('demo_city', props.lead.city)
  if (props.lead?.state) params.set('demo_state', props.lead.state)
  return `/dashboard/cornerstone-church?${params.toString()}`
})

// ── Math — ministry framing, NOT revenue-leak framing ─────────────────
// Scaled for a ~1,000-attendance multi-congregation church (e.g. FPC).
// Smaller churches will see lower absolute numbers but the same
// proportional impact. The math IS conservative on purpose — better
// to under-promise + over-deliver on slide 8.
//
// Church-honest research: ~65% of first-time visitors never return
// without intentional follow-up. Meaningful follow-up converts ~25-35%
// of those who would have dropped off.
const visitorsPerMonth = 25
const noReturnPct = 65
const followUpRescuePct = 25
const visitorsRescuedPerYear = computed(() =>
  Math.round(visitorsPerMonth * 12 * (noReturnPct / 100) * (followUpRescuePct / 100)),
)

// Drift — members going quiet
// ~1,000 weekly attendance ÷ ~2.5 per household ≈ 400 households
const totalHouseholds = 400
const atRiskPct = 7
const driftReactivationPct = 30
const householdsRescuedFromDriftPerYear = computed(() =>
  Math.round(totalHouseholds * (atRiskPct / 100) * (driftReactivationPct / 100)),
)

// Pastor's time
const pastorHoursPerWeek = 10
const pastorHoursPerYear = computed(() => pastorHoursPerWeek * 52)

// ── Keyboard nav ──────────────────────────────────────────────────────
function next() {
  // On the pricing reveal slide, advance the within-slide reveal step
  // before moving on to the next slide.
  if (slideIdx.value === PRICING_SLIDE && pricingRevealStep.value < PRICING_REVEAL_MAX) {
    pricingRevealStep.value++
    return
  }
  if (slideIdx.value < SLIDE_COUNT - 1) {
    slideIdx.value++
    // Reset pricing reveal when entering OR leaving the slide
    if (slideIdx.value !== PRICING_SLIDE) pricingRevealStep.value = 0
  }
}
function prev() {
  // Step backward through the within-slide reveal before leaving the slide.
  if (slideIdx.value === PRICING_SLIDE && pricingRevealStep.value > 0) {
    pricingRevealStep.value--
    return
  }
  if (slideIdx.value > 0) {
    slideIdx.value--
    if (slideIdx.value !== PRICING_SLIDE) pricingRevealStep.value = 0
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); next() }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev() }
  else if (e.key === 'n') { showNotes.value = !showNotes.value }
  else if (e.key === 'Escape') { showNotes.value = false }
  else if (/^[0-9]$/.test(e.key)) { const n = parseInt(e.key, 10); if (n < SLIDE_COUNT) slideIdx.value = n }
}

onMounted(() => { window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey) })

// Speaker notes per slide
const notes = computed<string[]>(() => [
  // 0 — cover
  `Open warm. "${pastorFirst.value} — thank you for the time. I'm ${founderFirst}, and the next 30 min is going to be specific to ${churchName.value}. I've spent some time with your website + reviews + Google profile, so this won't be a generic pitch."`,
  // 1 — agenda
  `Set expectations gently. "Four things in 30 min: what I noticed about ${churchName.value}, where the gaps are between Sunday and the rest of the week, Grace in action, and what working together looks like. Stop me whenever — questions are how this gets useful."`,
  // 2 — what I noticed
  `THIS slide makes or breaks trust. Pastors are skeptical of vendors who do generic outreach. Show that you actually researched THEIR church. Read review quotes verbatim if you have them. Mention something specific — sermon series, building campaign, recent baptism announcement. After each observation: "Does that line up with what you're feeling?"`,
  // 3 — Sunday-to-Sunday gap
  `Math slide #1 — DON'T frame as revenue. Frame as souls. "65% of first-time visitors never come back. Some of that's preference. But a lot is just... no one followed up well." Make THEM correct the math: "Does 25/month feel right across your three congregations?" If they say more (likely — 1k church often sees 30-40), recalculate live: "OK so it's even bigger than I have here."`,
  // 4 — drift
  `Math slide #2. "Quiet drift" is the hidden ministry crisis — at 400 households, even 7% at-risk is 28 families slipping. Most pastors can't track that systematically. "Grace watches the patterns (kids attendance, giving rhythm, serving) and surfaces a household the FIRST week something looks off. Not the third month."`,
  // 5 — your time
  `THE most resonant slide for pastors. "Realistically, how many hours a week do you and Andrew spend on admin work — follow-ups, scheduling, comms drafts, drift checks?" They'll say 10-20 across the team. Multiply: "That's 500-1,000 hours a year of pastoral time spent on what should be operations. Time that should be on the people God put in front of you."`,
  // 6 — show her work (DEMO — moved up before pricing)
  `Click out to the dashboard URL: ${demoUrl.value}. Don't try to demo all of Grace's roles. Focus on the approval queue — show them ONE drafted pastoral check-in, click Approve, watch the animation. Narrate: "Right now Grace just sent that on your behalf. That's the loop you'd live in."`,
  // 7 — solutions table
  `The "what else could you do?" slide. Hire an admin ($35-50K/year), hire a comms director ($45-60K), buy a stack of ChMS tools ($300-800/mo), do it yourself (your time). Then Grace at $299/mo. The point isn't "we're cheapest" — it's "we're the only one that does ALL of this AND respects your time."`,
  // 8 — pricing reveal (TWO STEPS — important!)
  `Two-step reveal. FIRST press of → shows ONLY the standard rate. Pause. Let them read it. Say: "Andrew, that's what most churches who come on after our founding window will pay." Let it land for 2-3 seconds. THEN press → again. Standard slashes through, founding rate slides in with the "Yours" badge. That's when you say: "But ${churchName.value} would be coming on as a founding partner. Half off, locked for ${pricing.value.lockMonths} months." The drama is doing work here — don't rush.`,
  // 9 — next steps
  `Don't pressure. Pastors hate sales pressure. "What's the right next step for ${churchName.value}? I can send a proposal this week, or send the deck + dashboard link and we can reconnect after you've talked it over with anyone who needs to be in the conversation." Either is real. Picking IS the close.`,
])
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-canvas via-surface to-canvas relative overflow-hidden">
    <!-- Top progress + nav -->
    <header class="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 py-3 bg-gradient-to-b from-surface/80 to-transparent">
      <div class="flex items-center gap-2 text-xs text-ink-muted">
        <span class="font-semibold">CommandSite</span>
        <span class="opacity-50">·</span>
        <span>{{ churchName }} pitch</span>
      </div>
      <div class="flex items-center gap-1.5 text-[10px] font-mono text-ink-muted">
        <span v-for="n in SLIDE_COUNT" :key="n" class="block h-0.5 w-6 transition-all"
          :class="(n - 1) === slideIdx ? 'bg-brand' : (n - 1) < slideIdx ? 'bg-brand/40' : 'bg-divider'"></span>
        <span class="ml-2 text-ink-disabled">{{ slideIdx + 1 }}/{{ SLIDE_COUNT }}</span>
      </div>
    </header>

    <!-- Bottom controls -->
    <footer class="absolute bottom-0 inset-x-0 z-20 flex items-center justify-between px-6 py-3 bg-gradient-to-t from-surface/80 to-transparent">
      <div class="flex items-center gap-2">
        <button
          class="rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand transition-colors disabled:opacity-30"
          :disabled="slideIdx === 0"
          @click="prev"
        >← Back</button>
        <button
          class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-30"
          :disabled="slideIdx === SLIDE_COUNT - 1"
          @click="next"
        >Next →</button>
      </div>
      <div class="flex items-center gap-2 text-[10px] text-ink-disabled">
        <button class="hover:text-ink transition-colors" @click="showNotes = !showNotes">
          {{ showNotes ? 'Hide notes' : 'Speaker notes (n)' }}
        </button>
        <span class="opacity-50">·</span>
        <span>← → arrows · 0-9 jump</span>
      </div>
    </footer>

    <!-- Speaker notes panel -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-4"
    >
      <aside
        v-if="showNotes"
        class="fixed bottom-14 inset-x-0 mx-auto max-w-3xl z-30 rounded-xl bg-ink text-white shadow-2xl px-5 py-4"
      >
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[10px] font-bold uppercase tracking-[0.18em] opacity-60">Speaker notes</span>
          <span class="text-[10px] opacity-40">slide {{ slideIdx + 1 }}</span>
        </div>
        <p class="text-sm leading-relaxed whitespace-pre-wrap">{{ notes[slideIdx] }}</p>
      </aside>
    </Transition>

    <main class="relative w-full min-h-screen flex items-center justify-center px-6 py-16">
      <!-- ── Slide 0: Cover ───────────────────────────────────────── -->
      <section v-if="slideIdx === 0" class="text-center max-w-4xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">A 30-min ministry walkthrough</div>
        <h1 class="text-6xl sm:text-7xl font-bold text-ink mb-4 tracking-tight leading-none">
          Grace for<br />
          <span class="text-brand">{{ churchName }}</span>
        </h1>
        <p class="mt-8 text-lg text-ink-muted max-w-2xl mx-auto leading-relaxed">
          Specific to your church, not a generic pitch. Built from your website, your Google profile, and what I could learn before today.
        </p>
        <p class="mt-12 text-xs text-ink-disabled">
          {{ founderFirst }} Daniel · CommandSite
        </p>
      </section>

      <!-- ── Slide 1: Agenda ──────────────────────────────────────── -->
      <section v-else-if="slideIdx === 1" class="max-w-3xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">What we'll cover</div>
        <h2 class="text-4xl font-bold text-ink mb-10 tracking-tight">30 minutes, 4 things.</h2>
        <ol class="space-y-5">
          <li v-for="(it, i) in [
            'What I noticed about ' + churchName,
            'The Sunday-to-Sunday gap (where ministry leaks)',
            'Grace in action — live on a sample dashboard',
            'What partnership would look like',
          ]" :key="i" class="flex items-start gap-4">
            <span class="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white font-bold text-sm flex-shrink-0">{{ i + 1 }}</span>
            <span class="text-xl text-ink leading-snug pt-1">{{ it }}</span>
          </li>
        </ol>
        <p class="mt-10 text-sm text-ink-muted italic">
          Stop me whenever. Questions are how this gets useful.
        </p>
      </section>

      <!-- ── Slide 2: What I noticed ─────────────────────────────── -->
      <section v-else-if="slideIdx === 2" class="max-w-4xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">What I noticed about {{ churchName }}</div>
        <h2 class="text-4xl font-bold text-ink mb-8 tracking-tight">A few things from your site + reviews.</h2>
        <ul v-if="topReviews.length > 0" class="space-y-4">
          <li v-for="(r, i) in topReviews" :key="i"
            class="rounded-lg border border-brand/20 bg-brand/5 px-5 py-4">
            <p class="text-base text-ink leading-relaxed italic">"{{ r.text.slice(0, 280) }}{{ r.text.length > 280 ? '…' : '' }}"</p>
            <p v-if="r.rating !== null || r.relative_time" class="text-[11px] text-ink-muted mt-1">
              <span v-if="r.rating !== null">{{ r.rating }}★</span>
              <span v-if="r.rating !== null && r.relative_time"> · </span>
              <span v-if="r.relative_time">{{ r.relative_time }}</span>
            </p>
          </li>
        </ul>
        <ul v-else class="space-y-4 text-base text-ink leading-relaxed">
          <li class="rounded-lg border border-brand/20 bg-brand/5 px-5 py-4 italic">[Mention something specific from their website — sermon series, mission statement, recent baptism, building campaign.]</li>
          <li class="rounded-lg border border-brand/20 bg-brand/5 px-5 py-4 italic">[Quote a review verbatim if you have one — visitor experience, kids program, hospitality.]</li>
          <li class="rounded-lg border border-brand/20 bg-brand/5 px-5 py-4 italic">[Reference one community detail — neighborhood demographic, a community partner, etc.]</li>
        </ul>
        <p class="mt-8 text-lg text-ink font-medium">
          Does any of this line up with what you're feeling at {{ churchName }}?
        </p>
      </section>

      <!-- ── Slide 3: Sunday-to-Sunday gap (visitors) ─────────────── -->
      <section v-else-if="slideIdx === 3" class="max-w-4xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">Gap #1 · Visitors who never come back</div>
        <h2 class="text-4xl font-bold text-ink mb-8 tracking-tight">The Sunday-to-Sunday silence.</h2>
        <div class="rounded-xl bg-surface-raised border border-divider p-6 text-base text-ink leading-loose">
          <div class="flex justify-between"><span>First-time visitors per month (across 3 congregations):</span><span class="font-bold tabular-nums">{{ visitorsPerMonth }}</span></div>
          <div class="flex justify-between"><span>× 12 months = visitors per year:</span><span class="font-bold tabular-nums">{{ visitorsPerMonth * 12 }}</span></div>
          <div class="flex justify-between text-warn"><span>× {{ noReturnPct }}% who never return without follow-up:</span><span class="font-bold tabular-nums">{{ Math.round(visitorsPerMonth * 12 * (noReturnPct / 100)) }}</span></div>
          <div class="flex justify-between text-success"><span>× {{ followUpRescuePct }}% rescued by intentional follow-up:</span><span class="font-bold tabular-nums">{{ visitorsRescuedPerYear }}</span></div>
          <hr class="my-3 border-divider" />
          <div class="flex justify-between text-lg"><span class="font-bold">Households kept in your church family per year:</span><span class="font-bold tabular-nums text-success">~{{ visitorsRescuedPerYear }}</span></div>
        </div>
        <p class="mt-6 text-base text-ink-muted italic leading-relaxed">
          {{ pastorFirst }} — these aren't just numbers. Each one is a family that walked into your church looking for something. {{ visitorsRescuedPerYear }} families a year is multiple small groups, a whole new serving team, a Sunday school class twice over. With three congregations and ~1,000 attendance, the follow-up surface is bigger than any one person can carry — that's where Grace earns her keep.
        </p>
      </section>

      <!-- ── Slide 4: Quiet drift ─────────────────────────────────── -->
      <section v-else-if="slideIdx === 4" class="max-w-4xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">Gap #2 · The drift you don't see</div>
        <h2 class="text-4xl font-bold text-ink mb-8 tracking-tight">Members going quiet — until they're gone.</h2>
        <div class="rounded-xl bg-surface-raised border border-divider p-6 text-base text-ink leading-loose">
          <div class="flex justify-between"><span>Total households at {{ churchName }} (~1,000 weekend attendance):</span><span class="font-bold tabular-nums">~{{ totalHouseholds }}</span></div>
          <div class="flex justify-between text-warn"><span>× {{ atRiskPct }}% at-risk at any given time (1+ drift signals):</span><span class="font-bold tabular-nums">{{ Math.round(totalHouseholds * (atRiskPct / 100)) }}</span></div>
          <div class="flex justify-between text-success"><span>× {{ driftReactivationPct }}% re-engaged when caught early:</span><span class="font-bold tabular-nums">{{ householdsRescuedFromDriftPerYear }}</span></div>
          <hr class="my-3 border-divider" />
          <div class="flex justify-between text-lg"><span class="font-bold">Households reconnected per year:</span><span class="font-bold tabular-nums text-success">~{{ householdsRescuedFromDriftPerYear }}</span></div>
        </div>
        <p class="mt-6 text-base text-ink-muted italic leading-relaxed">
          The hardest part of pastoral work isn't the families who tell you they're leaving — it's the ones who quietly stop showing up. Grace watches the patterns (kids attendance, giving rhythm, serving) and surfaces a household the FIRST week something looks off. Not the third month.
        </p>
      </section>

      <!-- ── Slide 5: Your time ──────────────────────────────────── -->
      <section v-else-if="slideIdx === 5" class="max-w-3xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">Gap #3 · Your time</div>
        <h2 class="text-4xl font-bold text-ink mb-8 tracking-tight">{{ pastorHoursPerYear }} hours.</h2>
        <p class="text-lg text-ink-muted leading-relaxed mb-6">
          That's a conservative estimate of what a pastor like you spends a year on stuff that isn't ministry work — drafting newsletters, scheduling volunteers, drift checks, follow-up texts, birthday cards.
        </p>
        <div class="rounded-xl bg-surface-raised border border-divider p-6 space-y-3">
          <div class="flex items-baseline gap-3">
            <span class="text-3xl font-bold tabular-nums text-brand">{{ pastorHoursPerWeek }}</span>
            <span class="text-ink-muted">hours/week on admin</span>
          </div>
          <div class="flex items-baseline gap-3">
            <span class="text-3xl font-bold tabular-nums text-brand">×52</span>
            <span class="text-ink-muted">weeks</span>
          </div>
          <div class="flex items-baseline gap-3 pt-2 border-t border-divider">
            <span class="text-4xl font-bold tabular-nums text-brand">{{ pastorHoursPerYear }}</span>
            <span class="text-ink font-semibold">hours/year that should be ministry time, not admin time</span>
          </div>
        </div>
        <p class="mt-6 text-base text-ink-muted italic leading-relaxed">
          {{ pastorFirst }} — what would you do with 10 extra hours a week? Whatever it is, that's what we're really talking about here. Grace handles the admin so you can spend the hours on people.
        </p>
      </section>

      <!-- ── Slide 6: Show her work (DEMO) ───────────────────────── -->
      <section v-else-if="slideIdx === 6" class="max-w-3xl text-center">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">Live · in your browser</div>
        <h2 class="text-5xl font-bold text-ink mb-6 tracking-tight">Let's stop talking and watch Grace work.</h2>
        <p class="text-xl text-ink-muted mb-10 leading-relaxed">
          A CommandSite dashboard set up for {{ churchName }}. Numbers are illustrative — every <em>behavior</em> is what Grace would actually do for you from week one.
        </p>
        <a
          :href="demoUrl"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-3 rounded-xl bg-brand text-white px-8 py-4 text-base font-semibold hover:opacity-90 transition-opacity shadow-2xl"
        >
          Open {{ churchName }}'s Grace dashboard
          <span>→</span>
        </a>
        <p class="mt-12 text-[11px] text-ink-disabled italic">
          During the call I'll drive. After the call this link is yours — share it with your elders / staff.
        </p>
      </section>

      <!-- ── Slide 7: Solutions table ─────────────────────────────── -->
      <section v-else-if="slideIdx === 7" class="max-w-5xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">What else could fix this?</div>
        <h2 class="text-3xl font-bold text-ink mb-6 tracking-tight">You'd want to plug those gaps no matter what. Here are the options.</h2>
        <div class="overflow-x-auto rounded-xl border border-divider">
          <table class="w-full text-sm">
            <thead class="bg-canvas/60 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <tr>
                <th class="text-left px-4 py-3">Option</th>
                <th class="text-left px-4 py-3">Year-1 cost</th>
                <th class="text-left px-4 py-3">What it does</th>
                <th class="text-left px-4 py-3">What it misses</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-divider">
              <tr>
                <td class="px-4 py-3 font-semibold text-ink">Hire a church administrator</td>
                <td class="px-4 py-3 text-ink-muted">$35-50K + benefits</td>
                <td class="px-4 py-3 text-ink-muted">Ops + scheduling + comms</td>
                <td class="px-4 py-3 text-ink-muted">Hiring is hard · sick days · learning curve · no nights/weekends</td>
              </tr>
              <tr>
                <td class="px-4 py-3 font-semibold text-ink">Hire a comms director (PT)</td>
                <td class="px-4 py-3 text-ink-muted">$20-35K + benefits</td>
                <td class="px-4 py-3 text-ink-muted">Newsletter + social + cards</td>
                <td class="px-4 py-3 text-ink-muted">Comms only · no drift detection · no care triage</td>
              </tr>
              <tr>
                <td class="px-4 py-3 font-semibold text-ink">Stack ChMS tools (Planning Center, Breeze, Subsplash)</td>
                <td class="px-4 py-3 text-ink-muted">$3.6-9.6K</td>
                <td class="px-4 py-3 text-ink-muted">Roster + giving + maybe an app</td>
                <td class="px-4 py-3 text-ink-muted">Tools store data — they don't DO things. Still need someone to act</td>
              </tr>
              <tr class="bg-warn/5">
                <td class="px-4 py-3 font-semibold text-ink">You yourself, evenings + Saturdays</td>
                <td class="px-4 py-3 text-ink-muted">"Free"<br /><span class="text-[11px] italic">(but it's the {{ pastorHoursPerYear }} hours we just talked about)</span></td>
                <td class="px-4 py-3 text-ink-muted">Whatever you can squeeze in</td>
                <td class="px-4 py-3 text-warn font-semibold">Time you'd rather spend on people, sermon prep, family</td>
              </tr>
              <tr class="bg-brand/10 border-l-4 border-brand">
                <td class="px-4 py-3 font-bold text-brand">Grace (CommandSite)</td>
                <td class="px-4 py-3 font-bold text-brand">From {{ pricing.solutionsTeaser }}/mo<br /><span class="text-[10px] font-medium opacity-70">we'll get to the full breakdown next</span></td>
                <td class="px-4 py-3 text-ink">Visitor follow-up + drift detection + care triage + comms + volunteer coord</td>
                <td class="px-4 py-3 text-ink-muted">New product · founder-built · I respond same-day</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="mt-6 text-base text-ink-muted italic">
          Grace isn't trying to replace what you do. She's trying to give you back the {{ pastorHoursPerYear }} hours so you can spend them on the things only you can do.
        </p>
      </section>

      <!-- ── Slide 8: Pricing reveal (two-step) ────────────────────── -->
      <section v-else-if="slideIdx === 8" class="max-w-3xl w-full">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">{{ pricing.tier }}</div>
        <h2 class="text-4xl font-bold text-ink mb-3 tracking-tight">
          <template v-if="pricingRevealStep === 0">The standard rate.</template>
          <template v-else>An introductory rate, just for {{ churchName }}.</template>
        </h2>
        <p class="text-sm text-ink-muted mb-8 leading-relaxed transition-opacity duration-500">
          <template v-if="pricingRevealStep === 0">
            This is what {{ churchName }} would pay at our standard rate — what new churches who come on after our founding window will see.
          </template>
          <template v-else>
            {{ churchName }} would be coming on as a founding partner while Grace is still new to the world. That earns you the founding rate — half off, locked for {{ pricing.lockMonths }} months. Worth being early.
          </template>
        </p>

        <div class="rounded-2xl bg-gradient-to-br from-brand/5 via-surface-raised to-success/5 border-2 border-brand/40 overflow-hidden mb-6 shadow-xl">
          <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-divider">
            <!-- Standard rate — fades + strikes through on reveal -->
            <div
              class="px-6 py-5 transition-all duration-700 ease-out"
              :class="pricingRevealStep > 0 ? 'opacity-60' : 'opacity-100'"
            >
              <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-3">Standard rate</div>
              <div
                class="text-ink text-2xl font-bold tabular-nums leading-tight strike-anim"
                :class="{ 'strike-active': pricingRevealStep > 0 }"
              >{{ pricing.stdSetup }}</div>
              <div class="text-[11px] text-ink-disabled mb-3">setup, one-time</div>
              <div
                class="text-ink text-2xl font-bold tabular-nums leading-tight strike-anim"
                :class="{ 'strike-active': pricingRevealStep > 0 }"
              >{{ pricing.stdMonthly }}/mo</div>
              <div class="text-[11px] text-ink-disabled">monthly</div>
            </div>
            <!-- Founding rate — slides in on reveal -->
            <Transition
              enter-active-class="transition-all duration-700 ease-out"
              enter-from-class="opacity-0 translate-x-12"
              enter-to-class="opacity-100 translate-x-0"
            >
              <div
                v-if="pricingRevealStep > 0"
                class="px-6 py-5 bg-brand/10 relative"
              >
                <div class="absolute top-3 right-3 rounded-full bg-success text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 yours-bounce">Yours</div>
                <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-3">Founding rate</div>
                <div class="text-brand text-3xl font-bold tabular-nums leading-tight">{{ pricing.setup }}</div>
                <div class="text-[11px] text-ink-muted mb-3">setup, one-time</div>
                <div class="text-brand text-3xl font-bold tabular-nums leading-tight">{{ pricing.monthly }}/mo</div>
                <div class="text-[11px] text-ink-muted">monthly · locked {{ pricing.lockMonths }} months</div>
              </div>
              <!-- Placeholder while standard is the only thing visible -->
              <div v-else class="px-6 py-5 flex items-center justify-center text-center">
                <div>
                  <div class="text-[10px] font-bold uppercase tracking-wider text-ink-disabled mb-1">Next →</div>
                  <div class="text-xs text-ink-muted italic max-w-[180px]">But there's something else I want to show you first.</div>
                </div>
              </div>
            </Transition>
          </div>
          <!-- Savings strip — only shows after reveal -->
          <Transition
            enter-active-class="transition-all duration-500 ease-out delay-300"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
          >
            <div
              v-if="pricingRevealStep > 0"
              class="bg-success/10 px-6 py-3 flex items-center justify-between border-t border-divider"
            >
              <span class="text-success font-semibold text-sm">Year-one savings:</span>
              <span class="text-success text-xl font-bold tabular-nums">${{ pricing.year1Savings.toLocaleString() }}</span>
            </div>
          </Transition>
        </div>

        <!-- Detail bullets — only after reveal -->
        <Transition
          enter-active-class="transition-all duration-500 ease-out delay-500"
          enter-from-class="opacity-0 translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
        >
          <div v-if="pricingRevealStep > 0" class="space-y-1.5 text-[13px] text-ink-muted">
            <p class="flex items-start gap-2"><span class="text-success font-bold">✓</span><span><strong class="text-ink">Annual prepay</strong> available: {{ pricing.annualPrepay }}</span></p>
            <p class="flex items-start gap-2"><span class="text-success font-bold">✓</span><span><strong class="text-ink">Cancel anytime</strong> — no annual contract, no commitment. If Grace isn't pulling her weight, you walk.</span></p>
            <p class="flex items-start gap-2"><span class="text-success font-bold">✓</span><span><strong class="text-ink">We set everything up.</strong> You don't lift a finger past the kickoff call</span></p>
            <p class="flex items-start gap-2"><span class="text-ink-muted">·</span><span class="italic">Founding rate is locked for {{ pricing.lockMonths }} months while you're a partner. After that, renews at standard rate — we'll tell you 60 days out.</span></p>
          </div>
          <div v-else class="text-center mt-4">
            <span class="text-[11px] text-ink-disabled italic">Press → to see {{ churchName }}'s founding rate</span>
          </div>
        </Transition>
      </section>

      <!-- ── Slide 9: Next steps ─────────────────────────────────── -->
      <section v-else-if="slideIdx === 9" class="max-w-3xl text-center">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">Next steps</div>
        <h2 class="text-5xl font-bold text-ink mb-12 tracking-tight">What feels right, {{ pastorFirst }}?</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <div class="rounded-xl border-2 border-brand bg-brand/5 p-6 text-left">
            <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-2">Option A · Move forward</div>
            <div class="text-xl font-bold text-ink mb-3">Send a partnership proposal this week.</div>
            <p class="text-sm text-ink-muted">Target start in 2 weeks. Grace live by month-end.</p>
          </div>
          <div class="rounded-xl border-2 border-divider bg-surface-raised p-6 text-left">
            <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">Option B · Take time</div>
            <div class="text-xl font-bold text-ink mb-3">Send the deck + dashboard link.</div>
            <p class="text-sm text-ink-muted">Talk it over with anyone who needs to be in the conversation. Reconnect Tuesday.</p>
          </div>
        </div>
        <p class="text-base text-ink-muted">
          Either is honestly fine. No pressure — just clarity on the next step.
        </p>
        <p class="mt-12 text-xs text-ink-disabled">
          {{ founderFirst }} Daniel · josh@commandsite.io · CommandSite
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped>
section {
  animation: fade-in 250ms ease-out;
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Animated strike-through — line draws across the price */
.strike-anim {
  position: relative;
  display: inline-block;
}
.strike-anim::after {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 0;
  height: 2.5px;
  background-color: currentColor;
  transition: width 600ms cubic-bezier(0.65, 0, 0.35, 1);
  transform: translateY(-50%);
}
.strike-anim.strike-active::after {
  width: 100%;
}

/* "Yours" badge bounces in */
.yours-bounce {
  animation: yours-pop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms both;
}
@keyframes yours-pop {
  0%   { transform: scale(0.3) rotate(-12deg); opacity: 0; }
  60%  { transform: scale(1.1) rotate(2deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
</style>
