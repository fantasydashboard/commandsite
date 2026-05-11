<script setup lang="ts">
/**
 * Cornerstone — Sundays & Comms.
 *
 * Combined home for Grace's operational roles: Volunteer
 * Coordination (Sunday roster + suggested fills) and
 * Communications (drafts + sent + performance). Pulls from the
 * existing sundays + comms fixtures.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import { sundayStats, upcomingService, VOLUNTEER_ROLE_META } from '@/lib/clients/cornerstone/sundays'
import { commsStats, posts, CHANNEL_META } from '@/lib/clients/cornerstone/comms'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const sunday = computed(() => sundayStats())
const comms = computed(() => commsStats())

// Roles short this Sunday with Grace's suggested fills
const understaffedRoles = computed(() => {
  return upcomingService.slots
    .filter((s) => s.confirmed.length < s.needed)
    .map((s) => ({
      role: s.role,
      label: VOLUNTEER_ROLE_META[s.role].label,
      need: s.needed - s.confirmed.length,
      time: s.service,
      suggested: s.suggested_fills ?? [],
    }))
})

const recentPosts = computed(() => posts.filter((p) => p.status === 'sent').slice(0, 5))
const draftedPosts = computed(() => posts.filter((p) => p.status === 'draft' || p.status === 'scheduled'))

function pct(v: number): string { return Math.round(v * 100) + '%' }
function fmtSlotTime(t: '9_am' | '11_am'): string { return t === '9_am' ? '9 AM' : '11 AM' }
function readinessTone(p: number): string {
  if (p >= 0.85) return 'text-success'
  if (p >= 0.6)  return 'text-warn'
  return 'text-danger'
}

// ── Approval queue: Sunday volunteer asks + comms drafts ──────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'sun-nursery-9',
    icon: '🙋',
    badge: 'Volunteer Coord',
    badgeClass: 'bg-accent/15 text-accent',
    title: 'Fill ask — Nursery Sunday 9 AM',
    recipient: '2 spots open · Mia Pham + Amanda Foster suggested',
    preview: '"Hey Mia and Amanda — Linda and Aanya are both off this Sunday and we\'re short for the 9 AM nursery slot. You\'ve both filled in last-minute before and saved the day. Any chance one (or both) of you could swing it? Totally fine if not. — Pastor Mark (via Grace)"',
    approved_response: "Sent to both. Planning Center will auto-confirm if either says yes. I'll surface the result Saturday morning if no one bites — usually they reply same-day.",
    ticker_after_approval: 'Nursery fill ask sent — Mia + Amanda',
  },
  {
    id: 'sun-parking-11',
    icon: '🅿️',
    badge: 'Volunteer Coord',
    badgeClass: 'bg-accent/15 text-accent',
    title: 'Fill ask — Parking Sunday 11 AM',
    recipient: '1 spot open · Kyle Marris suggested',
    preview: '"Hey Kyle — we\'re one short on the parking team for the 11 AM Sunday. Saw you covered it last month and folks loved you out there. Free to grab the slot? — Pastor Mark"',
    approved_response: "Sent. Kyle's responded within an hour every previous ask, so likely a fast yes. I'll bump him to Pastor Mark's calendar if confirmed.",
    ticker_after_approval: 'Parking fill ask sent — Kyle Marris',
  },
  {
    id: 'sun-newsletter',
    icon: '📧',
    badge: 'Communications',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Sunday newsletter — week of May 11',
    recipient: '847 subscribers · scheduled for Wed 6 AM',
    preview: '"This Sunday — guest worship leader, baptism Sunday for two from Discover Cornerstone, and a special update from the building fund (we\'re past 60% of our goal). Plus: Newcomers Lunch RSVPs are open, Wednesday night small groups resume next week. Hope to see you Sunday."',
    approved_response: 'Scheduled for Wed 6 AM. Past 4 newsletters averaged 38% open rate at that send time. I\'ll surface the open-rate result Wednesday afternoon.',
    ticker_after_approval: 'Newsletter scheduled for Wed 6 AM — 847 subscribers',
  },
  {
    id: 'sun-recap',
    icon: '✏️',
    badge: 'Communications',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Sunday recap email draft',
    recipient: 'Auto-drafts every Sun PM · ready for Mon AM send',
    preview: '"Sunday recap — 412 of you joined us in person, with 3 first-time visitors (Riley, Kennedy, the Madduxes — welcome again!). Big moment: 6 baptisms on the calendar for next month. Worship setlist is on Spotify. Sermon link below. Praying for everyone Pastor Mark talked with after service."',
    approved_response: 'Sent to the all-church list. Mon morning open rate trends 42% — I\'ll surface anyone who clicked but didn\'t come Sunday as warm re-engagement leads.',
    ticker_after_approval: 'Sunday recap sent to all-church list',
  },
  {
    id: 'sun-ribbon-cutting',
    icon: '🏗️',
    badge: 'Communications',
    badgeClass: 'bg-success/15 text-success',
    title: 'Building fund milestone post',
    recipient: '60% of goal hit — share-ready',
    preview: '"Friends — we just crossed 60% of the building fund goal. Thank you. Every gift, every prayer, every Sunday you\'ve shown up has gotten us here. There\'s real momentum and we\'re feeling it. Specific number + what\'s next in this Sunday\'s announcement."',
    approved_response: 'Posted to socials + church app. Church-app push notifications usually get 18-22% engagement on milestone posts.',
    ticker_after_approval: 'Building fund milestone posted — socials + app',
  },
]

const tickerSeed = [
  { icon: '🎵', text: 'Worship setlist locked — Jess + Marcus + Holloway', ageSec: 12 * 60 },
  { icon: '✅', text: 'Holloway confirmed for backing vocals 9 AM', ageSec: 38 * 60 },
  { icon: '📧', text: 'Newsletter open: 38% (847 subscribers)', ageSec: 4 * 3600 },
  { icon: '🅿️', text: 'Parking team — 1 short for 11 AM, ask drafted', ageSec: 6 * 3600 },
]
const tickerPool = [
  { icon: '🙋', text: 'Volunteer accept — Mia Pham confirmed for 9 AM nursery' },
  { icon: '📅', text: 'Sunday slot auto-confirmed — Kids Ministry team complete' },
  { icon: '✏️', text: 'Sermon notes uploaded for Sunday — formatted for app' },
  { icon: '📧', text: 'Newsletter delivered to 847 — opens trickling in' },
  { icon: '🎵', text: 'Worship rehearsal Tuesday 7 PM — calendar invite sent' },
  { icon: '💬', text: 'New small group inquiry routed to Pastor Mark' },
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
      subtitle="Sunday + comms activity — auto-updates"
    />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="6"
      heading="Sunday + comms queue"
      subtitle="Volunteer asks + drafted comms ready to schedule. Approve to send."
      @approved="onApproved"
    />

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Sunday readiness</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="readinessTone(sunday.filled_slots / sunday.total_slots)">
          {{ Math.round((sunday.filled_slots / sunday.total_slots) * 100) }}%
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ sunday.filled_slots }}/{{ sunday.total_slots }} roles</div>
      </div>
      <div class="card">
        <div class="kpi-label">Roles short</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="sunday.short_total > 0 ? 'text-warn' : 'text-success'">{{ sunday.short_total }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">people needed Sunday</div>
      </div>
      <div class="card">
        <div class="kpi-label">Sent (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ comms.sent_30d }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ comms.scheduled_count }} scheduled</div>
      </div>
      <div class="card">
        <div class="kpi-label">Bulletin open rate</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ pct(comms.bulletin_open_rate) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ comms.bulletin_subscribers }} subscribers</div>
      </div>
    </div>

    <!-- Volunteer Coordination — Sunday readiness + Grace's suggestions -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">🙋 Volunteer Coordination · This Sunday</span>
          <span class="text-xs text-ink-muted">— Grace's roster gaps + suggested fills</span>
        </div>
        <span class="text-[11px] text-ink-disabled">{{ upcomingService.date_label }} · {{ upcomingService.sermon.title }}</span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <div class="kpi-label">Sermon prep</div>
          <div class="mt-0.5 text-xl font-bold tabular-nums" :class="readinessTone(sunday.prep_pct / 100)">{{ sunday.prep_pct }}%</div>
        </div>
        <div>
          <div class="kpi-label">Roles filled</div>
          <div class="mt-0.5 text-xl font-bold tabular-nums" :class="readinessTone(sunday.filled_slots / sunday.total_slots)">{{ sunday.filled_slots }}/{{ sunday.total_slots }}</div>
        </div>
        <div>
          <div class="kpi-label">Announcements</div>
          <div class="mt-0.5 text-xl font-bold text-ink tabular-nums">{{ sunday.announcements_ready }}/{{ sunday.announcements_total }}</div>
        </div>
        <div>
          <div class="kpi-label">Worship setlist</div>
          <div class="mt-0.5 text-xl font-bold text-success tabular-nums">{{ upcomingService.worship_setlist.length }}</div>
          <div class="text-[10px] text-ink-disabled">songs locked</div>
        </div>
      </div>

      <div v-if="understaffedRoles.length > 0">
        <div class="kpi-label mb-2">Roles short — Grace's suggested fills</div>
        <ul class="space-y-2">
          <li
            v-for="r in understaffedRoles"
            :key="r.role + r.time"
            class="rounded-md border border-warn/30 bg-warn/5 px-3 py-2"
          >
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ r.label }}</span>
              <span class="text-[11px] text-ink-muted">· {{ fmtSlotTime(r.time) }} · {{ r.need }} short</span>
            </div>
            <p v-if="r.suggested.length > 0" class="text-[11px] text-ink-muted mt-1">
              <span class="font-medium text-brand">Grace suggests:</span> {{ r.suggested.join(', ') }}
            </p>
            <p v-else class="text-[11px] text-ink-disabled mt-1 italic">No fill suggestions yet — pinged Planning Center.</p>
          </li>
        </ul>
      </div>
      <p v-else class="text-xs text-success">All Sunday roles staffed.</p>
    </section>

    <!-- Communications — Sent + Drafts + Performance -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">📧 Communications · Recent</span>
          <span class="text-xs text-ink-muted">— sent in the last few weeks</span>
        </div>
      </div>

      <ul class="space-y-2 mb-4">
        <li
          v-for="p in recentPosts"
          :key="p.id"
          class="rounded-md bg-canvas/50 px-3 py-2"
        >
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-base flex-shrink-0">{{ CHANNEL_META[p.channel].icon }}</span>
            <span class="text-sm font-semibold text-ink truncate">{{ p.title }}</span>
            <span class="rounded-full bg-surface-elevated text-ink-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">{{ CHANNEL_META[p.channel].label }}</span>
          </div>
          <p v-if="p.reach" class="text-[11px] text-ink-muted mt-0.5">
            {{ p.reach.toLocaleString() }} reach
            <span v-if="p.engagements"> · {{ p.engagements }} engaged</span>
            <span v-if="p.click_throughs"> · {{ p.click_throughs }} clicked</span>
          </p>
        </li>
      </ul>

      <div v-if="draftedPosts.length > 0">
        <div class="kpi-label mb-2">📝 Drafts waiting for your review</div>
        <ul class="space-y-1.5">
          <li
            v-for="p in draftedPosts.slice(0, 4)"
            :key="p.id"
            class="flex items-center gap-2 text-xs"
          >
            <span class="text-sm flex-shrink-0">{{ CHANNEL_META[p.channel].icon }}</span>
            <span class="font-medium text-ink truncate flex-1">{{ p.title }}</span>
            <span
              class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
              :class="p.status === 'scheduled' ? 'bg-brand/15 text-brand' : 'bg-warn/15 text-warn'"
            >{{ p.status }}</span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
