<script setup lang="ts">
/**
 * CommandSite Social — single-page social hub with five internal views:
 * Calendar / Composer / Inbox / Engaged Leads / Performance.
 *
 * The thesis vs. UFD's Reddit-listening tool: every engagement is a
 * lead signal. The whole UX flows toward "Add to Pipeline" for high-
 * ICP-fit engagers — not just analytics for analytics' sake.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  posts,
  engagements,
  engagedLeads,
  socialStats,
  PLATFORM_META,
  CLASS_META,
  type Post,
  type Platform,
  type EngagementClass,
  type EngagedLead,
} from '@/lib/clients/commandsite/social'

defineProps<{ client: Client; config: Record<string, unknown> }>()

type View = 'calendar' | 'composer' | 'inbox' | 'leads' | 'performance'
const view = ref<View>('calendar')
const stats = computed(() => socialStats())

// ── CALENDAR ────────────────────────────────────────────────────────────
// Group posts into 7 day-columns starting today. Past-day posts and
// drafts get bucketed into a "Past" / "Drafts" sidebar respectively.
interface DayColumn { dateLabel: string; dateKey: string; posts: Post[] }

const calendarDays = computed<DayColumn[]>(() => {
  const cols: DayColumn[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    cols.push({
      dateKey: key,
      dateLabel: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      posts: [],
    })
  }
  for (const p of posts) {
    if (p.status === 'draft') continue
    const d = new Date(p.scheduled_at)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    const col = cols.find((c) => c.dateKey === key)
    if (col) col.posts.push(p)
  }
  for (const col of cols) {
    col.posts.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  }
  return cols
})

const draftPosts = computed(() => posts.filter((p) => p.status === 'draft'))
const pastPosts = computed(() => posts.filter((p) => p.status === 'posted')
  .sort((a, b) => new Date(b.posted_at!).getTime() - new Date(a.posted_at!).getTime()))

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const am = h < 12
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${display}:${m.toString().padStart(2, '0')} ${am ? 'AM' : 'PM'}`
}

function statusChip(s: Post['status']): { label: string; class: string } {
  if (s === 'posted')  return { label: 'Posted', class: 'bg-success/15 text-success' }
  if (s === 'queued')  return { label: 'Queued', class: 'bg-brand/15 text-brand' }
  if (s === 'paused')  return { label: 'Paused', class: 'bg-warn/15 text-warn' }
  return { label: 'Draft', class: 'bg-surface-elevated text-ink-disabled' }
}

// ── COMPOSER ───────────────────────────────────────────────────────────
const composerIdea = ref(`The "vertical SaaS is dead" take is wrong, but it's wrong in an interesting way. Horizontal tools are great when the customer knows what they want — vertical is great when you can show them.`)
const composerPlatforms = ref<Set<Platform>>(new Set(['linkedin', 'twitter', 'reddit', 'youtube']))

interface DraftVariant {
  platform: Platform
  body: string
  hashtags?: string[]
  format_label: string
  char_count: number
  optimal_count: number
}

const composerDrafts = computed<DraftVariant[]>(() => {
  // Pretend AI has generated platform-specific variations of the idea.
  // In real life this calls Claude with the idea + a per-platform prompt.
  const idea = composerIdea.value.trim()
  const drafts: DraftVariant[] = []
  if (composerPlatforms.value.has('linkedin')) {
    drafts.push({
      platform: 'linkedin',
      format_label: 'Long-form (200-400 words)',
      body: `${idea}\n\nHere's where it gets interesting:\n\n→ Horizontal players (Jobber, Stripe, HubSpot) win when the buyer already knows what they need.\n\n→ Vertical players win when the buyer doesn't know yet — and you can show them by speaking their language.\n\nFor home services, that means: don't try to out-feature the horizontal incumbents. Out-empathize them.\n\nThe owner doesn't want a "scheduling platform." They want fewer phone calls and more booked jobs.\n\nThat reframing is the entire moat.`,
      hashtags: ['#verticalsaas', '#smb', '#sales'],
      char_count: 612, optimal_count: 1300,
    })
  }
  if (composerPlatforms.value.has('twitter')) {
    drafts.push({
      platform: 'twitter',
      format_label: 'Single tweet (280 chars max)',
      body: `"Vertical SaaS is dead" is wrong — but it's wrong in an interesting way.\n\nHorizontal wins when buyers know what they want.\nVertical wins when they don't yet — and you can show them.\n\nThe wedge isn't features. It's that you've sat in their truck.`,
      char_count: 244, optimal_count: 280,
    })
  }
  if (composerPlatforms.value.has('reddit')) {
    drafts.push({
      platform: 'reddit',
      format_label: 'r/SaaS or r/Entrepreneur — discussion post',
      body: `Vertical SaaS isn't dead — but most people are wrong about why it works\n\n${idea}\n\nNot trying to start a flame war, genuinely curious what others think. Especially folks who've shipped both horizontal and vertical products: what was different about how customers reacted?\n\nI'll share what I learned building vertical for home services in the comments if helpful.`,
      char_count: 487, optimal_count: 800,
    })
  }
  if (composerPlatforms.value.has('youtube')) {
    drafts.push({
      platform: 'youtube',
      format_label: 'Short script (40-60s)',
      body: `[HOOK 0-3s]\n"Vertical SaaS is dead" — let me show you why that's backwards.\n\n[BODY 3-45s]\nHorizontal tools (point at Jobber screenshot) work when the buyer already knows what they want.\n\nVertical tools (point at CommandSite screenshot) work when the buyer doesn't know yet — and you can show them by speaking their actual language.\n\nFor home services that means: don't out-feature Jobber. Out-empathize Jobber.\n\nOwners don't want a platform. They want fewer phone calls and more booked jobs.\n\n[CTA 45-60s]\nFollow for more vertical SaaS lessons from someone actually building one.`,
      char_count: 624, optimal_count: 800,
    })
  }
  return drafts
})

function togglePlatform(p: Platform) {
  if (composerPlatforms.value.has(p)) composerPlatforms.value.delete(p)
  else composerPlatforms.value.add(p)
}

// ── INBOX ──────────────────────────────────────────────────────────────
const inboxFilter = ref<EngagementClass | 'all'>('all')
const inboxHandled = ref<Set<string>>(new Set())

const visibleEngagements = computed(() => {
  return engagements
    .filter((e) => inboxFilter.value === 'all' || e.classification === inboxFilter.value)
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
})

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function handleEng(id: string) { inboxHandled.value.add(id) }

// ── LEADS ──────────────────────────────────────────────────────────────
type LeadFilter = 'all' | 'top_fit' | 'not_in_pipeline'
const leadFilter = ref<LeadFilter>('not_in_pipeline')
const addedLeads = ref<Set<string>>(new Set())

const visibleLeads = computed<EngagedLead[]>(() => {
  return engagedLeads
    .filter((l) => {
      if (leadFilter.value === 'top_fit')         return l.icp_fit_score >= 80
      if (leadFilter.value === 'not_in_pipeline') return !l.in_pipeline && !addedLeads.value.has(l.id)
      return true
    })
    .sort((a, b) => b.icp_fit_score - a.icp_fit_score)
})

function fitColor(score: number): string {
  if (score >= 85) return '#10B981'
  if (score >= 70) return 'rgb(var(--color-brand))'
  if (score >= 50) return '#F59E0B'
  return '#94A3B8'
}

// ── PERFORMANCE ────────────────────────────────────────────────────────
const topByImpressions = computed(() =>
  [...pastPosts.value]
    .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
    .slice(0, 5),
)
const topByPipeline = computed(() =>
  [...pastPosts.value]
    .filter((p) => (p.attributed_pipeline_cents ?? 0) > 0)
    .sort((a, b) => (b.attributed_pipeline_cents ?? 0) - (a.attributed_pipeline_cents ?? 0))
    .slice(0, 5),
)

function money(cents: number, opts: { compact?: boolean } = {}): string {
  if (cents === 0) return '—'
  if (opts.compact && cents >= 100_000) return '$' + Math.round(cents / 1000) + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

function num(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toLocaleString()
}

function engagementRate(p: Post): string {
  if (!p.impressions || p.impressions === 0) return '—'
  return ((p.engagements ?? 0) / p.impressions * 100).toFixed(1) + '%'
}

const tabs: { key: View; label: string; badge?: number }[] = [
  { key: 'calendar',    label: 'Calendar' },
  { key: 'composer',    label: 'Composer' },
  { key: 'inbox',       label: 'Inbox' },
  { key: 'leads',       label: 'Engaged Leads' },
  { key: 'performance', label: 'Performance' },
]
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Social</h2>
        <p class="text-sm text-ink-muted">
          Plan, draft, schedule across platforms. Every engagement is treated as a lead signal — high-ICP engagers feed straight into the pipeline.
        </p>
      </div>
      <button
        type="button"
        class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"
        @click="view = 'composer'"
      >+ New post</button>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Posts (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.posts_30d }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ num(stats.impressions_30d) }} impressions</div>
      </div>
      <div class="card">
        <div class="kpi-label">Engagements (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ num(stats.engagements_30d) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ ((stats.engagements_30d / Math.max(stats.impressions_30d, 1)) * 100).toFixed(1) }}% rate</div>
      </div>
      <div class="card">
        <div class="kpi-label">Attributed Pipeline</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ money(stats.attributed_pipeline_30d_cents, { compact: true }) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ stats.conversions_30d }} conversions in 30d</div>
      </div>
      <div class="card">
        <div class="kpi-label">Inbox · Leads to review</div>
        <div class="mt-1 text-2xl font-bold tabular-nums">
          <span :class="stats.inbox_to_address > 0 ? 'text-warn' : 'text-ink-disabled'">{{ stats.inbox_to_address }}</span>
          <span class="text-base text-ink-muted"> · </span>
          <span :class="stats.leads_to_review > 0 ? 'text-success' : 'text-ink-disabled'">{{ stats.leads_to_review }}</span>
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">need response · ICP-fit ≥ 70</div>
      </div>
    </div>

    <!-- Sub-view tabs -->
    <div class="card flex flex-wrap items-center gap-1.5">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="chip"
        :class="view === t.key ? 'chip-active' : ''"
        @click="view = t.key"
      >
        {{ t.label }}
        <span
          v-if="t.key === 'inbox' && stats.inbox_to_address > 0"
          class="ml-1 rounded-full bg-warn text-white px-1.5 text-[10px] font-bold"
        >{{ stats.inbox_to_address }}</span>
        <span
          v-if="t.key === 'leads' && stats.leads_to_review > 0"
          class="ml-1 rounded-full bg-success text-white px-1.5 text-[10px] font-bold"
        >{{ stats.leads_to_review }}</span>
      </button>
    </div>

    <!-- ═════════════════════ CALENDAR ═════════════════════ -->
    <div v-if="view === 'calendar'" class="space-y-4">
      <!-- Week grid -->
      <div class="overflow-x-auto">
        <div class="flex gap-2 min-w-fit pb-2">
          <div
            v-for="col in calendarDays"
            :key="col.dateKey"
            class="w-[180px] flex-shrink-0"
          >
            <div class="rounded-t-card bg-surface px-3 py-2 border border-divider border-b-0">
              <div class="text-xs font-semibold text-ink">{{ col.dateLabel }}</div>
              <div class="text-[10px] text-ink-disabled">{{ col.posts.length }} post{{ col.posts.length === 1 ? '' : 's' }}</div>
            </div>
            <div class="rounded-b-card bg-surface-elevated/40 border border-divider border-t-0 p-2 space-y-2 min-h-[200px]">
              <article
                v-for="p in col.posts"
                :key="p.id"
                class="rounded-md bg-surface border-l-4 p-2 cursor-pointer hover:border-brand transition-colors"
                :style="{ borderLeftColor: PLATFORM_META[p.platform].color }"
              >
                <div class="flex items-center justify-between gap-1 mb-1">
                  <span
                    class="text-[10px] font-bold uppercase tracking-wide"
                    :style="{ color: PLATFORM_META[p.platform].color }"
                  >{{ PLATFORM_META[p.platform].short }}</span>
                  <span class="text-[10px] text-ink-disabled tabular-nums">{{ fmtTime(p.scheduled_at) }}</span>
                </div>
                <p class="text-[11px] text-ink leading-snug line-clamp-3">{{ p.body }}</p>
                <div class="mt-1.5 flex items-center justify-between gap-1">
                  <span class="text-[9px] uppercase tracking-wide text-ink-disabled">{{ p.format }}</span>
                  <span
                    class="rounded-full px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide"
                    :class="statusChip(p.status).class"
                  >{{ statusChip(p.status).label }}</span>
                </div>
              </article>
              <button
                type="button"
                class="w-full rounded-md border border-dashed border-divider py-1.5 text-[10px] text-ink-disabled hover:border-brand hover:text-brand transition-colors"
                @click="view = 'composer'"
              >+ Schedule</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Drafts + recently posted -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section class="card">
          <div class="mb-3 flex items-center gap-2">
            <span class="eyebrow">Drafts</span>
            <span class="chip !py-0.5 !px-2 !text-[10px]">{{ draftPosts.length }} ideas</span>
          </div>
          <div class="space-y-2">
            <article
              v-for="p in draftPosts"
              :key="p.id"
              class="flex items-start gap-2 rounded-md border-l-4 bg-surface-elevated/40 p-2.5"
              :style="{ borderLeftColor: PLATFORM_META[p.platform].color }"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 mb-0.5">
                  <span
                    class="text-[10px] font-bold uppercase tracking-wide"
                    :style="{ color: PLATFORM_META[p.platform].color }"
                  >{{ PLATFORM_META[p.platform].label }}</span>
                  <span class="text-[10px] text-ink-disabled">· {{ p.format }}</span>
                </div>
                <p class="text-xs text-ink leading-snug line-clamp-2">{{ p.body }}</p>
              </div>
              <button
                type="button"
                class="rounded-md bg-brand/10 text-brand px-2 py-1 text-[10px] font-semibold hover:bg-brand/20 whitespace-nowrap"
              >Schedule</button>
            </article>
            <div v-if="draftPosts.length === 0" class="text-center text-xs text-ink-muted italic py-3">
              No drafts.
            </div>
          </div>
        </section>

        <section class="card">
          <div class="mb-3 flex items-center gap-2">
            <span class="eyebrow">Recently Posted</span>
          </div>
          <div class="space-y-2">
            <article
              v-for="p in pastPosts.slice(0, 4)"
              :key="p.id"
              class="flex items-start gap-2 rounded-md border-l-4 bg-surface-elevated/40 p-2.5"
              :style="{ borderLeftColor: PLATFORM_META[p.platform].color }"
            >
              <div class="min-w-0 flex-1">
                <p class="text-xs text-ink leading-snug line-clamp-2">{{ p.body }}</p>
                <div class="mt-1 flex items-center gap-x-3 text-[10px] text-ink-disabled tabular-nums">
                  <span>👁 {{ num(p.impressions ?? 0) }}</span>
                  <span>💬 {{ p.comments_count ?? 0 }}</span>
                  <span v-if="(p.attributed_pipeline_cents ?? 0) > 0" class="text-success">→ {{ money(p.attributed_pipeline_cents!, { compact: true }) }} pipe</span>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>

    <!-- ═════════════════════ COMPOSER ═════════════════════ -->
    <div v-if="view === 'composer'" class="space-y-4">
      <section class="card">
        <div class="mb-3">
          <span class="eyebrow">Idea</span>
          <p class="text-xs text-ink-muted mt-0.5">Type the seed thought. AI will generate platform-specific variations below.</p>
        </div>
        <textarea
          v-model="composerIdea"
          class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink resize-y min-h-[100px] focus:outline-none focus:border-brand"
          placeholder="A lesson, observation, story, or question worth sharing…"
        ></textarea>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted">Platforms:</span>
          <button
            v-for="(meta, p) in PLATFORM_META"
            :key="p"
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-white"
            :style="composerPlatforms.has(p as Platform)
              ? { backgroundColor: meta.color }
              : { backgroundColor: meta.color + '22', color: meta.color }"
            @click="togglePlatform(p as Platform)"
          >{{ meta.label }}</button>
          <button
            type="button"
            class="ml-auto rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"
          >✨ Regenerate drafts</button>
        </div>
      </section>

      <!-- Per-platform drafts -->
      <article
        v-for="d in composerDrafts"
        :key="d.platform"
        class="card"
      >
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="flex items-center gap-2">
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              :style="{ backgroundColor: PLATFORM_META[d.platform].color }"
            >{{ PLATFORM_META[d.platform].label }}</span>
            <span class="text-[11px] text-ink-muted">· {{ d.format_label }}</span>
          </div>
          <span class="text-[10px] text-ink-disabled tabular-nums">{{ d.char_count }} / {{ d.optimal_count }}</span>
        </div>
        <textarea
          :value="d.body"
          class="w-full rounded-md border border-divider bg-surface-elevated/40 px-3 py-2 text-sm text-ink resize-y min-h-[140px] font-mono focus:outline-none focus:border-brand"
        ></textarea>
        <div v-if="d.hashtags && d.hashtags.length > 0" class="mt-2 flex flex-wrap gap-1.5">
          <span
            v-for="h in d.hashtags"
            :key="h"
            class="rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-medium"
          >{{ h }}</span>
        </div>
        <div class="mt-3 flex items-center justify-end gap-2">
          <button type="button" class="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink">Save draft</button>
          <button type="button" class="rounded-md bg-surface-elevated text-ink px-3 py-1.5 text-xs font-semibold hover:bg-surface-elevated/80">Schedule</button>
          <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">Post now</button>
        </div>
      </article>

      <div v-if="composerDrafts.length === 0" class="card text-center text-sm text-ink-muted italic py-6">
        Pick at least one platform above to generate a draft.
      </div>
    </div>

    <!-- ═════════════════════ INBOX ═════════════════════ -->
    <div v-if="view === 'inbox'" class="space-y-3">
      <div class="card">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            :class="inboxFilter === 'all' ? 'bg-brand text-white' : 'bg-surface-elevated text-ink-muted hover:bg-surface-elevated/80'"
            @click="inboxFilter = 'all'"
          >All ({{ engagements.length }})</button>
          <button
            v-for="(meta, k) in CLASS_META"
            :key="k"
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-white"
            :style="inboxFilter === k
              ? { backgroundColor: meta.color }
              : { backgroundColor: meta.color + '22', color: meta.color }"
            @click="inboxFilter = (k as EngagementClass)"
          >{{ meta.icon }} {{ meta.label }} ({{ engagements.filter((e) => e.classification === k).length }})</button>
        </div>
      </div>

      <article
        v-for="e in visibleEngagements"
        :key="e.id"
        class="card transition-opacity"
        :class="inboxHandled.has(e.id) ? 'opacity-50' : ''"
      >
        <!-- Header -->
        <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-0.5">
              <span class="text-sm font-semibold text-ink">{{ e.author_name }}</span>
              <span v-if="e.author_title" class="text-[11px] text-ink-muted">· {{ e.author_title }}</span>
              <span v-if="e.author_company && e.author_company !== '[private]'" class="text-[11px] text-ink-muted">at {{ e.author_company }}</span>
              <span v-if="e.in_pipeline" class="rounded-full bg-success/15 text-success px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">In pipeline</span>
            </div>
            <div class="text-[11px] text-ink-disabled flex flex-wrap items-center gap-2">
              <span
                class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                :style="{ backgroundColor: PLATFORM_META[e.platform].color }"
              >{{ PLATFORM_META[e.platform].label }} · {{ e.kind }}</span>
              <span v-if="e.author_industry">{{ e.author_industry }}</span>
              <span v-if="e.author_followers > 0">· {{ num(e.author_followers) }} followers</span>
              <span>· {{ fmtAgo(e.received_at) }}</span>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1 flex-shrink-0">
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white whitespace-nowrap"
              :style="{ backgroundColor: CLASS_META[e.classification].color }"
            >{{ CLASS_META[e.classification].icon }} {{ CLASS_META[e.classification].label }}</span>
            <span class="text-[10px] tabular-nums" :style="{ color: fitColor(e.icp_fit_score) }">
              ICP fit: <span class="font-bold">{{ e.icp_fit_score }}</span>
            </span>
          </div>
        </div>

        <!-- Their message -->
        <div class="rounded-md bg-surface-elevated/40 border border-divider/50 p-3 mb-2.5">
          <div class="text-[10px] uppercase tracking-wide font-semibold text-ink-disabled mb-1">{{ e.kind }}</div>
          <p class="text-sm text-ink leading-relaxed whitespace-pre-line">{{ e.message }}</p>
        </div>

        <!-- AI draft (only for actionable classes) -->
        <div
          v-if="e.classification !== 'spam' && e.classification !== 'irrelevant'"
          class="rounded-md border border-brand/30 bg-brand/5 p-3"
        >
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-brand text-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">AI draft</span>
            </div>
          </div>
          <textarea
            :value="e.ai_suggested_reply"
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink leading-relaxed resize-y min-h-[80px] focus:outline-none focus:border-brand"
          ></textarea>
          <div class="mt-2 flex flex-wrap items-center justify-end gap-2">
            <button type="button" class="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink" @click="handleEng(e.id)">Skip</button>
            <button
              v-if="!e.in_pipeline && e.classification === 'lead_signal'"
              type="button"
              class="rounded-md bg-success/15 text-success px-3 py-1.5 text-xs font-semibold hover:bg-success/25"
              @click="handleEng(e.id)"
            >+ Add to Pipeline</button>
            <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90" @click="handleEng(e.id)">Reply</button>
          </div>
        </div>
        <div v-else class="text-[11px] text-ink-disabled italic">
          {{ e.classification === 'spam' ? '⛔ Auto-flagged for moderator.' : 'Off-topic — auto-skipped.' }}
        </div>
      </article>
    </div>

    <!-- ═════════════════════ ENGAGED LEADS ═════════════════════ -->
    <div v-if="view === 'leads'" class="space-y-3">
      <div class="card">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="chip"
            :class="leadFilter === 'not_in_pipeline' ? 'chip-active' : ''"
            @click="leadFilter = 'not_in_pipeline'"
          >Not yet in pipeline</button>
          <button
            type="button"
            class="chip"
            :class="leadFilter === 'top_fit' ? 'chip-active' : ''"
            @click="leadFilter = 'top_fit'"
          >ICP fit ≥ 80</button>
          <button
            type="button"
            class="chip"
            :class="leadFilter === 'all' ? 'chip-active' : ''"
            @click="leadFilter = 'all'"
          >All ({{ engagedLeads.length }})</button>
          <span class="ml-auto text-[11px] text-ink-disabled italic">
            People who engaged 2+ times in 30d. Enriched via Clay + RB2B.
          </span>
        </div>
      </div>

      <article
        v-for="l in visibleLeads"
        :key="l.id"
        class="card"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2 mb-0.5">
              <h3 class="text-sm font-semibold text-ink">{{ l.name }}</h3>
              <span v-if="l.title" class="text-[11px] text-ink-muted">· {{ l.title }}</span>
              <span v-if="l.company && l.company !== '[private]'" class="text-[11px] text-ink-muted">at {{ l.company }}</span>
              <span v-if="l.in_pipeline" class="rounded-full bg-success/15 text-success px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">In pipeline</span>
              <span v-if="l.enrichment !== 'full'" class="rounded-full bg-warn/15 text-warn px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Enrichment {{ l.enrichment }}</span>
            </div>
            <div class="text-[11px] text-ink-disabled flex flex-wrap items-center gap-x-2">
              <span v-if="l.industry">{{ l.industry }}</span>
              <span v-if="l.city">· {{ l.city }}, {{ l.state }}</span>
              <span v-if="l.team_size">· {{ l.team_size }} techs</span>
              <span v-if="l.followers > 0">· {{ num(l.followers) }} followers</span>
              <span>· primary on {{ PLATFORM_META[l.primary_platform].label }}</span>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
              <span class="font-semibold text-ink">{{ l.engagements_30d }} engagements</span>
              <span>across {{ l.posts_engaged_with.length }} post{{ l.posts_engaged_with.length === 1 ? '' : 's' }}</span>
              <span>· last seen {{ fmtAgo(l.last_engaged_at) }}</span>
            </div>
          </div>
          <div class="flex flex-col items-end gap-2 flex-shrink-0">
            <div class="text-right">
              <div class="text-2xl font-bold tabular-nums" :style="{ color: fitColor(l.icp_fit_score) }">{{ l.icp_fit_score }}</div>
              <div class="text-[10px] uppercase tracking-wide font-semibold text-ink-disabled">ICP fit</div>
            </div>
            <button
              v-if="!l.in_pipeline && !addedLeads.has(l.id)"
              type="button"
              class="rounded-md bg-success text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 whitespace-nowrap"
              @click="addedLeads.add(l.id)"
            >+ Add to Pipeline</button>
            <button
              v-else-if="addedLeads.has(l.id)"
              type="button"
              class="rounded-md bg-success/15 text-success px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
            >✓ Added</button>
            <span v-else class="text-[10px] text-ink-disabled italic">Already in pipeline</span>
          </div>
        </div>
      </article>

      <div v-if="visibleLeads.length === 0" class="card text-center text-sm text-ink-muted italic py-6">
        Nothing left here — all high-fit engagers are already in the pipeline. Good problem to have.
      </div>
    </div>

    <!-- ═════════════════════ PERFORMANCE ═════════════════════ -->
    <div v-if="view === 'performance'" class="space-y-4">
      <!-- Top by impressions -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Top Posts · Last 30 Days</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">By Impressions</span>
        </div>
        <div class="space-y-2">
          <article
            v-for="(p, i) in topByImpressions"
            :key="p.id"
            class="flex items-start gap-3 rounded-md border-l-4 bg-surface-elevated/40 p-3"
            :style="{ borderLeftColor: PLATFORM_META[p.platform].color }"
          >
            <div class="text-2xl font-bold text-ink-disabled w-6 flex-shrink-0">{{ i + 1 }}</div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span
                  class="text-[10px] font-bold uppercase tracking-wide"
                  :style="{ color: PLATFORM_META[p.platform].color }"
                >{{ PLATFORM_META[p.platform].label }}</span>
                <span class="text-[10px] text-ink-disabled">· {{ p.format }}</span>
              </div>
              <p class="text-xs text-ink leading-snug line-clamp-2">{{ p.body }}</p>
            </div>
            <div class="grid grid-cols-3 gap-3 text-right flex-shrink-0">
              <div>
                <div class="text-sm font-semibold text-ink tabular-nums">{{ num(p.impressions ?? 0) }}</div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">impressions</div>
              </div>
              <div>
                <div class="text-sm font-semibold text-ink tabular-nums">{{ engagementRate(p) }}</div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">eng rate</div>
              </div>
              <div>
                <div class="text-sm font-semibold tabular-nums" :class="(p.attributed_pipeline_cents ?? 0) > 0 ? 'text-success' : 'text-ink-disabled'">
                  {{ money(p.attributed_pipeline_cents ?? 0, { compact: true }) }}
                </div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">pipeline</div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- Top by pipeline attributed -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Pipeline Drivers</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">By Attributed Revenue</span>
        </div>
        <div class="space-y-2">
          <article
            v-for="(p, i) in topByPipeline"
            :key="p.id"
            class="flex items-start gap-3 rounded-md border-l-4 bg-surface-elevated/40 p-3"
            :style="{ borderLeftColor: PLATFORM_META[p.platform].color }"
          >
            <div class="text-2xl font-bold text-success w-6 flex-shrink-0">{{ i + 1 }}</div>
            <div class="min-w-0 flex-1">
              <p class="text-xs text-ink leading-snug line-clamp-2">{{ p.body }}</p>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-base font-bold text-success tabular-nums">{{ money(p.attributed_pipeline_cents ?? 0, { compact: true }) }}</div>
              <div class="text-[9px] uppercase tracking-wide text-ink-disabled">{{ p.conversions ?? 0 }} conversions</div>
            </div>
          </article>
        </div>
      </section>

      <!-- A/B-style insights -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">What's Working · Patterns</span>
        </div>
        <ul class="space-y-2 text-sm">
          <li class="flex items-start gap-2">
            <span class="text-success">↑</span>
            <span class="text-ink"><span class="font-semibold">Customer-story posts</span> drive 3.4× more pipeline than thought-leadership posts. Keep doing customer numbers.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-success">↑</span>
            <span class="text-ink"><span class="font-semibold">LinkedIn long-form with a screenshot</span> outperforms text-only by 47% on engagement. Cap each post with a real screenshot.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-success">↑</span>
            <span class="text-ink"><span class="font-semibold">Posting between 8 AM–9 AM ET on Tue/Wed</span> nets 2× the comments vs. afternoon slots.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-warn">↓</span>
            <span class="text-ink"><span class="font-semibold">YouTube Shorts</span> is your weakest channel — 3,840 avg impressions vs LinkedIn's 18,000. Either invest more or pause.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-warn">↓</span>
            <span class="text-ink"><span class="font-semibold">Twitter pure-thought tweets</span> get likes but zero pipeline attribution. Threads work, single tweets don't.</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
