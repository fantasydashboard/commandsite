<script setup lang="ts">
/**
 * CommandSite — Landing page (churches).
 *
 * Lives at `/churches`. Audience: small-to-mid church staff +
 * leadership (senior pastors, exec pastors, ops directors, admins).
 * Voice + content sourced from docs/landing-page/commandsite-io-churches-v1.md.
 *
 * Persona: Grace — AI ministry assistant. Lighter persona framing
 * than Ada because pastors are reflexively wary of AI personification
 * in pastoral contexts.
 *
 * TODO before launch: swap CTA_URL to a church-specific Calendly link.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import BrandLogo from '@/components/BrandLogo.vue'
import AssistantMark from '@/components/AssistantMark.vue'

const CTA_URL = 'https://calendly.com/josh-commandsite/30-min-discovery-church-walkthrough'
const CTA_LABEL = 'Book a no-pressure walkthrough'

// Mobile sticky bottom CTA: appears once the hero scrolls offscreen,
// disappears when the user scrolls back up. Pastors reading on a phone
// between Tuesday meetings shouldn't have to scroll back up to act.
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
    headline: 'A first-time family visits Sunday and leaves a connect card.',
    detail: 'By Friday they\'ve heard nothing. By next Sunday, they\'re checking out the bigger church across town that texted them the same afternoon.',
  },
  {
    headline: 'A member hasn\'t been in 8 weeks.',
    detail: 'Nobody noticed. Nobody texted. The drift was preventable — but invisible.',
  },
  {
    headline: 'A prayer request sits in your contact form for five days.',
    detail: 'The person who reached out at 11 PM on Tuesday wonders if anyone is actually there.',
  },
  {
    headline: 'You\'re paying for Planning Center, MailChimp, your texting service, and a separate ChMS.',
    detail: 'Your admin still has to manually move data between all of them while the actual ministry happens.',
  },
]

interface Module { icon: string; title: string; tagline: string; detail: string }
const modules: Module[] = [
  {
    icon: '📞',
    title: 'Grace at the front desk',
    tagline: 'Catches every call, every form, every connect card.',
    detail: 'Trained on your ministries, service times, and team. Routes pastoral emergencies straight to your cell, captures first-time visitor info, handles general questions warmly — 24/7. Sounds like a thoughtful volunteer, not a chatbot.',
  },
  {
    icon: '👋',
    title: 'Grace welcomes every first-timer',
    tagline: 'Within hours, not weeks.',
    detail: 'Drafts a personal text or email in your pastor\'s voice within 2 hours of a Sunday visit. Day 3, 7, 14, 30 — gentle, mission-aligned next-step invitations. Always personal, never spammy.',
  },
  {
    icon: '🌱',
    title: 'Grace captures the stories',
    tagline: 'The testimonies you never have time to gather.',
    detail: 'After a baptism, a small group milestone, or a notable life moment, Grace asks for the story (with permission) and drafts share-ready quotes for Sunday slides, your website, and social.',
  },
  {
    icon: '🔁',
    title: 'Grace notices when someone drifts',
    tagline: 'Before they\'re gone for good.',
    detail: 'Members who haven\'t attended in 60-90 days get a personal "we miss you, can we pray for anything?" outreach. Drafts always go through your pastoral team for review — never fully automated for pastoral care.',
  },
  {
    icon: '📊',
    title: 'Grace\'s weekly report',
    tagline: 'One screen. The numbers your team cares about.',
    detail: 'Weekly attendance trends, first-time visitors, follow-up completion, dormant members reached, prayer requests received, volunteer pipeline. Open Monday morning over coffee.',
  },
]

interface CompareRow { dimension: string; hire: string; grace: string }
const compare: CompareRow[] = [
  { dimension: 'Cost',                  hire: '$25-45K/year + benefits',     grace: 'As low as $199/month' },
  { dimension: 'Hours available',       hire: 'Office hours',                grace: '24/7 — answers calls Sunday morning, Wednesday night, anytime' },
  { dimension: 'Visitor follow-up',     hire: 'When she has time',           grace: 'Every first-timer within 2 hours, every time' },
  { dimension: 'Dormant member alerts', hire: 'Catches the obvious ones',    grace: 'Notices everyone who drifts past 60 days' },
  { dimension: 'Story / testimony collection', hire: 'Rarely happens',       grace: 'Asks after every milestone, drafts share-ready quotes' },
  { dimension: 'Hire-to-productive',    hire: '6-12 weeks (interview + train)', grace: '14 days, fully trained on your church' },
  { dimension: 'Scales with attendance', hire: 'Hire another part-time admin', grace: 'Same flat monthly fee' },
]

interface Faq { q: string; a: string }
const faqs: Faq[] = [
  {
    q: 'Won\'t the AI make our church feel impersonal?',
    a: 'The opposite, actually. Grace handles the systems work that\'s currently not happening — the first-time visitor texts that nobody has time to send, the dormant-member check-ins that fall through the cracks, the prayer requests that sit in voicemail. Your pastoral team stays in the relationships. Grace just makes sure no one falls through the cracks before someone reaches out.',
  },
  {
    q: 'We already use Planning Center / ChurchTeams / Breeze. Does this replace it?',
    a: 'No. CommandSite plugs into your existing ChMS. Grace is the missing layer between your visitors and your tools — the part that catches the connection, drafts the follow-up, and notifies the right person on your team. Your existing system stays.',
  },
  {
    q: 'What about pastoral confidentiality? Where does our data live?',
    a: 'Your data lives in a dedicated, isolated environment — not shared with other churches. Pastoral notes, prayer requests, and member data are encrypted at rest and in transit. We never share or sell anything. We follow the same security standards as any reputable church management platform. You own everything.',
  },
  {
    q: 'We\'re a small church. Is this overkill for us?',
    a: 'Our Small Church tier is built for exactly that range — under 250 attenders, one staff admin, can\'t justify hiring a full-time church administrator but can\'t keep losing first-time families either. If that\'s you, this is for you.',
  },
  {
    q: 'How long does setup actually take?',
    a: '14 days from kickoff to live. We do the heavy lifting — your team\'s only "homework" is a discovery call, an intro to your existing tools, and a final review before we go live. Most pastors are surprised at how little of their time it takes.',
  },
  {
    q: 'Our elder board / finance committee will need to review this. Is there a way to share?',
    a: 'Yes — after the discovery walkthrough, we\'ll send you a one-page summary you can share with your leadership team or finance committee. Annual pricing is available for churches who prefer to budget once a year.',
  },
  {
    q: 'Why is she called Grace?',
    a: 'Because grace — unearned help, quiet support — is exactly what we want her to embody for your church. Not a flashy tool. Not a replacement for ministry. Just a quiet, faithful presence that handles the systems work so your team can do the people work.',
  },
  {
    q: 'Does Grace identify herself as AI when she answers calls?',
    a: 'Yes — Grace always introduces herself as your AI assistant on the first interaction. We think transparency is the right move pastorally and it\'s becoming legally required in some states. Most callers are pleasantly surprised at how naturally she handles the conversation once they know.',
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
            to="/"
            class="text-sm font-medium text-ink-inverse/80 hover:text-ink-inverse transition-colors hidden sm:inline"
          >For service businesses</RouterLink>
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
    <section ref="heroRef" class="mx-auto max-w-6xl px-4 sm:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div class="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-12 items-center">
        <div>
          <AssistantMark class="h-16 w-16 mb-6 text-brand" />
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
            For small-to-mid churches
          </div>
          <h1 class="text-4xl font-semibold tracking-tight text-ink sm:text-6xl leading-[1.05]">
            Meet Grace —<br />
            your AI ministry assistant.
          </h1>
          <p class="mt-6 max-w-2xl text-lg text-ink-muted leading-relaxed">
            <strong class="text-ink font-semibold">CommandSite</strong> builds Grace custom for your church — trained on your ministries, your services, your team's voice. She welcomes first-time visitors, drafts gentle pastoral check-ins, and notices when someone drifts past 60 days. Your team stays in the relationships; Grace handles the systems work.
          </p>
          <p class="mt-2 text-sm text-ink-muted italic">
            (Named "Grace" because grace is what every church needs more of, quietly.)
          </p>
          <div class="mt-10 flex flex-wrap gap-3">
            <a :href="CTA_URL" class="btn-primary">
              {{ CTA_LABEL }} →
            </a>
            <a href="#how-it-works" class="btn-secondary">
              See how it works
            </a>
          </div>
          <div class="mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span class="font-semibold text-ink">From $249/mo</span>
            <span class="text-ink-disabled" aria-hidden="true">·</span>
            <span class="text-ink-muted">cancel anytime after month 1</span>
          </div>
        </div>

        <!-- "Grace at work today" — floating activity cards -->
        <div class="hidden lg:block">
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted mb-4 pl-2">
            Grace · today
          </div>
          <div class="space-y-4">
            <!-- Card 1: First-time family welcomed -->
            <div class="rounded-card bg-surface-raised p-4 shadow-raised border border-divider">
              <div class="flex items-center gap-2 mb-2">
                <span class="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand text-sm">👋</span>
                <p class="text-sm font-semibold text-ink">Welcomed a first-time family</p>
                <span class="ml-auto text-[10px] text-ink-disabled">Sun 1:14 PM</span>
              </div>
              <p class="text-xs text-ink-muted leading-relaxed">
                The Maddux family — <span class="italic">"Loved the kids program."</span>
              </p>
              <div class="mt-2.5 flex items-center gap-1.5 text-xs">
                <span class="text-success font-bold">✓</span>
                <span class="text-ink font-medium">Welcome text sent · opened in 11 min</span>
              </div>
            </div>

            <!-- Card 2: Pastoral check-in drafted -->
            <div class="rounded-card bg-surface-raised p-4 shadow-raised border border-divider translate-x-6">
              <div class="flex items-center gap-2 mb-2">
                <span class="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand text-sm">🕊️</span>
                <p class="text-sm font-semibold text-ink">Drafted a pastoral check-in</p>
                <span class="ml-auto text-[10px] text-ink-disabled">Tue 9:02 AM</span>
              </div>
              <p class="text-xs text-ink-muted leading-relaxed">
                The Whitakers — quiet 4 weeks · ready for Pastor Mark's eyes
              </p>
              <div class="mt-2.5 flex items-center gap-1.5 text-xs">
                <span class="text-success font-bold">✓</span>
                <span class="text-ink font-medium">Queued for review</span>
              </div>
            </div>

            <!-- Card 3: Story captured -->
            <div class="rounded-card bg-surface-raised p-4 shadow-raised border border-divider translate-x-2">
              <div class="flex items-center gap-2 mb-2">
                <span class="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand text-sm">🌱</span>
                <p class="text-sm font-semibold text-ink">Captured a baptism story</p>
                <span class="ml-auto text-[10px] text-ink-disabled">Wed 4:31 PM</span>
              </div>
              <p class="text-xs text-ink-muted leading-relaxed">
                Riley B. · drafted a share-ready quote for Sunday slides
              </p>
              <div class="mt-2.5 flex items-center gap-1.5 text-xs">
                <span class="text-success font-bold">✓</span>
                <span class="text-ink font-medium">Permission confirmed · ready to use</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Live demo CTA — "see Grace in action first" ──────────────── -->
    <section class="border-y border-divider py-12">
      <div class="mx-auto max-w-5xl px-4 sm:px-8">
        <div class="relative overflow-hidden rounded-card border border-brand/30 bg-surface-raised p-6 sm:p-8 flex flex-col lg:flex-row items-start gap-6">
          <div class="absolute top-0 left-0 right-0 h-[3px] bg-brand" aria-hidden="true"></div>
          <div class="flex-1 min-w-0">
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-2">
              Take a look inside
            </div>
            <h2 class="text-xl sm:text-2xl font-semibold text-ink leading-snug mb-3">
              Want to see Grace in action first? <span class="text-ink-muted font-normal">No call required.</span>
            </h2>
            <p class="text-sm text-ink-muted leading-relaxed mb-4 max-w-lg">
              Walk through the same dashboard a real church staff would use — populated with sample data for "Cornerstone Community Church." Click every tab. Try the chat — Grace answers like she would for your church.
            </p>
            <ul class="space-y-1.5 text-sm text-ink mb-5">
              <li class="flex items-start gap-2">
                <span class="text-brand font-bold">→</span>
                <span>See how Grace welcomes first-time visitors + drafts pastoral check-ins</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-brand font-bold">→</span>
                <span>Click the floating "Ask Grace" button on any page to chat with her</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-brand font-bold">→</span>
                <span>Drill into all 10 of her roles from the Today page</span>
              </li>
            </ul>
            <div class="flex flex-wrap items-center gap-3">
              <RouterLink to="/dashboard/cornerstone-church" class="btn-primary !text-sm">
                Tour the demo →
              </RouterLink>
              <p class="text-[11px] text-ink-disabled italic">All people, prayer requests, and giving figures are fictional.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Pain ──────────────────────────────────────────────────────── -->
    <section class="py-16 sm:py-20">
      <div class="mx-auto max-w-5xl px-4 sm:px-8">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
          Recognize this
        </div>
        <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-10 max-w-3xl">
          If this happens at your church, keep reading.
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
          If your one staff admin or volunteer is already drowning, this is for them.
        </p>
      </div>
    </section>

    <!-- ── What Grace does ───────────────────────────────────────────── -->
    <section id="how-it-works" class="mx-auto max-w-6xl px-4 sm:px-8 py-16 sm:py-24">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
        What Grace handles
      </div>
      <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-3">
        Five things Grace handles for your team.
      </h2>
      <p class="text-base text-ink-muted max-w-2xl mb-10">
        Grace handles the systems work. Your pastors and team focus on the people work.
      </p>

      <!-- Lead module: hero card with a real-feeling first-time-visitor inquiry -->
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
        <!-- Real-feeling first-time-visitor inquiry on the right -->
        <div class="w-full lg:flex-1 rounded-xl bg-surface-elevated p-4 sm:p-5 border border-divider">
          <div class="flex items-center gap-2 mb-3 pb-3 border-b border-divider">
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand text-[11px]" aria-hidden="true">👋</span>
            <span class="text-xs text-ink font-semibold">Connect card · Sun 12:08 PM</span>
            <span class="ml-auto text-[11px] text-ink-disabled">first-time</span>
          </div>
          <div class="space-y-2.5 text-xs leading-relaxed">
            <p><span class="font-semibold text-ink-muted uppercase tracking-wider text-[10px]">Visitor</span><br /><span class="text-ink-data">"The Maddux family. Visited today with our 6-year-old. She loved the kids program. Would love to know more."</span></p>
            <p><span class="font-semibold text-brand uppercase tracking-wider text-[10px]">Grace · drafted for Pastor Mark</span><br /><span class="text-ink-data">"Hi Maddux family — so glad you visited Cornerstone today, and even more glad your daughter had fun in the kids program. If you'd like, I can introduce you to Sarah who runs that ministry — she'd love to answer any questions. Either way, no pressure: hope to see you again Sunday."</span></p>
          </div>
          <div class="mt-3 pt-3 border-t border-divider flex items-center gap-1.5 text-[11px]">
            <span class="text-success font-bold" aria-hidden="true">✓</span>
            <span class="text-ink font-medium">Queued for Pastor Mark · sends after his review · target window: Sun 6 PM</span>
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
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand text-lg flex-shrink-0" aria-hidden="true">{{ m.icon }}</div>
          <div class="flex-1 min-w-0">
            <h3 class="text-base font-semibold text-ink leading-snug">{{ m.title }}</h3>
            <p class="text-xs font-medium text-brand mt-0.5">{{ m.tagline }}</p>
            <p class="mt-2 text-sm text-ink-muted leading-relaxed">{{ m.detail }}</p>
          </div>
        </article>
      </div>

      <!-- "Ask Grace" pulled out as a dark quote-block, separate surface -->
      <div class="mt-10 rounded-card bg-chrome text-ink-inverse p-6 sm:p-8 lg:p-10 max-w-3xl">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-3">
          Plus
        </div>
        <h3 class="text-xl sm:text-2xl font-semibold leading-tight mb-2">
          Ask Grace anything.
        </h3>
        <p class="text-sm opacity-80 mb-5 max-w-xl">
          A chat box, right on your dashboard. She knows your congregation; ask her like she's the church admin who has every detail at her fingertips.
        </p>
        <div class="space-y-2.5">
          <div class="flex items-start gap-3">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-accent flex-shrink-0 pt-0.5 w-8">You</span>
            <p class="text-sm italic opacity-90">"Did the Hendricks family visit last week?"</p>
          </div>
          <div class="flex items-start gap-3">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-accent flex-shrink-0 pt-0.5 w-8">You</span>
            <p class="text-sm italic opacity-90">"Who haven't I checked in with this month?"</p>
          </div>
          <div class="flex items-start gap-3">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-accent flex-shrink-0 pt-0.5 w-8">You</span>
            <p class="text-sm italic opacity-90">"What came in over the weekend?"</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── On the AI feels impersonal question ───────────────────────── -->
    <section class="py-16 sm:py-20">
      <div class="mx-auto max-w-3xl px-4 sm:px-8">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
          On the AI question
        </div>
        <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-4">
          Some pastors hear "AI" and stop listening. We get it.
        </h2>
        <p class="text-base text-ink-muted leading-relaxed mb-6">
          Grace isn't a chatbot pretending to be human. She's a ministry assistant who handles the parts of church admin that are already broken or missed entirely.
        </p>
        <ul class="space-y-4 text-sm text-ink leading-relaxed">
          <li class="flex items-start gap-3">
            <span class="text-brand font-bold flex-shrink-0">•</span>
            <span><strong>For pastoral care, Grace never replaces a human.</strong> She drafts, she queues, she routes — but a real person on your team reads, edits, and sends. Your team stays in the relationship.</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="text-brand font-bold flex-shrink-0">•</span>
            <span><strong>For systems work — first-time visitor texts, dormant-member check-ins, story collection — Grace just handles it.</strong> These are the touches that already aren't happening because nobody has time. The choice isn't "AI does it vs. a human does it." It's "Grace does it vs. nobody does it."</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="text-brand font-bold flex-shrink-0">•</span>
            <span><strong>You set the line.</strong> Some churches want every outbound message reviewed. Others want only the pastoral ones reviewed. Grace works around your team's comfort level.</span>
          </li>
        </ul>
        <p class="mt-6 text-base text-ink-muted leading-relaxed">
          The result: more first-time families followed up with. More dormant members reached. More stories captured. Your pastor gets their evenings back.
        </p>
      </div>
    </section>

    <!-- ── Hire Grace vs. Hire Another Admin ─────────────────────────── -->
    <section id="compare" class="mx-auto max-w-5xl px-4 sm:px-8 py-16 sm:py-24">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
        Honest math
      </div>
      <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-3">
        Hire Grace vs. hire another church admin.
      </h2>
      <p class="text-base text-ink-muted max-w-2xl mb-10">
        Most small-to-mid churches can't afford a full-time church administrator — and even when they can, the admin's bandwidth is finite. Here's the honest comparison.
      </p>

      <div class="rounded-card border border-divider bg-surface-raised overflow-hidden">
        <!-- Header row -->
        <div class="grid grid-cols-3 bg-surface-elevated text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          <div class="px-4 py-3">&nbsp;</div>
          <div class="px-4 py-3 border-l border-divider">Hire a part-time admin</div>
          <div class="px-4 py-3 border-l border-divider bg-brand/5 text-brand">Hire Grace</div>
        </div>
        <!-- Rows -->
        <div
          v-for="(row, i) in compare"
          :key="i"
          class="grid grid-cols-3 text-sm border-t border-divider"
        >
          <div class="px-4 py-3 font-semibold text-ink">{{ row.dimension }}</div>
          <div class="px-4 py-3 border-l border-divider text-ink-muted">{{ row.hire }}</div>
          <div class="px-4 py-3 border-l border-divider bg-brand/5 text-ink font-medium">{{ row.grace }}</div>
        </div>
      </div>

      <p class="mt-6 text-sm text-ink-muted italic max-w-2xl">
        Grace doesn't replace your team or your volunteers. She handles the systems work that's not happening because no one has time, so your staff can focus on the people in front of them.
      </p>
    </section>

    <!-- ── Pricing ───────────────────────────────────────────────────── -->
    <section id="pricing" class="py-16 sm:py-24">
      <div class="mx-auto max-w-6xl px-4 sm:px-8">
        <div class="text-center mb-12">
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
            Pricing
          </div>
          <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-4">
            Three tiers. Cancel anytime after month 1.
          </h2>
          <p class="text-base text-ink-muted leading-relaxed max-w-xl mx-auto">
            Each includes a one-time custom build, scoped on the discovery call. Annual pricing available for churches who budget once a year.
          </p>
        </div>

        <div class="grid gap-4 lg:grid-cols-3 lg:gap-6">
          <!-- Small -->
          <div class="rounded-card bg-surface-raised border border-divider p-6 sm:p-7 flex flex-col">
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted mb-3">
              Small
            </div>
            <div class="flex items-baseline gap-1 mb-1">
              <span class="text-4xl font-bold text-ink leading-none tracking-tight">$249</span>
              <span class="text-sm text-ink-muted">/mo</span>
            </div>
            <p class="text-xs text-ink-muted mb-5">+ one-time build, scoped on call</p>
            <p class="text-sm text-ink leading-relaxed">
              Under 200 attendance, one staff admin, can't justify a full-time church administrator. Wants Grace to handle the visitor follow-ups and dormant-member check-ins falling through the cracks.
            </p>
          </div>

          <!-- Plus (highlighted) -->
          <div class="relative rounded-card bg-surface-raised border-2 border-brand p-6 sm:p-7 flex flex-col shadow-raised lg:-mt-2">
            <div class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand text-ink-inverse px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] whitespace-nowrap">
              Most common
            </div>
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-3">
              Plus
            </div>
            <div class="flex items-baseline gap-1 mb-1">
              <span class="text-4xl font-bold text-ink leading-none tracking-tight">$499</span>
              <span class="text-sm text-ink-muted">/mo</span>
            </div>
            <p class="text-xs text-ink-muted mb-5">+ one-time build, scoped on call</p>
            <p class="text-sm text-ink leading-relaxed">
              200-750 attendance, established hospitality team, growing first-time visitor flow. Wants Grace to extend the team's reach without adding another staff role.
            </p>
          </div>

          <!-- Premium -->
          <div class="rounded-card bg-surface-raised border border-divider p-6 sm:p-7 flex flex-col">
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted mb-3">
              Premium
            </div>
            <div class="flex items-baseline gap-1 mb-1">
              <span class="text-4xl font-bold text-ink leading-none tracking-tight">$799</span>
              <span class="text-sm text-ink-muted">/mo</span>
            </div>
            <p class="text-xs text-ink-muted mb-5">+ one-time build, scoped on call</p>
            <p class="text-sm text-ink leading-relaxed">
              750-1,500+ attendance, multi-staff team, may run multiple campuses. Wants Grace to coordinate across ministries with custom workflows and direct access to the founder.
            </p>
          </div>
        </div>

        <div class="mt-12 text-center">
          <a :href="CTA_URL" class="btn-primary !text-base !py-3 !px-6">
            Get your exact quote in a 30-min walkthrough →
          </a>
          <p class="mt-4 text-xs text-ink-disabled italic">
            We can also send a one-page summary you can share with your elder board or finance committee.
          </p>
        </div>
      </div>
    </section>

    <!-- ── Founder note ──────────────────────────────────────────────── -->
    <section class="py-16 sm:py-24">
      <div class="mx-auto max-w-5xl px-4 sm:px-8">
        <div class="grid gap-10 lg:grid-cols-[1fr_220px] lg:gap-16">
          <!-- Letter -->
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
              From the founder
            </div>
            <h2 class="text-3xl sm:text-4xl font-semibold text-ink mb-8 leading-[1.1] tracking-tight">
              A note from the founder.
            </h2>
            <div class="space-y-5 text-base text-ink leading-relaxed">
              <p>Honestly? I built CommandSite because I watched it happen too many times.</p>
              <p>
                A first-time family visits a small church on a Sunday. They love it. They leave their info on the connect card. By Friday, they've heard nothing. By next Sunday, they're at the bigger church down the road that texted them the same afternoon.
              </p>
              <p>
                I write kids' ministry curriculum every week and I've sat with dozens of pastors and admins over the years. Every one of them cares deeply about the people who walk through the door. None of them have time to do what their hearts know needs to happen — because they're already drowning in the rest of the work.
              </p>
              <p>
                So I built Grace. Grace is the ministry assistant I wished every small-to-mid church already had: she catches every visitor inquiry, drafts the gentle pastoral follow-ups, captures the stories you never have time to gather, and notices when a member's been gone a few weeks before they're gone for good. She's not here to replace your team. She's here to free your team for the conversations that actually matter.
              </p>
              <p>
                If that sounds like the version of your church you've been wishing for, let's talk.
              </p>
            </div>
          </div>

          <!-- Founder identity card (right rail at lg+, stacks above on mobile) -->
          <aside class="lg:sticky lg:top-24 lg:self-start order-first lg:order-last">
            <!-- TODO: replace placeholder with josh-headshot.jpg when available. Keep the rounded-full + h-24 w-24 sizing. -->
            <div class="h-24 w-24 rounded-full bg-surface-elevated border border-divider flex items-center justify-center mb-4 overflow-hidden">
              <svg viewBox="0 0 24 24" class="h-12 w-12 text-ink-disabled" fill="currentColor" aria-hidden="true">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <p class="text-base font-semibold text-ink leading-tight">Josh</p>
            <p class="text-sm text-ink-muted">Founder, CommandSite</p>
            <hr class="my-4 border-divider max-w-[160px]" />
            <ul class="space-y-2 text-xs text-ink-muted leading-relaxed">
              <li>Kids' ministry curriculum writer · weekly</li>
              <li>Sat with dozens of pastors over a decade</li>
              <li>Runs every discovery call himself</li>
            </ul>
          </aside>
        </div>
      </div>
    </section>

    <!-- ── FAQ ───────────────────────────────────────────────────────── -->
    <section class="mx-auto max-w-3xl px-4 sm:px-8 py-16 sm:py-24">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
        FAQ
      </div>
      <h2 class="text-xl sm:text-2xl font-semibold text-ink mb-8">
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
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-4">
          Get started
        </div>
        <h2 class="text-3xl sm:text-4xl font-semibold mb-4 leading-[1.1] tracking-tight">
          If you've read this far, let's talk.
        </h2>
        <p class="text-base opacity-80 mb-8 max-w-xl mx-auto leading-relaxed">
          The walkthrough is 30 minutes. We talk through how your church actually does ministry, what's slipping through the cracks, and whether CommandSite's a fit. No pressure — half of these conversations end with "let me think about it" or "let me bring this to my leadership," and that's totally fine.
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
          Built for small-to-mid churches.
          <RouterLink to="/" class="underline hover:text-ink ml-1">Also serving service businesses →</RouterLink>
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
      leave-active-class="transition-transform duration-150 ease-in"
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
