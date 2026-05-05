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
import { RouterLink } from 'vue-router'
import BrandLogo from '@/components/BrandLogo.vue'

const CTA_URL = 'mailto:josh@commandsite.io?subject=CommandSite%20for%20our%20church'
const CTA_LABEL = 'Book a no-pressure walkthrough'

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

interface Tier {
  name: string
  size: string
  firstMonth: number
  monthly: number
  annual: number
  blurb: string
  features: string[]
  highlight: boolean
}
const tiers: Tier[] = [
  {
    name: 'Small Church',
    size: 'Under 250 attenders',
    firstMonth: 1999,
    monthly: 199,
    annual: 1990,
    blurb: 'For churches getting Grace started.',
    features: [
      'Grace at the front desk',
      'Grace welcomes every first-timer',
      'Grace\'s weekly report',
      'Ask-Grace chat',
      'Email + SMS support',
      'Live in 14 days',
    ],
    highlight: false,
  },
  {
    name: 'Mid Church',
    size: '250-1,000 attenders',
    firstMonth: 2999,
    monthly: 399,
    annual: 3990,
    blurb: 'Everything Grace can do for your team.',
    features: [
      'Everything in Small',
      'Grace captures the stories',
      'Grace notices when someone drifts',
      'Grace trained in your pastor\'s specific voice',
      'Priority support',
    ],
    highlight: true,
  },
  {
    name: 'Large Church',
    size: '1,000+ attenders',
    firstMonth: 4999,
    monthly: 799,
    annual: 7990,
    blurb: 'For multi-campus and large operations.',
    features: [
      'Everything in Mid',
      'Multi-campus support',
      'Custom integrations',
      'Quarterly strategy call with Josh',
      'Dedicated account contact',
    ],
    highlight: false,
  },
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

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString()
}
</script>

<template>
  <div class="min-h-screen bg-surface text-ink antialiased">
    <!-- ── Header ────────────────────────────────────────────────────── -->
    <header class="sticky top-0 z-30 border-b border-divider bg-surface-dark/95 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
        <RouterLink to="/" class="flex items-center" aria-label="CommandSite home">
          <BrandLogo surface="dark" :height="32" />
        </RouterLink>
        <nav class="flex items-center gap-3 sm:gap-5">
          <RouterLink
            to="/"
            class="text-sm text-ink-inverse/70 hover:text-ink-inverse transition-colors hidden sm:inline"
          >For service businesses</RouterLink>
          <RouterLink
            to="/login"
            class="text-sm text-ink-inverse/70 hover:text-ink-inverse transition-colors"
          >Sign in</RouterLink>
          <a :href="CTA_URL" class="btn-primary !py-2 !px-4 !text-xs sm:!text-sm">
            {{ CTA_LABEL }}
          </a>
        </nav>
      </div>
    </header>

    <!-- ── Hero ──────────────────────────────────────────────────────── -->
    <section class="mx-auto max-w-5xl px-4 sm:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-4">
        For small-to-mid churches
      </div>
      <h1 class="text-4xl font-semibold tracking-tight text-ink sm:text-6xl leading-[1.05]">
        No two churches are the same.<br />
        Your software shouldn't be either.
      </h1>
      <p class="mt-6 max-w-2xl text-lg text-ink-muted leading-relaxed">
        Meet <strong class="text-ink font-semibold">Grace</strong> — your custom-built AI ministry assistant. Trained on your ministries, your services, and how your team actually does follow-up. She welcomes your visitors, drafts the gentle pastoral check-ins, and quietly notices when someone's been gone a few weeks — so your team can focus on the people in front of them.
      </p>
      <div class="mt-10 flex flex-wrap gap-3">
        <a :href="CTA_URL" class="btn-primary">
          {{ CTA_LABEL }} →
        </a>
        <a href="#how-it-works" class="btn-secondary">
          See how it works
        </a>
      </div>
    </section>

    <!-- ── Pain ──────────────────────────────────────────────────────── -->
    <section class="bg-canvas py-16 sm:py-20">
      <div class="mx-auto max-w-5xl px-4 sm:px-8">
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
      <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-3">
        Five things Grace handles for your team.
      </h2>
      <p class="text-base text-ink-muted max-w-2xl mb-10">
        Grace handles the systems work. Your pastors and team focus on the people work.
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

        <!-- Ask Grace chat callout -->
        <article class="card flex flex-col bg-brand text-ink-inverse border-brand">
          <div class="text-3xl mb-3" aria-hidden="true">💬</div>
          <h3 class="text-lg font-semibold">Plus — Ask Grace anything</h3>
          <p class="text-sm font-medium opacity-90 mt-1">A chat box, right on your dashboard.</p>
          <p class="mt-3 text-sm leading-relaxed opacity-90 flex-1">
            <em>"Grace, did the Hendricks family visit last week?"</em><br />
            <em>"Grace, who haven't I prayed for this week?"</em><br />
            <em>"Grace, what came in over the weekend?"</em><br /><br />
            She knows your congregation — ask her like she's the church admin who has every detail at her fingertips.
          </p>
        </article>
      </div>
    </section>

    <!-- ── On the AI feels impersonal question ───────────────────────── -->
    <section class="bg-canvas py-16 sm:py-20">
      <div class="mx-auto max-w-3xl px-4 sm:px-8">
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

    <!-- ── Pricing ───────────────────────────────────────────────────── -->
    <section id="pricing" class="mx-auto max-w-6xl px-4 sm:px-8 py-16 sm:py-24">
      <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-3">
        Simple pricing. Custom build. Annual or monthly.
      </h2>
      <p class="text-base text-ink-muted max-w-2xl mb-10">
        First month covers the custom build. Annual pricing saves about two months — most churches choose annual once their finance team approves the year's spend.
      </p>

      <div class="grid gap-5 lg:grid-cols-3">
        <article
          v-for="t in tiers"
          :key="t.name"
          class="rounded-card border bg-surface-raised p-6 flex flex-col relative"
          :class="t.highlight ? 'border-brand shadow-raised' : 'border-divider shadow-card'"
        >
          <div
            v-if="t.highlight"
            class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand text-ink-inverse text-[10px] font-bold uppercase tracking-wider px-3 py-1"
          >Most popular</div>
          <h3 class="text-xl font-semibold text-ink">{{ t.name }}</h3>
          <p class="text-sm text-brand font-semibold mt-1">{{ t.size }}</p>
          <p class="text-sm text-ink-muted mt-2 mb-4">{{ t.blurb }}</p>
          <div class="flex items-baseline gap-1 mb-1">
            <span class="text-3xl font-bold text-ink tabular-nums">{{ fmtMoney(t.firstMonth) }}</span>
            <span class="text-sm text-ink-muted">first month</span>
          </div>
          <div class="flex items-baseline gap-1 mb-2">
            <span class="text-lg font-semibold text-ink tabular-nums">then {{ fmtMoney(t.monthly) }}</span>
            <span class="text-sm text-ink-muted">/month</span>
          </div>
          <p class="text-xs text-ink-disabled italic mb-5">
            Or annual: {{ fmtMoney(t.firstMonth) }} + {{ fmtMoney(t.annual) }}/year
          </p>
          <ul class="space-y-2 mb-6 flex-1">
            <li
              v-for="(f, i) in t.features"
              :key="i"
              class="text-sm text-ink leading-snug flex items-start gap-2"
            >
              <span class="text-brand font-bold flex-shrink-0">✓</span>
              <span>{{ f }}</span>
            </li>
          </ul>
          <a :href="CTA_URL" class="block text-center rounded-full px-4 py-2.5 text-sm font-semibold transition-colors"
             :class="t.highlight ? 'bg-brand text-ink-inverse hover:bg-brand-hover' : 'bg-surface-elevated text-ink hover:bg-surface-elevated/80 border border-divider'"
          >Book a walkthrough</a>
        </article>
      </div>
    </section>

    <!-- ── Founder note ──────────────────────────────────────────────── -->
    <section class="bg-canvas py-16 sm:py-24">
      <div class="mx-auto max-w-3xl px-4 sm:px-8">
        <h2 class="text-2xl sm:text-3xl font-semibold text-ink mb-8">
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
          <p class="font-semibold text-ink pt-2">— Josh<br /><span class="text-sm text-ink-muted font-normal">Founder, CommandSite · Kids ministry curriculum writer</span></p>
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
    <section class="bg-surface-dark text-ink-inverse py-16 sm:py-24">
      <div class="mx-auto max-w-3xl px-4 sm:px-8 text-center">
        <h2 class="text-2xl sm:text-3xl font-semibold mb-4">
          Ready to see what Grace would look like for your church?
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
    <footer class="border-t border-divider bg-surface py-10">
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
  </div>
</template>
