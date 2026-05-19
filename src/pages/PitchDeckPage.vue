<script setup lang="ts">
/**
 * Pitch deck — 10 slides for the discovery call.
 *
 * Public route. Optional :slug param looks up a cs_leads row and
 * personalizes everything (company name, reviews, math). Without
 * a slug, slides show "[Their Company]" placeholders so Josh can
 * preview the structure.
 *
 * Keyboard nav (←/→/space/esc), speaker-notes toggle, print mode.
 *
 * Used live on Zoom share-screen + sent as a post-call follow-up
 * link with the personalized URL.
 */
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AssistantMark from '@/components/AssistantMark.vue'
import AdaIcon from '@/components/ada/AdaIcon.vue'
import ChurchPitchDeck from './ChurchPitchDeck.vue'

const props = defineProps<{ slug?: string }>()
const route = useRoute()

interface LeadDetail {
  company_name: string
  contact_name: string | null
  industry: string | null
  city: string | null
  state: string | null
  icp_score: number | null
  icp_score_reason: string | null
  notes: string | null
  review_excerpts: { text: string; rating: number | null; relative_time: string | null }[] | null
  website_extract: string | null
  tags: string[] | null
}

const lead = ref<LeadDetail | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// Slide state
const slideIdx = ref(0)
const SLIDE_COUNT = 10
const showNotes = ref(false)

// Slide 8 (pricing reveal) — two-step within-slide reveal.
// Step 0: standard rate only, centered, no founding column.
// Step 1: standard strikes through, founding rate slides in.
// Bidirectional: ← un-reveals so the operator can re-anchor on a live
// call. Resets to step 0 whenever you navigate away from the slide.
const PRICING_SLIDE = 8
const pricingRevealStep = ref(0)
const PRICING_REVEAL_MAX = 1

// ── Personalization tokens (with sensible fallbacks) ─────────────────
const company = computed(() => lead.value?.company_name ?? '[Their Company]')
const ownerFirst = computed(() => {
  const n = lead.value?.contact_name ?? ''
  return n ? n.split(' ')[0] : '[Owner first name]'
})
const industry = computed(() => lead.value?.industry ?? 'service business')
const isChurch = computed(() => /church|ministry/i.test(industry.value))
const persona = computed(() => isChurch.value ? 'Grace' : 'Ada')
const founderFirst = 'Josh'

// Pull a few specific review quotes if available
const topReviews = computed(() => (lead.value?.review_excerpts ?? []).slice(0, 4))

// Pricing — both standard rate AND the founding-customer intro rate.
// The intro rate is what new prospects actually get; the standard
// rate is what shows up "slashed" to communicate the value of the
// discount without us having to say "first 5 customers."
const pricing = computed(() => {
  if (isChurch.value) {
    return {
      tier: 'Founding customer · ministry rate',
      // Standard (slashed)
      stdSetup: '$999',
      stdMonthly: '$499',
      // Founding rate (active)
      setup: '$499',
      monthly: '$299',
      annualPrepay: '$2,990 (saves another $498)',
      lockMonths: 12,
      year1Cost: 499 + 299 * 12,        // $4,087
      year1CostStandard: 999 + 499 * 12, // $6,987
      year1Savings: (999 + 499 * 12) - (499 + 299 * 12), // $2,900
    }
  }
  return {
    tier: 'Founding customer · service business rate',
    stdSetup: '$2,500',
    stdMonthly: '$999',
    setup: '$1,499',
    monthly: '$499',
    annualPrepay: '$4,990 (saves another $497)',
    lockMonths: 12,
    year1Cost: 1499 + 499 * 12,         // $7,487
    year1CostStandard: 2500 + 999 * 12, // $14,488
    year1Savings: (2500 + 999 * 12) - (1499 + 499 * 12), // $7,001
  }
})

// Custom demo URL — assumed to exist (link out target on slide 8)
const demoUrl = computed(() => {
  const params = new URLSearchParams({ demo_company: company.value })
  if (industry.value && industry.value !== 'service business') params.set('demo_industry', industry.value)
  if (lead.value?.city) params.set('demo_city', lead.value.city)
  if (lead.value?.state) params.set('demo_state', lead.value.state)
  const template = isChurch.value ? 'cornerstone-community-church' : 'apex-heating-and-air'
  return `/dashboard/${template}?${params.toString()}`
})

// ── Math placeholders (HVAC / service-business numbers) ──────────────
// Church math + voice live in ChurchPitchDeck.vue; this file handles
// the service-business pitch only.
const callsPerDay = 12
const missedPct = 28
const missedCallsPerYear = computed(() => Math.round(callsPerDay * 365 * (missedPct / 100)))
const closeRatePct = 23
const avgTicket = 480
const missedRevenue = computed(() => Math.round(missedCallsPerYear.value * (closeRatePct / 100) * avgTicket))

const quotesPerMonth = 24
const noFollowupPct = 40
const followupCloseLift = 0.18
const avgQuoteValue = 2200
const quotesRevenue = computed(() =>
  Math.round(quotesPerMonth * 12 * (noFollowupPct / 100) * followupCloseLift * avgQuoteValue),
)

const totalCaught = computed(() => missedRevenue.value + quotesRevenue.value)
const roi = computed(() => Math.round(totalCaught.value / pricing.value.year1Cost))

function money(n: number): string {
  return '$' + n.toLocaleString()
}

// ── Lead loading ──────────────────────────────────────────────────────
async function loadLead(slug: string | undefined) {
  if (!slug) return
  loading.value = true
  error.value = null
  try {
    // Try slug match first (we don't have a slug column on cs_leads yet,
    // so fall back to id match — UUIDs work as slugs).
    const { data } = await supabase
      .from('cs_leads')
      .select('company_name, contact_name, industry, city, state, icp_score, icp_score_reason, notes, review_excerpts, website_extract, tags')
      .eq('id', slug)
      .maybeSingle()
    if (data) lead.value = data as unknown as LeadDetail
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

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
    // Reset reveal when leaving the slide so the next entry shows step 0.
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

onMounted(() => {
  loadLead(props.slug ?? (route.query.lead as string | undefined))
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})

// Speaker notes per slide — shown in a toggleable bottom panel
const notes = computed<string[]>(() => [
  // 0 — cover
  `Open with energy. "${ownerFirst.value} — thanks for the time. I'm ${founderFirst} from CommandSite. The next 30 minutes is going to be specific to ${company.value} — I've done my homework on your shop, so this won't be a generic deck."`,
  // 1 — agenda
  `Set expectations. "Four things in 30 min: what I noticed about your shop, the math on what's leaking, ${persona.value} in action, and the pricing. Stop me anytime — questions are how this gets useful for you."`,
  // 2 — what I noticed
  `THIS is the slide that wins or loses the call. Slow down. Read the quotes verbatim. After each one ask: "Does that match what you're feeling?" Get a yes before moving on. If they push back ("oh that was just one customer"), agree and ask "what would be a more accurate read?"`,
  // 3 — missed calls leak
  `Math slide #1. Don't lecture — make THEM do the math out loud. "How many calls do you think you miss in a typical day?" "What's your average closed-call value?" Then build the math live with their numbers, not mine. End with: "Even if I'm half wrong on these, what's the rough number that feels right?"`,
  // 4 — quote follow-up leak
  `Math slide #2. Same shape. "How many quotes do you send a month?" "What's your close rate on the ones you follow up vs the ones you don't?" Most owners DON'T track this — when they realize they don't, that's a soft moment of recognition. Use it.`,
  // 5 — show her work (DEMO — moved up before price)
  `THE wow moment. Click out to the live dashboard URL — ${demoUrl.value}. Don't try to demo all 4 roles. Pick ONE that maps to their #1 pain. Drive the wow moment: click Approve on a queue card, watch the animation, narrate it: "Right now, ${persona.value} just sent that on your behalf. That's the loop you'd live in." Spend 5-7 minutes here. They should ask questions. After this slide they're imagining themselves using it — that's exactly when we should NOT show price yet.`,
  // 6 — solutions table (no Ada price yet)
  `THE alternative-cost slide. Walk down the list one row at a time. The "you yourself" row is the secret weapon — when they say "8 hours/week," multiply by their hourly rate live. They will gasp. That's the moment. ${persona.value}'s row says "From ${pricing.value.monthly}/mo — we'll get to the full breakdown next." Plant the floor without revealing the deal.`,
  // 7 — the catch (year 1 catch math, no cost number)
  `Now that they've seen ${persona.value} work AND seen the alternatives, this is the catch math. Show ${money(totalCaught.value)} caught year one. Ask: "Even if I'm off by half — does this still pencil for you?" Almost everyone says yes. THAT is your buying signal. End with: "Now let's talk about what she costs." This sets up the reveal.`,
  // 8 — pricing reveal with founding rate (two-step)
  `THE PRICE REVEAL — TWO STEPS. First press shows ONLY the standard rate (${pricing.value.stdSetup} setup + ${pricing.value.stdMonthly}/mo). PAUSE. Read it out loud. Let it sit for 2-3 seconds. Watch for the wince — that's the anchoring moment. Then press → again: slash draws across, founding rate slides in. Frame it: "But ${company.value} would be coming on while ${persona.value} is still new — that earns you the founding rate, half off, locked ${pricing.value.lockMonths} months. Worth being early." Don't apologize for the price — the catch math justified it. Mention: 30-day money-back, no setup work for them, renews at standard after ${pricing.value.lockMonths} months (be honest — surprise renewal would burn trust). Annual prepay available if they want a single PO.`,
  // 9 — next steps
  `Don't ask "do you want to do this?" Ask "what's the right next step for you?" Two clean options: (1) "send a proposal this afternoon, target start next week" or (2) "send the deck + recap, you sit on it for a week, we reconnect Tuesday." Both are real options. Picking one IS the close.`,
])
</script>

<template>
  <!-- Lead is a church/ministry → render the dedicated church deck -->
  <ChurchPitchDeck v-if="isChurch" :lead="lead" />

  <!-- Otherwise render the service-business deck -->
  <div v-else class="min-h-screen bg-surface relative overflow-hidden">
    <!-- Top progress + nav -->
    <header class="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 py-3 bg-gradient-to-b from-surface/80 to-transparent">
      <div class="flex items-center gap-2 text-xs text-ink-muted">
        <span class="font-semibold">CommandSite</span>
        <span class="opacity-50">·</span>
        <span>{{ company }} pitch</span>
      </div>
      <div class="flex items-center gap-1.5 text-[10px] font-mono text-ink-muted">
        <span v-for="n in SLIDE_COUNT" :key="n" class="block h-0.5 w-6 transition-colors duration-200 ease-out-quart"
          :class="(n - 1) === slideIdx ? 'bg-brand' : (n - 1) < slideIdx ? 'bg-brand/40' : 'bg-divider'"></span>
        <span class="ml-2 text-ink-disabled">{{ slideIdx + 1 }}/{{ SLIDE_COUNT }}</span>
      </div>
    </header>

    <!-- Bottom controls -->
    <footer class="absolute bottom-0 inset-x-0 z-20 flex items-center justify-between px-6 py-3 bg-gradient-to-t from-surface/80 to-transparent">
      <div class="flex items-center gap-2">
        <button
          class="rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand transition-[border-color,transform] duration-200 ease-out-quart active:scale-[0.97] disabled:opacity-30 disabled:active:scale-100"
          :disabled="slideIdx === 0"
          @click="prev"
        >← Back</button>
        <button
          class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-200 ease-out-quart active:scale-[0.97] disabled:opacity-30 disabled:active:scale-100"
          :disabled="slideIdx === SLIDE_COUNT - 1"
          @click="next"
        >Next →</button>
      </div>
      <div class="flex items-center gap-2 text-[10px] text-ink-disabled">
        <button class="hover:text-ink transition-colors" @click="showNotes = !showNotes">
          {{ showNotes ? 'Hide notes' : 'Speaker notes (n)' }}
        </button>
        <span class="opacity-50">·</span>
        <span>← → arrows · 0-9 jump · Esc close notes</span>
      </div>
    </footer>

    <!-- Speaker notes panel -->
    <Transition
      enter-active-class="transition-[opacity,transform] duration-[220ms] ease-out-quart"
      enter-from-class="opacity-0 translate-y-3"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-[opacity,transform] duration-150 ease-out-quart"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-3"
    >
      <aside
        v-if="showNotes"
        class="fixed bottom-14 inset-x-0 mx-auto max-w-3xl z-30 rounded-xl bg-ink text-ink-inverse shadow-2xl px-5 py-4"
      >
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[10px] font-bold uppercase tracking-[0.18em] opacity-60">Speaker notes</span>
          <span class="text-[10px] opacity-40">slide {{ slideIdx + 1 }}</span>
        </div>
        <p class="text-sm leading-relaxed whitespace-pre-wrap">{{ notes[slideIdx] }}</p>
      </aside>
    </Transition>

    <!-- Slide stage -->
    <main class="relative w-full min-h-screen flex items-center justify-center px-6 py-16">
      <!-- ── Slide 0: Cover ───────────────────────────────────────── -->
      <section v-if="slideIdx === 0" class="slide-stagger text-center max-w-4xl">
        <AssistantMark class="h-14 w-14 mx-auto mb-6 text-brand" />
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">A 30-min walkthrough</div>
        <h1 class="text-6xl sm:text-7xl font-bold text-ink mb-4 tracking-tight leading-none">
          {{ persona }} for<br />
          <span class="text-brand">{{ company }}</span>
        </h1>
        <p class="mt-8 text-lg text-ink-muted max-w-2xl mx-auto leading-relaxed">
          Specific to your shop, not a generic pitch. Built from your reviews + your Google profile + everything I could learn before today.
        </p>
        <p class="mt-12 text-xs text-ink-disabled">
          {{ founderFirst }} Daniel · CommandSite
        </p>
      </section>

      <!-- ── Slide 1: Agenda ──────────────────────────────────────── -->
      <section v-else-if="slideIdx === 1" class="slide-stagger max-w-3xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">What we'll cover</div>
        <h2 class="text-4xl font-bold text-ink mb-10 tracking-tight">30 minutes, 4 things.</h2>
        <ol class="space-y-5">
          <li v-for="(it, i) in [
            'What I noticed about ' + company,
            'Where revenue is leaking right now',
            persona + ' in action — live demo on your data',
            'What it catches, what it costs, what happens next',
          ]" :key="i" class="flex items-start gap-4">
            <span class="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-ink-inverse font-bold text-sm flex-shrink-0">{{ i + 1 }}</span>
            <span class="text-xl text-ink leading-snug pt-1">{{ it }}</span>
          </li>
        </ol>
        <p class="mt-10 text-sm text-ink-muted italic">
          Stop me whenever. Questions are how this gets useful.
        </p>
      </section>

      <!-- ── Slide 2: What I noticed ─────────────────────────────── -->
      <section v-else-if="slideIdx === 2" class="slide-stagger max-w-4xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">What I noticed about {{ company }}</div>
        <h2 class="text-4xl font-bold text-ink mb-8 tracking-tight">A few things from your reviews + profile.</h2>
        <ul v-if="topReviews.length > 0" class="space-y-4">
          <li v-for="(r, i) in topReviews" :key="i"
            class="rounded-lg border border-brand/20 bg-brand/5 px-5 py-4">
            <p class="text-base text-ink leading-relaxed italic">"{{ r.text.slice(0, 240) }}{{ r.text.length > 240 ? '…' : '' }}"</p>
            <p class="text-[11px] text-ink-muted mt-1">{{ r.rating ?? '?' }}★ · {{ r.relative_time ?? 'recent' }}</p>
          </li>
        </ul>
        <ul v-else class="space-y-4 text-base text-ink leading-relaxed">
          <li class="rounded-lg border border-brand/20 bg-brand/5 px-5 py-4 italic">[Pull 3-4 specific quotes from their Google reviews here. Pain is best — missed calls, no callback, ghost quote, etc.]</li>
          <li class="rounded-lg border border-brand/20 bg-brand/5 px-5 py-4 italic">[Reference their actual response time, recent rating change, or website claim.]</li>
          <li class="rounded-lg border border-brand/20 bg-brand/5 px-5 py-4 italic">[End with one positive — proves you read everything, not just the bad ones.]</li>
        </ul>
        <p class="mt-8 text-lg text-ink font-medium">
          Does any of this match what you're feeling?
        </p>
      </section>

      <!-- ── Slide 3: Missed calls leak ──────────────────────────── -->
      <section v-else-if="slideIdx === 3" class="slide-stagger max-w-4xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">Leak #1 · Missed calls</div>
        <h2 class="text-4xl font-bold text-ink mb-8 tracking-tight">The phone is bleeding.</h2>
        <div class="rounded-xl bg-surface-raised border border-divider p-6 font-mono text-base text-ink leading-loose">
          <div class="flex justify-between"><span>Calls per day (industry avg):</span><span class="font-bold tabular-nums">{{ callsPerDay }}</span></div>
          <div class="flex justify-between"><span>× 365 days:</span><span class="font-bold tabular-nums">{{ (callsPerDay * 365).toLocaleString() }}</span></div>
          <div class="flex justify-between text-warn"><span>× {{ missedPct }}% missed (after-hours / busy / lunch):</span><span class="font-bold tabular-nums">{{ missedCallsPerYear.toLocaleString() }}</span></div>
          <div class="flex justify-between"><span>× {{ closeRatePct }}% close rate × {{ money(avgTicket) }} avg ticket:</span><span class="font-bold tabular-nums text-danger">{{ money(missedRevenue) }}</span></div>
          <hr class="my-3 border-divider" />
          <div class="flex justify-between text-lg"><span class="font-bold">On the table per year:</span><span class="font-bold tabular-nums text-danger">{{ money(missedRevenue) }}</span></div>
        </div>
        <p class="mt-6 text-base text-ink-muted italic">
          "Even if I'm half wrong — what's the number that feels right to you?"
        </p>
      </section>

      <!-- ── Slide 4: Quote follow-up leak ───────────────────────── -->
      <section v-else-if="slideIdx === 4" class="slide-stagger max-w-4xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">Leak #2 · Unanswered quotes</div>
        <h2 class="text-4xl font-bold text-ink mb-8 tracking-tight">The estimates that go cold.</h2>
        <div class="rounded-xl bg-surface-raised border border-divider p-6 font-mono text-base text-ink leading-loose">
          <div class="flex justify-between"><span>Quotes per month (your shop):</span><span class="font-bold tabular-nums">{{ quotesPerMonth }}</span></div>
          <div class="flex justify-between"><span>× 12 months = quotes/year:</span><span class="font-bold tabular-nums">{{ (quotesPerMonth * 12).toLocaleString() }}</span></div>
          <div class="flex justify-between text-warn"><span>× {{ noFollowupPct }}% with no follow-up:</span><span class="font-bold tabular-nums">{{ Math.round(quotesPerMonth * 12 * (noFollowupPct / 100)) }}</span></div>
          <div class="flex justify-between"><span>× {{ Math.round(followupCloseLift * 100) }}% close lift if followed up × {{ money(avgQuoteValue) }}:</span><span class="font-bold tabular-nums text-danger">{{ money(quotesRevenue) }}</span></div>
          <hr class="my-3 border-divider" />
          <div class="flex justify-between text-lg"><span class="font-bold">Recoverable per year:</span><span class="font-bold tabular-nums text-danger">{{ money(quotesRevenue) }}</span></div>
        </div>
        <p class="mt-6 text-base text-ink-muted italic">
          Most shops don't track this. When you don't track it, you don't see it. {{ persona }} tracks every quote.
        </p>
      </section>

      <!-- ── Slide 5: Show her work (DEMO — moved up before price) ─ -->
      <section v-else-if="slideIdx === 5" class="slide-stagger max-w-3xl text-center">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">Live · in your browser</div>
        <h2 class="text-5xl font-bold text-ink mb-6 tracking-tight">Let's stop talking and watch {{ persona }} do it.</h2>
        <p class="text-xl text-ink-muted mb-10 leading-relaxed">
          A CommandSite dashboard set up specifically for {{ company }}. Click around. Numbers are illustrative — every <em>behavior</em> is what {{ persona }} would actually do for you from day one.
        </p>
        <a
          :href="demoUrl"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-3 rounded-xl bg-brand text-ink-inverse px-8 py-4 text-base font-semibold hover:opacity-90 transition-[opacity,transform] duration-200 ease-out-quart active:scale-[0.97] shadow-2xl"
        >
          Open {{ company }}'s {{ persona }} dashboard
          <span>→</span>
        </a>
        <p class="mt-12 text-[11px] text-ink-disabled italic">
          During the call I'll drive. After the call this link is yours — share it with your team.
        </p>
      </section>

      <!-- ── Slide 6: Solutions table — Ada price held back ──────── -->
      <section v-else-if="slideIdx === 6" class="slide-stagger max-w-5xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">Who could fix this — and what it costs</div>
        <h2 class="text-3xl font-bold text-ink mb-6 tracking-tight">You'd want to plug those leaks no matter what. Here are the options.</h2>
        <div class="overflow-x-auto rounded-xl border border-divider">
          <table class="w-full text-sm">
            <thead class="bg-surface-elevated/60 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <tr>
                <th class="text-left px-4 py-3">Solution</th>
                <th class="text-left px-4 py-3">Year-1 cost</th>
                <th class="text-left px-4 py-3">What they catch</th>
                <th class="text-left px-4 py-3">What they miss</th>
              </tr>
            </thead>
            <tbody class="table-stagger divide-y divide-divider">
              <tr>
                <td class="px-4 py-3 font-semibold text-ink">Hire an office manager</td>
                <td class="px-4 py-3 text-ink-muted">$48–65K + benefits</td>
                <td class="px-4 py-3 text-ink-muted">Calls, quotes, reviews</td>
                <td class="px-4 py-3 text-ink-muted">Hard to find · sick days · vacation</td>
              </tr>
              <tr>
                <td class="px-4 py-3 font-semibold text-ink">Live answering service</td>
                <td class="px-4 py-3 text-ink-muted">$4.8–14K</td>
                <td class="px-4 py-3 text-ink-muted">The phone</td>
                <td class="px-4 py-3 text-ink-muted">No quote chasing · no review collection · no reactivation</td>
              </tr>
              <tr>
                <td class="px-4 py-3 font-semibold text-ink">AI receptionist (Smith.ai)</td>
                <td class="px-4 py-3 text-ink-muted">$3.6–12K</td>
                <td class="px-4 py-3 text-ink-muted">AI handles calls</td>
                <td class="px-4 py-3 text-ink-muted">Calls only</td>
              </tr>
              <tr class="bg-warn/5">
                <td class="px-4 py-3 font-semibold text-ink">You yourself, evenings + weekends</td>
                <td class="px-4 py-3 text-ink-muted">"Free"<br /><span class="text-[11px] italic">(let's add up the hours)</span></td>
                <td class="px-4 py-3 text-ink-muted">Whatever you can squeeze in</td>
                <td class="px-4 py-3 text-warn font-semibold">Time you'd rather spend on jobs / family</td>
              </tr>
              <tr class="bg-brand/10">
                <td class="px-4 py-3 font-bold text-brand">{{ persona }} (CommandSite)</td>
                <td class="px-4 py-3 font-bold text-brand">From {{ pricing.monthly }}/mo<br /><span class="text-[10px] font-medium opacity-70">full breakdown next</span></td>
                <td class="px-4 py-3 text-ink">Calls + quotes + reviews + reactivation</td>
                <td class="px-4 py-3 text-ink-muted">New product · founder-built · so I respond same-day</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="mt-6 text-base text-ink-muted italic">
          {{ ownerFirst }} — how many hours a week do you spend on after-hours calls + quote follow-ups? What's your billable rate when you're on a job?
        </p>
      </section>

      <!-- ── Slide 7: The catch (math — cost held back for reveal) ─ -->
      <section v-else-if="slideIdx === 7" class="slide-stagger max-w-3xl">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">What {{ persona }} catches</div>
        <h2 class="text-4xl font-bold text-ink mb-8 tracking-tight">A real number, year one.</h2>
        <div class="rounded-xl bg-surface-raised border border-divider divide-y divide-divider">
          <div class="px-6 py-3 text-[11px] uppercase tracking-wider text-ink-disabled font-bold bg-surface-elevated/40">For {{ company }}, year one</div>
          <div class="flex items-center justify-between px-6 py-3">
            <span class="text-ink-muted">Missed calls recovered:</span>
            <span class="text-lg font-bold tabular-nums text-success">{{ money(missedRevenue) }}</span>
          </div>
          <div class="flex items-center justify-between px-6 py-3">
            <span class="text-ink-muted">Quote follow-ups closed:</span>
            <span class="text-lg font-bold tabular-nums text-success">{{ money(quotesRevenue) }}</span>
          </div>
          <div class="flex items-center justify-between px-6 py-3">
            <span class="text-ink-muted">Reviews collected (year):</span>
            <span class="text-lg font-bold tabular-nums text-success">~30 → ~70</span>
          </div>
          <div class="flex items-center justify-between px-6 py-3">
            <span class="text-ink-muted">Dormant customers reactivated:</span>
            <span class="text-lg font-bold tabular-nums text-success">$6,800+</span>
          </div>
          <div class="flex items-center justify-between px-6 py-6 bg-brand/10">
            <span class="text-ink font-bold text-lg">Total she catches:</span>
            <span class="text-4xl font-bold tabular-nums text-brand">{{ money(totalCaught) }}</span>
          </div>
        </div>
        <p class="mt-6 text-lg text-ink font-medium text-center">
          Even if I'm off by half: does this still pencil for you?
        </p>
        <p class="mt-3 text-sm text-ink-muted italic text-center">
          Now let's talk about what she costs.
        </p>
      </section>

      <!-- ── Slide 8: Pricing reveal — two-step (anchor → founding) ─ -->
      <section v-else-if="slideIdx === 8" class="slide-stagger max-w-3xl">
        <!-- Eyebrow swaps between anchor + founding framings -->
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">
          {{ pricingRevealStep === 0 ? 'Standard pricing' : pricing.tier }}
        </div>
        <h2 class="text-4xl font-bold text-ink mb-3 tracking-tight">
          {{ pricingRevealStep === 0 ? "Here's what CommandSite normally costs." : "But you're not paying that." }}
        </h2>
        <p class="text-sm text-ink-muted mb-8 leading-relaxed min-h-[2.5rem]">
          <template v-if="pricingRevealStep === 0">
            The standard rate. What every customer pays after the founding window closes.
          </template>
          <template v-else>
            {{ company }} would be coming on while {{ persona }} is still new to the world. That earns you the founding rate: half off, locked for {{ pricing.lockMonths }} months. Worth being early.
          </template>
        </p>

        <div class="rounded-2xl bg-surface-raised border-2 border-brand/40 overflow-hidden mb-6 shadow-xl">
          <!-- Two-column: standard | founding -->
          <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-divider">
            <!-- Standard column — always visible, fades + strikes on reveal -->
            <div
              class="px-6 py-5 transition-opacity duration-300 ease-out-quart"
              :class="pricingRevealStep === 1 ? 'opacity-60' : 'opacity-100'"
            >
              <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-3">Standard rate</div>
              <div :class="['strike-anim text-ink text-2xl font-bold tabular-nums leading-tight inline-block', { 'strike-active': pricingRevealStep === 1 }]">
                {{ pricing.stdSetup }}
              </div>
              <div class="text-[11px] text-ink-disabled mb-3">setup, one-time</div>
              <div :class="['strike-anim text-ink text-2xl font-bold tabular-nums leading-tight inline-block', { 'strike-active': pricingRevealStep === 1 }]">
                {{ pricing.stdMonthly }}/mo
              </div>
              <div class="text-[11px] text-ink-disabled">monthly</div>
            </div>

            <!-- Founding column — slides in on reveal -->
            <Transition
              enter-active-class="transition-[opacity,transform] duration-[400ms] ease-out-quart"
              enter-from-class="opacity-0 translate-x-4"
              enter-to-class="opacity-100 translate-x-0"
            >
              <div v-if="pricingRevealStep === 1" class="px-6 py-5 bg-brand/10 relative">
                <div class="absolute top-3 right-3 rounded-full bg-success text-ink-inverse text-[9px] font-bold uppercase tracking-wider px-2 py-0.5">Yours</div>
                <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-3">Founding rate</div>
                <div class="text-brand text-3xl font-bold tabular-nums leading-tight">{{ pricing.setup }}</div>
                <div class="text-[11px] text-ink-muted mb-3">setup, one-time</div>
                <div class="text-brand text-3xl font-bold tabular-nums leading-tight">{{ pricing.monthly }}/mo</div>
                <div class="text-[11px] text-ink-muted">monthly · locked {{ pricing.lockMonths }} months</div>
              </div>
              <!-- Placeholder when not revealed yet (keeps the card balanced) -->
              <div v-else class="px-6 py-5 flex items-center justify-center text-center min-h-[178px]">
                <div class="text-[11px] text-ink-disabled italic max-w-[180px]">
                  Press → to see what {{ ownerFirst }} actually pays.
                </div>
              </div>
            </Transition>
          </div>

          <!-- Savings strip — appears on reveal, after founding column lands -->
          <Transition
            enter-active-class="transition-[opacity,transform,max-height] duration-[300ms] ease-out-quart [transition-delay:200ms]"
            enter-from-class="opacity-0 -translate-y-1 max-h-0"
            enter-to-class="opacity-100 translate-y-0 max-h-[60px]"
          >
            <div
              v-if="pricingRevealStep === 1"
              class="bg-success/10 px-6 py-3 flex items-center justify-between border-t border-divider overflow-hidden"
            >
              <span class="text-success font-semibold text-sm">Year-one savings:</span>
              <span class="text-success text-xl font-bold tabular-nums">{{ money(pricing.year1Savings) }}</span>
            </div>
          </Transition>
        </div>

        <!-- Year-1 cost + ROI cards — fade in after savings strip -->
        <Transition
          enter-active-class="transition-[opacity,transform] duration-[280ms] ease-out-quart [transition-delay:300ms]"
          enter-from-class="opacity-0 translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
        >
          <div v-if="pricingRevealStep === 1" class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <div class="rounded-lg border border-divider bg-surface-raised px-4 py-3">
              <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">Year-1 cost (founding)</div>
              <div class="text-xl font-bold tabular-nums text-ink">{{ money(pricing.year1Cost) }}</div>
              <div class="text-[11px] text-ink-disabled">setup + 12 × monthly</div>
            </div>
            <div class="rounded-lg border border-success/30 bg-success/5 px-4 py-3">
              <div class="text-[10px] font-bold uppercase tracking-wider text-success mb-1">Year-1 ROI</div>
              <div class="text-xl font-bold tabular-nums text-success">{{ roi }}× return</div>
              <div class="text-[11px] text-ink-muted">{{ money(totalCaught) }} caught ÷ {{ money(pricing.year1Cost) }} cost</div>
            </div>
          </div>
        </Transition>

        <!-- Proof points — fade in after Year-1 cards -->
        <Transition
          enter-active-class="transition-opacity duration-[250ms] ease-out-quart [transition-delay:400ms]"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
        >
          <div v-if="pricingRevealStep === 1" class="space-y-1.5 text-[13px] text-ink-muted">
            <p class="flex items-start gap-2"><AdaIcon name="check-circle" class="h-4 w-4 text-success flex-shrink-0 mt-0.5" /><span><strong class="text-ink">Annual prepay</strong> available: {{ pricing.annualPrepay }}</span></p>
            <p class="flex items-start gap-2"><AdaIcon name="check-circle" class="h-4 w-4 text-success flex-shrink-0 mt-0.5" /><span><strong class="text-ink">30-day money-back</strong> if {{ persona }} doesn't pay for herself in month one</span></p>
            <p class="flex items-start gap-2"><AdaIcon name="check-circle" class="h-4 w-4 text-success flex-shrink-0 mt-0.5" /><span><strong class="text-ink">We set everything up.</strong> You don't lift a finger</span></p>
            <p class="flex items-start gap-2"><span class="text-ink-muted flex-shrink-0 mt-0.5">·</span><span class="italic">After {{ pricing.lockMonths }} months, renews at standard rate. No surprises — we'll tell you 60 days out.</span></p>
          </div>
        </Transition>
      </section>

      <!-- ── Slide 9: Next steps ─────────────────────────────────── -->
      <section v-else-if="slideIdx === 9" class="slide-stagger max-w-3xl text-center">
        <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-brand mb-6">Next steps</div>
        <h2 class="text-5xl font-bold text-ink mb-12 tracking-tight">What feels right to you, {{ ownerFirst }}?</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <div class="rounded-xl border-2 border-brand bg-brand/5 p-6 text-left">
            <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-2">Option A · Move now</div>
            <div class="text-xl font-bold text-ink mb-3">Send me a proposal this afternoon.</div>
            <p class="text-sm text-ink-muted">Target start next week. {{ persona }} live in 2 weeks.</p>
          </div>
          <div class="rounded-xl border-2 border-divider bg-surface-raised p-6 text-left">
            <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">Option B · Sleep on it</div>
            <div class="text-xl font-bold text-ink mb-3">Send the deck + dashboard link.</div>
            <p class="text-sm text-ink-muted">I'll reconnect Tuesday with whatever questions you've got.</p>
          </div>
        </div>
        <p class="text-base text-ink-muted">
          Either is honestly fine. No pressure. Just clarity on the next step.
        </p>
        <p class="mt-12 text-xs text-ink-disabled">
          {{ founderFirst }} Daniel · josh@commandsite.io · CommandSite
        </p>
      </section>
    </main>

    <!-- Loading / error chrome -->
    <div v-if="loading" class="absolute top-1/2 right-4 text-[10px] text-ink-disabled">Loading lead…</div>
    <div v-if="error" class="absolute top-1/2 right-4 text-[10px] text-danger">{{ error }}</div>
  </div>
</template>

<style scoped>
/* Slide enter — single section fade. Emil's keyboard-nav rule: don't
   animate per-child on keyboard-initiated UI. The whole slide fades up
   as one block in 180ms, fast enough to stay out of the operator's way. */
@keyframes slideFadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

section.slide-stagger {
  animation: slideFadeUp 180ms var(--ease-out-quart);
}

/* Alternatives table — the one place stagger earns its keep. Slide 6
   IS the reveal slide, drama appropriate. Tight 30ms steps, no front
   delay; cascade settles in ~250ms. */
.table-stagger tr {
  animation: slideFadeUp 240ms var(--ease-out-quart) backwards;
}
.table-stagger tr:nth-child(1) { animation-delay: 0ms; }
.table-stagger tr:nth-child(2) { animation-delay: 30ms; }
.table-stagger tr:nth-child(3) { animation-delay: 60ms; }
.table-stagger tr:nth-child(4) { animation-delay: 90ms; }
.table-stagger tr:nth-child(5) { animation-delay: 120ms; }

/* Price strike-through — the slash on the standard rate draws across
   left-to-right on price reveal. Emil's "on-screen movement" curve
   (ease-in-out-quart) reads as deliberate ink rather than a snap. */
.strike-anim {
  position: relative;
}
.strike-anim::after {
  content: '';
  position: absolute;
  top: 50%;
  left: -4%;
  right: -4%;
  height: 2px;
  background: currentColor;
  transform-origin: left center;
  transform: scaleX(0);
  transition: transform 500ms cubic-bezier(0.77, 0, 0.175, 1);
  transition-delay: 100ms;
  pointer-events: none;
}
.strike-anim.strike-active::after {
  transform: scaleX(1);
}

@media (prefers-reduced-motion: reduce) {
  section.slide-stagger,
  .table-stagger tr {
    animation: none;
  }
  .strike-anim::after {
    transition: none;
  }
}
</style>
