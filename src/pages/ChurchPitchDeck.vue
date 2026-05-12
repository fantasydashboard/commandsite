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
}

const props = defineProps<{ lead: LeadInput | null }>()

// Slide state
const slideIdx = ref(0)
const SLIDE_COUNT = 10
const showNotes = ref(false)

// ── Personalization tokens (with sensible fallbacks) ─────────────────
const churchName = computed(() => props.lead?.company_name ?? '[Their Church]')
const pastorFirst = computed(() => {
  const n = props.lead?.contact_name ?? ''
  return n ? n.split(' ')[0] : '[Pastor first name]'
})
const founderFirst = 'Josh'

// Top reviews (if scraped from Google)
const topReviews = computed(() => (props.lead?.review_excerpts ?? []).slice(0, 4))

// ── Pricing — church founding rate (matches PitchDeckPage logic) ──
const pricing = {
  tier: 'Founding partner · ministry rate',
  stdSetup: '$999',
  stdMonthly: '$499',
  setup: '$499',
  monthly: '$299',
  annualPrepay: '$2,990 (saves another $498)',
  lockMonths: 12,
  year1Cost: 499 + 299 * 12,         // $4,087
  year1CostStandard: 999 + 499 * 12, // $6,987
  year1Savings: (999 + 499 * 12) - (499 + 299 * 12), // $2,900
}

// ── Demo URL — Cornerstone template branded as their church ─────────
const demoUrl = computed(() => {
  const params = new URLSearchParams({ demo_company: churchName.value })
  if (props.lead?.city) params.set('demo_city', props.lead.city)
  if (props.lead?.state) params.set('demo_state', props.lead.state)
  return `/dashboard/cornerstone-community-church?${params.toString()}`
})

// ── Math — ministry framing, NOT revenue-leak framing ─────────────────
// Church-honest research: ~65% of first-time visitors never return
// without intentional follow-up. Meaningful follow-up converts ~25-35%
// of those who would have dropped off.
const visitorsPerMonth = 8
const noReturnPct = 65
const followUpRescuePct = 25
const visitorsRescuedPerYear = computed(() =>
  Math.round(visitorsPerMonth * 12 * (noReturnPct / 100) * (followUpRescuePct / 100)),
)

// Drift — members going quiet
const totalHouseholds = 200
const atRiskPct = 7
const driftReactivationPct = 30
const householdsRescuedFromDriftPerYear = computed(() =>
  Math.round(totalHouseholds * (atRiskPct / 100) * (driftReactivationPct / 100)),
)

// Pastor's time
const pastorHoursPerWeek = 8
const pastorHoursPerYear = computed(() => pastorHoursPerWeek * 52)

// ── Keyboard nav ──────────────────────────────────────────────────────
function next() { if (slideIdx.value < SLIDE_COUNT - 1) slideIdx.value++ }
function prev() { if (slideIdx.value > 0) slideIdx.value-- }
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
  `Math slide #1 — but DON'T frame as revenue. Frame as souls. "65% of first-time visitors never come back. Some of that's preference, sure. But a lot is just... no one followed up well." Make THEM do the math: "How many first-time visitors do you typically see in a month?" Then build their number live.`,
  // 4 — drift
  `Math slide #2. "Quiet drift" is the hidden ministry crisis — pastors KNOW they have families slipping away but don't have the time to systematically check. "Of every 100 households, 7 are at-risk at any given time. They look fine until they're gone. Grace watches that pattern and surfaces them while they're still rescuable."`,
  // 5 — your time
  `THE most resonant slide for pastors. "Realistically, how many hours a week do you spend on stuff that isn't ministry work? Follow-ups, scheduling volunteers, drafting newsletters, drift checks?" They will say 8-15. Multiply: "That's 400-700 hours a year of YOUR time on admin. Time that should be spent on the people God put in front of you."`,
  // 6 — show her work (DEMO — moved up before pricing)
  `Click out to the dashboard URL: ${demoUrl.value}. Don't try to demo all of Grace's roles. Focus on the approval queue — show them ONE drafted pastoral check-in, click Approve, watch the animation. Narrate: "Right now Grace just sent that on your behalf. That's the loop you'd live in."`,
  // 7 — solutions table
  `The "what else could you do?" slide. Hire an admin ($35-50K/year), hire a comms director ($45-60K), buy a stack of ChMS tools ($300-800/mo), do it yourself (your time). Then Grace at $299/mo. The point isn't "we're cheapest" — it's "we're the only one that does ALL of this AND respects your time."`,
  // 8 — pricing reveal
  `Pricing is sensitive in church world. Frame it as partnership, not transaction. "${churchName.value} would be coming on as a founding partner — this is a brand-new product still finding its first churches, so you get the founding rate, locked for ${pricing.lockMonths} months. Worth being early." Don't apologize for the price — the math already justified it.`,
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
            <p class="text-base text-ink leading-relaxed italic">"{{ r.text.slice(0, 240) }}{{ r.text.length > 240 ? '…' : '' }}"</p>
            <p class="text-[11px] text-ink-muted mt-1">{{ r.rating ?? '?' }}★ · {{ r.relative_time ?? 'recent' }}</p>
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
          <div class="flex justify-between"><span>First-time visitors per month (typical):</span><span class="font-bold tabular-nums">{{ visitorsPerMonth }}</span></div>
          <div class="flex justify-between"><span>× 12 months = visitors per year:</span><span class="font-bold tabular-nums">{{ visitorsPerMonth * 12 }}</span></div>
          <div class="flex justify-between text-warn"><span>× {{ noReturnPct }}% who never return without follow-up:</span><span class="font-bold tabular-nums">{{ Math.round(visitorsPerMonth * 12 * (noReturnPct / 100)) }}</span></div>
          <div class="flex justify-between text-success"><span>× {{ followUpRescuePct }}% rescued by intentional follow-up:</span><span class="font-bold tabular-nums">{{ visitorsRescuedPerYear }}</span></div>
          <hr class="my-3 border-divider" />
          <div class="flex justify-between text-lg"><span class="font-bold">Households kept in your church family per year:</span><span class="font-bold tabular-nums text-success">~{{ visitorsRescuedPerYear }}</span></div>
        </div>
        <p class="mt-6 text-base text-ink-muted italic leading-relaxed">
          {{ pastorFirst }} — these aren't just numbers. Each one is a family that walked into your church looking for something. {{ visitorsRescuedPerYear }} families a year is a small group, a serving team, a Sunday school class. People who would have slipped through if no one followed up.
        </p>
      </section>

      <!-- ── Slide 4: Quiet drift ─────────────────────────────────── -->
      <section v-else-if="slideIdx === 4" class="max-w-4xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">Gap #2 · The drift you don't see</div>
        <h2 class="text-4xl font-bold text-ink mb-8 tracking-tight">Members going quiet — until they're gone.</h2>
        <div class="rounded-xl bg-surface-raised border border-divider p-6 text-base text-ink leading-loose">
          <div class="flex justify-between"><span>Total households at {{ churchName }} (typical for your size):</span><span class="font-bold tabular-nums">~{{ totalHouseholds }}</span></div>
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
                <td class="px-4 py-3 font-bold text-brand">From {{ pricing.monthly }}/mo<br /><span class="text-[10px] font-medium opacity-70">we'll get to the full breakdown next</span></td>
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

      <!-- ── Slide 8: Pricing reveal ─────────────────────────────── -->
      <section v-else-if="slideIdx === 8" class="max-w-3xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">{{ pricing.tier }}</div>
        <h2 class="text-4xl font-bold text-ink mb-3 tracking-tight">An introductory rate, just for {{ churchName }}.</h2>
        <p class="text-sm text-ink-muted mb-8 leading-relaxed">
          {{ churchName }} would be coming on as a founding partner while Grace is still new to the world. That earns you the founding rate — half off, locked for {{ pricing.lockMonths }} months. Worth being early.
        </p>

        <div class="rounded-2xl bg-gradient-to-br from-brand/5 via-surface-raised to-success/5 border-2 border-brand/40 overflow-hidden mb-6 shadow-xl">
          <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-divider">
            <!-- Standard (slashed) -->
            <div class="px-6 py-5 opacity-60">
              <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-3">Standard rate</div>
              <div class="line-through text-ink text-2xl font-bold tabular-nums leading-tight">{{ pricing.stdSetup }}</div>
              <div class="text-[11px] text-ink-disabled mb-3">setup, one-time</div>
              <div class="line-through text-ink text-2xl font-bold tabular-nums leading-tight">{{ pricing.stdMonthly }}/mo</div>
              <div class="text-[11px] text-ink-disabled">monthly</div>
            </div>
            <!-- Founding rate (active) -->
            <div class="px-6 py-5 bg-brand/10 relative">
              <div class="absolute top-3 right-3 rounded-full bg-success text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5">Yours</div>
              <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-3">Founding rate</div>
              <div class="text-brand text-3xl font-bold tabular-nums leading-tight">{{ pricing.setup }}</div>
              <div class="text-[11px] text-ink-muted mb-3">setup, one-time</div>
              <div class="text-brand text-3xl font-bold tabular-nums leading-tight">{{ pricing.monthly }}/mo</div>
              <div class="text-[11px] text-ink-muted">monthly · locked {{ pricing.lockMonths }} months</div>
            </div>
          </div>
          <div class="bg-success/10 px-6 py-3 flex items-center justify-between border-t border-divider">
            <span class="text-success font-semibold text-sm">Year-one savings:</span>
            <span class="text-success text-xl font-bold tabular-nums">${{ pricing.year1Savings.toLocaleString() }}</span>
          </div>
        </div>

        <div class="space-y-1.5 text-[13px] text-ink-muted">
          <p class="flex items-start gap-2"><span class="text-success font-bold">✓</span><span><strong class="text-ink">Annual prepay</strong> available: {{ pricing.annualPrepay }}</span></p>
          <p class="flex items-start gap-2"><span class="text-success font-bold">✓</span><span><strong class="text-ink">30-day partnership trial</strong> — if Grace isn't earning her place in your week by month one, full refund</span></p>
          <p class="flex items-start gap-2"><span class="text-success font-bold">✓</span><span><strong class="text-ink">We set everything up.</strong> You don't lift a finger past the kickoff call</span></p>
          <p class="flex items-start gap-2"><span class="text-ink-muted">·</span><span class="italic">After {{ pricing.lockMonths }} months, renews at standard rate. We'll tell you 60 days out.</span></p>
        </div>
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
</style>
