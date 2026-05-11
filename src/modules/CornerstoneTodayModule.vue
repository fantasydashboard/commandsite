<script setup lang="ts">
/**
 * Cornerstone — Today (Grace command bridge).
 *
 * Live operational surface using the shared grace/* components:
 * live ticker → approval queue → command bridge → recent history.
 * The floating chat lives in DashboardLayout (AskAiFloatingButton)
 * and approval-queue actions push acknowledgments into it.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Client } from '@/types/database'
import { todayPulse } from '@/lib/clients/cornerstone/today'
import { givingStats } from '@/lib/clients/cornerstone/giving'
import { peopleStats } from '@/lib/clients/cornerstone/people'
import { graceRoles, ROLE_STATUS_META } from '@/lib/clients/cornerstone/roles'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

const router = useRouter()
function goToRole(tab: string) {
  router.push({ name: 'dashboard.tab', params: { slug: 'cornerstone-church', tab } })
}

defineProps<{ client: Client; config: Record<string, unknown> }>()

const pulse = computed(() => todayPulse())
const giving = computed(() => givingStats())
const people = computed(() => peopleStats())

const attendanceTrend = computed(() => {
  const diff = pulse.value.attendance_last_sunday - pulse.value.attendance_avg_4w
  return { diff, sign: diff >= 0 ? '↑' : '↓', isUp: diff >= 0 }
})

function money(cents: number): string {
  if (cents >= 100_000) return '$' + Math.round(cents / 100_000) + 'k'
  return '$' + Math.round(cents / 100).toLocaleString()
}

const greeting = computed(() => {
  const hr = new Date().getHours()
  if (hr < 12) return 'Good morning, Pastor Mark'
  if (hr < 17) return 'Good afternoon, Pastor Mark'
  return 'Good evening, Pastor Mark'
})

// ── Approval queue items ──────────────────────────────────────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'q-ellison',
    icon: '🎉',
    badge: 'Communications',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Birth congrats note — Ellison Family',
    recipient: 'Marc & Hannah Ellison · baby Ellison born Tue',
    preview: '"Marc and Hannah — saw the news from your small group, congratulations on baby Ellison. Hope the first nights are going as well as they can. Pastor Mark and the whole team are praying for you. We mailed a meal-train signup link to the group so they can rally around you this week. — Grace, on behalf of Pastor Mark"',
    approved_response: 'Done — note printed, posting tomorrow with a hand-signed signature from Pastor Mark. The Ellisons should have it by Friday.',
    ticker_after_approval: 'Mailed congrats note to the Ellisons',
  },
  {
    id: 'q-sullivan',
    icon: '🤝',
    badge: 'Care Triage',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Pastoral check-in — Sullivan Family',
    recipient: 'Drew & Ana Sullivan · 3 red flags · escalated 4d ago',
    preview: '"Drew, Ana — was thinking about you both this week. I know the last few months have been a lot. No agenda here, just wanted to see if a coffee or a call would be helpful. I\'ve got Tuesday afternoon or Friday morning open. — Pastor Mark"',
    approved_response: "Sent. I'll watch for a reply for 48 hrs and let you know either way. If they don't respond, I'll surface it again Wednesday.",
    ticker_after_approval: 'Pastoral check-in sent to the Sullivans',
  },
  {
    id: 'q-maddux',
    icon: '👋',
    badge: 'Guest Follow-Up',
    badgeClass: 'bg-success/15 text-success',
    title: 'Welcome card — Maddux Family',
    recipient: '4th visit Sunday · daughter loves the kids program',
    preview: '"The Maddux Family — thanks so much for joining us again Sunday. Lila told her teacher she can\'t wait to come back, which made everyone\'s day. If you\'re open to it, we\'d love to chat about Newcomers Lunch next month — no pressure either way. — Pastor Mark"',
    approved_response: 'Sent. The Madduxes are now in the day-7 nudge sequence — if no reply by then I\'ll draft another soft touch.',
    ticker_after_approval: 'Welcome card sent to the Maddux Family',
  },
  {
    id: 'q-nursery',
    icon: '🙋',
    badge: 'Volunteer Coord',
    badgeClass: 'bg-accent/15 text-accent',
    title: 'Fill ask — Nursery Sunday 9 AM',
    recipient: '2 spots open · suggesting Mia Pham + Amanda Foster',
    preview: '"Hey Mia — Linda and Aanya are both off this Sunday and we\'re short for the 9 AM nursery slot. You\'ve filled in last-minute before and I really appreciated it. Any chance you\'re free? Totally understand if not. — Pastor Mark (via Grace)"',
    approved_response: 'Pinged both. Planning Center will auto-confirm if either says yes. I\'ll surface the result to you Saturday morning if no one bites.',
    ticker_after_approval: 'Volunteer ask sent — Mia + Amanda for 9 AM nursery',
  },
  {
    id: 'q-hawthorne',
    icon: '💳',
    badge: 'Giving',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Card-update reminder — Hawthorne Family',
    recipient: 'Recurring gift card expired 22d ago · 3-yr giving streak',
    preview: '"The Hawthorne Family — your monthly gift didn\'t process this month because the card on file expired. Whenever you have a moment, here\'s the link to update it. Zero pressure, just wanted to flag it before another cycle slips. Thank you for your faithfulness. — Grace, for Cornerstone"',
    approved_response: 'Sent. I\'ll watch for the card update for 5 days. If they update, I\'ll quietly retry the gift. If not, I\'ll surface it again next Monday.',
    ticker_after_approval: 'Card-update reminder sent to the Hawthornes',
  },
]

// Live ticker seed + pool
const tickerSeed = [
  { icon: '✉️', text: 'Riley opened your welcome text — 11 min ago', ageSec: 11 * 60 },
  { icon: '🎂', text: 'Card #4 mailed for the Hawthorne family', ageSec: 22 * 60 },
  { icon: '📞', text: 'Connect form submitted — Kennedy Park', ageSec: 47 * 60 },
  { icon: '🌱', text: 'Baptism testimony captured — Marcus L.', ageSec: 95 * 60 },
]
const tickerPool = [
  { icon: '✉️', text: 'Newsletter open: 38% (847 recipients)' },
  { icon: '👋', text: 'Connect card submitted — first-time visitor' },
  { icon: '📅', text: 'Sunday volunteer slot auto-confirmed (Parking)' },
  { icon: '🎂', text: 'Birthday card queued for next Monday print run' },
  { icon: '💬', text: 'New small group inquiry — replied with the directory' },
  { icon: '🏡', text: '"We missed you" SMS opened by the Reyes Family' },
  { icon: '📧', text: 'Auto-drafted Sunday recap for review' },
  { icon: '🙋', text: 'Volunteer fill confirmed — Mia Pham accepted' },
]

const tickerRef = ref<InstanceType<typeof GraceLiveTicker> | null>(null)

function onApproved(item: ApprovalQueueItem) {
  if (item.ticker_after_approval) {
    tickerRef.value?.pushEvent({ icon: item.icon, text: item.ticker_after_approval })
  }
}

// ── Recent activity (de-emphasized — collapse-able history) ────────────
interface AutoEvent { icon: string; label: string; detail: string; ago: string; tone: 'success' | 'info' | 'warn' }
const recentHistory: AutoEvent[] = [
  { icon: '👋', label: 'Welcome SMS to Riley Boucher', detail: 'First-time visitor · opened in 11 min', ago: '2h ago', tone: 'success' },
  { icon: '🎂', label: '4 birthday cards mailed', detail: 'Auto-printed Mon AM · posted Tue', ago: '1d ago', tone: 'success' },
  { icon: '🏡', label: '"We missed you" check-in to the Reyes Family', detail: 'Back after a 4-month gap', ago: '3d ago', tone: 'success' },
  { icon: '⚠', label: 'Drift escalation — Sullivan Family', detail: '3rd flag turned red, paged you', ago: '4d ago', tone: 'warn' },
  { icon: '📧', label: 'Sunday newsletter sent', detail: '847 recipients · 38% open · 12% click', ago: '5d ago', tone: 'success' },
]

const historyOpen = ref(false)
</script>

<template>
  <div class="space-y-4 pb-32 relative">
    <GraceLiveTicker ref="tickerRef" :seed="tickerSeed" :pool="tickerPool" />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="8"
      :subtitle="`${greeting}. Approve to send, edit to revise, skip to resurface tomorrow.`"
      @approved="onApproved"
    />

    <!-- ── Command bridge — pulse + roles + KPIs in one panel ────── -->
    <section class="rounded-card overflow-hidden border border-divider bg-surface-raised">
      <header class="px-4 py-3 border-b border-divider bg-canvas/50 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Command bridge</span>
          <span class="text-xs text-ink-muted">— Cornerstone at a glance</span>
        </div>
        <span class="text-[11px] text-ink-disabled">
          {{ graceRoles.filter((r) => r.status === 'active').length }} of {{ graceRoles.length }} of Grace's roles active
        </span>
      </header>

      <div class="grid grid-cols-2 sm:grid-cols-4 divide-x divide-divider/60 border-b border-divider">
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Last Sun</div>
          <div class="flex items-baseline gap-1.5 mt-0.5">
            <span class="text-xl font-bold tabular-nums text-ink">{{ pulse.attendance_last_sunday }}</span>
            <span
              class="text-[11px] font-semibold tabular-nums"
              :class="attendanceTrend.isUp ? 'text-success' : 'text-warn'"
            >{{ attendanceTrend.sign }}{{ Math.abs(attendanceTrend.diff) }}</span>
          </div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Visitors</div>
          <div class="text-xl font-bold tabular-nums text-ink mt-0.5">{{ pulse.visitors_last_sunday }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">At-risk</div>
          <div
            class="text-xl font-bold tabular-nums mt-0.5"
            :class="people.at_risk_two_plus_flags > 0 ? 'text-danger' : 'text-ink'"
          >{{ people.at_risk_two_plus_flags }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Giving (mo)</div>
          <div class="text-xl font-bold tabular-nums text-ink mt-0.5">{{ money(giving.current_month_cents) }}</div>
        </div>
      </div>

      <div class="p-3 flex flex-wrap gap-1.5">
        <button
          v-for="role in graceRoles"
          :key="role.key"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px] hover:border-brand hover:bg-brand/5 transition-colors"
          @click="goToRole(role.tab)"
        >
          <span>{{ role.icon }}</span>
          <span class="font-semibold text-ink">{{ role.name }}</span>
          <span
            class="rounded-full px-1 text-[8px] font-bold uppercase tracking-wider"
            :class="ROLE_STATUS_META[role.status].pillClass"
          >{{ role.status === 'active' ? '●' : ROLE_STATUS_META[role.status].label }}</span>
        </button>
      </div>
    </section>

    <!-- ── Recent history (collapsed by default) ─────────────────── -->
    <section class="rounded-card border border-divider overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas/50 text-left transition-colors"
        @click="historyOpen = !historyOpen"
      >
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Recent history</span>
          <span class="text-xs text-ink-muted">— what Grace handled this week</span>
        </div>
        <span class="text-[11px] text-ink-disabled">
          {{ recentHistory.length }} actions
          <span class="ml-1">{{ historyOpen ? '▲' : '▼' }}</span>
        </span>
      </button>
      <Transition
        enter-active-class="transition-all duration-300 ease-out overflow-hidden"
        enter-from-class="max-h-0 opacity-0"
        enter-to-class="max-h-[400px] opacity-100"
        leave-active-class="transition-all duration-200 ease-in overflow-hidden"
        leave-from-class="max-h-[400px] opacity-100"
        leave-to-class="max-h-0 opacity-0"
      >
        <ul v-if="historyOpen" class="divide-y divide-divider/60 border-t border-divider">
          <li v-for="(e, i) in recentHistory" :key="i" class="flex items-start gap-3 px-4 py-2.5">
            <span class="text-base flex-shrink-0">{{ e.icon }}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-ink">{{ e.label }}</div>
              <div class="text-[11px] text-ink-muted">{{ e.detail }}</div>
            </div>
            <span class="text-[10px] text-ink-disabled flex-shrink-0">{{ e.ago }}</span>
          </li>
        </ul>
      </Transition>
    </section>
  </div>
</template>
