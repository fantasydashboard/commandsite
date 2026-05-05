<script setup lang="ts">
/**
 * Cornerstone — Engagement (metrics-only).
 *
 * Replaces the four operational tabs (Visitors / Sundays / Comms / Care
 * approval queues) with one page that shows what's working and what's
 * drifting. Pastor reads numbers + "what ran" — never approves drafts
 * or assigns volunteers from this surface.
 *
 * Four sections:
 *   1. Visitor funnel — first-time → connected → member rates + recent
 *      automation actions (welcome SMS sent, etc.)
 *   2. Sunday readiness — prep %, slots filled, chronic understaffing
 *   3. Comms performance — sent, open rate, reach by channel
 *   4. Serving participation — % families serving, teams at capacity,
 *      households that dropped a serving role
 */
import { computed } from 'vue'
import type { Client } from '@/types/database'
import { visitorStats, STAGE_META as VISITOR_STAGE_META } from '@/lib/clients/cornerstone/visitors'
import { sundayStats, upcomingService, VOLUNTEER_ROLE_META } from '@/lib/clients/cornerstone/sundays'
import { commsStats, posts, CHANNEL_META } from '@/lib/clients/cornerstone/comms'
import { households, people, SERVING_LABEL, type ServingRole } from '@/lib/clients/cornerstone/people'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const visitor = computed(() => visitorStats())
const sunday = computed(() => sundayStats())
const comms = computed(() => commsStats())

// ── Serving participation (computed from people fixtures) ───────────────
const servingMetrics = computed(() => {
  // Active families = members + pillars + returning (not visitors, not drifting)
  const activeHouseholds = households.filter((h) =>
    h.stage === 'member' || h.stage === 'pillar' || h.stage === 'returning',
  )
  const activeIds = new Set(activeHouseholds.map((h) => h.id))
  // Families with at least one adult serving in any role
  const servingFamilies = activeHouseholds.filter((h) =>
    people.some((p) => p.household_id === h.id && p.age_group === 'adult' && p.serving_roles.length > 0),
  ).length
  // Households that have stopped serving (active but yellow/red on serving flag)
  const droppedServing = activeHouseholds.filter((h) =>
    h.serving_flag === 'yellow' || h.serving_flag === 'red',
  )
  const participation = activeHouseholds.length > 0 ? servingFamilies / activeHouseholds.length : 0
  // Per-team participation (active adults serving in role / adult population)
  const adultPop = people.filter((p) => p.age_group === 'adult' && activeIds.has(p.household_id)).length
  const roleCounts: Record<ServingRole, number> = {
    worship_team: 0, kids_ministry: 0, youth_leader: 0, usher: 0, parking_team: 0,
    hospitality: 0, tech_av: 0, small_group_leader: 0, prayer_team: 0, community_outreach: 0,
  }
  for (const p of people) {
    if (p.age_group !== 'adult') continue
    if (!activeIds.has(p.household_id)) continue
    for (const r of p.serving_roles) roleCounts[r]++
  }
  // "At capacity" — pretend each team has a target. Use a flat 5 for demo.
  const TEAM_TARGETS: Record<ServingRole, number> = {
    worship_team: 8, kids_ministry: 12, youth_leader: 6, usher: 6, parking_team: 6,
    hospitality: 8, tech_av: 4, small_group_leader: 8, prayer_team: 6, community_outreach: 4,
  }
  const teams = (Object.keys(roleCounts) as ServingRole[]).map((k) => ({
    key: k,
    label: SERVING_LABEL[k],
    count: roleCounts[k],
    target: TEAM_TARGETS[k],
    pct: TEAM_TARGETS[k] > 0 ? roleCounts[k] / TEAM_TARGETS[k] : 0,
  })).sort((a, b) => a.pct - b.pct)
  return {
    serving_families: servingFamilies,
    total_active: activeHouseholds.length,
    participation_pct: participation,
    dropped_serving: droppedServing,
    teams,
    adult_pop: adultPop,
  }
})

// ── Sunday readiness — chronic understaffing call-out ───────────────────
const understaffedRoles = computed(() => {
  // Slots short for upcoming Sunday — surface them with a "trend" frame
  return upcomingService.slots
    .filter((s) => s.confirmed.length < s.needed)
    .map((s) => ({
      role: s.role,
      label: VOLUNTEER_ROLE_META[s.role].label,
      need: s.needed - s.confirmed.length,
      time: s.service,
    }))
})

// ── Comms — channel rollup ───────────────────────────────────────────────
const channelPerf = computed(() => {
  // Group sent posts by channel for last-30d performance roll-up
  const sent = posts.filter((p) => p.status === 'sent')
  const byChannel: Record<string, { count: number; reach: number; engagement: number }> = {}
  for (const p of sent) {
    const k = p.channel
    if (!byChannel[k]) byChannel[k] = { count: 0, reach: 0, engagement: 0 }
    byChannel[k].count++
    byChannel[k].reach += p.reach ?? 0
    byChannel[k].engagement += p.engagements ?? 0
  }
  return byChannel
})

// ── Recent automation actions (visitor pipeline + comms send) ───────────
interface AutoEvent { icon: string; label: string; detail: string; ago: string }
const visitorAutoFeed: AutoEvent[] = [
  { icon: '👋', label: 'Welcome SMS sent', detail: 'Riley Boucher · first-time visitor Sun · opened in 12m', ago: '2h' },
  { icon: '✉', label: 'Day-3 nudge sent', detail: 'Kennedy Park · "What did you think of Sunday?"', ago: '1d' },
  { icon: '📣', label: 'Newcomers Lunch invite sent', detail: 'The Maddux Family · 4th visit', ago: '2d' },
  { icon: '🎓', label: 'Discover Cornerstone invite sent', detail: 'The Maddux Family · post-lunch follow-up', ago: '3d' },
  { icon: '🏡', label: '"We missed you" sent', detail: 'The Reyes Family · returning after 4-month gap', ago: '5d' },
]

function pct(v: number, places = 0): string { return (v * 100).toFixed(places) + '%' }
function fmtSlotTime(t: '9_am' | '11_am'): string { return t === '9_am' ? '9 AM' : '11 AM' }
function deltaTone(p: number): string {
  if (p >= 0.85) return 'text-success'
  if (p >= 0.6) return 'text-warn'
  return 'text-danger'
}
function teamPctTone(p: number): string {
  if (p >= 0.9) return 'text-success'
  if (p >= 0.6) return 'text-ink'
  return 'text-warn'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Engagement</h2>
        <p class="text-sm text-ink-muted">
          What's working + what's drifting across the visitor pipeline, Sunday operations, comms, and serving teams. No queues, no approvals — automations run; this page shows the result.
        </p>
      </div>
      <div class="text-xs text-ink-muted">
        <span class="inline-flex items-center gap-1">
          <span class="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
          Live
        </span>
      </div>
    </div>

    <!-- Top KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Active visitors</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ visitor.total_active }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ visitor.first_time_30d }} first-timers in 30d</div>
      </div>
      <div class="card">
        <div class="kpi-label">Sunday readiness</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="deltaTone(sunday.filled_slots / sunday.total_slots)">{{ Math.round((sunday.filled_slots / sunday.total_slots) * 100) }}%</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ sunday.filled_slots }}/{{ sunday.total_slots }} roles filled</div>
      </div>
      <div class="card">
        <div class="kpi-label">Comms reach (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ comms.bulletin_subscribers + comms.social_followers_combined + comms.sms_audience }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ comms.sent_30d }} sends · {{ pct(comms.bulletin_open_rate) }} bulletin open</div>
      </div>
      <div class="card">
        <div class="kpi-label">Serving participation</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="deltaTone(servingMetrics.participation_pct)">{{ pct(servingMetrics.participation_pct) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ servingMetrics.serving_families }}/{{ servingMetrics.total_active }} active families</div>
      </div>
    </div>

    <!-- Visitor funnel -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Visitor funnel</span>
          <span class="text-xs text-ink-muted">conversion rates + most recent automated touches</span>
        </div>
      </div>

      <!-- Funnel bar -->
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

      <!-- Conversion rates -->
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="rounded-md bg-success/5 border border-success/20 px-3 py-2">
          <div class="kpi-label">Connect rate</div>
          <div class="mt-0.5 text-xl font-bold text-success tabular-nums">{{ pct(visitor.connect_rate) }}</div>
          <div class="text-[10px] text-ink-disabled">visitors → connected</div>
        </div>
        <div class="rounded-md bg-brand/5 border border-brand/20 px-3 py-2">
          <div class="kpi-label">Member conversion</div>
          <div class="mt-0.5 text-xl font-bold text-brand tabular-nums">{{ pct(visitor.member_conversion_rate) }}</div>
          <div class="text-[10px] text-ink-disabled">visitors → member (90d window)</div>
        </div>
      </div>

      <!-- Recent automated touches -->
      <div>
        <div class="kpi-label mb-2">Recent automated touches</div>
        <ul class="space-y-1.5">
          <li v-for="(e, i) in visitorAutoFeed" :key="i" class="flex items-center gap-2 text-xs">
            <span>{{ e.icon }}</span>
            <span class="font-semibold text-ink">{{ e.label }}</span>
            <span class="text-ink-muted truncate flex-1">{{ e.detail }}</span>
            <span class="text-[10px] text-ink-disabled flex-shrink-0">{{ e.ago }} ago</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Sunday readiness -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Sunday readiness</span>
          <span class="text-xs text-ink-muted">— sermon prep + roles + chronic gaps</span>
        </div>
        <span class="text-[11px] text-ink-disabled">{{ upcomingService.date_label }} · {{ upcomingService.sermon.title }}</span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <div class="kpi-label">Sermon prep</div>
          <div class="mt-0.5 text-xl font-bold tabular-nums" :class="deltaTone(sunday.prep_pct / 100)">{{ sunday.prep_pct }}%</div>
        </div>
        <div>
          <div class="kpi-label">Roles filled</div>
          <div class="mt-0.5 text-xl font-bold tabular-nums" :class="deltaTone(sunday.filled_slots / sunday.total_slots)">{{ sunday.filled_slots }}/{{ sunday.total_slots }}</div>
        </div>
        <div>
          <div class="kpi-label">Total people short</div>
          <div class="mt-0.5 text-xl font-bold tabular-nums" :class="sunday.short_total > 0 ? 'text-warn' : 'text-success'">{{ sunday.short_total }}</div>
        </div>
        <div>
          <div class="kpi-label">Announcements</div>
          <div class="mt-0.5 text-xl font-bold text-ink tabular-nums">{{ sunday.announcements_ready }}/{{ sunday.announcements_total }}</div>
        </div>
      </div>

      <!-- Chronic understaffing call-out -->
      <div v-if="understaffedRoles.length > 0">
        <div class="kpi-label mb-2">Roles short this Sunday <span class="text-[10px] text-ink-disabled">— Planning Center is handling the asks</span></div>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="r in understaffedRoles"
            :key="r.role + r.time"
            class="rounded-md bg-warn/10 text-warn px-2 py-1 text-[11px] font-medium"
          >
            {{ r.label }} · {{ fmtSlotTime(r.time) }} · {{ r.need }} short
          </span>
        </div>
      </div>
      <p v-else class="text-xs text-success">All Sunday roles staffed.</p>
    </section>

    <!-- Comms performance -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Comms performance</span>
          <span class="text-xs text-ink-muted">— sent in last 30d, by channel</span>
        </div>
        <span class="text-[11px] text-ink-disabled">{{ comms.scheduled_count }} scheduled · {{ comms.sent_30d }} sent</span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div
          v-for="(perf, ch) in channelPerf"
          :key="ch"
          class="rounded-md border border-divider bg-canvas/40 px-3 py-2"
        >
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="text-base">{{ CHANNEL_META[ch as keyof typeof CHANNEL_META]?.icon }}</span>
            <span class="kpi-label">{{ CHANNEL_META[ch as keyof typeof CHANNEL_META]?.label ?? ch }}</span>
          </div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ perf.reach.toLocaleString() }}</div>
          <div class="text-[10px] text-ink-disabled">{{ perf.count }} sends · {{ perf.engagement }} engaged</div>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 text-center">
        <div><div class="kpi-label">Bulletin opens</div><div class="text-base font-semibold text-ink tabular-nums">{{ pct(comms.bulletin_open_rate) }}</div></div>
        <div><div class="kpi-label">Bulletin list</div><div class="text-base font-semibold text-ink tabular-nums">{{ comms.bulletin_subscribers.toLocaleString() }}</div></div>
        <div><div class="kpi-label">SMS audience</div><div class="text-base font-semibold text-ink tabular-nums">{{ comms.sms_audience.toLocaleString() }}</div></div>
      </div>
    </section>

    <!-- Serving participation -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Serving participation</span>
          <span class="text-xs text-ink-muted">— who's in, who dropped, which teams need bodies</span>
        </div>
      </div>

      <!-- Top KPIs -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <div class="kpi-label">Families serving</div>
          <div class="mt-0.5 text-xl font-bold text-ink tabular-nums">{{ pct(servingMetrics.participation_pct) }}</div>
          <div class="text-[10px] text-ink-disabled">{{ servingMetrics.serving_families }}/{{ servingMetrics.total_active }} active families</div>
        </div>
        <div>
          <div class="kpi-label">Adults volunteering</div>
          <div class="mt-0.5 text-xl font-bold text-ink tabular-nums">{{ servingMetrics.adult_pop }}</div>
          <div class="text-[10px] text-ink-disabled">across {{ servingMetrics.teams.length }} teams</div>
        </div>
        <div>
          <div class="kpi-label">Households dropped serving</div>
          <div class="mt-0.5 text-xl font-bold tabular-nums" :class="servingMetrics.dropped_serving.length > 0 ? 'text-warn' : 'text-ink'">{{ servingMetrics.dropped_serving.length }}</div>
          <div class="text-[10px] text-ink-disabled">yellow/red flag · see People</div>
        </div>
      </div>

      <!-- Teams capacity grid -->
      <div>
        <div class="kpi-label mb-2">Teams · staffed vs target</div>
        <div class="space-y-1.5">
          <div
            v-for="t in servingMetrics.teams"
            :key="t.key"
            class="flex items-center gap-3 text-xs"
          >
            <span class="w-44 text-ink truncate">{{ t.label }}</span>
            <div class="flex-1 h-2 rounded-full bg-canvas overflow-hidden">
              <div
                class="h-full rounded-full"
                :class="t.pct >= 0.9 ? 'bg-success' : t.pct >= 0.6 ? 'bg-brand' : 'bg-warn'"
                :style="{ width: Math.min(100, t.pct * 100) + '%' }"
              ></div>
            </div>
            <span class="tabular-nums w-16 text-right text-ink-muted" :class="teamPctTone(t.pct)">{{ t.count }}/{{ t.target }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
