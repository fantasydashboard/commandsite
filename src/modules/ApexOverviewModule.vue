<script setup lang="ts">
/**
 * Apex Heating & Air — Today page.
 *
 * The "what needs me / what's Ada done / what's happening" surface.
 * Deep analytics (donut, calls captured chart, quote-followup bar,
 * revenue recovered) live on the Insights tab, not here.
 *
 * Order is deliberate (top → bottom):
 *   1. Ada at Work hub                ← value-prop hero
 *   2. Approval queue                 ← things waiting on Brett
 *   3. Ask Ada chat                   ← Q&A Assistant surface (Tier 3 agent loop)
 *   4. Today snapshot + Live feed     ← merged: today's numbers as header,
 *                                       auto-updating activity feed below
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { Client } from '@/types/database'
import { adaRoles, getRole, type AdaRole } from '@/lib/clients/apex/roles'
import { recentActivity } from '@/lib/clients/apex/recentActivity'
import type { RecentActivityEvent } from '@/lib/clients/apex/types'
import AdaAtWorkHub from '@/components/ada/AdaAtWorkHub.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'
import { money, fmtAgo } from '@/lib/format'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const router = useRouter()
const route = useRoute()

// Hide the inner demo banner when DashboardLayout already shows a
// per-prospect banner (?demo_company=…).
const isCustomDemo = computed(() => typeof route.query.demo_company === 'string')

function onRoleClick(role: AdaRole) {
  router.push({
    name: 'dashboard.tab',
    params: { slug: 'apex-heating-and-air', tab: role.tab },
    hash: `#${role.key}`,
  })
}

const greeting = computed(() => {
  const hr = new Date().getHours()
  if (hr < 12) return `Good morning, Brett`
  if (hr < 17) return `Good afternoon, Brett`
  return `Good evening, Brett`
})

// ── Approval queue: Ada's drafts waiting on Brett ─────────────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'ovw-riverpoint',
    role: 'quote_followup',
    icon: 'qa_assistant',
    badge: 'Quote follow-up',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Stale quote nudge — Riverpoint Condos ($14,800)',
    recipient: 'Commercial RTU replace · sent 11 days ago · opened twice',
    preview: '"Hey Tom — circling back on the proposal we sent for the rooftop unit. Saw it got opened a couple times so I figured I\'d check in. Happy to walk through the line items, swap parts for budget options, or just answer questions. No pressure — just want to make sure it didn\'t get lost in the inbox. — Brett, Apex Heating & Air"',
    approved_response: "Sent. Tom usually replies within a day on a soft nudge. If he doesn't bite by Wed, I'll surface the deal as cooled and we can decide whether to drop the price or close it out.",
    ticker_after_approval: 'Riverpoint nudge sent — $14,800 RTU opportunity',
  },
  {
    id: 'ovw-castellanos-apology',
    role: 'review_engine',
    icon: 'review_engine',
    badge: 'Review reply',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Apology reply — Jim Castellanos 3★ review',
    recipient: 'Tech was 40 min late + didn\'t call ahead · before this goes live',
    preview: '"Jim — Brett here, owner at Apex. You\'re right — we missed on the heads-up call and that\'s on us. I\'ve talked with the tech and we\'re tightening up the dispatch routing so this doesn\'t happen again. I\'d like to credit your next service call to make it right if you\'ll give us another shot. Either way, thanks for the honest feedback. — Brett"',
    approved_response: 'Posted to Google. Reviews with owner replies (especially humble ones on negative reviews) get 3.4× more positive engagement than ones without. Watching for a follow-up reply from Jim.',
    ticker_after_approval: 'Apology reply posted to Castellanos 3★ review',
  },
  {
    id: 'ovw-hendersons-tuneup',
    role: 'reactivation',
    icon: 'reactivation',
    badge: 'Reactivation',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Tune-up reminder — The Hendersons',
    recipient: 'Recurring AC tune-up overdue 6 wks · normally schedule Mar',
    preview: '"Hi Henderson Family — Ada here from Apex. Noticed your spring AC tune-up usually lands in March and we hadn\'t heard from you yet — wanted to flag it before the heat really hits. Want me to grab you a slot this week? I have Tue and Thu morning open. — Ada (for Brett at Apex)"',
    approved_response: 'Sent. The Hendersons are in the "easy yes" tier — they\'ve booked every spring + fall tune-up for 4 years. If they don\'t respond by Friday I\'ll surface them again as soft re-engage.',
    ticker_after_approval: 'Tune-up reminder sent to the Hendersons',
  },
  {
    id: 'ovw-coronado',
    role: 'reactivation',
    icon: 'building',
    badge: 'Replace opportunity',
    badgeClass: 'bg-success/15 text-success',
    title: 'Replace-job outreach — Coronado Property Mgmt',
    recipient: '3 service calls in 60d · last tech notes: "system at end of life"',
    preview: '"Hey Marcus — Brett at Apex. Saw the recent service tickets on the building 2 unit and Tony\'s notes flagged it as nearing end of life. Before another emergency call eats your weekend, want to grab 30 min and walk through replacement options? No obligation — just want to give you the budget picture for next year. — Brett"',
    approved_response: "Sent. Property managers usually bite on the budget framing — saves them a board explanation. I'll surface his reply within the hour and route to your calendar if he wants the walkthrough.",
    ticker_after_approval: 'Replace-job outreach sent to Coronado Property',
  },
  {
    id: 'ovw-marie-review',
    role: 'review_engine',
    icon: 'review_engine',
    badge: 'Review request',
    badgeClass: 'bg-success/15 text-success',
    title: 'Review request — Maria Chen (yesterday\'s job)',
    recipient: 'New thermostat install · Tony was the tech · Maria mentioned thank-you in passing',
    preview: '"Hi Maria — thanks for letting Tony come out yesterday. He mentioned how patient you were while he walked through the thermostat options, which I really appreciate. If you\'re happy with how it\'s running, would you mind dropping a quick Google review? Two clicks: [link]. No pressure either way. — Brett, Apex"',
    approved_response: "Sent. Day-after timing has the highest review-conversion rate (~38% for residential). Tony's a tech customers consistently call out by name — I'd expect a 5★.",
    ticker_after_approval: 'Review request sent to Maria Chen',
  },
]

// ── Live-updating activity feed ────────────────────────────────────────
// Seeded from the static recentActivity list, then auto-grows on a drift
// interval that pulls fresh events from the pool. Pauses when the tab is
// hidden (saves cycles + prevents timestamp jumps when user returns).
// On real deployments this gets replaced with a Supabase Realtime
// subscription — the simulated drift is what the DEMO shows; the live
// feel ports straight to real data without UI changes.
interface PoolActivity {
  kind: RecentActivityEvent['kind']
  role: string
  text: string
}
const activityPool: PoolActivity[] = [
  { kind: 'call',         role: 'front_desk',       text: 'Caught a call — service times question, info text sent' },
  { kind: 'dispatch',     role: 'schedule_coord',   text: 'Service slot auto-confirmed for tomorrow PM' },
  { kind: 'dispatch',     role: 'schedule_coord',   text: 'Tech dispatched — Marcus en-route to Coronado' },
  { kind: 'review',       role: 'review_engine',    text: 'Review request opened — clicked through to Google' },
  { kind: 'quote',        role: 'quote_followup',   text: 'Quote sent — residential AC replace, $4,200' },
  { kind: 'reactivation', role: 'reactivation',     text: 'Reactivation reply — dormant customer wants tune-up' },
  { kind: 'call',         role: 'deal_won_handoff', text: 'Job complete — invoice sent + welcome message queued' },
  { kind: 'call',         role: 'front_desk',       text: 'After-hours emergency caught — overflow line, escalated' },
]

const liveActivity = ref<RecentActivityEvent[]>([...recentActivity])

let nextPoolIndex = 0
function newEventId(): string {
  return `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function pushLiveActivity(p: PoolActivity) {
  const event: RecentActivityEvent = {
    id: newEventId(),
    at: new Date().toISOString(),
    kind: p.kind,
    role: p.role,
    text: p.text,
  }
  // Prepend; cap at 20 so the list doesn't grow forever during long sessions.
  liveActivity.value = [event, ...liveActivity.value].slice(0, 20)
}

const DRIFT_MS = 15_000
let driftInterval: ReturnType<typeof setInterval> | null = null

function startDrift() {
  if (driftInterval) return
  driftInterval = setInterval(() => {
    if (activityPool.length === 0) return
    const next = activityPool[nextPoolIndex % activityPool.length]
    nextPoolIndex++
    pushLiveActivity(next)
  }, DRIFT_MS)
}
function stopDrift() {
  if (driftInterval) {
    clearInterval(driftInterval)
    driftInterval = null
  }
}
function onVisibility() {
  if (document.visibilityState === 'visible') startDrift()
  else stopDrift()
}

// Reactive tick used by fmtAgo so "just now → 1m ago → 2m ago" updates
// without re-fetching anything.
const nowTick = ref(0)
let tickInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  startDrift()
  document.addEventListener('visibilitychange', onVisibility)
  tickInterval = setInterval(() => { nowTick.value++ }, 60_000)
})
onBeforeUnmount(() => {
  stopDrift()
  document.removeEventListener('visibilitychange', onVisibility)
  if (tickInterval) clearInterval(tickInterval)
})

// When the owner approves a queue item, surface it immediately in the
// live activity stream so the work feels reflected. Today uses an inline
// `pushLiveActivity` (matches the structure of `liveActivity` ref) rather
// than the composable's `pushEvent` — the two are interchangeable in
// intent, but the inline version maps to this module's RecentActivityEvent
// shape (kind field). Migrating Today to the composable is on the backlog.
function onApproved(item: ApprovalQueueItem) {
  if (!item.ticker_after_approval) return
  const role = item.role ?? 'front_desk'
  const kind: RecentActivityEvent['kind'] =
    role === 'review_engine' ? 'review' :
    role === 'reactivation' ? 'reactivation' :
    role === 'quote_followup' ? 'quote' :
    role === 'schedule_coord' ? 'dispatch' :
    'call'
  pushLiveActivity({ kind, role, text: item.ticker_after_approval })
}

// ── Today pulse strip ───────────────────────────────────────────────────
const today = {
  calls: 11,
  booked: 3,
  revenue_cents: 124_700,
  on_call_tech: 'Marcus Reyes',
  on_call_status: 'available',
} as const

// ── Ask Ada chat (Q&A Assistant role surface) ─────────────────────────
// Demo chat panel — Tier 3 agent loop in marketing form. Real LLM wiring
// is separate work; this surface lets prospects see the "she's a coworker"
// moment land. Sample exchange + suggested questions + input.
interface ChatMessage {
  role: 'user' | 'ada'
  text: string
  label: string
}
const chat = ref<ChatMessage[]>([
  {
    role: 'user',
    label: 'Brett · earlier',
    text: 'Which customers haven\'t I followed up with this week?',
  },
  {
    role: 'ada',
    label: 'Ada · earlier',
    text: 'Three: Riverpoint Condos ($14,800 quote, 11 days stale), Patterson residential ($2,400 furnace, day 7), and Coronado Property (3 service calls in 60 days — Tony\'s notes flagged the system as end-of-life). I\'ve drafted nudges for all three. They\'re sitting in your queue above.',
  },
])
const chatSuggestions = [
  "What's our close rate on quotes over $5k this month?",
  'Which lead source is paying off the most?',
  "How much time have you saved me this week?",
  'Schedule a tune-up for the Hendersons',
]
const chatInput = ref('')
const chatThinking = ref(false)

function askAda(question: string) {
  if (!question.trim()) return
  chat.value.push({ role: 'user', label: 'Brett · just now', text: question })
  chatInput.value = ''
  chatThinking.value = true
  // Simulated response — real LLM wiring comes later (Tier 3 agent loop).
  setTimeout(() => {
    chat.value.push({
      role: 'ada',
      label: 'Ada · just now',
      text: 'On it — pulling the data now. I\'ll surface the answer right here in a moment.',
    })
    chatThinking.value = false
  }, 900)
}

function submitChat() {
  askAda(chatInput.value.trim())
}

// ── Helpers ────────────────────────────────────────────────────────────


function activityIcon(kind: string): string {
  if (kind === 'call') return '📞'
  if (kind === 'quote') return '💬'
  if (kind === 'review') return '⭐'
  if (kind === 'reactivation') return '🔁'
  if (kind === 'dispatch') return '🚐'
  return '·'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Demo mode banner — hidden when DashboardLayout's custom
         per-prospect banner is already showing -->
    <div
      v-if="!isCustomDemo"
      class="rounded-card bg-accent/10 border border-accent/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
    >
      <div class="text-sm text-ink">
        <span class="font-semibold">Demo mode:</span>
        Sample data for Apex Heating & Air — illustrating what CommandSite looks like for a home-services business.
      </div>
      <a href="#" class="text-xs text-brand font-semibold hover:underline">Book a real walkthrough →</a>
    </div>

    <!-- ── 1. Ada at Work hub — the value-prop hero ───────────────── -->
    <AdaAtWorkHub :roles="adaRoles" owner-name="Brett" @role-click="onRoleClick" />

    <!-- ── 2. Approval queue — Ada's drafts waiting on Brett ─────── -->
    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="11"
      assistant-name="Ada"
      :push-approved-to-chat="false"
      :subtitle="`${greeting}. Co-sign to send, edit to revise, skip to resurface tomorrow.`"
      @approved="onApproved"
    />

    <!-- ── 3. Ask Ada chat — the Q&A Assistant surface ────────────── -->
    <section id="qa_assistant" class="card overflow-hidden !p-0 scroll-mt-24">
      <header class="px-5 py-3 border-b border-divider bg-surface-elevated/40 flex items-center gap-2 flex-wrap">
        <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Ask Ada</span>
        <span class="text-[11px] text-ink-muted">she knows your customers, jobs, pipeline, and history</span>
        <span class="ml-auto rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">Available 24/7</span>
      </header>

      <!-- Conversation -->
      <div class="px-5 py-4 space-y-3 max-h-[360px] overflow-y-auto">
        <div
          v-for="(msg, i) in chat"
          :key="i"
          class="flex"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div class="max-w-[80%]">
            <div
              class="rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
              :class="msg.role === 'user'
                ? 'bg-brand text-ink-inverse rounded-tr-sm'
                : 'bg-surface-elevated/60 text-ink rounded-tl-sm border border-divider/60'"
            >{{ msg.text }}</div>
            <div
              class="text-[10px] text-ink-disabled mt-1"
              :class="msg.role === 'user' ? 'text-right' : 'text-left'"
            >{{ msg.label }}</div>
          </div>
        </div>
        <div v-if="chatThinking" class="flex justify-start">
          <div class="rounded-2xl rounded-tl-sm bg-surface-elevated/60 border border-divider/60 px-4 py-2.5 text-sm text-ink-muted italic">
            Ada is thinking…
          </div>
        </div>
      </div>

      <!-- Suggested questions -->
      <div class="px-5 pb-3 flex flex-wrap gap-1.5">
        <button
          v-for="s in chatSuggestions"
          :key="s"
          type="button"
          class="rounded-full border border-divider bg-surface px-3 py-1 text-[11px] text-ink-muted hover:border-brand hover:text-brand hover:bg-brand/5 transition-[transform,color,border-color,background-color] duration-150 ease-out-quart active:scale-[0.97]"
          @click="askAda(s)"
        >{{ s }}</button>
      </div>

      <!-- Input -->
      <form class="px-5 py-3 border-t border-divider flex items-center gap-2" @submit.prevent="submitChat">
        <label for="ask-ada-input" class="sr-only">Ask Ada a question</label>
        <input
          id="ask-ada-input"
          v-model="chatInput"
          type="text"
          placeholder="Ask anything about your business…"
          class="flex-1 rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink transition-[border-color,box-shadow] duration-150 ease-out-quart focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
        />
        <button
          type="submit"
          class="rounded-md bg-brand text-ink-inverse px-4 py-2 text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-[transform,background-color,opacity] duration-150 ease-out-quart active:scale-[0.97]"
          :disabled="!chatInput.trim() || chatThinking"
        >Send</button>
      </form>
    </section>

    <!-- ── 4. Today snapshot + Live activity (merged) ─────────────── -->
    <section class="card overflow-hidden !p-0">
      <!-- Header: Today's numbers + on-call tech -->
      <header class="border-b border-divider px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 bg-surface-elevated/40">
        <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Today</span>
        <div class="flex items-baseline gap-1.5">
          <span class="text-lg font-bold tabular-nums text-ink">{{ today.calls }}</span>
          <span class="text-xs text-ink-muted">calls</span>
        </div>
        <div class="flex items-baseline gap-1.5">
          <span class="text-lg font-bold tabular-nums text-ink">{{ today.booked }}</span>
          <span class="text-xs text-ink-muted">booked</span>
        </div>
        <div class="flex items-baseline gap-1.5">
          <span class="text-lg font-bold tabular-nums text-ink">{{ money(today.revenue_cents) }}</span>
          <span class="text-xs text-ink-muted">captured</span>
        </div>
        <div class="ml-auto flex items-center gap-2 text-xs">
          <span class="text-ink-muted">On-call:</span>
          <span class="font-semibold text-ink">{{ today.on_call_tech }}</span>
          <span class="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
            {{ today.on_call_status }}
          </span>
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
          <span class="text-[11px] text-ink-muted">Ada's stream — auto-updates as work happens</span>
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
            v-for="ev in liveActivity"
            :key="ev.id"
            class="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-surface-elevated/40 transition-colors duration-200"
          >
            <div class="text-base flex-shrink-0 leading-tight pt-0.5">{{ activityIcon(ev.kind) }}</div>
            <div class="flex-1 min-w-0">
              <div class="text-sm text-ink leading-snug">{{ ev.text }}</div>
              <div class="flex items-center gap-2 mt-1">
                <span
                  v-if="getRole(ev.role)"
                  class="rounded-full bg-brand/10 text-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                >{{ getRole(ev.role)?.name }}</span>
                <span class="text-[11px] text-ink-disabled">{{ fmtAgo(ev.at) }}</span>
              </div>
            </div>
          </li>
        </TransitionGroup>
      </div>
    </section>
  </div>
</template>
