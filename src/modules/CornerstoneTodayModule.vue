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
// Ordered by URGENCY, not by chronological order. The pastor opening
// this in the morning sees the most-pressing items first: grief
// support, then escalated care, then time-sensitive guest follow-up.
// Birth congrats + giving notes + volunteer coordination sit at the
// bottom — they're real work but can wait a day if needed.
const queueItems: ApprovalQueueItem[] = [
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
    id: 'q-sullivan',
    role: 'care_triage',
    icon: 'referral_hunter',
    badge: 'Care Triage',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Pastoral check-in — Sullivan Family',
    recipient: 'Drew & Ana Sullivan · 3 red flags · escalated 4d ago',
    preview: '"Drew, Ana, was thinking about you both this week. I know the last few months have been a lot. No agenda here, just wanted to see if a coffee or a call would be helpful. I\'ve got Tuesday afternoon or Friday morning open. — Pastor"',
    approved_response: "Sent. I'll watch for a reply for 48 hrs and let you know either way. If they don't respond, I'll surface it again Wednesday.",
    ticker_after_approval: 'Pastoral check-in sent to the Sullivans',
  },
  {
    id: 'q-maddux',
    role: 'guest_followup',
    icon: 'qa_assistant',
    badge: 'Guest Follow-Up',
    badgeClass: 'bg-success/15 text-success',
    title: 'Welcome card — Maddux Family',
    recipient: '4th visit Sunday · daughter loves the kids program',
    preview: '"The Maddux Family, thanks so much for joining us again Sunday. Lila told her teacher she can\'t wait to come back, which made everyone\'s day. If you\'re open to it, we\'d love to chat about Newcomers Lunch next month, no pressure either way. — Pastor"',
    approved_response: 'Sent. The Madduxes are now in the day-7 nudge sequence. If no reply by then I\'ll draft another soft touch.',
    ticker_after_approval: 'Welcome card sent to the Maddux Family',
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
const liveSeed: LiveEvent[] = [
  seedEvent(11 * 60,  'email_marketing', 'Riley opened your welcome text', 'communications'),
  seedEvent(22 * 60,  'check-circle',    'Card #4 mailed for the Hawthorne family', 'communications'),
  seedEvent(47 * 60,  'front_desk',      'Connect form submitted — Kennedy Park', 'front_desk'),
  seedEvent(95 * 60,  'review_engine',   'Baptism testimony captured — Marcus L.', 'stories'),
]
const livePool: PoolEvent[] = [
  { icon: 'email_marketing', text: 'Newsletter open: 38% (847 recipients)',                role: 'communications' },
  { icon: 'qa_assistant',    text: 'Connect card submitted — first-time visitor',          role: 'guest_followup' },
  { icon: 'calendar',        text: 'Sunday volunteer slot auto-confirmed (Parking)',       role: 'volunteer_coord' },
  { icon: 'check-circle',    text: 'Birthday card queued for next Monday print run',       role: 'communications' },
  { icon: 'qa_assistant',    text: 'New small group inquiry — replied with the directory', role: 'guest_followup' },
  { icon: 'reactivation',    text: '"We missed you" SMS opened by the Reyes Family',       role: 'reengagement' },
  { icon: 'email_marketing', text: 'Auto-drafted Sunday recap for review',                 role: 'communications' },
  { icon: 'calendar',        text: 'Volunteer fill confirmed — Mia Pham accepted',         role: 'volunteer_coord' },
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
</script>

<template>
  <div class="space-y-4">
    <!-- ── 1. Grace at Work hub — value-prop hero ─────────────────── -->
    <AdaAtWorkHub
      :roles="graceRoles"
      assistant-name="Grace"
      @role-click="onRoleClick"
    />

    <!-- ── 2. Approval queue — Grace's drafts awaiting pastoral sign-off ─ -->
    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="8"
      :subtitle="`${greeting}. Co-sign to send, edit to revise, skip to resurface tomorrow.`"
      @approved="onApproved"
    />

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
