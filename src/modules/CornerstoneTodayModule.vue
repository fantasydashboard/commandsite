<script setup lang="ts">
/**
 * Cornerstone — Today (Grace-led metrics + automation results).
 *
 * Top of the page now leads with Grace as the AI ministry assistant —
 * persona greeting + interactive "Ask Grace" chat with hardcoded
 * demo Q&A pulled from real fixture data. Below that: pulse strip,
 * KPI grid, and "What Grace ran this week" attribution feed.
 *
 * Chat answers are deterministic (not live Claude) so demos are
 * predictable. Swap to Anthropic API for real customer deployments.
 */
import { computed, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import type { Client } from '@/types/database'
import { todayPulse } from '@/lib/clients/cornerstone/today'
import { careStats } from '@/lib/clients/cornerstone/care'
import { givingStats } from '@/lib/clients/cornerstone/giving'
import { peopleStats } from '@/lib/clients/cornerstone/people'
import { graceRoles, ROLE_STATUS_META } from '@/lib/clients/cornerstone/roles'

const router = useRouter()
function goToRole(tab: string) {
  router.push({ name: 'dashboard.tab', params: { slug: 'cornerstone-church', tab } })
}

defineProps<{ client: Client; config: Record<string, unknown> }>()

const pulse = computed(() => todayPulse())
const care = computed(() => careStats())
const giving = computed(() => givingStats())
const people = computed(() => peopleStats())

const attendanceTrend = computed(() => {
  const diff = pulse.value.attendance_last_sunday - pulse.value.attendance_avg_4w
  return { diff, color: diff >= 0 ? '#10B981' : '#F59E0B', sign: diff >= 0 ? '↑' : '↓' }
})

function money(cents: number): string {
  if (cents >= 100_000) return '$' + Math.round(cents / 100_000) + 'k'
  return '$' + Math.round(cents / 100).toLocaleString()
}

// ── Grace greeting (time-of-day aware) ─────────────────────────────────
const graceGreeting = computed(() => {
  const hr = new Date().getHours()
  if (hr < 12) return 'Good morning, Pastor Mark'
  if (hr < 17) return 'Good afternoon, Pastor Mark'
  return 'Good evening, Pastor Mark'
})

const graceSummaryLine = computed(() => {
  return `I handled ${automationFeed.length} things this week — ${automationFeed.filter((e) => e.tone === 'warn').length} need your eyes when you have a minute.`
})

// ── Ask Grace chat (hardcoded demo Q&A drawing on fixture data) ────────
interface ChatMessage { role: 'user' | 'grace'; text: string }

interface SuggestedQuestion { q: string; a: string }
const suggestedQuestions: SuggestedQuestion[] = [
  {
    q: 'Who visited for the first time this week?',
    a: "Three first-time visitors Sunday — Riley Boucher (came alone, mentioned work has been lonely), Kennedy Park (second visit, filled out the connect card), and the Maddux Family (4th visit + Newcomers Lunch — daughter loves the kids program). I sent Riley a welcome text Sunday afternoon (she opened it in 11 minutes) and drafted day-3 follow-ups for Kennedy and the Madduxes. Want to review?",
  },
  {
    q: "Who haven't we connected with in a while?",
    a: "Three families I'd surface: The Sullivans (4 weeks no kids attendance, gift cancelled, Casey stepped off hospitality — pastoral check-in overdue), the Whitakers (2 flags red, kids missed 3 of last 4 Sundays), and the Reyes Family (just back after a 4-month gap — be warm but no pressure). I've drafted soft check-ins for the first two; the Sullivan situation might need a personal call instead of a text — your call.",
  },
  {
    q: "How's giving this month?",
    a: "$28,420 so far this month, on pace for ~$36k by month-end. Down ~5% vs same week last month, but two big Building Fund gifts are scheduled to clear next week. Five households flagged on stopped giving — two of them (Sullivans, Whitakers) are also at-risk on the People page, so I'd prioritize those over the rest.",
  },
  {
    q: 'Who needs care this week?',
    a: "Two urgent: James Foster's father passed Sunday (funeral Friday at 10 AM — meal train already coordinated through their small group), and the Sullivan family pastoral check-in is overdue. Eight other open cases, six in 'awaiting response.' I closed 14 cases over the last 30 days. Full breakdown's on the Care pulse card.",
  },
  {
    q: 'What did you handle while I was off?',
    a: "Eight things this week — sent Riley her welcome SMS (opened 11m later), mailed 4 birthday cards (auto-printed Mon, posted Tue), sent the Hawthorne Family their card-update reminder (their giving cycle was about to break), drafted the Ellison birth congrats note (sent for your review), texted the Reyes Family 'we missed you' (no response yet), escalated the Sullivan drift alert to you, sent the Sunday newsletter (847 recipients, 38% open, 12% click), and pinged Planning Center about the Sunday 9 AM nursery gap.",
  },
  {
    q: "Who's serving Sunday?",
    a: "Most slots filled — the Worship Team is solid (Jess leading, Marcus on bass, Holloway on backing vocals), Kids Ministry is healthy across all four age groups. Two gaps: Nursery (9 AM) is short 2 (Linda Tan + Aanya Patel both off — I suggested Mia Pham + Amanda Foster as fills based on past last-minute responses), and Parking Team (11 AM) is short 1. Planning Center has the asks queued.",
  },
]

const chatMessages = ref<ChatMessage[]>([
  {
    role: 'grace',
    text: "Hi Pastor Mark — I'm here. Ask me anything about what's happening at Cornerstone this week.",
  },
])
const customQuestion = ref('')
const chatScrollEl = ref<HTMLElement | null>(null)

async function askSuggested(q: SuggestedQuestion) {
  chatMessages.value.push({ role: 'user', text: q.q })
  await nextTick()
  scrollChatToBottom()
  // Small delay so Grace's response feels like she's "thinking"
  setTimeout(() => {
    chatMessages.value.push({ role: 'grace', text: q.a })
    nextTick(scrollChatToBottom)
  }, 600)
}

async function askCustom() {
  const text = customQuestion.value.trim()
  if (!text) return
  chatMessages.value.push({ role: 'user', text })
  customQuestion.value = ''
  await nextTick()
  scrollChatToBottom()
  setTimeout(() => {
    chatMessages.value.push({
      role: 'grace',
      text: "Let me check on that. Give me a moment to pull what I have for the team — I'll draft something for your review and queue it on the Care or Engagement page based on what fits.",
    })
    nextTick(scrollChatToBottom)
  }, 700)
}

function scrollChatToBottom() {
  if (chatScrollEl.value) {
    chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight
  }
}

// ── What Grace handled this week (attribution feed) ─────────────────────
interface AutoEvent { icon: string; label: string; detail: string; ago: string; tone: 'success' | 'info' | 'warn' }
const automationFeed: AutoEvent[] = [
  { icon: '👋', label: 'Grace sent welcome SMS', detail: 'Riley Boucher (first-time visitor Sun) — opened in 11 min', ago: '2h ago', tone: 'success' },
  { icon: '🎂', label: 'Grace mailed 4 birthday cards', detail: 'Auto-printed Mon AM, posted Tue', ago: '1d ago', tone: 'success' },
  { icon: '💳', label: 'Grace sent card-update reminder', detail: 'The Hawthorne Family — recurring gift expired 18d ago', ago: '1d ago', tone: 'success' },
  { icon: '🎉', label: 'Grace drafted birth congrats note', detail: 'The Ellison Family · Baby Ellison — queued for your review', ago: '2d ago', tone: 'info' },
  { icon: '🏡', label: 'Grace sent "we missed you" check-in', detail: 'The Reyes Family — back after 4-month gap', ago: '3d ago', tone: 'success' },
  { icon: '⚠', label: 'Grace escalated drift alert', detail: 'The Sullivan Family — 3rd flag turned red, paged you', ago: '4d ago', tone: 'warn' },
  { icon: '📧', label: 'Grace sent Sunday newsletter', detail: '847 recipients · 38% open · 12% click', ago: '5d ago', tone: 'success' },
  { icon: '🙋', label: 'Grace flagged volunteer gap', detail: 'Nursery short 2 for Sun 9 AM — Planning Center notified', ago: '6d ago', tone: 'info' },
]
</script>

<template>
  <div class="space-y-4">
    <!-- ── Grace persona panel + chat ───────────────────────────────── -->
    <section class="card overflow-hidden p-0">
      <!-- Grace header strip -->
      <div class="flex items-center gap-3 bg-gradient-to-r from-brand to-brand/80 text-ink-inverse px-5 py-4">
        <!-- Avatar -->
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-ink-inverse/15 text-lg font-bold ring-2 ring-ink-inverse/30">
          G
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-base font-semibold">Grace</span>
            <span class="rounded-full bg-success/30 text-ink-inverse px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
              <span class="h-1.5 w-1.5 rounded-full bg-success-300 animate-pulse" style="background-color:#86efac"></span>
              Online
            </span>
            <span class="text-[11px] opacity-80 hidden sm:inline">your AI ministry assistant</span>
          </div>
          <p class="text-sm opacity-90 mt-0.5">{{ graceGreeting }}. {{ graceSummaryLine }}</p>
        </div>
      </div>

      <!-- Chat area -->
      <div class="flex flex-col">
        <div
          ref="chatScrollEl"
          class="max-h-[280px] overflow-y-auto px-5 py-4 space-y-3 bg-canvas/40"
        >
          <div
            v-for="(m, i) in chatMessages"
            :key="i"
            class="flex"
            :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed"
              :class="m.role === 'user'
                ? 'bg-ink text-ink-inverse rounded-br-sm'
                : 'bg-surface-raised text-ink border border-divider rounded-bl-sm'"
            >
              {{ m.text }}
            </div>
          </div>
        </div>

        <!-- Suggested questions -->
        <div class="border-t border-divider bg-surface-raised px-5 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
            Try asking
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="(q, i) in suggestedQuestions"
              :key="i"
              type="button"
              class="rounded-full border border-divider bg-surface px-3 py-1 text-[11px] font-medium text-ink-muted hover:text-ink hover:border-brand hover:bg-brand/5 transition-colors"
              @click="askSuggested(q)"
            >{{ q.q }}</button>
          </div>
        </div>

        <!-- Custom input -->
        <form
          class="flex items-center gap-2 border-t border-divider bg-surface-raised px-5 py-3"
          @submit.prevent="askCustom"
        >
          <input
            v-model="customQuestion"
            type="text"
            placeholder="Ask Grace anything..."
            class="flex-1 rounded-full border border-divider bg-canvas px-4 py-2 text-sm text-ink placeholder:text-ink-disabled focus:outline-none focus:border-brand"
          />
          <button
            type="submit"
            class="rounded-full bg-brand text-ink-inverse px-4 py-2 text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50"
            :disabled="!customQuestion.trim()"
          >Send</button>
        </form>
      </div>
    </section>

    <!-- ── Grace's Roles status grid ───────────────────────────────── -->
    <section class="card">
      <div class="mb-4 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Grace's roles</span>
          <span class="text-xs text-ink-muted">— what she handles for Cornerstone</span>
        </div>
        <span class="text-[11px] text-ink-disabled">{{ graceRoles.filter((r) => r.status === 'active').length }} of {{ graceRoles.length }} active · click any to drill in</span>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <button
          v-for="role in graceRoles"
          :key="role.key"
          type="button"
          class="flex flex-col items-start gap-2 rounded-card border border-divider bg-surface-raised p-3 text-left hover:border-brand hover:shadow-card transition-all"
          @click="goToRole(role.tab)"
        >
          <div class="flex items-center gap-2 w-full">
            <span class="text-2xl flex-shrink-0">{{ role.icon }}</span>
            <span
              class="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              :class="ROLE_STATUS_META[role.status].pillClass"
            >{{ ROLE_STATUS_META[role.status].label }}</span>
          </div>
          <div class="text-sm font-semibold text-ink leading-snug">{{ role.name }}</div>
          <div class="text-[11px] text-ink-muted leading-snug">{{ role.description }}</div>
          <div class="mt-auto pt-2 border-t border-divider/60 text-[10px] text-ink-disabled font-medium w-full">
            {{ role.this_week_snippet }}
          </div>
        </button>
      </div>
    </section>

    <!-- ── Pulse strip ─────────────────────────────────────────────── -->
    <div class="rounded-card bg-brand text-ink-inverse px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div class="flex items-center gap-2 text-xs uppercase tracking-wide font-semibold opacity-90">
        <span class="h-2 w-2 rounded-full bg-success animate-pulse"></span>
        This Week
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.attendance_last_sunday }}</span>
        <span class="text-xs opacity-80">last Sunday</span>
        <span class="text-xs ml-1" :style="{ color: attendanceTrend.color }">
          {{ attendanceTrend.sign }} {{ Math.abs(attendanceTrend.diff) }} vs 4-wk avg
        </span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.visitors_last_sunday }}</span>
        <span class="text-xs opacity-80">visitors</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums" :class="pulse.households_at_risk > 0 ? 'text-amber-200' : ''">{{ pulse.households_at_risk }}</span>
        <span class="text-xs opacity-80">at-risk households</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.life_events_this_week }}</span>
        <span class="text-xs opacity-80">life events</span>
      </div>
    </div>

    <!-- ── KPI grid — each card links to its deeper module ─────────── -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">At-risk households</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="people.at_risk_two_plus_flags > 0 ? 'text-danger' : 'text-ink'">{{ people.at_risk_two_plus_flags }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">2+ red flags · see People</div>
      </div>
      <div class="card">
        <div class="kpi-label">Care pulse</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="care.urgent_cases > 0 ? 'text-warn' : 'text-ink'">{{ care.open_cases }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ care.urgent_cases }} urgent · {{ care.resolved_30d }} closed last 30d</div>
      </div>
      <div class="card">
        <div class="kpi-label">Giving (this month)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(giving.current_month_cents) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">
          {{ giving.giving_households }}/{{ giving.total_households }} households · see Giving
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Active members</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ people.members }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ people.visitors_active }} visitors in flight</div>
      </div>
    </div>

    <!-- ── What Grace ran this week — automation results stream ─────── -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">What Grace ran this week</span>
          <span class="text-xs text-ink-muted">— she handled all of this without you</span>
        </div>
        <span class="text-[11px] text-ink-disabled">{{ automationFeed.length }} actions</span>
      </div>
      <ul class="space-y-2">
        <li
          v-for="(e, i) in automationFeed"
          :key="i"
          class="flex items-start gap-3 rounded-md bg-canvas/50 px-3 py-2"
        >
          <span class="text-base flex-shrink-0">{{ e.icon }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ e.label }}</span>
              <span
                class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                :class="e.tone === 'success' ? 'bg-success/15 text-success' : e.tone === 'warn' ? 'bg-warn/15 text-warn' : 'bg-accent/15 text-accent'"
              >{{ e.tone === 'warn' ? 'Escalated' : e.tone === 'info' ? 'For review' : 'Auto' }}</span>
            </div>
            <p class="text-[11px] text-ink-muted mt-0.5">{{ e.detail }}</p>
          </div>
          <span class="text-[10px] text-ink-disabled flex-shrink-0">{{ e.ago }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
