<script setup lang="ts">
/**
 * Cornerstone — Front Desk & Guests.
 *
 * Combined home for Grace's first-touch roles: Front Desk (calls /
 * forms / connect cards), Guest Follow-Up (visitor sequences), and
 * the Story Engine (testimony collection). Same fixture data the
 * old Engagement module pulled from for visitor stats.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import { visitorStats, STAGE_META as VISITOR_STAGE_META, visitors } from '@/lib/clients/cornerstone/visitors'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const visitor = computed(() => visitorStats())

interface CallEntry { time: string; from: string; topic: string; outcome: string; tone: 'success' | 'warn' | 'info' }
const recentCalls: CallEntry[] = [
  { time: '2h ago',  from: 'Riley Boucher',           topic: 'Said she came Sunday & loved it', outcome: 'Captured contact + sent welcome SMS',                tone: 'success' },
  { time: '8h ago',  from: 'Anonymous (mobile)',      topic: 'Asked about Sunday service times', outcome: 'Answered + sent service info via text',             tone: 'success' },
  { time: '14h ago', from: 'Kennedy Park',            topic: 'Wanted to know about kids program', outcome: 'Booked her a tour Sat AM',                          tone: 'success' },
  { time: '1d ago',  from: 'Mark — VM',               topic: 'Pastoral request — wife in hospital', outcome: 'Escalated to Pastor Mark immediately (5 PM)',    tone: 'warn' },
  { time: '2d ago',  from: 'The Maddux Family',       topic: 'RSVPing for Newcomers Lunch',      outcome: 'Confirmed + added to attendee list',                tone: 'success' },
]

interface VisitorTouch { name: string; stage: string; latest: string; ago: string }
const recentVisitorTouches: VisitorTouch[] = [
  { name: 'Riley Boucher',     stage: 'First-time',     latest: 'Welcome SMS sent — opened in 11 min',           ago: '2h' },
  { name: 'Kennedy Park',      stage: 'Returning',      latest: 'Day-3 nudge: "What did you think of Sunday?"',   ago: '1d' },
  { name: 'The Maddux Family', stage: 'Connected',      latest: 'Discover Cornerstone class invite drafted',      ago: '3d' },
  { name: 'The Yates Family',  stage: 'First-time',     latest: 'Welcome SMS sent — no response yet',             ago: '4d' },
  { name: 'The Reyes Family',  stage: 'Returning',      latest: '"We missed you" check-in sent (4-mo gap)',       ago: '5d' },
]

interface Story { person: string; trigger: string; status: 'captured' | 'drafted' | 'pending'; preview: string }
const recentStories: Story[] = [
  { person: 'Owen Holloway',   trigger: '1 year as Youth Leader', status: 'captured', preview: '"What started as just helping out turned into the most meaningful Wednesday nights of my year..."' },
  { person: 'The Téllez Family', trigger: 'Discover Cornerstone graduation', status: 'drafted', preview: '"We\'d been church-shopping for two years — this was the first place that felt like home..."' },
  { person: 'Baby Ellison',     trigger: 'Birth (Tue)',            status: 'pending',  preview: 'Awaiting permission from Wes + Tara to capture + share' },
]

function callToneClass(tone: CallEntry['tone']): string {
  if (tone === 'warn') return 'bg-warn/15 text-warn'
  if (tone === 'info') return 'bg-accent/15 text-accent'
  return 'bg-success/15 text-success'
}

function storyStatusClass(s: Story['status']): string {
  if (s === 'captured') return 'bg-success/15 text-success'
  if (s === 'drafted')  return 'bg-brand/15 text-brand'
  return 'bg-warn/15 text-warn'
}

// ── Approval queue: visitor sequences + story drafts ──────────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'fd-yates-nudge',
    icon: '👋',
    badge: 'Guest Follow-Up',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Day-7 nudge — The Yates Family',
    recipient: 'First-time visitor · welcome SMS sent · no response after 4 days',
    preview: '"Hey Yates Family — just wanted to circle back from last week. No pressure to reply, but if you\'re thinking about coming back this Sunday, we\'d love to see you again. Happy to answer anything about kids ministry or small groups whenever. — Pastor Mark"',
    approved_response: "Sent. If they don't respond by next Sunday I'll move them from 'first-time' to 'cooled' so we don't keep nudging. They opened the welcome SMS though, so I'm cautiously optimistic.",
    ticker_after_approval: 'Day-7 nudge sent to the Yates Family',
  },
  {
    id: 'fd-tellez-story',
    icon: '🌱',
    badge: 'Story Engine',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Share story — The Téllez Family',
    recipient: 'DC graduation testimony · drafted · awaiting your sign-off',
    preview: '"\'We\'d been church-shopping for two years — this was the first place that felt like home.\' — The Téllez Family. Permission to share on socials + the new-member welcome packet. Drafted with their consent on the form. Edit before publish or approve as-is."',
    approved_response: "Posted — socials, welcome packet, the next bulletin email. The Téllez Family will get a heads-up text from me 30 sec after publish so they're not surprised.",
    ticker_after_approval: 'Téllez story published — socials + bulletin',
  },
  {
    id: 'fd-ellison-permission',
    icon: '🌱',
    badge: 'Story Engine',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Story permission ask — Baby Ellison',
    recipient: 'Birth Tue · need Marc + Hannah\'s OK before share',
    preview: '"Marc and Hannah — would you be open to us sharing the news of Baby Ellison\'s arrival on socials + in this Sunday\'s announcement? Totally optional, no pressure either way. If yes, I\'ll draft something simple for your approval first. — Pastor Mark (via Grace)"',
    approved_response: "Sent. Asking for permission first is the right move with births — I'll surface their reply the moment it lands and only THEN draft the announcement.",
    ticker_after_approval: 'Permission ask sent to the Ellisons',
  },
  {
    id: 'fd-kennedy-day3',
    icon: '👋',
    badge: 'Guest Follow-Up',
    badgeClass: 'bg-success/15 text-success',
    title: 'Day-3 nudge — Kennedy Park',
    recipient: '2nd visit Sunday · filled out connect card',
    preview: '"Hey Kennedy — wanted to follow up after Sunday and just say it was great having you with us again. Saw the connect card — thanks for that. If you\'re open to it, our Newcomers Lunch is May 19th — informal, no commitment. Otherwise: looking forward to seeing you again whenever feels right. — Pastor Mark"',
    approved_response: "Sent. Kennedy's a soft pipeline lead — I'll watch for an RSVP or a reply, and surface either to you within minutes.",
    ticker_after_approval: 'Day-3 nudge sent to Kennedy Park',
  },
]

const tickerSeed = [
  { icon: '📞', text: 'Caught a call — Sun service times question, info text sent', ageSec: 6 * 60 },
  { icon: '👋', text: 'Riley opened welcome SMS — 11 min after send', ageSec: 11 * 60 },
  { icon: '✅', text: 'Connect form submitted — Kennedy Park (2nd visit)', ageSec: 47 * 60 },
  { icon: '🌱', text: 'Owen Holloway story captured — 1-yr Youth Leader milestone', ageSec: 3 * 3600 },
]

const tickerPool = [
  { icon: '📞', text: 'Caught a call — pastoral request, escalated to Pastor Mark' },
  { icon: '✅', text: 'Connect card submitted via web form' },
  { icon: '👋', text: 'Welcome SMS opened — first-time visitor' },
  { icon: '🌱', text: 'Story drafted — testimony ready for review' },
  { icon: '📅', text: 'Newcomers Lunch RSVP — Maddux Family' },
  { icon: '💬', text: 'Forwarded inquiry — kids ministry routed to team lead' },
]

const tickerRef = ref<InstanceType<typeof GraceLiveTicker> | null>(null)

function onApproved(item: ApprovalQueueItem) {
  if (item.ticker_after_approval) {
    tickerRef.value?.pushEvent({ icon: item.icon, text: item.ticker_after_approval })
  }
}
</script>

<template>
  <div class="space-y-4">
    <GraceLiveTicker
      ref="tickerRef"
      :seed="tickerSeed"
      :pool="tickerPool"
      subtitle="Front-desk activity — calls, forms, stories. Auto-updates."
    />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="5"
      heading="First-touch queue"
      subtitle="Visitor sequences + story permissions awaiting your eyes. Approve to send."
      @approved="onApproved"
    />

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Calls handled (7d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">47</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">12 captured visitor info</div>
      </div>
      <div class="card">
        <div class="kpi-label">First-timers (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ visitor.first_time_30d }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ visitor.total_active }} active in pipeline</div>
      </div>
      <div class="card">
        <div class="kpi-label">Connect rate</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ Math.round(visitor.connect_rate * 100) }}%</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">visitors → connected</div>
      </div>
      <div class="card">
        <div class="kpi-label">Stories captured (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">7</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">3 share-ready quotes drafted</div>
      </div>
    </div>

    <!-- Front Desk: recent calls Grace handled -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">📞 Front Desk · Recent calls</span>
          <span class="text-xs text-ink-muted">— what Grace handled at the phone</span>
        </div>
      </div>
      <ul class="space-y-2">
        <li
          v-for="(c, i) in recentCalls"
          :key="i"
          class="flex items-start gap-3 rounded-md bg-canvas/50 px-3 py-2"
        >
          <span class="text-[10px] text-ink-disabled flex-shrink-0 mt-0.5 w-14">{{ c.time }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ c.from }}</span>
              <span class="text-[11px] text-ink-muted">— {{ c.topic }}</span>
            </div>
            <p class="text-[11px] text-ink-muted mt-0.5">{{ c.outcome }}</p>
          </div>
          <span
            class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
            :class="callToneClass(c.tone)"
          >{{ c.tone === 'warn' ? 'Escalated' : 'Auto' }}</span>
        </li>
      </ul>
    </section>

    <!-- Guest Follow-Up: visitor pipeline -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">👋 Guest Follow-Up · Pipeline</span>
          <span class="text-xs text-ink-muted">— Grace's sequences, by stage</span>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <div
          v-for="stage in (['first_time','returning','connected','membership_class','member'] as const)"
          :key="stage"
          class="rounded-md border border-divider bg-canvas/40 px-3 py-2"
        >
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: VISITOR_STAGE_META[stage].color }"></span>
            <span class="kpi-label">{{ VISITOR_STAGE_META[stage].label }}</span>
          </div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ visitor.by_stage[stage] }}</div>
        </div>
      </div>

      <div>
        <div class="kpi-label mb-2">Recent Grace touches</div>
        <ul class="space-y-1.5">
          <li
            v-for="(t, i) in recentVisitorTouches"
            :key="i"
            class="flex items-center gap-2 text-xs"
          >
            <span class="font-semibold text-ink min-w-0 truncate w-32">{{ t.name }}</span>
            <span class="rounded bg-surface-elevated text-ink-muted px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0">{{ t.stage }}</span>
            <span class="text-ink-muted truncate flex-1">{{ t.latest }}</span>
            <span class="text-[10px] text-ink-disabled flex-shrink-0">{{ t.ago }} ago</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Story Engine -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">🌱 Story Engine · Recent</span>
          <span class="text-xs text-ink-muted">— testimonies Grace asked for</span>
        </div>
      </div>
      <div class="space-y-2">
        <article
          v-for="(s, i) in recentStories"
          :key="i"
          class="rounded-md border border-divider bg-canvas/40 px-3 py-2"
        >
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="text-sm font-semibold text-ink">{{ s.person }}</span>
            <span class="text-[11px] text-ink-muted">— {{ s.trigger }}</span>
            <span
              class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              :class="storyStatusClass(s.status)"
            >{{ s.status }}</span>
          </div>
          <p class="text-[11px] text-ink-muted italic leading-relaxed">{{ s.preview }}</p>
        </article>
      </div>
    </section>

    <!-- Quiet visitors used reference (silence ESLint via reference) -->
    <span v-if="false">{{ visitors.length }}</span>
  </div>
</template>
