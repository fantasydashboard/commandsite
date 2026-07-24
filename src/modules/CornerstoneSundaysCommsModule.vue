<script setup lang="ts">
/**
 * Cornerstone Serving (volunteer scheduling, burnout, and weekly comms).
 * Grace's roles on this page: Volunteer Coordination + Communications.
 */
import { computed, onMounted } from 'vue'
import type { Client } from '@/types/database'
import { VOLUNTEER_ROLE_META } from '@/lib/clients/cornerstone/sundays'
import { CHANNEL_META } from '@/lib/clients/cornerstone/comms'
import { churchDataset } from '@/lib/clients/church/dataset'
import { rolesOnTab, getRole } from '@/lib/clients/cornerstone/roles'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'
import LiveActivityFeed from '@/components/ada/LiveActivityFeed.vue'
import RolesOnPage from '@/components/ada/RolesOnPage.vue'
import AdaIcon from '@/components/ada/AdaIcon.vue'
import GraceRecommendations, { type GraceRecommendation } from '@/components/cornerstone/GraceRecommendations.vue'
import SampleBadge from '@/components/cornerstone/SampleBadge.vue'
import SundayReadinessBoard from '@/components/cornerstone/SundayReadinessBoard.vue'
import BurnoutWatch from '@/components/cornerstone/BurnoutWatch.vue'
import CommsDrafts from '@/components/cornerstone/CommsDrafts.vue'
import FlagDetailDrawer from '@/components/cornerstone/FlagDetailDrawer.vue'
import { focalPointRoster } from '@/lib/clients/focal-point/roster'
import { useCongregationLens } from '@/stores/congregationLens'
import { useLiveActivity, seedEvent, type PoolEvent } from '@/composables/useLiveActivity'
import { loadCareData, burnoutData } from '@/lib/clients/church/careDataLoader'
import { LIVE_CHURCHES } from '@/lib/clients/church/liveChurches'

const props = defineProps<{ client: Client; config: Record<string, unknown> }>()

// Live churches get Burnout Watch's real Planning Center pull; everyone else
// keeps the baked demo snapshot (the loader getter falls back automatically).
// The Care & Drift module may have already loaded this church's data, but the
// loader is idempotent and cheap, so calling it here too keeps this module
// correct even when a user lands here first.
onMounted(() => {
  if (LIVE_CHURCHES.includes(props.client?.slug)) loadCareData(props.client.slug)
})

// Over-serving scopes by campus like the Burnout Watch list below, so the KPI and
// the list always agree. The other KPIs (spots to fill, fresh capacity) are the
// church-wide roster, which does not scope.
const lens = useCongregationLens()
const overServing = computed(() => {
  const s = lens.scope
  return burnoutData().people.filter((p) => s === 'all' || p.campus === 'both' || p.campus === s).length
})

// Client-varying data resolved by slug; names preserved so the rest of the
// module and template are unchanged.
const data = churchDataset(props.client.slug)
// Sundays & Comms is Sample for Focal Point until comms/volunteer data lands.
const isFocalPoint = computed(() => props.client.slug === 'focal-point-church')
const sundayStats = data.sundays.stats
const upcomingService = data.sundays.upcoming
const commsStats = data.comms.stats
const posts = data.comms.posts

const sunday = computed(() => sundayStats())
const comms = computed(() => commsStats())

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

// Countdown to first service Sunday morning. Reads the upcoming-service
// date and counts forward from now. Used by the Sunday-status hero so
// the pastor has a single anchor for "how close are we, and are we ready?"
const sundayCountdown = computed(() => {
  const target = new Date(upcomingService.date)
  target.setHours(9, 0, 0, 0)
  const ms = target.getTime() - Date.now()
  if (ms <= 0) return 'Today'
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  if (days === 0) return `${hours}h`
  if (days === 1) return `1 day · ${hours}h`
  return `${days} days`
})

const sundayReadinessPct = computed(() =>
  Math.round((sunday.value.filled_slots / sunday.value.total_slots) * 100),
)

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
    role: 'volunteer_coord',
    icon: 'calendar',
    badge: 'Volunteer Coord',
    badgeClass: 'bg-accent/15 text-accent',
    title: 'Fill ask: Nursery Sunday 9 AM',
    recipient: '2 spots open · Mia Pham + Amanda Foster suggested',
    preview: '"Hey Mia and Amanda — Linda and Aanya are both off this Sunday and we\'re short for the 9 AM nursery slot. You\'ve both filled in last-minute before and saved the day. Any chance one (or both) of you could swing it? Totally fine if not. — Pastor Mark (via Grace)"',
    approved_response: "Sent to both. Planning Center will auto-confirm if either says yes. I'll surface the result Saturday morning if no one bites — usually they reply same-day.",
    ticker_after_approval: 'Nursery fill ask sent — Mia + Amanda',
  },
  {
    id: 'sun-parking-11',
    role: 'volunteer_coord',
    icon: 'calendar',
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
    role: 'communications',
    icon: 'email_marketing',
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
    role: 'communications',
    icon: 'email_marketing',
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
    role: 'communications',
    icon: 'trending-up',
    badge: 'Communications',
    badgeClass: 'bg-success/15 text-success',
    title: 'Building fund milestone post',
    recipient: '60% of goal hit — share-ready',
    preview: '"Friends — we just crossed 60% of the building fund goal. Thank you. Every gift, every prayer, every Sunday you\'ve shown up has gotten us here. There\'s real momentum and we\'re feeling it. Specific number + what\'s next in this Sunday\'s announcement."',
    approved_response: 'Posted to socials + church app. Church-app push notifications usually get 18-22% engagement on milestone posts.',
    ticker_after_approval: 'Building fund milestone posted — socials + app',
  },
]

// ── Live activity (scoped to Sundays & Comms) ─────────────────────────
const liveSeed = [
  seedEvent(12 * 60,   'check-circle',    'Worship setlist locked — Jess + Marcus + Holloway',   'volunteer_coord'),
  seedEvent(38 * 60,   'check-circle',    'Holloway confirmed for backing vocals 9 AM',          'volunteer_coord'),
  seedEvent(4 * 3600,  'email_marketing', 'Newsletter open: 38% (847 subscribers)',              'communications'),
  seedEvent(6 * 3600,  'calendar',        'Parking team — 1 short for 11 AM, ask drafted',       'volunteer_coord'),
]
const livePool: PoolEvent[] = [
  { icon: 'calendar',        text: 'Volunteer accept — Mia Pham confirmed for 9 AM nursery',  role: 'volunteer_coord' },
  { icon: 'calendar',        text: 'Sunday slot auto-confirmed — Kids Ministry team complete', role: 'volunteer_coord' },
  { icon: 'email_marketing', text: 'Sermon notes uploaded for Sunday — formatted for app',     role: 'communications' },
  { icon: 'email_marketing', text: 'Newsletter delivered to 847 — opens trickling in',         role: 'communications' },
  { icon: 'check-circle',    text: 'Worship rehearsal Tuesday 7 PM — calendar invite sent',     role: 'volunteer_coord' },
  { icon: 'qa_assistant',    text: 'New small group inquiry routed to Pastor Mark',             role: 'communications' },
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

const pageRoles = rolesOnTab('sundays-comms')

// ── Grace's recommendations for Sundays & Comms ─────────────────────
const sundaysRecommendations: GraceRecommendation[] = [
  {
    id: 'sc-greeters-gap',
    title: 'Greeters team: 2 of 5 confirmed for next Sunday',
    tag: 'Heads up',
    tagTone: 'urgent',
    body: 'You usually run with 5. I have 8 past greeters I can text Thursday morning for a soft ask. Most churches realize the gap Saturday at 7pm; I can have this closed by Friday noon.',
    actionLabel: 'Let Grace handle the texts',
  },
  {
    id: 'sc-newsletter-frame',
    title: 'Mid-week newsletter is drafted, with a Diego shoutout woven in',
    tag: 'Worth your eyes',
    tagTone: 'pastoral',
    body: 'Three families specifically named the worship team in their connection cards this month. I drafted a newsletter that opens with "the worship team is hearing you," which is the kind of recognition that retains volunteers. Goes Tuesday at 10am unless you edit.',
    actionLabel: 'Read the draft',
  },
  {
    id: 'sc-sunday-school-up',
    title: 'Sunday school registration is up 22% vs last fall',
    tag: 'Opportunity',
    tagTone: 'opportunity',
    body: 'Real momentum. Worth surfacing in announcements + dropping a quick celebration line in this week\'s newsletter ("our kids ministry is the biggest it\'s been"). Builds confidence for the families on the fence.',
    impact: 'Mentioning growth publicly tends to lift the next month\'s registrations another 8-12%.',
    actionLabel: 'Draft the celebration line',
  },
]
</script>

<template>
  <div class="space-y-4">
    <RolesOnPage
      :roles="pageRoles"
      :back-to="{ name: 'dashboard.tab', params: { slug: 'cornerstone-church', tab: 'today' } }"
    />

    <!-- Grace's note (hidden for Focal Point) -->
    <section v-if="!isFocalPoint" class="rounded-card border border-brand/25 bg-brand/[0.04] px-5 py-4">
      <header class="flex items-center gap-2.5 mb-2.5">
        <div class="h-7 w-7 rounded-full bg-brand text-ink-inverse flex items-center justify-center text-xs font-bold flex-shrink-0">G</div>
        <span class="text-xs font-bold text-ink">Grace's note on Sunday prep + comms</span>
      </header>
      <p class="text-[13.5px] text-ink leading-relaxed max-w-2xl">
        Sunday is ~85% ready right now. Greeters team is short 3 (I can fix that Thursday). Mid-week newsletter is drafted and waiting on your edit, opens with a worship-team shoutout because 3 families specifically called them out this month. Volunteer texts go out automatically Friday at 5pm unless you say otherwise. Most pastors don't realize their volunteer gaps until Saturday night; I see them on Tuesday.
      </p>
    </section>

    <!-- Sunday-status hero: this page's anchor. Countdown + readiness %
         + outstanding actions in one glance. Operational page, so the
         answer to "are we ready for Sunday?" lives at the top, not
         buried in the KPI strip. -->
    <!-- Focal Point: real Sunday operations (staff Sunday without burning out your people) -->
    <template v-if="isFocalPoint">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="card">
          <div class="kpi-label">This Sunday</div>
          <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ focalPointRoster.sundayLabel.replace('Sun ', '') }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">{{ focalPointRoster.daysAway }} days away</div>
        </div>
        <div class="card">
          <div class="kpi-label">Spots to fill</div>
          <div class="mt-1 text-2xl font-bold text-warn tabular-nums">{{ focalPointRoster.totalShort }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">across {{ focalPointRoster.teamsShort }} teams</div>
        </div>
        <div class="card">
          <div class="kpi-label">Over-serving</div>
          <div class="mt-1 text-2xl font-bold text-danger tabular-nums">{{ overServing }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">protect, do not add load</div>
        </div>
        <div class="card">
          <div class="kpi-label">Fresh capacity</div>
          <div class="mt-1 text-2xl font-bold text-success tabular-nums">74%</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">of core do not serve yet</div>
        </div>
      </div>
      <SundayReadinessBoard />
      <BurnoutWatch />
      <CommsDrafts />
      <FlagDetailDrawer />
    </template>

    <section v-if="!isFocalPoint" class="card border-2 border-brand bg-brand/[0.04] !p-5">
      <div class="text-[10px] font-bold uppercase tracking-[0.18em] text-brand mb-2">This Sunday · readiness brief</div>
      <div class="flex flex-wrap items-end gap-x-8 gap-y-3 justify-between">
        <div class="min-w-0">
          <div class="flex items-baseline gap-3 flex-wrap">
            <div class="text-3xl font-bold text-brand tabular-nums leading-none">{{ sundayCountdown }}</div>
            <div class="text-sm font-semibold text-ink">
              until first service
              <span class="text-ink-muted font-medium">·</span>
              <span :class="readinessTone(sunday.filled_slots / sunday.total_slots)">{{ sundayReadinessPct }}% ready</span>
            </div>
          </div>
          <div class="text-[11px] uppercase tracking-wide text-ink-muted mt-1.5">{{ upcomingService.sermon.title }}</div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-xs text-ink-muted">
            <span><span class="font-semibold" :class="sunday.short_total > 0 ? 'text-warn' : 'text-success'">{{ sunday.short_total }}</span> roles still short</span>
            <span class="text-ink-disabled" aria-hidden="true">·</span>
            <span><span class="font-semibold text-ink">{{ draftedPosts.length }}</span> comms drafts awaiting sign-off</span>
            <span class="text-ink-disabled" aria-hidden="true">·</span>
            <span class="inline-flex items-center gap-1">
              <AdaIcon name="check-circle" class="h-3 w-3 text-success flex-shrink-0" />
              <span>Worship setlist locked ({{ upcomingService.worship_setlist.length }} songs)</span>
            </span>
          </div>
        </div>
        <div class="text-xs text-ink-muted max-w-md">
          <span class="font-semibold text-ink">Latest:</span> Holloway confirmed for backing vocals · 38 min ago
        </div>
      </div>
    </section>

    <GraceApprovalQueue
      v-if="!isFocalPoint"
      :items="queueItems"
      :initial-resolved="6"
      assistant-name="Grace"
      heading="Sunday + comms queue"
      subtitle="Volunteer asks + drafted comms ready to schedule. Co-sign to send."
      @approved="onApproved"
    />

    <!-- KPI strip (Cornerstone demo) -->
    <div v-if="!isFocalPoint" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

    <!-- Volunteer Coordination — Sunday readiness (Cornerstone demo; Focal Point uses the real board above) -->
    <section v-if="!isFocalPoint" id="volunteer_coord" class="card scroll-mt-24">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Volunteer Coordination · This Sunday</span> <SampleBadge v-if="isFocalPoint" />
          <span class="text-xs text-ink-muted">Grace's roster gaps + suggested fills</span>
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
          <!-- Urgency-aware row styling: 2+ short = danger accent
               (red tint), 1 short = warn accent (amber tint). Pastor's
               eye lands on the most critical gap first instead of
               having to read all 5 rows to triage. -->
          <li
            v-for="r in understaffedRoles"
            :key="r.role + r.time"
            class="rounded-md border px-3 py-2"
            :class="r.need >= 2 ? 'border-danger/40 bg-danger/5' : 'border-warn/30 bg-warn/5'"
          >
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ r.label }}</span>
              <span class="text-[11px] text-ink-muted">· {{ fmtSlotTime(r.time) }}</span>
              <span
                class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
                :class="r.need >= 2 ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn'"
              >{{ r.need }} short</span>
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

    <!-- Communications — Drafts first (action surface), then Sent + Performance -->
    <section v-if="!isFocalPoint" id="communications" class="card scroll-mt-24">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Communications</span> <SampleBadge v-if="isFocalPoint" />
          <span class="text-xs text-ink-muted">drafts + recent sends</span>
        </div>
      </div>

      <!-- Drafts waiting for review: promoted above the recent-sends list
           so the action surface (things that need pastoral sign-off) is
           seen first. Recent-sends is reference data; drafts are work. -->
      <div v-if="draftedPosts.length > 0" class="mb-5 rounded-md border border-divider bg-surface-elevated/40 px-3 py-3">
        <div class="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
          <div class="kpi-label">Drafts waiting for your review</div>
          <span class="text-[11px] text-ink-disabled">{{ draftedPosts.length }} pending</span>
        </div>
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

      <div class="kpi-label mb-2">Recent sends</div>
      <ul class="space-y-2">
        <li
          v-for="p in recentPosts"
          :key="p.id"
          class="rounded-md bg-surface-elevated/60 px-3 py-2"
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
    </section>

    <LiveActivityFeed
      v-if="!isFocalPoint"
      :events="liveEvents"
      :fmt-ago="fmtLiveAgo"
      :get-role="getRole"
      title="Sunday + comms activity"
      subtitle="Grace's stream scoped to this page · auto-updates"
    />

    <!-- Grace's recommendations — what to act on this week -->
    <GraceRecommendations v-if="!isFocalPoint" :recommendations="sundaysRecommendations" />
  </div>
</template>
