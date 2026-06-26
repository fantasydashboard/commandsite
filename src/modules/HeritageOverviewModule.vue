<script setup lang="ts">
/**
 * Heritage Bath & Kitchen Co. — Today page.
 *
 * Page priority (post-impeccable critique):
 *   1. Status strip — greeting + current business state (NO redundant branding)
 *   2. Approvals queue — what needs Marc's eyes RIGHT NOW (was 3rd, moved to top)
 *   3. Today's Pulse — at-a-glance business state with trends
 *   4. Ada at Work — reassurance + role coverage (was 1st, moved to middle)
 *   5. Recent activity — context (clickable to drill in)
 *
 * Reframing of Ada hero: business outcome ($112K revenue won) is the
 * headline, not "hours saved." The owner thinks in revenue, not hours.
 * Hours-saved framing was for the SALES pitch, not the daily tool.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { Client } from '@/types/database'
import { adaRoles } from '@/lib/clients/heritage/roles'
import { recentActivity } from '@/lib/clients/heritage/recentActivity'
import type { RecentActivityEvent } from '@/lib/clients/heritage/types'
import AdaMorningHandoff from '@/components/heritage/AdaMorningHandoff.vue'
import AdaRecommendations, { type AdaRecommendation } from '@/components/heritage/AdaRecommendations.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'
import { fmtAgo } from '@/lib/format'
import { fmtMoney } from '@/lib/clients/heritage/format'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const router = useRouter()
const route = useRoute()

const isCustomDemo = computed(() => typeof route.query.demo_company === 'string')

// Route an activity event to the relevant tab (clickable feed rows).
function onActivityClick(event: RecentActivityEvent) {
  const tabByKind: Record<string, string> = {
    quote: 'front-desk-quotes',
    call: 'front-desk-quotes',
    review: 'reputation-marketing',
    reactivation: 'customer-care',
    dispatch: 'insights',
  }
  const tab = tabByKind[event.kind] ?? 'overview'
  router.push({
    name: 'dashboard.tab',
    params: { slug: 'heritage-bath', tab },
  })
}

const greeting = computed(() => {
  const hr = new Date().getHours()
  if (hr < 12) return `Good morning, Marc`
  if (hr < 17) return `Good afternoon, Marc`
  return `Good evening, Marc`
})

// ── Today's snapshot KPIs (with trend) ────────────────────────────────
const todaySnapshot = computed(() => {
  return {
    activeQuotes: 9,
    activeQuotesTrend: '2 vs last week',
    bookedToday: 2,
    bookedTodayTrend: 'next: Hendricks 2pm',
    revenueThisWeek: 11200000, // $112K
    revenueTrendPct: 17, // ↗ 17% vs prior week
    avgTicket: 2800000, // $28K
    avgTicketTrend: '8% trailing 30d',
  }
})

// ── Approval queue items ──────────────────────────────────────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'h-rodriguez-day7',
    role: 'quote_followup',
    icon: 'quote_followup',
    badge: 'Quote nudge · day 7',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Quote follow-up — Rodriguez Estate ($54,400 master bath)',
    recipient: 'Master bath + walk-in closet remodel · sent 7 days ago',
    preview: `"Hey Maria — Marc here at Heritage. Wanted to check in on the proposal for the master bath redesign. Know you mentioned wanting to take a few weeks to think through the tile selections. Happy to swing by with samples if it'd help, or just answer any questions about the timeline or budget options. No pressure either way — just want to make sure it didn't get lost in the inbox. — Marc"`,
    approved_response: "Sent. Day-7 has the highest reply rate for bath remodels in this price range. If she doesn't respond by Friday, I'll surface a softer day-14 nudge with a budget-tier option included.",
    ticker_after_approval: 'Day-7 quote follow-up sent to Rodriguez Estate · $54K master bath',
  },
  {
    id: 'h-bell-referral',
    role: 'referral_engine',
    icon: 'referral_hunter',
    badge: 'Referral ask',
    badgeClass: 'bg-success/15 text-success',
    title: 'Referral ask — Marcus & Tia Bell (just closed kitchen reno)',
    recipient: '5★ review posted yesterday · kitchen reno completed 9 days ago',
    preview: `"Hey Marcus and Tia, this is Marc with Heritage. Hope the new kitchen's holding up. Honest question — anyone in your circle thinking about a bath or kitchen project this year? If you're comfortable making an intro, they'd get $500 off and you'd get the same as a thank-you. No pressure either way. — Marc"`,
    approved_response: "Sent. Marcus + Tia's 5★ review specifically thanked you by name — high-affinity moment. Referrals from this customer profile close at 64% historically. If they refer, I'll auto-thank them when the friend books.",
    ticker_after_approval: 'Referral ask sent to Marcus & Tia Bell — kitchen referral chain started',
  },
  {
    id: 'h-castellanos-review',
    role: 'review_engine',
    icon: 'review_engine',
    badge: '4★ review reply',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Review reply — Pat Owens 4★ ("install was clean but delivery slipped")',
    recipient: 'Replying before this stays visible without acknowledgment',
    preview: `"Pat — Marc here, owner at Heritage. You're absolutely right that the cabinet delivery slip set us back a week, and that's on us to manage tighter with our suppliers. Diego's installation work was clean and I'm glad that came through. We're switching our cabinet vendor for projects starting next month for exactly this reason. Thanks for the honest feedback — it helps. — Marc"`,
    approved_response: 'Posted to Google. Owner-acknowledged 4★ reviews convert prospect-viewers at higher rates than ignored ones — the candor reads as honest.',
    ticker_after_approval: 'Reply posted to Pat Owens 4★ review',
  },
  {
    id: 'h-cole-reactivation',
    role: 'reactivation',
    icon: 'reactivation',
    badge: 'Expansion outreach',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Reactivation — Heather Cole (bath remodel 18 mo ago, kitchen interest)',
    recipient: 'Replied to last newsletter · "kitchen is next on the list"',
    preview: `"Hi Heather — Marc at Heritage. Saw your reply to the kitchen-trends newsletter, glad it sparked something. Last time we were out we talked through what you might want eventually. If you want to grab 30 min for a no-commitment kitchen walkthrough — measurements, rough budget range, timeline — happy to set that up. Booked your bath last March, would love to do the kitchen too. — Marc"`,
    approved_response: 'Sent. Past-bath customers becoming kitchen customers is the #1 expansion path for Heritage — 28% lifetime expansion rate. Heather is in the high-intent tier.',
    ticker_after_approval: 'Kitchen expansion outreach sent to Heather Cole',
  },
  {
    id: 'h-mendoza-review-ask',
    role: 'review_engine',
    icon: 'review_engine',
    badge: 'Review request',
    badgeClass: 'bg-success/15 text-success',
    title: 'Review request — Olivia Reagan (powder room completed 5 days ago)',
    recipient: 'Diego mentioned she was thrilled with the tile work',
    preview: `"Hi Olivia — thanks for letting us redo the powder room. Diego mentioned how much you loved how the tile turned out and it made our week. If you're up for it, a quick Google review would mean a lot — two clicks: [link]. No pressure either way. — Marc, Heritage"`,
    approved_response: "Sent. 5-day post-job timing has the highest review-conversion rate for residential remodel. Olivia's already shared photos in her NextDoor — she'll likely 5★.",
    ticker_after_approval: 'Review request sent to Olivia Reagan',
  },
]

// ── Live-updating activity feed ────────────────────────────────────────
const liveFeed = ref<RecentActivityEvent[]>([...recentActivity].sort((a, b) =>
  new Date(b.at).getTime() - new Date(a.at).getTime(),
))

const tickIntervalMs = 30_000
let tickHandle: number | null = null
const tickCounter = ref(0)

// `feedRows` recomputes `ago` text every tick without remounting <li> nodes.
const feedRows = computed(() => {
  // Read tickCounter so the computed re-runs on each interval tick.
  void tickCounter.value
  return liveFeed.value.slice(0, 10).map((event) => ({
    event,
    ago: fmtAgo(event.at),
  }))
})

onMounted(() => {
  tickHandle = window.setInterval(() => {
    tickCounter.value++
  }, tickIntervalMs)
})

onBeforeUnmount(() => {
  if (tickHandle !== null) clearInterval(tickHandle)
})

// Total revenue captured this week (for the Ada at Work hero)
const totalRevenueThisWeek = computed(() => todaySnapshot.value.revenueThisWeek)
const totalActions = computed(() =>
  adaRoles.filter((r) => r.status === 'active').reduce((sum, r) => sum + r.this_week_count, 0),
)
const activeRoles = computed(() => adaRoles.filter((r) => r.status === 'active'))

// ── "What Ada replaces" hero — the cheat-code framing ───────────────
// This is the single most important block on the page for a cold visitor.
// Translates Ada's monthly output into the language an owner-operator
// actually thinks in: jobs they would have hired for, dollars they
// would have spent on payroll, and the net leverage Ada provides.
//
// Numbers based on common Florida bath/kitchen remodeler hiring math:
//   - Office manager / admin: ~$52K/yr ($4,333/mo) handles phone, scheduling,
//     follow-up coordination
//   - Marketing coordinator (part-time): ~$21,600/yr ($1,800/mo, 0.5 FTE)
//     handles reviews, newsletter, social
//   - Salesperson / quote-chaser (part-time): ~$16,800/yr ($1,400/mo, 0.25 FTE)
//     handles quote follow-up, referral asks, reactivation
// Total roles replaced this month: $7,533/mo of payroll equivalent
// Ada's cost: $999/mo
// Net leverage: $6,534/mo (~$78K/yr)
const replacementHero = computed(() => ({
  totalReplacedDollars: 7533,
  adaCost: 999,
  netLeverage: 6534,
  netLeverageAnnual: 78408,
  roles: [
    {
      name: 'Office manager',
      replacementMonthly: 4333,
      annualSalary: 52000,
      what: 'answered the phone · scheduled consults · sent follow-ups',
    },
    {
      name: 'Marketing coordinator (half-time)',
      replacementMonthly: 1800,
      annualSalary: 43200,
      what: 'asked for reviews · drafted the newsletter · replied to Google + Houzz',
    },
    {
      name: 'Quote chaser / salesperson (quarter-time)',
      replacementMonthly: 1400,
      annualSalary: 67200,
      what: 'chased quotes · asked for referrals · reactivated dormant customers',
    },
  ],
}))

function fmtDollars(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

// ── Ada's recommendations for Today ────────────────────────────────
// Same DNA as the existing Lead Sources recommendations: observation +
// reasoning + dollar impact + clear next step. The page-level "Ada
// noticed" frame is what makes her feel like a thinking coworker.
const todayRecommendations: AdaRecommendation[] = [
  {
    id: 't-heather-warm',
    title: 'Heather Cole replied warmly to the kitchen reactivation',
    tag: 'Worth your eyes',
    tagTone: 'opportunity',
    body: 'Heather did her bath with you 18 months ago. Yesterday she replied "yeah, we\'ve been thinking about it" to the kitchen newsletter. I drafted a no-commitment walkthrough invite. This is a real one, worth a personal touch before I send.',
    impact: 'Past-bath-becomes-kitchen converts at 28% for Heritage. Estimated kitchen ticket: $45-65K.',
    actionLabel: 'Read the draft',
  },
  {
    id: 't-day6-preview',
    title: '3 quotes hit day 6 tomorrow',
    tag: 'Highest leverage',
    tagTone: 'leverage',
    body: 'The Rodriguez Estate ($54K), James & Rebecca Liu ($33K), and Whitfield Family ($78K) all hit the day-7 nudge window tomorrow. I have drafts ready. Total pipeline at risk if these go quiet: <strong class="text-ink">$165K</strong>.',
    impact: 'Day-7 nudges convert at ~22% in your $30-80K range. Probabilistically rescuing $36K of the $165K.',
    actionLabel: 'Preview the 3 drafts',
  },
  {
    id: 't-lsa-spike',
    title: 'LSA inquiries spiked 40% Tuesday afternoon',
    tag: 'Investigate',
    tagTone: 'opportunity',
    body: 'You normally get 2-3 LSA leads per day. Tuesday you got 7 between 1pm and 4pm. Probably a seasonal trigger (Q3 budget season) or a competitor pausing their spend. Worth tuning bid strategy this week before the window closes.',
    impact: 'If sustained, +5 leads/wk at your 21% LSA close rate = ~1 extra job/wk ($28K avg ticket).',
    actionLabel: 'Open Lead Sources',
  },
]
</script>

<template>
  <div class="space-y-6">
    <!-- ─── 1. Status strip — greeting + current business state ─── -->
    <header v-if="!isCustomDemo" class="flex items-baseline justify-between flex-wrap gap-2 pb-1">
      <h2 class="text-2xl font-semibold text-ink">{{ greeting }}</h2>
      <div class="flex items-baseline gap-3 text-sm text-ink-muted">
        <span class="hidden sm:inline">Tampa, FL</span>
        <span class="hidden sm:inline text-ink-disabled">·</span>
        <span class="tabular-nums"><strong class="text-ink">{{ todaySnapshot.activeQuotes }}</strong> quotes in pipeline</span>
        <span class="text-ink-disabled">·</span>
        <span class="tabular-nums"><strong class="text-ink">{{ todaySnapshot.bookedToday }}</strong> consults today</span>
      </div>
    </header>

    <!-- ─── 1.25 ADA'S MORNING HANDOFF — the emotional cheat-code moment.
         The first thing a visitor reads. Not a metric card; a conversational
         coworker note. Lands BEFORE the rational "What Ada replaces" hero
         so the emotional read ("oh, that's what having a coworker feels
         like") sets up the rational read ("here's the payroll math"). -->
    <AdaMorningHandoff owner-first-name="Marc" />

    <!-- ─── 1.5 WHAT ADA REPLACES — the cheat-code hero ────────────────
         The single most important block on the page for a cold visitor.
         Translates Ada's monthly output into the language an owner-
         operator actually thinks in: jobs they would have hired for,
         payroll dollars they would have spent, net leverage Ada delivers.
         Sits BEFORE the approval queue because the cheat-code framing
         has to land before the operator-mode UI starts. -->
    <section class="card overflow-hidden">
      <header class="mb-4 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">What Ada replaces</span>
          <span class="text-[11px] text-ink-disabled">This month · Tampa bath/kitchen owner-operator math</span>
        </div>
      </header>

      <!-- Hero strip: replacement value vs Ada cost vs net leverage -->
      <div class="rounded-card bg-brand text-ink-inverse px-5 py-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 sm:divide-x sm:divide-ink-inverse/20">
        <div>
          <div class="text-[10px] uppercase tracking-wider opacity-80">Roles Ada filled</div>
          <div class="flex items-baseline gap-1.5 mt-1">
            <span class="text-3xl font-bold tabular-nums leading-none">{{ fmtDollars(replacementHero.totalReplacedDollars) }}</span>
            <span class="text-sm font-semibold opacity-90">/ mo payroll equivalent</span>
          </div>
          <div class="text-[11px] opacity-80 mt-1.5">if you hired humans to do this work</div>
        </div>
        <div class="sm:pl-6">
          <div class="text-[10px] uppercase tracking-wider opacity-80">What you pay</div>
          <div class="flex items-baseline gap-1.5 mt-1">
            <span class="text-3xl font-bold tabular-nums leading-none">{{ fmtDollars(replacementHero.adaCost) }}</span>
            <span class="text-sm font-semibold opacity-90">/ mo for Ada</span>
          </div>
          <div class="text-[11px] opacity-80 mt-1.5">no benefits, vacation, or sick days</div>
        </div>
        <div class="sm:pl-6">
          <div class="text-[10px] uppercase tracking-wider opacity-80">Your net leverage</div>
          <div class="flex items-baseline gap-1.5 mt-1">
            <span class="text-3xl font-bold tabular-nums leading-none">{{ fmtDollars(replacementHero.netLeverage) }}</span>
            <span class="text-sm font-semibold opacity-90">/ mo</span>
          </div>
          <div class="text-[11px] opacity-80 mt-1.5 tabular-nums">~{{ fmtDollars(replacementHero.netLeverageAnnual) }} / year saved</div>
        </div>
      </div>

      <!-- Per-role breakdown -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div
          v-for="role in replacementHero.roles"
          :key="role.name"
          class="rounded-card border border-divider bg-surface-elevated p-3"
        >
          <div class="flex items-baseline justify-between gap-2 mb-1">
            <span class="text-[13px] font-semibold text-ink">{{ role.name }}</span>
            <span class="text-[11px] font-semibold text-brand tabular-nums">{{ fmtDollars(role.replacementMonthly) }}/mo</span>
          </div>
          <div class="text-[11px] text-ink-muted leading-snug">{{ role.what }}</div>
        </div>
      </div>

      <p class="text-[11px] text-ink-disabled mt-3 leading-snug">
        Ada doesn't sit at your kitchen table with the homeowner. She handles the rest, the part that fills your inbox at 9pm and burns out an admin in 6 months. Cancel anytime; no contract; founding-cohort pricing locked in.
      </p>
    </section>

    <!-- ─── 2. APPROVALS — what needs Marc's eyes RIGHT NOW ─── -->
    <!-- No `heading` override: default ("Today's approvals") becomes the
         eyebrow + queueLabel ("5 waiting on you") becomes the headline.
         No copy duplication. -->
    <GraceApprovalQueue
      :items="queueItems"
      :assistant-name="'Ada'"
      :owner-name="'Marc'"
      subtitle="Review · approve · or edit before it goes out. Every message sends from your number, in your voice."
    />

    <!-- ─── 3. Today's Pulse — at-a-glance state with trends ─── -->
    <section class="card overflow-hidden">
      <header class="mb-4 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">This week</span>
          <span class="text-[11px] text-ink-disabled flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
            Live · updates every 30s
          </span>
        </div>
      </header>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="text-[10px] uppercase tracking-wider text-ink-muted">Active quotes</div>
          <div class="text-2xl font-bold text-ink tabular-nums leading-none mt-1">{{ todaySnapshot.activeQuotes }}</div>
          <div class="text-[11px] text-success mt-1 tabular-nums"><span aria-hidden="true">↗</span> {{ todaySnapshot.activeQuotesTrend }}</div>
          <div class="text-[11.5px] text-danger/80 mt-2 leading-snug font-medium pt-2 border-t border-divider"><span class="text-danger font-bold">Without Ada:</span> ~3 of these would go cold by week's end (industry: 30% loss to follow-up gaps)</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="text-[10px] uppercase tracking-wider text-ink-muted">Consults today</div>
          <div class="text-2xl font-bold text-ink tabular-nums leading-none mt-1">{{ todaySnapshot.bookedToday }}</div>
          <div class="text-[11px] text-ink-disabled mt-1">{{ todaySnapshot.bookedTodayTrend }}</div>
          <div class="text-[11.5px] text-danger/80 mt-2 leading-snug font-medium pt-2 border-t border-divider"><span class="text-danger font-bold">Without Ada:</span> ~53% answered (industry avg) instead of 100%</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="text-[10px] uppercase tracking-wider text-ink-muted">Revenue this week</div>
          <div class="text-2xl font-bold text-success tabular-nums leading-none mt-1">{{ fmtMoney(todaySnapshot.revenueThisWeek) }}</div>
          <div class="text-[11px] text-success mt-1 tabular-nums"><span aria-hidden="true">↗</span> {{ todaySnapshot.revenueTrendPct }}% vs last week</div>
          <div class="text-[11.5px] text-danger/80 mt-2 leading-snug font-medium pt-2 border-t border-divider"><span class="text-danger font-bold">Without Ada:</span> ~$71K baseline. <strong class="text-ink">$41K rescued</strong> by follow-up</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="text-[10px] uppercase tracking-wider text-ink-muted">Avg ticket</div>
          <div class="text-2xl font-bold text-ink tabular-nums leading-none mt-1">{{ fmtMoney(todaySnapshot.avgTicket) }}</div>
          <div class="text-[11px] text-success mt-1 tabular-nums"><span aria-hidden="true">↗</span> {{ todaySnapshot.avgTicketTrend }}</div>
          <div class="text-[10px] text-ink-disabled mt-1.5 leading-tight">Trending up as Ada catches premium-tier inquiries that used to slip</div>
        </div>
      </div>
    </section>

    <!-- ─── 4. Ada at Work — compact proof strip (REDUCED 2026-06-26) ─
         Previously a full grid of 12 role cards. The morning handoff
         and Ada's Recommendations now do that storytelling job better,
         so the role grid became redundant. Kept the revenue + role
         count as a proof point for the cheat-code hero above, with a
         link to drill into the full role breakdown if anyone wants it. -->
    <section class="rounded-card bg-brand text-ink-inverse px-5 py-4 flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
      <div>
        <div class="flex items-baseline gap-1.5">
          <span class="text-3xl font-bold tabular-nums leading-none">{{ fmtMoney(totalRevenueThisWeek) }}</span>
          <span class="text-sm font-semibold opacity-90">revenue won this week</span>
        </div>
        <div class="text-[11px] uppercase tracking-wide opacity-80 mt-1.5 tabular-nums">
          across {{ totalActions }} actions Ada handled for you this week
        </div>
      </div>
      <div class="text-right">
        <div class="text-lg font-semibold leading-tight tabular-nums">
          {{ activeRoles.length }} of {{ adaRoles.length }}
        </div>
        <div class="text-[11px] uppercase tracking-wide opacity-80 mt-1">
          roles active
        </div>
      </div>
    </section>

    <!-- ─── 4.5 Ada's Recommendations — what to act on this week ─── -->
    <AdaRecommendations :recommendations="todayRecommendations" />

    <!-- ─── 5. Recent activity — context, clickable ─── -->
    <section class="card overflow-hidden">
      <header class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h3 class="text-base font-semibold text-ink">Recent activity</h3>
          <p class="text-[11px] text-ink-muted">Last 48 hours · click any event to drill in</p>
        </div>
      </header>
      <ul class="space-y-0">
        <li
          v-for="row in feedRows"
          :key="row.event.id"
          class="flex items-start gap-3 py-2.5 border-b border-divider last:border-0 cursor-pointer hover:bg-surface-elevated/50 -mx-2 px-2 rounded transition-colors"
          @click="onActivityClick(row.event)"
        >
          <span
            class="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
            :class="{
              'bg-brand': row.event.kind === 'quote',
              'bg-success': row.event.kind === 'review' || row.event.kind === 'reactivation',
              'bg-warn': row.event.kind === 'call',
              'bg-ink-muted': row.event.kind === 'dispatch',
            }"
          ></span>
          <span class="text-[13px] text-ink leading-snug flex-1">{{ row.event.text }}</span>
          <span class="text-[11px] text-ink-disabled tabular-nums flex-shrink-0">{{ row.ago }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
