<script setup lang="ts">
/**
 * UFD Redesign — individual user list. The B2C parallel to CommandSite
 * Customers, but with viral / share-driven mechanics: shares + viral
 * referrals attributed are first-class columns.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  users,
  userStats,
  PLAN_META,
  STAGE_META,
  PLATFORM_META,
  type UfdUser,
  type LifecycleStage,
  type Plan,
} from '@/lib/clients/ufd-redesign/users'
import {
  useUfdUsersData,
  COHORT_META,
  trialDaysLeft,
  daysSinceSignup,
  gmailComposeUrlForUser,
  type Cohort,
  type UfdUserRow,
} from '@/lib/clients/ufd-redesign/useUfdUsersData'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => userStats())

// ── Real cohort data via ufd-users edge function ─────────────────────
// Replaces the fixture-only flow at the top of the module. The
// fixture KPI strip + top-sharers leaderboard + filter table below
// stays for now as design reference — to be cut once every real
// surface lives here.
const live = useUfdUsersData('free_trial')

const cohortTabs: Cohort[] = [
  'free_trial',
  'at_risk',
  'expired',
  'individual_monthly',
  'individual_annual',
  'league_passes',
]

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

/** Subject + body for the founder-touch outreach email per cohort. */
function outreachDraftFor(user: UfdUserRow): { subject: string; body: string } {
  const firstName = (user.full_name ?? '').split(' ')[0] || 'there'
  if (live.cohort.value === 'free_trial') {
    const daysLeft = trialDaysLeft(user)
    const subject = `Quick check-in, ${firstName.toLowerCase()}`
    const body = `Hey ${firstName},\n\nI'm Josh, I built Ultimate Fantasy Dashboard. I noticed you signed up for the trial${daysLeft !== null && daysLeft >= 0 ? ` and you've got ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : ''}.\n\nQuick question — what's your league size, and is there anything specific you wanted UFD to do that you haven't figured out yet? I read every reply and I'm happy to help you get set up if anything's been confusing.\n\nThanks for trying it out.\n\n— Josh`
    return { subject, body }
  }
  if (live.cohort.value === 'expired' || live.cohort.value === 'at_risk') {
    const subject = `Coming back for the NFL Draft?`
    const body = `Hey ${firstName},\n\nJosh from UFD here. I noticed your trial wrapped up a while back. NFL Draft's coming up — usually the moment fantasy folks get back into prep mode.\n\nIf you want a fresh start, I can spin your account back up with a fresh 14 days. Just hit reply with "yes" and I'll handle it.\n\nNo pressure if it's not for you.\n\n— Josh`
    return { subject, body }
  }
  // Paying tiers — light NPS check-in
  const subject = `Quick check-in, ${firstName.toLowerCase()}`
  const body = `Hey ${firstName},\n\nJosh from UFD. Just checking in — anything I should know about your experience? What's working, what's not? Reply with anything.\n\n— Josh`
  return { subject, body }
}

function openGmailFor(user: UfdUserRow) {
  const draft = outreachDraftFor(user)
  const url = gmailComposeUrlForUser(user, draft)
  window.open(url, '_blank', 'noopener')
}

type SortKey = 'name' | 'mrr' | 'health' | 'shares' | 'last_login' | 'signed_up'
const sortBy = ref<SortKey>('mrr')
const sortDir = ref<'asc' | 'desc'>('desc')
const stageFilter = ref<LifecycleStage | 'all'>('all')
const planFilter = ref<Plan | 'all'>('all')

const stageOrder: LifecycleStage[] = [
  'power_user', 'paid_active', 'paid_new', 'trial_engaged', 'trial_new', 'trial_expiring', 'at_risk', 'churned_recent', 'churned_long',
]

const filtered = computed<UfdUser[]>(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...users]
    .filter((u) => stageFilter.value === 'all' || u.lifecycle_stage === stageFilter.value)
    .filter((u) => planFilter.value === 'all' || u.plan === planFilter.value)
    .sort((a, b) => {
      if (sortBy.value === 'name')      return a.display_name.localeCompare(b.display_name) * dir
      if (sortBy.value === 'mrr')       return (a.mrr_cents - b.mrr_cents) * dir
      if (sortBy.value === 'health')    return (a.health_score - b.health_score) * dir
      if (sortBy.value === 'shares')    return (a.shares_30d - b.shares_30d) * dir
      if (sortBy.value === 'signed_up') return (new Date(a.signed_up_at).getTime() - new Date(b.signed_up_at).getTime()) * dir
      return (new Date(a.last_login_at).getTime() - new Date(b.last_login_at).getTime()) * dir
    })
})

function toggleSort(k: SortKey) {
  if (sortBy.value === k) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortBy.value = k; sortDir.value = k === 'name' ? 'asc' : 'desc' }
}
function sortInd(k: SortKey): string {
  if (sortBy.value !== k) return ''
  return sortDir.value === 'asc' ? '↑' : '↓'
}

function money(cents: number, opts: { compact?: boolean } = {}): string {
  if (cents === 0) return '—'
  if (opts.compact && cents >= 100_000) return '$' + Math.round(cents / 1000) + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return `${Math.floor(day / 30)}mo ago`
}

function fmtSinceSignup(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const day = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (day < 30) return `${day}d`
  if (day < 365) return `${Math.floor(day / 30)}mo`
  return `${(day / 365).toFixed(1)}yr`
}

function healthColor(score: number): string {
  if (score >= 80) return '#10B981'
  if (score >= 60) return 'rgb(var(--color-brand))'
  if (score >= 40) return '#F59E0B'
  return '#EF4444'
}
function trendArrow(t: UfdUser['health_trend']): string {
  if (t === 'up') return '↑'
  if (t === 'down') return '↓'
  return '→'
}
function trendColor(t: UfdUser['health_trend']): string {
  if (t === 'up') return '#10B981'
  if (t === 'down') return '#EF4444'
  return '#94A3B8'
}

// Top sharers leaderboard for the side card
const topSharers = computed(() =>
  [...users]
    .filter((u) => u.shares_30d > 0)
    .sort((a, b) => b.shares_30d - a.shares_30d)
    .slice(0, 5),
)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Users</h2>
        <p class="text-sm text-ink-muted">
          Real user cohorts from UFD's Supabase. The richer fixture views below are design reference until full wiring lands.
        </p>
      </div>
      <span
        class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        :class="live.error.value
          ? 'bg-danger/15 text-danger'
          : live.loading.value
            ? 'bg-warn/15 text-warn'
            : 'bg-success/15 text-success'"
      >
        <span class="h-1.5 w-1.5 rounded-full"
          :class="live.error.value ? 'bg-danger' : live.loading.value ? 'bg-warn animate-pulse' : 'bg-success'"></span>
        {{ live.error.value
          ? 'Data error'
          : live.loading.value
            ? 'Loading…'
            : `Live · ${live.rows.value.length} ${live.rows.value.length === 1 ? 'user' : 'users'} · refreshed ${fmtRelative(live.lastFetchAt.value)}` }}
      </span>
    </div>

    <!-- ── Real cohort data ──────────────────────────────────────── -->
    <section class="card p-0 overflow-hidden">
      <!-- Cohort tabs -->
      <div class="flex items-center gap-1 p-2 border-b border-divider/60 bg-surface-elevated flex-wrap">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mr-2">Cohort:</span>
        <button
          v-for="c in cohortTabs"
          :key="c"
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
          :class="live.cohort.value === c ? 'bg-brand text-white' : 'text-ink hover:bg-canvas/50'"
          @click="live.setCohort(c)"
        >{{ COHORT_META[c].label }}</button>
      </div>

      <!-- Subtitle for selected cohort -->
      <div class="px-3 py-2 border-b border-divider/60 bg-canvas/30">
        <p class="text-[11px] text-ink-muted">
          <strong class="text-ink" :class="COHORT_META[live.cohort.value].color">{{ COHORT_META[live.cohort.value].label }}</strong>
          — {{ COHORT_META[live.cohort.value].description }}
        </p>
      </div>

      <!-- User rows -->
      <div v-if="live.loading.value" class="p-6 text-center text-sm text-ink-muted">Loading…</div>
      <div v-else-if="live.error.value" class="p-6 text-center text-sm text-danger">
        Failed to load: {{ live.error.value }}
      </div>
      <div v-else-if="live.rows.value.length === 0" class="p-6 text-center text-sm text-ink-disabled italic">
        No users in this cohort right now.
      </div>
      <ul v-else class="divide-y divide-divider">
        <li
          v-for="(u, idx) in live.rows.value"
          :key="u.id ?? u.email + idx"
          class="px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-canvas/30"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ u.full_name || '(no name)' }}</span>
              <span class="text-[11px] text-ink-muted font-mono">{{ u.email }}</span>
              <!-- Trial countdown badge — most actionable cohort -->
              <span
                v-if="live.cohort.value === 'free_trial' && trialDaysLeft(u) !== null"
                class="rounded-full px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider"
                :class="(trialDaysLeft(u) ?? 99) <= 1
                  ? 'bg-danger/15 text-danger'
                  : (trialDaysLeft(u) ?? 99) <= 3
                    ? 'bg-warn/15 text-warn'
                    : 'bg-success/15 text-success'"
              >
                {{ (trialDaysLeft(u) ?? 0) < 0
                  ? `expired ${Math.abs(trialDaysLeft(u) ?? 0)}d ago`
                  : trialDaysLeft(u) === 0
                    ? 'expires today'
                    : `${trialDaysLeft(u)}d left` }}
              </span>
            </div>
            <div class="text-[11px] text-ink-disabled mt-0.5">
              <template v-if="u.signup_date">signed up {{ fmtDate(u.signup_date) }} · {{ daysSinceSignup(u) }}d ago</template>
              <template v-if="u.last_opened"> · last opened email {{ fmtDate(u.last_opened) }}</template>
              <template v-if="u.open_rate !== undefined && u.open_rate !== null"> · {{ Math.round((u.open_rate ?? 0) * 100) }}% open rate</template>
            </div>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              class="rounded-md bg-brand text-white px-2.5 py-1 text-[11px] font-semibold hover:opacity-90"
              :title="`Open Gmail compose pre-filled for ${u.full_name || u.email}`"
              @click="openGmailFor(u)"
            >✉️ Email</button>
          </div>
        </li>
      </ul>
    </section>

    <!-- Divider between live data and design-reference fixtures -->
    <div class="text-[10px] uppercase tracking-[0.18em] text-ink-disabled mt-4 px-1">
      ───── Design reference (fixtures) ─────
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Paying users</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.total_paying }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">+ {{ stats.total_trialing }} trialing</div>
      </div>
      <div class="card">
        <div class="kpi-label">MRR</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(stats.total_mrr_cents) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ money(stats.total_mrr_cents * 12) }} ARR run-rate</div>
      </div>
      <div class="card">
        <div class="kpi-label">Avg health</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :style="{ color: healthColor(stats.avg_health) }">{{ stats.avg_health }}</div>
        <div class="text-[11px] mt-0.5" :class="stats.total_at_risk > 0 ? 'text-warn' : 'text-ink-disabled'">
          {{ stats.total_at_risk }} at-risk · {{ stats.total_churned_recent }} churned
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Viral signups</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ stats.total_viral_signups }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ stats.total_shares_30d }} shares last 30d</div>
      </div>
    </div>

    <!-- Top sharers leaderboard -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Top sharers (last 30 days)</span>
        <span class="text-xs text-ink-muted">Cards are the product. These users are doing your distribution work.</span>
      </div>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <article
          v-for="(u, i) in topSharers"
          :key="u.id"
          class="rounded-md border border-divider bg-surface p-3"
        >
          <div class="flex items-center gap-2 mb-1">
            <div class="flex h-7 w-7 items-center justify-center rounded-full bg-success text-white text-xs font-bold">
              {{ i + 1 }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-ink truncate">{{ u.display_name }}</div>
              <div class="text-[10px] text-ink-disabled truncate">{{ PLAN_META[u.plan].label }}</div>
            </div>
          </div>
          <div class="flex items-baseline justify-between gap-1">
            <div>
              <div class="text-lg font-bold text-success tabular-nums leading-none">{{ u.shares_30d }}</div>
              <div class="text-[10px] uppercase tracking-wide text-ink-disabled">shares</div>
            </div>
            <div class="text-right">
              <div class="text-lg font-bold text-brand tabular-nums leading-none">+{{ u.viral_signups_attributed }}</div>
              <div class="text-[10px] uppercase tracking-wide text-ink-disabled">signups</div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- Filters -->
    <div class="card flex flex-wrap items-center gap-3">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mr-1">Stage:</span>
        <button
          type="button"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
          :class="stageFilter === 'all' ? 'bg-brand text-white' : 'bg-surface-elevated text-ink-muted hover:bg-surface-elevated/80'"
          @click="stageFilter = 'all'"
        >All</button>
        <button
          v-for="s in stageOrder"
          :key="s"
          type="button"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-white"
          :style="stageFilter === s
            ? { backgroundColor: STAGE_META[s].color }
            : { backgroundColor: STAGE_META[s].color + '22', color: STAGE_META[s].color }"
          @click="stageFilter = s"
        >{{ STAGE_META[s].label }}</button>
      </div>
      <div class="flex flex-wrap items-center gap-1.5 ml-auto">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mr-1">Plan:</span>
        <button
          type="button"
          class="chip"
          :class="planFilter === 'all' ? 'chip-active' : ''"
          @click="planFilter = 'all'"
        >All</button>
        <button
          v-for="(meta, p) in PLAN_META"
          :key="p"
          type="button"
          class="chip"
          :class="planFilter === p ? 'chip-active' : ''"
          @click="planFilter = (p as Plan)"
        >{{ meta.label }}</button>
      </div>
    </div>

    <!-- User table -->
    <section class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('name')">
                User {{ sortInd('name') }}
              </th>
              <th class="px-3 py-2 font-medium">Stage</th>
              <th class="px-3 py-2 font-medium">Plan</th>
              <th class="px-3 py-2 font-medium text-right cursor-pointer hover:text-ink" @click="toggleSort('mrr')">
                MRR {{ sortInd('mrr') }}
              </th>
              <th class="px-3 py-2 font-medium text-center cursor-pointer hover:text-ink" @click="toggleSort('health')">
                Health {{ sortInd('health') }}
              </th>
              <th class="px-3 py-2 font-medium text-right">Cards (30d)</th>
              <th class="px-3 py-2 font-medium text-right cursor-pointer hover:text-ink" @click="toggleSort('shares')">
                Shares (30d) {{ sortInd('shares') }}
              </th>
              <th class="px-3 py-2 font-medium text-right">Viral signups</th>
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('last_login')">
                Last login {{ sortInd('last_login') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="u in filtered" :key="u.id">
              <tr class="border-b border-divider/60 hover:bg-surface-elevated/40 transition-colors">
                <td class="px-3 py-2.5">
                  <div class="text-sm font-semibold text-ink">{{ u.display_name }}</div>
                  <div class="text-[11px] text-ink-muted">
                    {{ u.email }} · signed up {{ fmtSinceSignup(u.signed_up_at) }} ago
                  </div>
                  <div v-if="u.platforms.length > 0" class="mt-0.5 flex flex-wrap gap-1">
                    <span
                      v-for="p in u.platforms"
                      :key="p"
                      class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                      :style="{ backgroundColor: PLATFORM_META[p].color }"
                    >{{ PLATFORM_META[p].label }}</span>
                    <span class="text-[10px] text-ink-disabled">· {{ u.leagues_connected }} league{{ u.leagues_connected === 1 ? '' : 's' }}</span>
                  </div>
                </td>
                <td class="px-3 py-2.5">
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white whitespace-nowrap"
                    :style="{ backgroundColor: STAGE_META[u.lifecycle_stage].color }"
                    :title="STAGE_META[u.lifecycle_stage].sub"
                  >{{ STAGE_META[u.lifecycle_stage].label }}</span>
                </td>
                <td class="px-3 py-2.5">
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white whitespace-nowrap"
                    :style="{ backgroundColor: PLAN_META[u.plan].color }"
                  >{{ PLAN_META[u.plan].label }}</span>
                </td>
                <td class="px-3 py-2.5 text-right text-sm font-semibold text-ink tabular-nums">{{ money(u.mrr_cents) }}</td>
                <td class="px-3 py-2.5 text-center">
                  <div class="inline-flex items-center gap-1">
                    <span class="text-base font-bold tabular-nums" :style="{ color: healthColor(u.health_score) }">{{ u.health_score }}</span>
                    <span class="text-xs" :style="{ color: trendColor(u.health_trend) }">{{ trendArrow(u.health_trend) }}</span>
                  </div>
                </td>
                <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">
                  {{ u.cards_made_30d }}
                  <span class="text-ink-disabled">· {{ u.cards_made_lifetime }} ⌀</span>
                </td>
                <td class="px-3 py-2.5 text-right">
                  <span class="text-sm font-semibold tabular-nums" :class="u.shares_30d > 0 ? 'text-success' : 'text-ink-disabled'">
                    {{ u.shares_30d }}
                  </span>
                </td>
                <td class="px-3 py-2.5 text-right text-xs tabular-nums" :class="u.viral_signups_attributed > 0 ? 'text-brand font-semibold' : 'text-ink-disabled'">
                  +{{ u.viral_signups_attributed }}
                </td>
                <td class="px-3 py-2.5 text-xs text-ink-muted whitespace-nowrap">{{ fmtAgo(u.last_login_at) }}</td>
              </tr>
              <!-- Signal row -->
              <tr v-if="u.signal" class="border-b border-divider/60">
                <td colspan="9" class="px-3 pb-2 -mt-1">
                  <div
                    class="text-[11px] inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
                    :style="{
                      backgroundColor: STAGE_META[u.lifecycle_stage].color + '22',
                      color: STAGE_META[u.lifecycle_stage].color,
                    }"
                  >
                    <span class="font-semibold">SIGNAL ·</span>
                    <span>{{ u.signal }}</span>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="filtered.length === 0">
              <td colspan="9" class="px-3 py-6 text-center text-sm text-ink-muted italic">
                No users match these filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Health legend -->
    <div class="text-[11px] text-ink-disabled flex flex-wrap items-center gap-3 px-2">
      <span class="font-semibold text-ink-muted">Health score:</span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color:#10B981"></span> 80–100 healthy
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color: rgb(var(--color-brand))"></span> 60–79 ok
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color:#F59E0B"></span> 40–59 watch
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color:#EF4444"></span> &lt;40 critical
      </span>
      <span class="opacity-70 ml-2">Composite of login frequency · cards made · share rate · payment status</span>
    </div>
  </div>
</template>
