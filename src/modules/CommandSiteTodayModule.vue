<script setup lang="ts">
/**
 * CommandSite Today — action queue. The "what should I work on right
 * now" answer for a solo SaaS founder. Mixes pipeline replies,
 * customer-health alerts, MRR changes, demos, expansion signals, and
 * tasks — sorted by priority.
 */
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Client } from '@/types/database'
import {
  todayItems,
  todayStats,
  todayPulse,
  KIND_META,
  type TodayItem,
  type Priority,
} from '@/lib/clients/commandsite/today'
import { adaRoles, ROLE_STATUS_META } from '@/lib/clients/commandsite/roles'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => todayStats())
const pulse = computed(() => todayPulse())

// Local "addressed" state so the demo lets you check items off.
const addressed = ref<Set<string>>(new Set())
function markDone(id: string) { addressed.value.add(id) }
function unmark(id: string) { addressed.value.delete(id) }

const filterPriority = ref<Priority | 'all'>('all')

// ── Ada persona + chat ─────────────────────────────────────────────────
const router = useRouter()
function goToRole(tab: string) {
  router.push({ name: 'dashboard.tab', params: { slug: 'commandsite', tab } })
}

const adaGreeting = computed(() => {
  const hr = new Date().getHours()
  if (hr < 12) return 'Good morning, Josh'
  if (hr < 17) return 'Good afternoon, Josh'
  return 'Good evening, Josh'
})

const adaSummaryLine = computed(() =>
  `I've handled 14 cold-email replies, drafted 3 follow-ups, and queued ${stats.value.high_count} things flagged for your eyes this week.`,
)

interface ChatMessage { role: 'user' | 'ada'; text: string }
interface SuggestedQuestion { q: string; a: string }
const suggestedQuestions: SuggestedQuestion[] = [
  { q: 'What did you handle while I was building?',
    a: "Today: classified 4 cold-email replies (1 positive from Brett at Cool Comfort — drafted Calendly intro for your review, 2 OOFs auto-handled, 1 objection from Maria @ Sunshine Plumbing flagged). Drafted Day-7 nudges for 3 stale quotes. Posted Reddit comment on the r/HVAC scheduling thread you'd been watching. Daily AM brief is queued for 7:30 tomorrow." },
  { q: "What's in my pipeline that needs attention?",
    a: "Three deals to surface: Cool Comfort (Brett, demo done 4d ago — proposal not sent, your move), Sunshine Plumbing (Maria, just replied positive — drafted Calendly intro), and BlueRidge Roofing (Wesley, day-9 in 'objection' stage — drafted a reframe for your review). Two more sit in early stages, no action needed yet. See Pipeline & Deals." },
  { q: 'Who replied to outreach this week?',
    a: "14 replies total. 4 positive (queued in Outreach), 3 objections (winnable — drafts ready), 2 'send more info' (auto-handled, sent your one-pager), 4 OOFs (auto-archived), 1 unsubscribe (suppressed). Reply rate is 11.2% on this batch — above my 7% baseline. Your subject lines are landing." },
  { q: 'What should I post on social this week?',
    a: "Three drafts ready for your review: a Reddit comment on r/HVAC about quote follow-up frustrations (you mentioned wanting to be active there), a LinkedIn post on the 'tools that don't talk to each other' theme (resonates with the Apollo data we pulled), and an X thread on Ada Lovelace's birthday next week (perfect angle to introduce her brand). Each is 60-90 sec to review + ship." },
  { q: 'Which leads should I prioritize this week?',
    a: "From this week's Apollo pull, 12 leads scored ≥80% ICP. Top 3 by fit: Travis Reeves (Pinnacle Heating, Austin TX — 8 techs, $2.4M revenue, recently added a tech), Maria Castillo (Sunshine Plumbing, Orlando FL — 12 techs, GM-led decision-making), and Derrick Powell (Coastal HVAC, Tampa FL — 6 techs, growth mode). All ready for personalized email-1." },
  { q: "How are we doing this month?",
    a: "Pre-revenue still. Smartlead warming hits day 14 in 7 days, then we ramp. Pipeline shows 6 active conversations + 2 demos booked (Brett next Tue, Maria Thu). If both close at Starter ($1,499 first month + $499/mo), that's $5,996 to start. Cash will go: $40 Smartlead + $7 Workspace + your time. See Customers & Revenue when first deal closes." },
]

const chatMessages = ref<ChatMessage[]>([
  { role: 'ada', text: "Hey Josh — Ada here. Ask me anything about CommandSite. Try one of the questions below." },
])
const customQuestion = ref('')
const chatScrollEl = ref<HTMLElement | null>(null)

async function askSuggested(q: SuggestedQuestion) {
  chatMessages.value.push({ role: 'user', text: q.q })
  await nextTick()
  scrollChatToBottom()
  setTimeout(() => {
    chatMessages.value.push({ role: 'ada', text: q.a })
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
      role: 'ada',
      text: "Let me check on that. Give me a moment to pull what I have — I'll draft something for your review and queue it on the right page based on what fits.",
    })
    nextTick(scrollChatToBottom)
  }, 700)
}

function scrollChatToBottom() {
  if (chatScrollEl.value) chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight
}

const visibleItems = computed<TodayItem[]>(() => {
  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
  return [...todayItems]
    .filter((t) => filterPriority.value === 'all' || t.priority === filterPriority.value)
    .sort((a, b) => order[a.priority] - order[b.priority])
})

const unaddressedCount = computed(() => todayItems.filter((t) => !addressed.value.has(t.id)).length)

function priorityColor(p: Priority): string {
  if (p === 'high') return '#EF4444'
  if (p === 'medium') return '#F59E0B'
  return '#94A3B8'
}
function priorityLabel(p: Priority): string {
  if (p === 'high') return 'High'
  if (p === 'medium') return 'Medium'
  return 'Low'
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}
</script>

<template>
  <div class="space-y-4">
    <!-- ── Ada persona panel + chat ───────────────────────────────── -->
    <section class="card overflow-hidden p-0">
      <div class="flex items-center gap-3 bg-gradient-to-r from-brand to-brand/80 text-ink-inverse px-5 py-4">
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-ink-inverse/15 text-lg font-bold ring-2 ring-ink-inverse/30">
          A
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-base font-semibold">Ada</span>
            <span class="rounded-full bg-success/30 text-ink-inverse px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
              <span class="h-1.5 w-1.5 rounded-full" style="background-color:#86efac"></span>
              Online
            </span>
            <span class="text-[11px] opacity-80 hidden sm:inline">your AI employee · running on the same system you sell</span>
          </div>
          <p class="text-sm opacity-90 mt-0.5">{{ adaGreeting }}. {{ adaSummaryLine }}</p>
        </div>
      </div>

      <div class="flex flex-col">
        <div ref="chatScrollEl" class="max-h-[280px] overflow-y-auto px-5 py-4 space-y-3 bg-canvas/40">
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

        <div class="border-t border-divider bg-surface-raised px-5 py-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">Try asking</div>
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

        <form
          class="flex items-center gap-2 border-t border-divider bg-surface-raised px-5 py-3"
          @submit.prevent="askCustom"
        >
          <input
            v-model="customQuestion"
            type="text"
            placeholder="Ask Ada anything..."
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

    <!-- ── Ada's Roles status grid ────────────────────────────────── -->
    <section class="card">
      <div class="mb-4 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Ada's roles</span>
          <span class="text-xs text-ink-muted">— what she handles for CommandSite</span>
        </div>
        <span class="text-[11px] text-ink-disabled">{{ adaRoles.filter((r) => r.status === 'active').length }} of {{ adaRoles.length }} active · click any to drill in</span>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <button
          v-for="role in adaRoles"
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

    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Today</h2>
        <p class="text-sm text-ink-muted">
          What deserves your attention right now — pipeline replies, customer-health alerts, MRR changes, and demos.
        </p>
      </div>
      <div class="text-xs text-ink-muted">
        <span class="font-semibold text-ink">{{ unaddressedCount }}</span> still to address
      </div>
    </div>

    <!-- Pulse strip -->
    <div class="rounded-card bg-brand text-ink-inverse px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div class="flex items-center gap-2 text-xs uppercase tracking-wide font-semibold opacity-90">
        <span class="h-2 w-2 rounded-full bg-success animate-pulse"></span>
        Live
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.new_replies }}</span>
        <span class="text-xs opacity-80">new replies</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.demos_today }}</span>
        <span class="text-xs opacity-80">demo today</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ money(pulse.mrr_change_cents) }}</span>
        <span class="text-xs opacity-80">MRR change</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums" :class="pulse.active_at_risk > 0 ? 'text-amber-200' : ''">{{ pulse.active_at_risk }}</span>
        <span class="text-xs opacity-80">at-risk</span>
      </div>
      <div class="flex items-baseline gap-1.5">
        <span class="text-xl font-bold tabular-nums">{{ pulse.trial_signups_today }}</span>
        <span class="text-xs opacity-80">trial signup{{ pulse.trial_signups_today === 1 ? '' : 's' }}</span>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">High priority</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="stats.high_count > 0 ? 'text-danger' : 'text-ink'">{{ stats.high_count }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Medium</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.medium_count }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Pipeline at stake</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(stats.pipeline_at_stake_cents) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">ARR across high-priority items</div>
      </div>
      <div class="card">
        <div class="kpi-label">MRR at risk</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="stats.mrr_at_stake_cents > 0 ? 'text-warn' : 'text-ink'">{{ money(stats.mrr_at_stake_cents) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">from at-risk customers</div>
      </div>
    </div>

    <!-- Priority filter -->
    <div class="card">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="p in (['all', 'high', 'medium', 'low'] as (Priority | 'all')[])"
          :key="p"
          type="button"
          class="chip"
          :class="filterPriority === p ? 'chip-active' : ''"
          @click="filterPriority = p"
        >
          {{ p === 'all' ? 'All' : priorityLabel(p as Priority) }}
        </button>
      </div>
    </div>

    <!-- Action items -->
    <div class="space-y-2">
      <article
        v-for="item in visibleItems"
        :key="item.id"
        class="card transition-opacity"
        :class="addressed.has(item.id) ? 'opacity-50' : ''"
      >
        <div class="flex items-start gap-3">
          <!-- Priority + kind icon -->
          <div class="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-full text-base"
              :style="{ backgroundColor: KIND_META[item.kind].color + '22' }"
            >
              {{ KIND_META[item.kind].icon }}
            </div>
            <span
              class="text-[9px] font-bold uppercase tracking-wider"
              :style="{ color: priorityColor(item.priority) }"
            >{{ priorityLabel(item.priority) }}</span>
          </div>

          <!-- Body -->
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <h3 class="text-sm font-semibold text-ink">{{ item.title }}</h3>
              <span
                class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                :style="{ backgroundColor: KIND_META[item.kind].color }"
              >{{ KIND_META[item.kind].label }}</span>
              <span class="text-[10px] text-ink-disabled">· {{ fmtAgo(item.created_at) }}</span>
            </div>
            <p class="mt-0.5 text-xs text-ink-muted leading-relaxed">{{ item.detail }}</p>
          </div>

          <!-- Actions -->
          <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
            <button
              v-if="!addressed.has(item.id)"
              type="button"
              class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 whitespace-nowrap"
              @click="markDone(item.id)"
            >{{ item.cta }}</button>
            <button
              v-else
              type="button"
              class="rounded-md bg-success/15 text-success px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
              @click="unmark(item.id)"
            >✓ Done · undo</button>
            <button
              type="button"
              class="text-[10px] text-ink-disabled hover:text-ink-muted"
            >Snooze</button>
          </div>
        </div>
      </article>

      <div
        v-if="visibleItems.length === 0"
        class="card text-center text-sm text-ink-muted italic py-6"
      >
        Nothing for that priority. Take a breath.
      </div>
    </div>
  </div>
</template>
