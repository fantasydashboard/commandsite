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
import { RouterLink } from 'vue-router'
import BrandLogo from '@/components/BrandLogo.vue'

const CTA_URL = 'https://calendly.com/josh-commandsite/30-min-discovery-services-walkthrough'
const CTA_LABEL = 'Book a discovery walkthrough'

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
    icon: '📞',
    title: 'Ada at the front desk',
    tagline: 'Catches every call. Books every job.',
    detail: 'Trained on your services, pricing, hours, and dispatch rules. Answers in your business\'s voice, books straight to your calendar, escalates emergencies to your cell — 24/7. Sounds like a thoughtful office manager, not a chatbot.',
  },
  {
    icon: '📋',
    title: 'Ada chases your quotes',
    tagline: 'No more estimates collecting dust.',
    detail: 'Every quote you send gets a 7-day SMS follow-up sequence in your voice. Ada answers basic questions, schedules walk-throughs, and only pings you when a serious lead needs a human.',
  },
  {
    icon: '⭐',
    title: 'Ada asks for the review',
    tagline: 'At the moment customers are happiest.',
    detail: 'Ada texts customers 2 hours after job completion — the highest-converting window. She drafts your responses to anything 3 stars or below before they go live, so a bad review never sits unanswered.',
  },
  {
    icon: '🔁',
    title: 'Ada wakes up old customers',
    tagline: 'The leads you forgot about? She didn\'t.',
    detail: 'Ada pulls dormant leads and past customers from your CRM, segments by job type and time silent, and runs personalized re-engagement campaigns. Most owners book 4-8 jobs in the first 30 days from leads they\'d written off.',
  },
  {
    icon: '📊',
    title: 'Ada\'s daily report',
    tagline: 'One screen. Everything that matters.',
    detail: 'Calls handled, quotes sent, reviews earned, jobs booked. No bouncing between tabs. No "wait, which tool does that live in?" Open it in the morning, see what Ada handled overnight, and get back on the truck.',
  },
]

interface CompareRow { dimension: string; hire: string; ada: string }
const compare: CompareRow[] = [
  { dimension: 'Cost',                hire: '$30-50K/year + benefits', ada: 'As low as $499/month' },
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
    a: 'Cancel anytime after month 1. The first-month investment covers Ada\'s custom build — after that, it\'s straight monthly. If she isn\'t earning her keep, you\'re not locked in.',
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
    <section class="mx-auto max-w-6xl px-4 sm:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div class="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-12 items-center">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
            For service businesses
          </div>
          <h1 class="text-4xl font-semibold tracking-tight text-ink sm:text-6xl leading-[1.05]">
            Meet Ada —<br />
            your AI employee.
          </h1>
          <p class="mt-6 max-w-2xl text-lg text-ink-muted leading-relaxed">
            <strong class="text-ink font-semibold">CommandSite</strong> builds Ada custom for your service business — trained on your services, your pricing, the way you actually run jobs. She catches every call, chases every quote, asks every customer for a review — while you're on the truck.
          </p>
          <p class="mt-2 text-sm text-ink-disabled italic">
            (Yes, named after Ada Lovelace — the first programmer.)
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

        <!-- "Ada at work today" — floating activity cards -->
        <div class="hidden lg:block">
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted mb-4 pl-2">
            ✨ Ada · today
          </div>
          <div class="space-y-4">
            <!-- Card 1: Call caught -->
            <div class="rounded-card bg-surface-raised p-4 shadow-raised border border-divider">
              <div class="flex items-center gap-2 mb-2">
                <span class="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand text-sm">📞</span>
                <p class="text-sm font-semibold text-ink">Caught a call</p>
                <span class="ml-auto text-[10px] text-ink-disabled">9:42 AM</span>
              </div>
              <p class="text-xs text-ink-muted leading-relaxed">
                Sarah M. — <span class="italic">"AC stopped working overnight"</span>
              </p>
              <div class="mt-2.5 flex items-center gap-1.5 text-xs">
                <span class="text-success font-bold">✓</span>
                <span class="text-ink font-medium">Booked emergency · Tue 10 AM</span>
              </div>
            </div>

            <!-- Card 2: Quote chased -->
            <div class="rounded-card bg-surface-raised p-4 shadow-raised border border-divider translate-x-6">
              <div class="flex items-center gap-2 mb-2">
                <span class="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand text-sm">✉️</span>
                <p class="text-sm font-semibold text-ink">Chased a quote</p>
                <span class="ml-auto text-[10px] text-ink-disabled">11:18 AM</span>
              </div>
              <p class="text-xs text-ink-muted leading-relaxed">
                Reynolds family — $4,500 install · 14 days silent
              </p>
              <div class="mt-2.5 flex items-center gap-1.5 text-xs">
                <span class="text-success font-bold">✓</span>
                <span class="text-ink font-medium">Reply received · ready to schedule</span>
              </div>
            </div>

            <!-- Card 3: Review asked -->
            <div class="rounded-card bg-surface-raised p-4 shadow-raised border border-divider translate-x-2">
              <div class="flex items-center gap-2 mb-2">
                <span class="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand text-sm">⭐</span>
                <p class="text-sm font-semibold text-ink">Asked for a review</p>
                <span class="ml-auto text-[10px] text-ink-disabled">2:30 PM</span>
              </div>
              <p class="text-xs text-ink-muted leading-relaxed">
                Johnson household · job completed yesterday
              </p>
              <div class="mt-2.5 flex items-center gap-1.5 text-xs">
                <span class="text-success font-bold">✓</span>
                <span class="text-ink font-medium">5★ posted to Google</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Live demo CTA — "see Ada in action first" ────────────────── -->
    <section class="bg-canvas border-y border-divider py-12">
      <div class="mx-auto max-w-5xl px-4 sm:px-8">
        <div class="rounded-card border border-brand/30 bg-gradient-to-br from-brand/5 to-surface-raised p-6 sm:p-8 flex flex-col lg:flex-row items-start gap-6">
          <div class="flex-1 min-w-0">
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-2">
              ✨ Take a look inside
            </div>
            <h2 class="text-xl sm:text-2xl font-semibold text-ink leading-snug mb-3">
              Want to see Ada in action first? <span class="text-ink-muted font-normal">No call required.</span>
            </h2>
            <p class="text-sm text-ink-muted leading-relaxed mb-4 max-w-lg">
              Walk through the same dashboard a real HVAC shop would use. Click every tab. Try the chat — Ada knows the demo data and answers like she would for your business.
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
                <span>Drill into all 10 of her roles from the Today page</span>
              </li>
            </ul>
            <div class="flex flex-wrap items-center gap-3">
              <RouterLink to="/dashboard/apex-heating-and-air" class="btn-primary !text-sm">
                Tour the demo →
              </RouterLink>
              <p class="text-[11px] text-ink-disabled italic">Demo data is for "Apex Heating &amp; Air" — fictional, fully click-through.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Pain ──────────────────────────────────────────────────────── -->
    <section class="bg-canvas py-16 sm:py-20">
      <div class="mx-auto max-w-5xl px-4 sm:px-8">
        <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-10 max-w-3xl">
          If this sounds like your business, keep reading.
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
    <section id="how-it-works" class="mx-auto max-w-6xl px-4 sm:px-8 py-16 sm:py-24">
      <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-3">
        Five things Ada handles for you.
      </h2>
      <p class="text-base text-ink-muted max-w-2xl mb-10">
        Trained on your business specifically — not a generic chatbot bolted onto a template.
      </p>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="(m, i) in modules"
          :key="i"
          class="card flex flex-col"
        >
          <div class="text-3xl mb-3" aria-hidden="true">{{ m.icon }}</div>
          <h3 class="text-lg font-semibold text-ink">{{ m.title }}</h3>
          <p class="text-sm font-medium text-brand mt-1">{{ m.tagline }}</p>
          <p class="mt-3 text-sm text-ink-muted leading-relaxed flex-1">{{ m.detail }}</p>
        </article>

        <!-- Ask Ada chat callout -->
        <article class="card flex flex-col bg-brand text-ink-inverse border-brand">
          <div class="text-3xl mb-3" aria-hidden="true">💬</div>
          <h3 class="text-lg font-semibold">Plus — Ask Ada anything</h3>
          <p class="text-sm font-medium opacity-90 mt-1">A chat box, right on your dashboard.</p>
          <p class="mt-3 text-sm leading-relaxed opacity-90 flex-1">
            <em>"Ada, did the Whitaker quote get a response?"</em><br />
            <em>"Ada, who haven't I followed up with this week?"</em><br />
            <em>"Ada, what came in overnight?"</em><br /><br />
            She knows your business — ask her like she's your office manager.
          </p>
        </article>
      </div>
    </section>

    <!-- ── Why custom-built ──────────────────────────────────────────── -->
    <section class="bg-canvas py-16 sm:py-24">
      <div class="mx-auto max-w-5xl px-4 sm:px-8">
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
    <section id="compare" class="mx-auto max-w-5xl px-4 sm:px-8 py-16 sm:py-24">
      <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-3">
        Hire Ada vs. hire another person.
      </h2>
      <p class="text-base text-ink-muted max-w-2xl mb-10">
        The honest math on what an AI employee actually does for your business — compared to bringing on another part-time CSR or office admin.
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

    <!-- ── Pricing (gated) ───────────────────────────────────────────── -->
    <section id="pricing" class="bg-canvas py-16 sm:py-24">
      <div class="mx-auto max-w-3xl px-4 sm:px-8 text-center">
        <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-4">
          Simple pricing. Custom build. Cancel anytime after month 1.
        </h2>
        <p class="text-base text-ink-muted leading-relaxed mb-3">
          Pricing's built around your business — your call volume, your services, your setup needs. Every shop is different, so we quote you on your discovery call instead of a one-size-fits-all sticker.
        </p>
        <p class="text-base text-ink leading-relaxed mb-8">
          For most service businesses, that's <strong>between $499 and $1,499/month</strong> after a one-time first-month build. Way less than another hire. No long-term contract.
        </p>
        <a :href="CTA_URL" class="btn-primary !text-base !py-3 !px-6">
          Get your exact pricing in a 30-min walkthrough →
        </a>
        <p class="mt-4 text-xs text-ink-disabled italic">
          Half the conversations end with "let me think about it" — no pressure, no hard sell.
        </p>
      </div>
    </section>

    <!-- ── Founder note ──────────────────────────────────────────────── -->
    <section class="bg-canvas py-16 sm:py-24">
      <div class="mx-auto max-w-3xl px-4 sm:px-8">
        <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-8">
          A note from the founder.
        </h2>
        <div class="space-y-5 text-base text-ink leading-relaxed">
          <p>Honestly? I built CommandSite because I was tired.</p>
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
          <p class="font-semibold text-ink pt-2">— Josh<br /><span class="text-sm text-ink-muted font-normal">Founder, CommandSite</span></p>
        </div>
      </div>
    </section>

    <!-- ── FAQ ───────────────────────────────────────────────────────── -->
    <section class="mx-auto max-w-3xl px-4 sm:px-8 py-16 sm:py-24">
      <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-8">
        Common questions
      </h2>
      <div class="space-y-3">
        <details
          v-for="(f, i) in faqs"
          :key="i"
          class="group rounded-card border border-divider bg-surface-raised overflow-hidden"
        >
          <summary class="cursor-pointer list-none px-5 py-4 flex items-start gap-3 hover:bg-surface-elevated/40 transition-colors">
            <span class="text-brand font-bold text-lg leading-none flex-shrink-0 group-open:rotate-45 transition-transform">+</span>
            <span class="text-sm font-semibold text-ink leading-snug">{{ f.q }}</span>
          </summary>
          <div class="px-5 pb-4 pl-12 text-sm text-ink-muted leading-relaxed">
            {{ f.a }}
          </div>
        </details>
      </div>
    </section>

    <!-- ── Final CTA ─────────────────────────────────────────────────── -->
    <section class="bg-chrome text-ink-inverse py-16 sm:py-24">
      <div class="mx-auto max-w-3xl px-4 sm:px-8 text-center">
        <h2 class="text-2xl sm:text-3xl font-semibold mb-4">
          Ready to see what Ada would look like for your business?
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
    <footer class="border-t border-divider bg-surface py-10">
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
  </div>
</template>
