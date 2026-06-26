<script setup lang="ts">
/**
 * Cornerstone Community Church — Today (Grace command bridge).
 *
 * Mirrors the Apex Today pattern:
 *   1. Grace at Work hub              ← value-prop hero (11 roles + time saved)
 *   2. Approval queue                 ← Grace's drafts awaiting pastoral sign-off
 *   3. Today snapshot + Live feed     ← merged: Sunday/giving/at-risk pulse +
 *                                       auto-updating activity feed below
 *
 * The shared "Ask Grace" chat lives in the floating widget rendered by
 * DashboardLayout (AskAiFloatingButton) — approval-queue approves push
 * a chime-in into that conversation (default GraceApprovalQueue
 * behavior preserved via pushApprovedToChat=true).
 */
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import type { Client } from '@/types/database'
import { todayPulse } from '@/lib/clients/cornerstone/today'
import { givingStats } from '@/lib/clients/cornerstone/giving'
import { peopleStats } from '@/lib/clients/cornerstone/people'
import { graceRoles, getRole, type GraceRole } from '@/lib/clients/cornerstone/roles'
import AdaAtWorkHub from '@/components/ada/AdaAtWorkHub.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'
import GraceMorningHandoff from '@/components/cornerstone/GraceMorningHandoff.vue'
import GraceRecommendations, { type GraceRecommendation } from '@/components/cornerstone/GraceRecommendations.vue'
import { useLiveActivity, seedEvent, type PoolEvent, type LiveEvent } from '@/composables/useLiveActivity'
import { money, fmtAgo } from '@/lib/format'
import AdaIcon from '@/components/ada/AdaIcon.vue'

const router = useRouter()
defineProps<{ client: Client; config: Record<string, unknown> }>()

function onRoleClick(role: GraceRole) {
  router.push({
    name: 'dashboard.tab',
    params: { slug: 'cornerstone-church', tab: role.tab },
    hash: `#${role.key}`,
  })
}

const pulse = computed(() => todayPulse())
const giving = computed(() => givingStats())
const people = computed(() => peopleStats())

const attendanceTrend = computed(() => {
  const diff = pulse.value.attendance_last_sunday - pulse.value.attendance_avg_4w
  return { diff, sign: diff >= 0 ? '↑' : '↓', isUp: diff >= 0 }
})

const greeting = computed(() => {
  const hr = new Date().getHours()
  // Generic greeting — the demo is for any visiting pastor, not "Pastor Mark"
  // specifically. Keeps the warmth without assuming the viewer's identity.
  if (hr < 12) return 'Good morning, Cornerstone'
  if (hr < 17) return 'Good afternoon, Cornerstone'
  return 'Good evening, Cornerstone'
})

// ── Approval queue: Grace's drafts awaiting sign-off ──────────────────
// Ordered to lead with the two headline products (Welcome + Drift
// Watch) so the pastor opening this in the morning sees the products
// they're evaluating FIRST. Grief support, giving, communications,
// and volunteer coordination follow as supporting workflows. Pastors
// can re-sort if they prefer urgency-first; the queue itself is
// re-sortable.
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'q-maddux',
    role: 'guest_followup',
    icon: 'qa_assistant',
    badge: 'Welcome',
    badgeClass: 'bg-success/15 text-success',
    title: 'Welcome card — Maddux Family',
    recipient: '4th visit Sunday · daughter loves the kids program',
    preview: '"The Maddux Family, thanks so much for joining us again Sunday. Lila told her teacher she can\'t wait to come back, which made everyone\'s day. If you\'re open to it, we\'d love to chat about Newcomers Lunch next month, no pressure either way. — Pastor"',
    approved_response: 'Sent. The Madduxes are now in the day-7 nudge sequence. If no reply by then I\'ll draft another soft touch.',
    ticker_after_approval: 'Welcome card sent to the Maddux Family',
  },
  {
    id: 'q-sullivan',
    role: 'drift_detection',
    icon: 'alert-triangle',
    badge: 'Drift Watch',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Pastoral check-in — Sullivan Family',
    recipient: 'Drew & Ana Sullivan · 3 flags (no Sunday attendance, skipped small group, paused giving) · escalated 4d ago',
    preview: '"Drew, Ana, was thinking about you both this week. I know the last few months have been a lot. No agenda here, just wanted to see if a coffee or a call would be helpful. I\'ve got Tuesday afternoon or Friday morning open. — Pastor"',
    approved_response: "Sent. I'll watch for a reply for 48 hrs and let you know either way. If they don't respond, I'll surface it again Wednesday.",
    ticker_after_approval: 'Drift Watch check-in sent to the Sullivans',
  },
  {
    id: 'q-foster-grief',
    role: 'care_triage',
    icon: 'alert-triangle',
    badge: 'Grief Support',
    badgeClass: 'bg-danger/15 text-danger',
    title: 'Funeral-week check-in — Foster Family',
    recipient: 'Amanda Foster · James\'s father passed Sunday · funeral Friday',
    preview: '"Amanda — thinking of you, James, and the kids constantly this week. I\'ll be at the funeral Friday and will plan to be there early. In the meantime: meals are covered through next Sunday via your small group, and the Cornerstone benevolence fund covered the casket flowers. No need to respond. Just know we\'re carrying you. — Pastor"',
    approved_response: 'Sent. I\'ll keep an eye out for any reply but won\'t prompt. I\'ll surface a 30-day follow-up reminder mid-June so you can check in once the immediate flurry settles.',
    ticker_after_approval: 'Funeral-week note sent to the Foster Family',
  },
  {
    id: 'q-hawthorne',
    role: 'communications',
    icon: 'dollar-sign',
    badge: 'Giving',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Card-update reminder — Hawthorne Family',
    recipient: 'Recurring gift card expired 22d ago · 3-yr giving streak',
    preview: '"The Hawthorne Family, your monthly gift didn\'t process this month because the card on file expired. Whenever you have a moment, here\'s the link to update it. Zero pressure, just wanted to flag it before another cycle slips. Thank you for your faithfulness. — Grace, for Cornerstone"',
    approved_response: 'Sent. I\'ll watch for the card update for 5 days. If they update, I\'ll quietly retry the gift. If not, I\'ll surface it again next Monday.',
    ticker_after_approval: 'Card-update reminder sent to the Hawthornes',
  },
  {
    id: 'q-ellison',
    role: 'communications',
    icon: 'check-circle',
    badge: 'Communications',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Birth congrats note — Ellison Family',
    recipient: 'Marc & Hannah Ellison · baby Ellison born Tue',
    preview: '"Marc and Hannah, saw the news from your small group, congratulations on baby Ellison. Hope the first nights are going as well as they can. The whole team is praying for you. We mailed a meal-train signup link to the group so they can rally around you this week. — Grace, on behalf of the pastoral team"',
    approved_response: 'Done. Note printed, posting tomorrow with a hand-signed signature. The Ellisons should have it by Friday.',
    ticker_after_approval: 'Mailed congrats note to the Ellisons',
  },
  {
    id: 'q-nursery',
    role: 'volunteer_coord',
    icon: 'calendar',
    badge: 'Volunteer Coord',
    badgeClass: 'bg-accent/15 text-accent',
    title: 'Fill ask — Nursery Sunday 9 AM',
    recipient: '2 spots open · suggesting Mia Pham + Amanda Foster',
    preview: '"Hey Mia, Linda and Aanya are both off this Sunday and we\'re short for the 9 AM nursery slot. You\'ve filled in last-minute before and I really appreciated it. Any chance you\'re free? Totally understand if not. — Pastor (via Grace)"',
    approved_response: 'Pinged both. Planning Center will auto-confirm if either says yes. I\'ll surface the result to you Saturday morning if no one bites.',
    ticker_after_approval: 'Volunteer ask sent — Mia + Amanda for 9 AM nursery',
  },
]

// ── Live-updating activity feed ────────────────────────────────────────
// Mix the two headline products (Welcome + Drift Watch) into the seed
// + pool so a pastor watching the stream sees those firing, not just
// supporting roles.
const liveSeed: LiveEvent[] = [
  seedEvent(8 * 60,   'alert-triangle',  'Whitaker household crossed 4-week threshold · check-in drafted', 'drift_detection'),
  seedEvent(11 * 60,  'qa_assistant',    'Riley opened your Welcome text',                                 'guest_followup'),
  seedEvent(22 * 60,  'check-circle',    'Card #4 mailed for the Hawthorne family',                       'communications'),
  seedEvent(47 * 60,  'front_desk',      'Connect form submitted — Kennedy Park',                         'front_desk'),
  seedEvent(95 * 60,  'review_engine',   'Baptism testimony captured — Marcus L.',                        'stories'),
]
const livePool: PoolEvent[] = [
  { icon: 'qa_assistant',    text: 'Welcome card drafted — first-time visitor from Sunday',                role: 'guest_followup' },
  { icon: 'alert-triangle',  text: 'Castellano household flagged · pastoral check-in drafted',             role: 'drift_detection' },
  { icon: 'email_marketing', text: 'Newsletter open: 38% (847 recipients)',                                role: 'communications' },
  { icon: 'qa_assistant',    text: 'Welcome day-3 nudge approved + sent to the Boucher family',            role: 'guest_followup' },
  { icon: 'calendar',        text: 'Sunday volunteer slot auto-confirmed (Parking)',                       role: 'volunteer_coord' },
  { icon: 'check-circle',    text: 'Birthday card queued for next Monday print run',                       role: 'communications' },
  { icon: 'alert-triangle',  text: 'Reyes Family · Drift Watch flag cleared (returned Sunday)',            role: 'drift_detection' },
  { icon: 'reactivation',    text: '"We missed you" SMS opened by the Reyes Family',                       role: 'reengagement' },
  { icon: 'email_marketing', text: 'Auto-drafted Sunday recap for review',                                  role: 'communications' },
  { icon: 'calendar',        text: 'Volunteer fill confirmed — Mia Pham accepted',                         role: 'volunteer_coord' },
]

const { events: liveEvents, fmtAgo: fmtLiveAgo, pushEvent } = useLiveActivity({
  seed: liveSeed,
  pool: livePool,
})

function onApproved(item: ApprovalQueueItem) {
  if (!item.ticker_after_approval) return
  const role = item.role ?? 'communications'
  pushEvent({ icon: item.icon, text: item.ticker_after_approval, role })
}

// Suppress unused warnings — kept for future surfaces.
void greeting
void fmtAgo

// Reactive minute tick → re-render fmtAgo across the recent-history list.
const nowTick = ref(0)
let tickInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  tickInterval = setInterval(() => { nowTick.value++ }, 60_000)
})
onBeforeUnmount(() => {
  if (tickInterval) clearInterval(tickInterval)
})

// ── Before/After Grace toggle ───────────────────────────────────────
// The cheat-code wow moment for churches. Same pattern as Heritage's
// Ada toggle but with PEOPLE framing instead of revenue framing.
type GraceMode = 'with-grace' | 'before-grace'
const mode = ref<GraceMode>('with-grace')

// ── "What Grace replaces" hero math ──────────────────────────────────
// Church-typical math: a part-time admin, part-time connections
// coordinator, and part-time comms coordinator add up to roughly
// 30+ hrs/week of work. At typical church compensation that's about
// $5,500-6,000/mo of payroll-equivalent. Grace Core: $599/mo.
//
// Pastors think in HOURS first (time for ministry), DOLLARS second
// (board / executive pastor language). Hero leads with hours, shows
// dollars as the secondary frame.
const replacementHero = {
  hoursPerWeek: 32,
  totalReplacedDollars: 5800,
  graceCost: 599,
  netLeverage: 5201,
  netLeverageAnnual: 62412,
  roles: [
    {
      name: 'Church admin (part-time)',
      replacementMonthly: 2400,
      what: 'first-time visitor cards · connection card data entry · weekly comms',
    },
    {
      name: 'Connections coordinator (part-time)',
      replacementMonthly: 2200,
      what: 'guest follow-up · drift watch · newcomer pathway',
    },
    {
      name: 'Comms / volunteer coordinator (part-time)',
      replacementMonthly: 1200,
      what: 'Sunday volunteer texts · mid-week comms · prayer team coordination',
    },
  ],
}

function fmtDollars(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

// ── Grace's recommendations for the Today page ──────────────────────
const todayRecommendations: GraceRecommendation[] = [
  {
    id: 'gt-sullivan-care',
    title: 'The Sullivan family needs your personal eyes before I send the coffee invite',
    tag: 'Worth your eyes',
    tagTone: 'pastoral',
    body: 'Three signals now: no Sunday attendance for 6 weeks, dropped small group in May, paused giving last month. Could be a season, could be something harder. The draft I made reads as no-agenda but you know them better than I do. Your edit could be the difference between "yes, coffee" and "we\'re fine, thanks".',
    impact: 'Drift-watch families who get the senior pastor\'s voice in the first touch re-engage at ~58% vs ~32% for templated.',
    actionLabel: 'Read the draft',
  },
  {
    id: 'gt-maddux-lunch',
    title: 'The Maddux Family is at 4 visits, the Newcomers Lunch sweet spot',
    tag: 'Opportunity',
    tagTone: 'opportunity',
    body: 'Pre-decision families who attend Newcomers Lunch convert to membership at 71% vs 23% who never come. The Madduxes are exactly the profile (kids enrolled, 4th visit, the daughter is excited). I drafted the invite already. Just needs your green light.',
    impact: 'One Newcomers Lunch invite at this stage is worth a 3x lift in membership conversion.',
    actionLabel: 'Read the invite',
  },
  {
    id: 'gt-greeters-gap',
    title: 'Greeters team only has 2 confirmed for next Sunday',
    tag: 'Heads up',
    tagTone: 'urgent',
    body: 'You usually run with 5. I have a list of 8 past greeters I could text Thursday for a soft ask, but I wanted you to know first in case there\'s a reason (vacation week, family situation). If I don\'t hear back by Wednesday end of day, I\'ll start the chain.',
    actionLabel: 'Let Grace handle it',
  },
]
</script>

<template>
  <div class="space-y-4">
    <!-- ── BEFORE / AFTER GRACE TOGGLE ─────────────────────────────────
         The wow moment. Visitor flips between "what your Monday looks
         like with Grace" vs "without her." Same structure as the Ada
         toggle on Heritage Bath. -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-divider bg-surface-elevated px-4 py-3">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">demo controls</div>
        <p class="text-[12.5px] text-ink-muted leading-snug mt-0.5">See what this same Monday looks like with vs without Grace.</p>
      </div>
      <div class="inline-flex items-center rounded-full border border-divider bg-surface p-0.5" role="group" aria-label="Toggle Grace mode">
        <button
          type="button"
          class="px-3 py-1.5 text-xs font-semibold rounded-full transition-colors"
          :class="mode === 'before-grace' ? 'bg-danger text-ink-inverse' : 'text-ink-muted hover:text-ink'"
          :aria-pressed="mode === 'before-grace'"
          @click="mode = 'before-grace'"
        >Before Grace</button>
        <button
          type="button"
          class="px-3 py-1.5 text-xs font-semibold rounded-full transition-colors"
          :class="mode === 'with-grace' ? 'bg-brand text-ink-inverse' : 'text-ink-muted hover:text-ink'"
          :aria-pressed="mode === 'with-grace'"
          @click="mode = 'with-grace'"
        >With Grace</button>
      </div>
    </div>

    <!-- ── GRACE'S MORNING HANDOFF — the emotional cheat-code moment ─ -->
    <GraceMorningHandoff v-if="mode === 'with-grace'" pastor-name="Pastor Andrew" />

    <section v-else class="rounded-card border border-danger/25 bg-danger/[0.04] px-5 py-5 sm:px-6 sm:py-6">
      <header class="flex items-center gap-3 mb-3">
        <div class="h-9 w-9 rounded-full bg-ink-disabled text-ink-inverse flex items-center justify-center text-sm font-bold flex-shrink-0">?</div>
        <div>
          <span class="text-sm font-bold text-ink">No handoff this morning</span>
          <p class="text-[11px] text-ink-muted leading-snug">staff meeting starts with "anyone hear from the Madduxes?"</p>
        </div>
      </header>
      <p class="text-[13.5px] text-ink leading-relaxed max-w-2xl">
        You walk into Monday cold. The connection cards from Sunday are sitting in a stack on your admin's desk. The Sullivan family didn't make it again, but no one tracked it. Brian Patel hasn't been checked on since the funeral 6 weeks ago. The greeters team is short for next Sunday but you won't realize until Friday. The work doesn't go away. It just lands somewhere, usually on Sunday afternoon or your Tuesday off.
      </p>
    </section>

    <!-- ── WHAT GRACE REPLACES — the cheat-code hero ───────────────── -->
    <section v-if="mode === 'with-grace'" class="card overflow-hidden">
      <header class="mb-4 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">What Grace replaces</span>
          <span class="text-[11px] text-ink-disabled">This month · for a 350-attendance church</span>
        </div>
      </header>

      <div class="rounded-card bg-brand text-ink-inverse px-5 py-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 sm:divide-x sm:divide-ink-inverse/20">
        <div>
          <div class="text-[10px] uppercase tracking-wider opacity-80">Time back for ministry</div>
          <div class="flex items-baseline gap-1.5 mt-1">
            <span class="text-3xl font-bold tabular-nums leading-none">~{{ replacementHero.hoursPerWeek }} hrs</span>
            <span class="text-sm font-semibold opacity-90">/ week</span>
          </div>
          <div class="text-[11px] opacity-80 mt-1.5">that doesn't have to come from your staff or your Tuesday off</div>
        </div>
        <div class="sm:pl-6">
          <div class="text-[10px] uppercase tracking-wider opacity-80">Payroll equivalent</div>
          <div class="flex items-baseline gap-1.5 mt-1">
            <span class="text-3xl font-bold tabular-nums leading-none">{{ fmtDollars(replacementHero.totalReplacedDollars) }}</span>
            <span class="text-sm font-semibold opacity-90">/ mo</span>
          </div>
          <div class="text-[11px] opacity-80 mt-1.5">if you hired the admin + connections + comms roles separately</div>
        </div>
        <div class="sm:pl-6">
          <div class="text-[10px] uppercase tracking-wider opacity-80">What you pay</div>
          <div class="flex items-baseline gap-1.5 mt-1">
            <span class="text-3xl font-bold tabular-nums leading-none">{{ fmtDollars(replacementHero.graceCost) }}</span>
            <span class="text-sm font-semibold opacity-90">/ mo for Grace</span>
          </div>
          <div class="text-[11px] opacity-80 mt-1.5 tabular-nums">net leverage: {{ fmtDollars(replacementHero.netLeverage) }}/mo (~{{ fmtDollars(replacementHero.netLeverageAnnual) }}/yr)</div>
        </div>
      </div>

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
        Grace doesn't preach, lead small groups, or sit with grieving families. She handles the rest, the things that quietly fall through the cracks because there's never enough time. Cancel anytime; no contract; founding-cohort pricing locked in.
      </p>
    </section>

    <section v-else class="card overflow-hidden">
      <header class="mb-4 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow text-danger">What you'd be absorbing</span>
          <span class="text-[11px] text-ink-disabled">This month · without Grace, without a connections pastor</span>
        </div>
      </header>

      <div class="rounded-card bg-danger text-ink-inverse px-5 py-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 sm:divide-x sm:divide-ink-inverse/20">
        <div>
          <div class="text-[10px] uppercase tracking-wider opacity-80">Work landing on the team</div>
          <div class="flex items-baseline gap-1.5 mt-1">
            <span class="text-3xl font-bold tabular-nums leading-none">~{{ replacementHero.hoursPerWeek }} hrs</span>
            <span class="text-sm font-semibold opacity-90">/ week</span>
          </div>
          <div class="text-[11px] opacity-80 mt-1.5">absorbed by you, your admin, or your weekend</div>
        </div>
        <div class="sm:pl-6">
          <div class="text-[10px] uppercase tracking-wider opacity-80">Your options</div>
          <div class="mt-1 text-[13px] leading-snug">Hire a part-time admin + connections coordinator (~$5,800/mo + benefits), OR let things slip (which is what most churches do).</div>
        </div>
        <div class="sm:pl-6">
          <div class="text-[10px] uppercase tracking-wider opacity-80">Either way</div>
          <div class="mt-1 text-[13px] leading-snug font-semibold">Visitors slip past. Members drift quietly. Volunteers find out about Sunday on Saturday night.</div>
        </div>
      </div>

      <p class="text-[12px] text-ink-muted leading-snug">
        This is the default for small-to-mid churches. The work doesn't go away, it just lands somewhere. Usually on the senior pastor, after the funeral or the marriage counseling session that ran long.
      </p>
    </section>

    <!-- ── 1. Grace at Work hub — value-prop hero ─────────────────── -->
    <!-- headlineRoleKeys promotes Welcome + Drift Watch to a 2-col hero
         strip at the top of the role grid. Mirrors the deck slide 6
         layout + the landing page module hierarchy: two headline jobs
         get equal heavy treatment, eight supporting roles render at
         standard size below.
         Hidden in 'before-grace' mode since these roles don't exist
         without Grace. -->
    <AdaAtWorkHub
      v-if="mode === 'with-grace'"
      :roles="graceRoles"
      assistant-name="Grace"
      :headline-role-keys="['guest_followup', 'drift_detection']"
      @role-click="onRoleClick"
    />

    <!-- ── 2. Approval queue — Grace's drafts awaiting pastoral sign-off ─ -->
    <GraceApprovalQueue
      v-if="mode === 'with-grace'"
      :items="queueItems"
      :initial-resolved="8"
      :subtitle="`${greeting}. Co-sign to send, edit to revise, skip to resurface tomorrow.`"
      @approved="onApproved"
    />

    <section v-else class="card border-danger/25">
      <header class="mb-2">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-danger mb-1">today's approvals</div>
        <h3 class="text-base font-bold text-ink">0 drafts waiting</h3>
        <p class="text-[12.5px] text-ink-muted mt-1 leading-snug">No one drafted welcome cards, drift check-ins, or volunteer asks for you. If those went out this week, your team wrote them between everything else. If they didn't go out, they didn't go out.</p>
      </header>
    </section>

    <!-- ── 2.5 Grace's recommendations — what to act on this week ─── -->
    <GraceRecommendations v-if="mode === 'with-grace'" :recommendations="todayRecommendations" />

    <!-- ── 3. Today snapshot + Live activity (merged) ─────────────── -->
    <section class="card overflow-hidden !p-0">
      <!-- Header: Cornerstone pulse stats -->
      <header class="border-b border-divider px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 bg-surface-elevated/40">
        <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Today</span>
        <div class="flex items-baseline gap-1.5">
          <span class="text-lg font-bold tabular-nums text-ink">{{ pulse.attendance_last_sunday }}</span>
          <span class="text-xs text-ink-muted">last Sun</span>
          <span
            class="text-[10px] font-semibold tabular-nums ml-0.5"
            :class="attendanceTrend.isUp ? 'text-success' : 'text-warn'"
          >{{ attendanceTrend.sign }}{{ Math.abs(attendanceTrend.diff) }}</span>
        </div>
        <div class="flex items-baseline gap-1.5">
          <span class="text-lg font-bold tabular-nums text-ink">{{ pulse.visitors_last_sunday }}</span>
          <span class="text-xs text-ink-muted">visitors</span>
        </div>
        <div class="flex items-baseline gap-1.5">
          <span
            class="text-lg font-bold tabular-nums"
            :class="people.at_risk_two_plus_flags > 0 ? 'text-warn' : 'text-ink'"
          >{{ people.at_risk_two_plus_flags }}</span>
          <span class="text-xs text-ink-muted">at-risk</span>
        </div>
        <div class="flex items-baseline gap-1.5">
          <span class="text-lg font-bold tabular-nums text-ink">{{ money(giving.current_month_cents, { compact: true }) }}</span>
          <span class="text-xs text-ink-muted">giving this month</span>
        </div>
      </header>

      <!-- Live activity feed -->
      <div class="px-5 py-4">
        <div class="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
            <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Live</span>
            <span class="text-sm font-semibold text-ink">Recent activity</span>
          </div>
          <span class="text-[11px] text-ink-muted">Grace's stream · auto-updates as work happens</span>
        </div>
        <TransitionGroup
          tag="ul"
          class="relative space-y-1"
          aria-live="polite"
          aria-atomic="false"
          enter-active-class="transition-[opacity,transform,background-color] duration-[280ms] ease-out-quart"
          enter-from-class="opacity-0 -translate-y-3 bg-success/15"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-opacity duration-200 ease-out-quart absolute"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <li
            v-for="ev in liveEvents"
            :key="ev.id"
            class="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-surface-elevated/40 transition-colors duration-200"
          >
            <AdaIcon :name="ev.icon" class="h-4 w-4 text-ink-muted flex-shrink-0 mt-1" />
            <div class="flex-1 min-w-0">
              <div class="text-sm text-ink leading-snug">{{ ev.text }}</div>
              <div class="flex items-center gap-2 mt-1">
                <span
                  v-if="getRole(ev.role)"
                  class="rounded-full bg-brand/10 text-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                >{{ getRole(ev.role)?.name }}</span>
                <span class="text-[11px] text-ink-disabled">{{ fmtLiveAgo(ev.at) }}</span>
              </div>
            </div>
          </li>
        </TransitionGroup>
      </div>
    </section>
  </div>
</template>
