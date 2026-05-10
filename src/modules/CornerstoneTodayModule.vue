<script setup lang="ts">
/**
 * Cornerstone — Today (Grace command bridge).
 *
 * Rebuilt from a status-report dashboard into a live operational
 * surface. Hierarchy:
 *
 *   1. Live activity ticker (top strip — auto-advancing events)
 *   2. Approval queue ("Waiting for your eyes") — the hero. One-click
 *      Approve/Edit/Skip. Cards animate out on action; activity
 *      ticker gets a fresh entry; counter ticks up; Grace chimes in.
 *   3. Command bridge — roles + pulse + KPIs in one tight panel
 *   4. Recent activity history (de-emphasized — what Grace did this
 *      week, useful but not the headline)
 *   5. Persistent Grace chat — floating widget, bottom-right. Always
 *      reachable, doesn't take vertical space.
 */
import { computed, ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import type { Client } from '@/types/database'
import { todayPulse } from '@/lib/clients/cornerstone/today'
import { givingStats } from '@/lib/clients/cornerstone/giving'
import { peopleStats } from '@/lib/clients/cornerstone/people'
import { graceRoles, ROLE_STATUS_META } from '@/lib/clients/cornerstone/roles'

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

// ── Greeting ───────────────────────────────────────────────────────────
const graceGreeting = computed(() => {
  const hr = new Date().getHours()
  if (hr < 12) return 'Good morning, Pastor Mark'
  if (hr < 17) return 'Good afternoon, Pastor Mark'
  return 'Good evening, Pastor Mark'
})

// ── Approval queue (THE hero) ──────────────────────────────────────────
// Each item is something Grace drafted that needs Pastor Mark to approve.
// Acting on one slides it away with an animation + adds a ticker event +
// counter bump + chat acknowledgment from Grace.

type QueueAction = 'approve' | 'edit' | 'skip'
interface QueueItem {
  id: string
  kind: 'card' | 'check_in' | 'volunteer_ask' | 'congrats' | 'reminder'
  icon: string
  badge: string                     // small role tag
  badgeClass: string
  title: string
  recipient: string
  preview: string                   // short paragraph
  full_preview?: string             // shown on hover/expand later
  approved_response: string         // what Grace says in chat after approval
  ticker_after_approval: string     // what shows in ticker after approval
}

const initialQueue: QueueItem[] = [
  {
    id: 'q-ellison',
    kind: 'congrats',
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
    kind: 'check_in',
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
    kind: 'card',
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
    kind: 'volunteer_ask',
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
    kind: 'reminder',
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

const queueItems = ref<QueueItem[]>([...initialQueue])
const recentlyResolved = ref<string[]>([])

// Counter that ticks up visibly as items are resolved
const resolvedThisWeek = ref(8)

// Stats for the queue header
const queueLabel = computed(() => {
  const n = queueItems.value.length
  if (n === 0) return 'All clear — Grace will surface the next batch as it lands'
  return `${n} ${n === 1 ? 'item needs' : 'items need'} your eyes`
})

// ── Toast notifications ────────────────────────────────────────────────
interface Toast { id: number; tone: 'success' | 'info'; text: string }
const toasts = ref<Toast[]>([])
let toastIdCounter = 0

function pushToast(text: string, tone: 'success' | 'info' = 'success') {
  const id = ++toastIdCounter
  toasts.value.push({ id, tone, text })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 4000)
}

// ── Live ticker ────────────────────────────────────────────────────────
// A pool of events that cycle through the strip. New ones get prepended
// when actions happen; old ones decay off the end.
interface TickerEvent { id: number; icon: string; text: string; ageSec: number }
let tickerIdCounter = 0
const ticker = ref<TickerEvent[]>([
  { id: ++tickerIdCounter, icon: '✉️', text: 'Riley opened your welcome text — 11 min ago', ageSec: 11 * 60 },
  { id: ++tickerIdCounter, icon: '🎂', text: 'Card #4 mailed for the Hawthorne family', ageSec: 22 * 60 },
  { id: ++tickerIdCounter, icon: '📞', text: 'Connect form submitted — Kennedy Park', ageSec: 47 * 60 },
  { id: ++tickerIdCounter, icon: '🌱', text: 'Baptism testimony captured — Marcus L.', ageSec: 95 * 60 },
])

// Pool of "fresh" events that cycle in periodically to feel alive
const freshEventPool: { icon: string; text: string }[] = [
  { icon: '✉️', text: 'Newsletter open: 38% (847 recipients)' },
  { icon: '👋', text: 'Connect card submitted — first-time visitor' },
  { icon: '📅', text: 'Sunday volunteer slot auto-confirmed (Parking)' },
  { icon: '🎂', text: 'Birthday card queued for next Monday print run' },
  { icon: '💬', text: 'New small group inquiry — replied with the directory' },
  { icon: '🏡', text: '"We missed you" SMS opened by the Reyes Family' },
  { icon: '📧', text: 'Auto-drafted Sunday recap for review' },
  { icon: '🙋', text: 'Volunteer fill confirmed — Mia Pham accepted' },
]
let nextFreshIndex = 0

function ageString(sec: number): string {
  if (sec < 60) return 'just now'
  if (sec < 60 * 60) return `${Math.floor(sec / 60)}m ago`
  if (sec < 60 * 60 * 24) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

// Tick the ages every second so "just now" → "1m ago" → "2m ago" etc.
let agingInterval: ReturnType<typeof setInterval> | null = null
let driftInterval: ReturnType<typeof setInterval> | null = null

function startTicker() {
  agingInterval = setInterval(() => {
    for (const t of ticker.value) t.ageSec += 1
  }, 1000)
  // Every 8-12s, drop in a fresh event at the front + drop the oldest
  driftInterval = setInterval(() => {
    const fresh = freshEventPool[nextFreshIndex % freshEventPool.length]
    nextFreshIndex++
    ticker.value.unshift({ id: ++tickerIdCounter, icon: fresh.icon, text: fresh.text, ageSec: 0 })
    if (ticker.value.length > 6) ticker.value.pop()
  }, 9000)
}

function stopTicker() {
  if (agingInterval) clearInterval(agingInterval)
  if (driftInterval) clearInterval(driftInterval)
}

onMounted(startTicker)
onBeforeUnmount(stopTicker)

// ── Queue actions ──────────────────────────────────────────────────────
const processingId = ref<string | null>(null)

async function actOnQueueItem(item: QueueItem, action: QueueAction) {
  if (processingId.value) return
  processingId.value = item.id

  // Brief flash before slide-out (approval)
  if (action === 'approve') {
    recentlyResolved.value.push(item.id)
  }

  await new Promise((r) => setTimeout(r, 350))  // let the success flash play

  // Remove the card from the queue (TransitionGroup handles the slide-out animation)
  queueItems.value = queueItems.value.filter((q) => q.id !== item.id)
  recentlyResolved.value = recentlyResolved.value.filter((id) => id !== item.id)

  if (action === 'approve') {
    resolvedThisWeek.value++
    // Drop a live ticker event
    ticker.value.unshift({
      id: ++tickerIdCounter,
      icon: item.icon,
      text: item.ticker_after_approval,
      ageSec: 0,
    })
    if (ticker.value.length > 6) ticker.value.pop()
    pushToast('✓ Done — Grace just sent it')
    // Grace chimes in via chat after a short delay
    setTimeout(() => {
      addGraceMessage(item.approved_response)
      // If chat is closed, badge it
      if (!chatOpen.value) chatUnread.value++
    }, 900)
  } else if (action === 'edit') {
    // For edit, we'd open an edit form. For demo, just toast.
    pushToast('Opened for editing — your changes will go into the queue', 'info')
  } else if (action === 'skip') {
    pushToast('Skipped — Grace will resurface this in 24 hrs', 'info')
  }

  processingId.value = null
}

// ── Persistent Grace chat (floating widget) ────────────────────────────
interface ChatMessage { role: 'user' | 'grace'; text: string; ts: number }

const chatOpen = ref(false)
const chatUnread = ref(0)
const chatMessages = ref<ChatMessage[]>([
  {
    role: 'grace',
    text: "Hi Pastor Mark — I'm here. Ask me anything, or just clear the queue and I'll narrate as we go.",
    ts: Date.now(),
  },
])
const customQuestion = ref('')
const chatScrollEl = ref<HTMLElement | null>(null)
const graceTyping = ref(false)

interface SuggestedQuestion { q: string; a: string }
const suggestedQuestions: SuggestedQuestion[] = [
  {
    q: 'Who visited for the first time this week?',
    a: "Three first-time visitors Sunday — Riley Boucher (came alone, mentioned work has been lonely), Kennedy Park (second visit, filled out the connect card), and the Maddux Family (4th visit + Newcomers Lunch — daughter loves the kids program). I sent Riley a welcome text Sunday afternoon (she opened it in 11 minutes). The Maddux welcome card is in your queue right now.",
  },
  {
    q: "Who haven't we connected with in a while?",
    a: "Three families I'd surface: The Sullivans (4 weeks no kids attendance, gift cancelled, Casey stepped off hospitality — pastoral check-in is in your queue), the Whitakers (2 flags red, kids missed 3 of last 4 Sundays), and the Reyes Family (just back after a 4-month gap — be warm but no pressure).",
  },
  {
    q: "How's giving this month?",
    a: "$28,420 so far this month, on pace for ~$36k by month-end. Down ~5% vs same week last month, but two big Building Fund gifts are scheduled to clear next week. Five households flagged on stopped giving — the Hawthorne card-update reminder is in your queue.",
  },
  {
    q: 'Who needs care this week?',
    a: "Two urgent: James Foster's father passed Sunday (funeral Friday at 10 AM — meal train already coordinated through their small group), and the Sullivan family pastoral check-in (in your queue). Eight other open cases, six in 'awaiting response.' I closed 14 cases over the last 30 days.",
  },
  {
    q: "Who's serving Sunday?",
    a: "Most slots filled — the Worship Team is solid (Jess leading, Marcus on bass, Holloway on backing vocals), Kids Ministry is healthy. Two gaps: Nursery (9 AM) is short 2 — that fill ask is in your queue right now. Parking Team (11 AM) is short 1.",
  },
]

function addGraceMessage(text: string) {
  // Show "typing..." for a beat first
  graceTyping.value = true
  nextTick(scrollChatToBottom)
  setTimeout(() => {
    graceTyping.value = false
    chatMessages.value.push({ role: 'grace', text, ts: Date.now() })
    nextTick(scrollChatToBottom)
  }, 700)
}

async function askSuggested(q: SuggestedQuestion) {
  chatMessages.value.push({ role: 'user', text: q.q, ts: Date.now() })
  await nextTick()
  scrollChatToBottom()
  addGraceMessage(q.a)
}

async function askCustom() {
  const text = customQuestion.value.trim()
  if (!text) return
  chatMessages.value.push({ role: 'user', text, ts: Date.now() })
  customQuestion.value = ''
  await nextTick()
  scrollChatToBottom()
  addGraceMessage("Let me check on that. Give me a moment to pull what I have for the team — I'll draft something for your review and queue it on the right page.")
}

function scrollChatToBottom() {
  if (chatScrollEl.value) {
    chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight
  }
}

function toggleChat() {
  chatOpen.value = !chatOpen.value
  if (chatOpen.value) {
    chatUnread.value = 0
    nextTick(scrollChatToBottom)
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
    <!-- ── Toasts (top-right) ───────────────────────────────────────── -->
    <Teleport to="body">
      <div class="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        <TransitionGroup
          tag="div"
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 -translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-300 ease-out absolute"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-2"
        >
          <div
            v-for="t in toasts"
            :key="t.id"
            class="rounded-lg shadow-lg px-4 py-3 text-sm font-medium pointer-events-auto"
            :class="t.tone === 'success' ? 'bg-success text-white' : 'bg-brand text-white'"
          >{{ t.text }}</div>
        </TransitionGroup>
      </div>
    </Teleport>

    <!-- ── 1. LIVE ACTIVITY TICKER ──────────────────────────────────── -->
    <section class="rounded-card border border-brand/20 bg-surface-raised overflow-hidden">
      <div class="flex items-center gap-3 px-4 py-2.5 border-b border-divider/60 bg-gradient-to-r from-brand/5 to-transparent">
        <div class="flex items-center gap-1.5">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
          </span>
          <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Live</span>
        </div>
        <span class="text-[11px] text-ink-muted">Grace's activity stream — auto-updates</span>
      </div>
      <ul class="divide-y divide-divider/40">
        <TransitionGroup
          tag="div"
          enter-active-class="transition-all duration-500 ease-out"
          enter-from-class="opacity-0 -translate-y-3 bg-success/10"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-opacity duration-300"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <li
            v-for="(ev, idx) in ticker.slice(0, 5)"
            :key="ev.id"
            class="flex items-center gap-3 px-4 py-2"
            :class="idx === 0 && ev.ageSec < 5 ? 'bg-success/5' : ''"
          >
            <span class="text-base flex-shrink-0">{{ ev.icon }}</span>
            <span class="flex-1 text-sm text-ink truncate">{{ ev.text }}</span>
            <span
              class="text-[10px] font-mono tabular-nums flex-shrink-0"
              :class="ev.ageSec < 5 ? 'text-success font-bold' : 'text-ink-disabled'"
            >{{ ageString(ev.ageSec) }}</span>
          </li>
        </TransitionGroup>
      </ul>
    </section>

    <!-- ── 2. APPROVAL QUEUE — THE HERO ─────────────────────────────── -->
    <section class="rounded-card border-2 border-brand/40 bg-gradient-to-br from-brand/5 to-surface overflow-hidden">
      <header class="flex items-start justify-between gap-3 px-5 py-4 bg-brand/10 border-b border-brand/20 flex-wrap">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white text-lg font-bold flex-shrink-0">
            G
          </div>
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">
              Waiting for your eyes
            </div>
            <h2 class="text-lg font-bold text-ink leading-tight">{{ queueLabel }}</h2>
            <p class="text-xs text-ink-muted mt-0.5">
              {{ graceGreeting }}. Approve to send, edit to revise, skip to resurface tomorrow.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3 text-right">
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Resolved this week</div>
            <div class="text-2xl font-bold text-success tabular-nums">{{ resolvedThisWeek }}</div>
          </div>
        </div>
      </header>

      <!-- Queue cards -->
      <TransitionGroup
        tag="div"
        class="divide-y divide-brand/10"
        enter-active-class="transition-all duration-400 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-400 ease-out absolute w-full"
        leave-from-class="opacity-100 translate-x-0"
        leave-to-class="opacity-0 translate-x-32"
        move-class="transition-transform duration-300 ease-out"
      >
        <article
          v-for="item in queueItems"
          :key="item.id"
          class="px-5 py-4 flex items-start gap-4 transition-colors duration-300 relative"
          :class="recentlyResolved.includes(item.id) ? 'bg-success/15' : 'bg-transparent'"
        >
          <div class="text-2xl flex-shrink-0 mt-0.5">{{ item.icon }}</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span
                class="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                :class="item.badgeClass"
              >{{ item.badge }}</span>
              <h3 class="text-sm font-semibold text-ink">{{ item.title }}</h3>
            </div>
            <p class="text-[11px] text-ink-muted mb-2">{{ item.recipient }}</p>
            <div class="rounded-md bg-surface-raised border border-divider px-3 py-2.5 text-[12.5px] leading-relaxed text-ink italic">
              {{ item.preview }}
            </div>
          </div>
          <div class="flex flex-col gap-1.5 flex-shrink-0 w-24">
            <button
              type="button"
              class="rounded-md bg-success text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all hover:scale-105"
              :disabled="processingId === item.id"
              @click="actOnQueueItem(item, 'approve')"
            >
              {{ processingId === item.id ? '✓' : 'Approve' }}
            </button>
            <button
              type="button"
              class="rounded-md border border-brand/40 text-brand bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-brand/10 disabled:opacity-50"
              :disabled="processingId === item.id"
              @click="actOnQueueItem(item, 'edit')"
            >Edit</button>
            <button
              type="button"
              class="rounded-md text-[11px] text-ink-muted hover:text-ink py-1"
              :disabled="processingId === item.id"
              @click="actOnQueueItem(item, 'skip')"
            >Skip</button>
          </div>
        </article>
      </TransitionGroup>

      <!-- Empty state when queue is cleared -->
      <div v-if="queueItems.length === 0" class="px-5 py-10 text-center">
        <div class="text-4xl mb-2">✨</div>
        <p class="text-sm font-semibold text-ink">All clear</p>
        <p class="text-xs text-ink-muted mt-1">
          Grace will surface the next batch as it lands. {{ resolvedThisWeek }} resolved this week.
        </p>
      </div>
    </section>

    <!-- ── 3. COMMAND BRIDGE — pulse + roles + KPIs in one panel ────── -->
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

      <!-- Pulse strip (compressed) -->
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

      <!-- Role chips -->
      <div class="p-3 flex flex-wrap gap-1.5">
        <button
          v-for="role in graceRoles"
          :key="role.key"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px] hover:border-brand hover:bg-brand/5 transition-colors group"
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

    <!-- ── 4. RECENT HISTORY (collapsed by default) ─────────────────── -->
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

    <!-- ── 5. PERSISTENT GRACE — floating chat widget ───────────────── -->
    <Teleport to="body">
      <div class="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        <!-- Expanded chat panel -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 translate-y-4 scale-95"
          enter-to-class="opacity-100 translate-y-0 scale-100"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="opacity-100 translate-y-0 scale-100"
          leave-to-class="opacity-0 translate-y-4 scale-95"
        >
          <div
            v-if="chatOpen"
            class="w-[360px] sm:w-[400px] max-w-[calc(100vw-3rem)] rounded-2xl bg-surface shadow-2xl border border-divider overflow-hidden flex flex-col"
            style="height: min(560px, calc(100vh - 8rem))"
          >
            <!-- Header -->
            <div class="flex items-center gap-3 bg-gradient-to-r from-brand to-brand/80 text-white px-4 py-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-base font-bold ring-2 ring-white/30">
                G
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-semibold">Grace</span>
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
                  <span class="text-[10px] opacity-80">Online</span>
                </div>
                <div class="text-[11px] opacity-80 truncate">your AI ministry assistant</div>
              </div>
              <button
                type="button"
                class="text-white/80 hover:text-white text-xl leading-none px-2"
                @click="toggleChat"
                aria-label="Close chat"
              >×</button>
            </div>

            <!-- Messages -->
            <div ref="chatScrollEl" class="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-canvas/40">
              <div
                v-for="(m, i) in chatMessages"
                :key="i"
                class="flex"
                :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
              >
                <div
                  class="max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed"
                  :class="m.role === 'user'
                    ? 'bg-ink text-white rounded-br-sm'
                    : 'bg-surface-raised text-ink border border-divider rounded-bl-sm'"
                >{{ m.text }}</div>
              </div>
              <!-- Typing indicator -->
              <div v-if="graceTyping" class="flex justify-start">
                <div class="bg-surface-raised text-ink-muted border border-divider rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm flex gap-1">
                  <span class="h-1.5 w-1.5 bg-ink-muted rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                  <span class="h-1.5 w-1.5 bg-ink-muted rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                  <span class="h-1.5 w-1.5 bg-ink-muted rounded-full animate-bounce" style="animation-delay: 300ms"></span>
                </div>
              </div>
            </div>

            <!-- Suggested questions -->
            <div class="border-t border-divider bg-surface-raised px-3 py-2">
              <div class="text-[9px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">Try asking</div>
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="(q, i) in suggestedQuestions"
                  :key="i"
                  type="button"
                  class="rounded-full border border-divider bg-surface px-2 py-0.5 text-[10px] font-medium text-ink-muted hover:text-brand hover:border-brand transition-colors"
                  @click="askSuggested(q)"
                >{{ q.q }}</button>
              </div>
            </div>

            <!-- Input -->
            <form
              class="flex items-center gap-2 border-t border-divider bg-surface-raised px-3 py-2"
              @submit.prevent="askCustom"
            >
              <input
                v-model="customQuestion"
                type="text"
                placeholder="Ask Grace anything..."
                class="flex-1 rounded-full border border-divider bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-ink-disabled focus:outline-none focus:border-brand"
              />
              <button
                type="submit"
                class="rounded-full bg-brand text-white px-3 py-1.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                :disabled="!customQuestion.trim()"
              >Send</button>
            </form>
          </div>
        </Transition>

        <!-- Floating button (always visible) -->
        <button
          type="button"
          class="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-2xl hover:scale-105 transition-transform group"
          :class="chatOpen ? 'ring-4 ring-brand/30' : ''"
          @click="toggleChat"
          aria-label="Open Grace chat"
        >
          <span class="text-2xl font-bold">G</span>
          <!-- Online dot -->
          <span class="absolute bottom-1 right-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-surface"></span>
          <!-- Unread badge -->
          <span
            v-if="chatUnread > 0 && !chatOpen"
            class="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-surface"
          >{{ chatUnread }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>
