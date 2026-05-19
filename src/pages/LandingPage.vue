<script setup lang="ts">
/**
 * CommandSite — Landing page (local services).
 *
 * Lives at `/`. Audience: 4-25 person service-business owners
 * (HVAC, plumbing, electrical, roofing, landscaping, contractors).
 * Voice + content sourced from docs/landing-page/commandsite-io-local-services-v1.md.
 *
 * Persona: Ada — the AI employee, named for Ada Lovelace.
 *
 * TODO before launch:
 *   • Swap CTA_URL from mailto: to the real Calendly URL once that
 *     account is set up + "30-min Discovery Walkthrough" event exists.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import BrandLogo from '@/components/BrandLogo.vue'
import AssistantMark from '@/components/AssistantMark.vue'
import AdaIcon from '@/components/ada/AdaIcon.vue'
import AdaAtWorkHub from '@/components/ada/AdaAtWorkHub.vue'
import AdaActivityColumn from '@/components/landing/AdaActivityColumn.vue'
import LiveActivityFeed from '@/components/ada/LiveActivityFeed.vue'
import { adaRoles, getRole, type AdaRole } from '@/lib/clients/apex/roles'
import { useLiveActivity, seedEvent } from '@/composables/useLiveActivity'

const router = useRouter()

// Hero "real product" preview clicks → the demo dashboard, with the
// clicked role's section pre-targeted via hash. Buyer goes from
// "look, that's Front Desk" on the landing → straight to the demo.
function onHeroRoleClick(role: AdaRole) {
  router.push({
    name: 'dashboard.tab',
    params: { slug: 'apex-heating-and-air', tab: role.tab },
    hash: `#${role.key}`,
  })
}

const CTA_URL = 'https://calendly.com/josh-commandsite/30-min-discovery-services-walkthrough'
const CTA_LABEL = 'Book a discovery walkthrough'

// Hero "she's working right now" feed — sits below the role hub so the
// product reads as alive on first paint. Drift slowed to 22s so the demo
// doesn't feel like a slot machine.
const { events: heroEvents, fmtAgo: heroFmtAgo } = useLiveActivity({
  seed: [
    seedEvent(45, 'phone-off', 'Caught a missed call from Walter Knox. Wants an AC quote.', 'front_desk'),
    seedEvent(180, 'quote_followup', 'Sent 3-day check-in to the Whitlocks on their $4,200 quote', 'quote_followup'),
    seedEvent(420, 'review_engine', 'Asked Diane Rivera for a Google review (job finished 2 hrs ago)', 'review_engine'),
    seedEvent(960, 'reactivation', 'Reactivation note went out to 12 customers who haven\'t called in 18 months', 'reactivation'),
  ],
  pool: [
    { icon: 'phone-off', text: 'After-hours call from Marcus Hill. Booked Tuesday 9 AM.', role: 'front_desk' },
    { icon: 'quote_followup', text: 'Day-1 follow-up sent on the $7,800 heat-pump quote for the Yangs', role: 'quote_followup' },
    { icon: 'review_engine', text: 'Trevor Ng left a 5-star review. Ada thanked him.', role: 'review_engine' },
    { icon: 'schedule_coord', text: 'Booked an emergency no-heat call for the Petersons at 6:15 AM', role: 'schedule_coord' },
    { icon: 'customer_health', text: 'Flagged the Hernandez account. Last service: 14+ months.', role: 'customer_health' },
    { icon: 'reactivation', text: 'Win-back SMS to 3 dormant customers; Megan Riley replied', role: 'reactivation' },
  ],
  driftMs: 22_000,
  cap: 6,
})

// Mobile sticky bottom CTA: appears once the hero scrolls offscreen,
// disappears when the user scrolls back up. Truck-cab buyers don't have
// to scroll back to the top to find the next step.
const heroRef = ref<HTMLElement | null>(null)
const showStickyCta = ref(false)
let heroObserver: IntersectionObserver | null = null

onMounted(() => {
  if (!heroRef.value || typeof IntersectionObserver === 'undefined') return
  heroObserver = new IntersectionObserver(
    ([entry]) => { showStickyCta.value = !entry.isIntersecting },
    { rootMargin: '-40% 0px 0px 0px' }
  )
  heroObserver.observe(heroRef.value)
})

onUnmounted(() => {
  heroObserver?.disconnect()
  heroObserver = null
})

interface Pain { headline: string; detail: string }
const pains: Pain[] = [
  {
    headline: 'Friday at 8 PM, your phone rings — and goes to voicemail.',
    detail: 'That was a $400 service call. By Monday morning they\'ve already booked the next guy.',
  },
  {
    headline: 'You sent a $4,500 quote three weeks ago.',
    detail: 'Crickets. The customer probably did the work — just not with you.',
  },
  {
    headline: 'You finished 47 jobs last month. You asked for 2 reviews.',
    detail: 'Your competitors are at 200+ stars; you\'re at 48.',
  },
  {
    headline: 'You\'re paying for five different tools.',
    detail: 'Phone system, scheduling, CRM, invoicing, review platform — and still feel like things slip through the cracks every week.',
  },
]

interface Module { icon: string; title: string; tagline: string; detail: string }
const modules: Module[] = [
  {
    icon: 'front_desk',
    title: 'Ada at the front desk',
    tagline: 'Catches every call. Books every job.',
    detail: 'Trained on your services, pricing, hours, and dispatch rules. Answers in your business\'s voice, books straight to your calendar, escalates emergencies to your cell, 24/7. Sounds like a thoughtful office manager, not a chatbot.',
  },
  {
    icon: 'quote_followup',
    title: 'Ada chases your quotes',
    tagline: 'No more estimates collecting dust.',
    detail: 'Every quote you send gets a 7-day SMS follow-up sequence in your voice. Ada answers basic questions, schedules walk-throughs, and only pings you when a serious lead needs a human.',
  },
  {
    icon: 'review_engine',
    title: 'Ada asks for the review',
    tagline: 'At the moment customers are happiest.',
    detail: 'Ada texts customers two hours after the job\'s done. The work\'s still fresh, and that\'s when people actually reply. She drafts your response to anything 3 stars or below before it goes live, so a bad review never sits unanswered.',
  },
  {
    icon: 'reactivation',
    title: 'Ada wakes up old customers',
    tagline: 'The leads you forgot about? She didn\'t.',
    detail: 'Ada digs through your CRM for customers who\'ve gone quiet, sorts them by what work they had and how long it\'s been, and texts them in your voice. Most owners book 4–8 jobs in the first 30 days from leads they\'d written off.',
  },
  {
    icon: 'performance_reporting',
    title: 'Ada\'s daily report',
    tagline: 'One screen. Everything that matters.',
    detail: 'Calls handled, quotes sent, reviews earned, jobs booked. No bouncing between tabs. No "wait, which tool does that live in?" Open it in the morning, see what Ada handled overnight, and get back on the truck.',
  },
]

interface CompareRow { dimension: string; hire: string; ada: string }
const compare: CompareRow[] = [
  { dimension: 'Cost',                hire: '$30-50K/year + benefits', ada: 'A lot less than a CSR salary. Exact number on the discovery call.' },
  { dimension: 'Hours worked',        hire: 'Office hours, M-F',        ada: '24/7, including weekends' },
  { dimension: 'Time off',            hire: 'PTO, sick days, holidays', ada: 'Never out' },
  { dimension: 'Quote follow-up',     hire: 'When she remembers',       ada: 'Every quote, every time, on schedule' },
  { dimension: 'Review collection',   hire: 'Manual ask if not forgotten', ada: 'Automated 2 hrs after every job' },
  { dimension: 'Hire-to-productive',  hire: '6-12 weeks (interview + train)', ada: '14 days, fully trained on your business' },
  { dimension: 'Scales with calls',   hire: 'Hire another person',      ada: 'Same flat monthly fee' },
]

interface Faq { q: string; a: string }
const faqs: Faq[] = [
  {
    q: 'I already use ServiceTitan / Jobber / Housecall Pro. Does this replace it?',
    a: 'No. CommandSite plugs into your existing CRM, scheduling, and invoicing. Ada is the missing layer between your customers and your tools — the part that catches calls, chases quotes, and collects reviews automatically. Your existing stack stays.',
  },
  {
    q: 'How long does setup actually take?',
    a: '14 days from kickoff to live. The first week is us learning your business + training Ada. The second week is testing, tuning, and going live with monitoring. Most owners are surprised how little of their time it takes.',
  },
  {
    q: 'What if I\'m too small? I only do 60 jobs a month.',
    a: 'Our Starter tier is built for exactly that range — small teams who can\'t justify a full-time CSR but are losing real money to missed calls and forgotten quotes. If 60 jobs/month feels like the ceiling and you want more, this is for you.',
  },
  {
    q: 'What about my data? Where does it live?',
    a: 'Your data lives in a dedicated, isolated environment — not shared with other customers. We use the same security standards as the major business apps you already use. We never sell or share your data, and you own everything.',
  },
  {
    q: 'What if it doesn\'t work for me?',
    a: 'Cancel anytime after month 1. We do the custom build during the first weeks of working together, then ongoing monthly. If Ada isn\'t earning her keep, you\'re not locked in.',
  },
  {
    q: 'Why is she called Ada?',
    a: 'Named after Ada Lovelace, who wrote the first computer program in the 1840s — a hundred years before computers existed. She\'s the original AI ancestor. Plus, "Ada" is short, easy to say on a phone, and sounds like a name you\'d actually want answering for your business.',
  },
  {
    q: 'Does Ada say she\'s an AI when she answers calls?',
    a: 'Yes — Ada always identifies herself as your AI assistant on the first interaction. Transparency is the right move (and it\'s becoming legally required in some states). Once customers know she\'s AI, they\'re often impressed at how naturally she handles the call.',
  },
]

</script>

<template>
  <div class="min-h-screen bg-surface text-ink antialiased">
    <!-- ── Header ────────────────────────────────────────────────────── -->
    <header class="sticky top-0 z-30 border-b border-divider bg-chrome/95 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
        <RouterLink to="/" class="flex items-center" aria-label="CommandSite home">
          <BrandLogo surface="dark" :height="44" />
        </RouterLink>
        <nav class="flex items-center gap-4 sm:gap-6">
          <RouterLink
            to="/churches"
            class="text-sm font-medium text-ink-inverse/80 hover:text-ink-inverse transition-colors hidden sm:inline"
          >For churches</RouterLink>
          <RouterLink
            to="/login"
            class="text-sm font-medium text-ink-inverse hover:opacity-80 transition-opacity inline-flex items-center gap-1.5"
          >
            <span class="hidden sm:inline">Sign in</span>
            <span class="sm:hidden">Login</span>
          </RouterLink>
          <a :href="CTA_URL" class="btn-primary !py-2 !px-4 !text-xs sm:!text-sm">
            {{ CTA_LABEL }}
          </a>
        </nav>
      </div>
    </header>

    <!-- ── Hero ──────────────────────────────────────────────────────── -->
    <section ref="heroRef" class="mx-auto max-w-6xl px-4 sm:px-8 pt-16 pb-12 sm:pt-20">
      <div class="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        <!-- Copy column -->
        <div class="lg:col-span-7 hero-stagger">
          <AssistantMark class="hero-mark h-16 w-16 mb-6 text-brand" />
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
            For service businesses
          </div>
          <h1 class="text-4xl font-semibold tracking-tight text-ink sm:text-6xl leading-[1.05]">
            Meet Ada,<br />
            your AI employee.
          </h1>
          <p class="mt-6 max-w-2xl text-lg text-ink-muted leading-relaxed">
            We're <strong class="text-ink font-semibold">CommandSite</strong>. We build Ada for your service business: your services, your pricing, the way you actually run jobs. While you're on the truck, she's catching calls, chasing quotes, asking customers for reviews.
          </p>
          <p class="mt-2 text-sm text-ink-muted italic">
            (Yes, named after Ada Lovelace, the first programmer.)
          </p>
          <div class="mt-10 flex flex-wrap gap-3">
            <a :href="CTA_URL" class="btn-primary">
              {{ CTA_LABEL }} →
            </a>
            <a href="#how-it-works" class="btn-secondary">
              See how it works
            </a>
          </div>
        </div>

        <!-- Activity column — atmospheric proof of "while you're on the truck" -->
        <div class="hero-column-in lg:col-span-5 h-[420px] sm:h-[520px] lg:h-[640px] -mt-2 lg:-mt-8">
          <AdaActivityColumn />
        </div>
      </div>
    </section>

    <!-- ── Hero product preview ──────────────────────────────────────────
         Renders the actual Apex Today Hub component with real role data.
         Same code that powers /dashboard/apex-heating-and-air; clicks
         deep-link straight into the public demo. -->
    <section v-reveal class="mx-auto max-w-6xl px-4 sm:px-8 pb-20 sm:pb-28">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Ada at work · Apex Heating &amp; Air
        </div>
        <RouterLink
          to="/dashboard/apex-heating-and-air"
          class="text-xs text-brand font-medium hover:underline"
        >
          Open the full demo →
        </RouterLink>
      </div>
      <!-- Real product surface, framed by a thin chrome-tinted rail so it
           reads as "look inside the dashboard" instead of "another section." -->
      <div class="rounded-card border border-divider bg-surface-raised shadow-raised overflow-hidden">
        <div class="h-1.5 bg-brand" aria-hidden="true"></div>
        <div class="p-4 sm:p-6 space-y-4">
          <AdaAtWorkHub
            :roles="adaRoles"
            owner-name="Brett"
            assistant-name="Ada"
            @role-click="onHeroRoleClick"
          />
          <LiveActivityFeed
            :events="heroEvents"
            :fmt-ago="heroFmtAgo"
            :get-role="getRole"
            title="What she's doing right now"
            subtitle="Ada's stream · auto-updating"
          />
        </div>
      </div>
      <p class="mt-3 text-[11px] text-ink-disabled italic">
        Click any role to drop into the demo. Apex is fictional. The dashboard is the real product.
      </p>
    </section>

    <!-- ── Live demo CTA — "see Ada in action first" ────────────────── -->
    <section v-reveal class="border-y border-divider py-12">
      <div class="mx-auto max-w-5xl px-4 sm:px-8">
        <div class="relative overflow-hidden rounded-card border border-brand/30 bg-surface-raised p-6 sm:p-8 flex flex-col lg:flex-row items-start gap-6">
          <div class="absolute top-0 left-0 right-0 h-[3px] bg-brand" aria-hidden="true"></div>
          <div class="flex-1 min-w-0">
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-2">
              Take a look inside
            </div>
            <h2 class="text-xl sm:text-2xl font-semibold text-ink leading-snug mb-3">
              Want to see Ada in action first? <span class="text-ink-muted font-normal">No call required.</span>
            </h2>
            <p class="text-sm text-ink-muted leading-relaxed mb-4 max-w-lg">
              Walk through the same dashboard a real HVAC shop would use. Click every tab. Try the chat. Ada knows the demo data and answers like she would for your business.
            </p>
            <ul class="space-y-1.5 text-sm text-ink mb-5">
              <li class="flex items-start gap-2">
                <span class="text-brand font-bold">→</span>
                <span>See how Ada handles calls, quotes, reviews, and reactivation</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-brand font-bold">→</span>
                <span>Click the floating "Ask Ada" button on any page to chat with her</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-brand font-bold">→</span>
                <span>Drill into all 12 of her roles from the Today page</span>
              </li>
            </ul>
            <div class="flex flex-wrap items-center gap-3">
              <RouterLink to="/dashboard/apex-heating-and-air" class="btn-primary !text-sm">
                Tour the demo →
              </RouterLink>
              <p class="text-[11px] text-ink-disabled italic">Demo data is for "Apex Heating &amp; Air" (fictional, fully click-through).</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Pain ──────────────────────────────────────────────────────── -->
    <section v-reveal class="py-16 sm:py-20">
      <div class="mx-auto max-w-5xl px-4 sm:px-8">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
          Sound familiar
        </div>
        <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-10 max-w-3xl">
          Four ways money slips out.
        </h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <div
            v-for="(p, i) in pains"
            :key="i"
            class="rounded-card border border-divider bg-surface-raised p-5"
          >
            <p class="text-base font-semibold text-ink leading-snug">{{ p.headline }}</p>
            <p class="mt-2 text-sm text-ink-muted leading-relaxed">{{ p.detail }}</p>
          </div>
        </div>
        <p class="mt-6 text-xs italic text-ink-disabled">
          If your office manager is doing all this manually, this is for them too.
        </p>
      </div>
    </section>

    <!-- ── What Ada does ─────────────────────────────────────────────── -->
    <section v-reveal id="how-it-works" class="mx-auto max-w-6xl px-4 sm:px-8 py-16 sm:py-24">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
        What Ada handles
      </div>
      <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-3">
        Five jobs. One Ada.
      </h2>
      <p class="text-base text-ink-muted max-w-2xl mb-10">
        Trained on your business specifically. Not a generic chatbot bolted onto a template.
      </p>

      <!-- Lead module: hero card with real call transcript -->
      <article class="card lg:p-8 flex flex-col lg:flex-row gap-6 lg:gap-10 items-stretch">
        <div class="flex-1 lg:max-w-md flex flex-col justify-center">
          <h3 class="text-xl sm:text-2xl font-semibold text-ink leading-tight">
            {{ modules[0].title }}
          </h3>
          <p class="mt-2 text-sm font-medium text-brand">
            {{ modules[0].tagline }}
          </p>
          <p class="mt-4 text-sm text-ink-muted leading-relaxed">
            {{ modules[0].detail }}
          </p>
        </div>
        <!-- Real-feeling call transcript on the right -->
        <div class="w-full lg:flex-1 rounded-xl bg-surface-elevated p-4 sm:p-5 border border-divider">
          <div class="flex items-center gap-2 mb-3 pb-3 border-b border-divider">
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand flex-shrink-0">
              <AdaIcon name="front_desk" class="h-3 w-3" />
            </span>
            <span class="text-xs text-ink font-semibold">Inbound · Sat 8:42 PM</span>
            <span class="ml-auto text-[11px] text-ink-disabled">3m 12s</span>
          </div>
          <div class="space-y-2.5 text-xs leading-relaxed">
            <p><span class="font-semibold text-ink-muted uppercase tracking-wider text-[10px]">Caller</span><br /><span class="text-ink-data">"Hi, my AC just stopped. Anyone available tonight?"</span></p>
            <p><span class="font-semibold text-brand uppercase tracking-wider text-[10px]">Ada</span><br /><span class="text-ink-data">"I'm sorry, that's miserable in this heat. We have an emergency tech available 9 to 11 tonight, or first slot tomorrow at 7 AM. What works?"</span></p>
            <p><span class="font-semibold text-ink-muted uppercase tracking-wider text-[10px]">Caller</span><br /><span class="text-ink-data">"Tonight please."</span></p>
            <p><span class="font-semibold text-brand uppercase tracking-wider text-[10px]">Ada</span><br /><span class="text-ink-data">"Booked. Tony will text you 15 minutes out. Address still 412 Elm?"</span></p>
          </div>
          <div class="mt-3 pt-3 border-t border-divider flex items-center gap-1.5 text-[11px]">
            <span class="text-success font-bold" aria-hidden="true">✓</span>
            <span class="text-ink font-medium">Booked: Tony · Sat 9–11 PM · $189 emergency rate confirmed</span>
          </div>
        </div>
      </article>

      <!-- Other 4 modules as icon-left horizontal cards -->
      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <article
          v-for="m in modules.slice(1)"
          :key="m.title"
          class="rounded-card bg-surface-raised border border-divider p-5 flex items-start gap-4"
        >
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand flex-shrink-0">
            <AdaIcon :name="m.icon" class="h-5 w-5" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-base font-semibold text-ink leading-snug">{{ m.title }}</h3>
            <p class="text-xs font-medium text-brand mt-0.5">{{ m.tagline }}</p>
            <p class="mt-2 text-sm text-ink-muted leading-relaxed">{{ m.detail }}</p>
          </div>
        </article>
      </div>

      <!-- "Ask Ada" pulled out as a dark quote-block, separate surface -->
      <div class="mt-10 rounded-card bg-chrome text-ink-inverse p-6 sm:p-8 lg:p-10 max-w-3xl">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-3">
          Plus
        </div>
        <h3 class="text-xl sm:text-2xl font-semibold leading-tight mb-2">
          Ask Ada anything.
        </h3>
        <p class="text-sm opacity-80 mb-5 max-w-xl">
          A chat box, right on your dashboard. She knows your business; ask her like she's your office manager.
        </p>
        <div class="space-y-2.5">
          <div class="flex items-start gap-3">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-accent flex-shrink-0 pt-0.5 w-8">You</span>
            <p class="text-sm italic opacity-90">"Did the Whitaker quote get a response?"</p>
          </div>
          <div class="flex items-start gap-3">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-accent flex-shrink-0 pt-0.5 w-8">You</span>
            <p class="text-sm italic opacity-90">"Who haven't I followed up with this week?"</p>
          </div>
          <div class="flex items-start gap-3">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-accent flex-shrink-0 pt-0.5 w-8">You</span>
            <p class="text-sm italic opacity-90">"What came in overnight?"</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Why custom-built ──────────────────────────────────────────── -->
    <section v-reveal class="py-16 sm:py-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-8">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
          Custom-built
        </div>
        <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-3">
          Ada isn't a generic chatbot. She's trained on your business.
        </h2>
        <p class="text-base text-ink-muted max-w-2xl mb-10">
          Most AI-for-trades tools ship a one-size-fits-all chatbot and call it done. Ada gets built around how <em>your</em> business actually runs.
        </p>

        <div class="grid gap-6 sm:grid-cols-3">
          <div>
            <div class="flex items-center gap-3 mb-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-ink-inverse text-sm font-bold">1</span>
              <span class="text-sm font-semibold text-ink">We learn your business</span>
            </div>
            <p class="text-sm text-ink-muted leading-relaxed">
              A discovery call where we map your services, pricing, dispatch rules, busy hours, and how you actually talk to your customers.
            </p>
          </div>
          <div>
            <div class="flex items-center gap-3 mb-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-ink-inverse text-sm font-bold">2</span>
              <span class="text-sm font-semibold text-ink">We train Ada</span>
            </div>
            <p class="text-sm text-ink-muted leading-relaxed">
              We teach Ada what we learned, set up your integrations, customize her follow-ups, and run test calls until she sounds like a real member of your team. Live in 14 days.
            </p>
          </div>
          <div>
            <div class="flex items-center gap-3 mb-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-ink-inverse text-sm font-bold">3</span>
              <span class="text-sm font-semibold text-ink">We tune and grow</span>
            </div>
            <p class="text-sm text-ink-muted leading-relaxed">
              Monthly check-ins to refine what's working. As your business grows, Ada grows with it.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Hire Ada vs. Hire Someone ─────────────────────────────────── -->
    <section v-reveal id="compare" class="mx-auto max-w-5xl px-4 sm:px-8 py-16 sm:py-24">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
        Honest math
      </div>
      <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-3">
        Hire Ada vs. hire another person.
      </h2>
      <p class="text-base text-ink-muted max-w-2xl mb-10">
        What an AI employee actually does, compared to hiring another part-time CSR or office admin.
      </p>

      <div class="rounded-card border border-divider bg-surface-raised overflow-hidden">
        <!-- Header row -->
        <div class="grid grid-cols-3 bg-surface-elevated text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          <div class="px-4 py-3">&nbsp;</div>
          <div class="px-4 py-3 border-l border-divider">Hire a part-time CSR</div>
          <div class="px-4 py-3 border-l border-divider bg-brand/5 text-brand">Hire Ada</div>
        </div>
        <!-- Rows -->
        <div
          v-for="(row, i) in compare"
          :key="i"
          class="grid grid-cols-3 text-sm border-t border-divider"
        >
          <div class="px-4 py-3 font-semibold text-ink">{{ row.dimension }}</div>
          <div class="px-4 py-3 border-l border-divider text-ink-muted">{{ row.hire }}</div>
          <div class="px-4 py-3 border-l border-divider bg-brand/5 text-ink font-medium">{{ row.ada }}</div>
        </div>
      </div>

      <p class="mt-6 text-sm text-ink-muted italic max-w-2xl">
        Ada doesn't replace your existing team. She handles the back-office work nobody has time for, so your team can focus on the jobs that pay the bills.
      </p>
    </section>

    <!-- ── Founder note ──────────────────────────────────────────────── -->
    <section v-reveal class="py-16 sm:py-24">
      <div class="mx-auto max-w-5xl px-4 sm:px-8">
        <div class="grid gap-10 lg:grid-cols-[1fr_220px] lg:gap-16">
          <!-- Letter -->
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
              From the founder
            </div>
            <h2 class="text-3xl sm:text-4xl font-semibold text-ink mb-8 leading-[1.1] tracking-tight">
              Honestly? I built CommandSite because I was tired.
            </h2>
            <div class="space-y-5 text-base text-ink leading-relaxed">
              <p>
                Tired of watching good leads go to voicemail because nobody answered after 5 PM. Tired of estimates sitting in inboxes for two weeks while the customer hired the next guy. Tired of bouncing between five different tools and still feeling like things were slipping through the cracks.
              </p>
              <p>
                I'd been working with local service businesses for over a decade — and the same pattern showed up in every business I touched. Smart owners running real operations, drowning in busywork that the technology should have already solved.
              </p>
              <p>
                So I built Ada. Ada is the office manager I always wished I could hand a service business owner: one AI employee who catches every call, chases every quote, asks every customer for a review, and reactivates the ones who've gone quiet. No bouncing between tabs. No "wait, which tool does that live in?" Just one team member running the back office while you run the business.
              </p>
              <p>
                If that sounds like the version of your business you've been wishing for, let's talk.
              </p>
            </div>
          </div>

          <!-- Founder identity card (right rail at lg+, stacks above on mobile via order on parent) -->
          <aside class="lg:sticky lg:top-24 lg:self-start order-first lg:order-last">
            <!-- Monogram stand-in until josh-headshot.jpg lands. Honest about
                 the absence (brand mark, not a generic person icon). -->
            <div class="h-24 w-24 rounded-full bg-brand/10 flex items-center justify-center mb-4" aria-hidden="true">
              <span class="text-brand text-4xl font-semibold tracking-tight">J</span>
            </div>
            <p class="text-base font-semibold text-ink leading-tight">Josh</p>
            <p class="text-sm text-ink-muted">Founder, CommandSite</p>
            <hr class="my-4 border-divider max-w-[160px]" />
            <ul class="space-y-2 text-xs text-ink-muted leading-relaxed">
              <li>10+ years with service businesses</li>
              <li>Solo founder; built Ada by hand</li>
              <li>Runs every discovery call himself</li>
            </ul>
          </aside>
        </div>
      </div>
    </section>

    <!-- ── FAQ ───────────────────────────────────────────────────────── -->
    <section v-reveal class="mx-auto max-w-3xl px-4 sm:px-8 py-16 sm:py-24">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
        FAQ
      </div>
      <h2 class="text-xl sm:text-2xl font-semibold text-ink mb-8">
        Questions before you book.
      </h2>
      <div class="space-y-3">
        <details
          v-for="(f, i) in faqs"
          :key="i"
          class="group rounded-card border border-divider bg-surface-raised overflow-hidden"
        >
          <summary class="cursor-pointer list-none px-5 py-4 flex items-start gap-3 hover:bg-surface-elevated/40 transition-colors">
            <span class="text-brand font-bold text-lg leading-none flex-shrink-0 group-open:rotate-45 transition-transform duration-[250ms] ease-out-quart">+</span>
            <span class="text-sm font-semibold text-ink leading-snug">{{ f.q }}</span>
          </summary>
          <div class="px-5 pb-4 pl-12 text-sm text-ink-muted leading-relaxed">
            {{ f.a }}
          </div>
        </details>
      </div>
    </section>

    <!-- ── Final CTA ─────────────────────────────────────────────────── -->
    <section v-reveal class="bg-chrome text-ink-inverse py-16 sm:py-24">
      <div class="mx-auto max-w-3xl px-4 sm:px-8 text-center">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-4">
          Get started
        </div>
        <h2 class="text-3xl sm:text-4xl font-semibold mb-4 leading-[1.1] tracking-tight">
          If you've read this far, let's talk.
        </h2>
        <p class="text-base opacity-80 mb-8 max-w-xl mx-auto leading-relaxed">
          The discovery walkthrough is 30 minutes. We talk through how your business actually runs, what's slipping through the cracks, and whether CommandSite's a fit. No pressure — half the conversations end with "let me think about it," and that's totally fine.
        </p>
        <a :href="CTA_URL" class="btn-primary !text-base !py-3 !px-6">
          {{ CTA_LABEL }} →
        </a>
        <p class="mt-6 text-sm opacity-70">
          Or email me directly: <a href="mailto:josh@commandsite.io" class="underline hover:opacity-100">josh@commandsite.io</a>
        </p>
      </div>
    </section>

    <!-- ── Footer ────────────────────────────────────────────────────── -->
    <footer class="border-t border-divider bg-surface py-10 sm:pb-10 pb-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-8 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <BrandLogo surface="light" :height="24" />
        </div>
        <div class="text-xs text-ink-muted">
          Built for service business owners.
          <RouterLink to="/churches" class="underline hover:text-ink ml-1">Also serving churches →</RouterLink>
        </div>
        <div class="text-xs text-ink-disabled">
          © 2026 CommandSite
        </div>
      </div>
    </footer>

    <!-- ── Mobile sticky CTA (after hero scrolls offscreen) ──────────── -->
    <Transition
      enter-active-class="transition-transform duration-200 ease-out"
      enter-from-class="translate-y-full"
      enter-to-class="translate-y-0"
      leave-active-class="transition-transform duration-200 ease-out-quart"
      leave-from-class="translate-y-0"
      leave-to-class="translate-y-full"
    >
      <div
        v-if="showStickyCta"
        class="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-chrome border-t border-chrome-ink/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-raised"
      >
        <a :href="CTA_URL" class="btn-primary w-full justify-center !text-sm">
          {{ CTA_LABEL }} →
        </a>
      </div>
    </Transition>
  </div>
</template>
