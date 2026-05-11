<script setup lang="ts">
/**
 * UFD Redesign — Reddit & Social. Single page, four internal views:
 * Calendar (week-grid of scheduled), Composer, Listening (mentions
 * inbox classified by AI), Performance.
 *
 * Reddit-first: mentions are the primary signal surface. Twitter/X +
 * YouTube Shorts are secondary distribution channels. Composer
 * generates platform-specific variants from a single idea.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  posts,
  mentions,
  socialStats,
  PLATFORM_META,
  CLASS_META,
  type Post,
  type Platform,
  type ListeningClass,
} from '@/lib/clients/ufd-redesign/social'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

type View = 'calendar' | 'composer' | 'listening' | 'performance'
const view = ref<View>('calendar')
const stats = computed(() => socialStats())

// ── Calendar ────────────────────────────────────────────────────────────
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
  for (const col of cols) col.posts.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
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

// ── Composer ───────────────────────────────────────────────────────────
const composerIdea = ref(`Most-shared UFD card type isn't Power Rankings — it's Season Awards. People share what makes them feel clever, not what they need weekly.`)
const composerPlatforms = ref<Set<Platform>>(new Set(['reddit', 'twitter', 'tiktok']))

interface Variant {
  platform: Platform
  format_label: string
  body: string
  char_count: number
  optimal_count: number
  /** For Reddit, suggested subreddit + title */
  reddit_suggestion?: { subreddit: string; title: string }
}

const composerDrafts = computed<Variant[]>(() => {
  const idea = composerIdea.value.trim()
  const out: Variant[] = []
  if (composerPlatforms.value.has('reddit')) {
    out.push({
      platform: 'reddit',
      format_label: 'Long-form discussion (community-friendly)',
      reddit_suggestion: {
        subreddit: 'r/fantasyfootball',
        title: 'After a year of running a fantasy SaaS — here\'s what gets shared vs. what gets used',
      },
      body: `${idea}\n\nFor context: I run UFD (free 7-day trial at ufd.app, but this isn\'t a sales post). I have access to actual share + use data across thousands of card generations.\n\nThe pattern that surprised me: usefulness ≠ shareability. Power Rankings is the most-USED card, but Season Awards is the most-SHARED. People share what makes them feel like they\'re cleverly observing their league, not what helps them manage it.\n\nImplication for product: shareable ≠ useful. Build for both, but understand they\'re different jobs.`,
      char_count: 612, optimal_count: 800,
    })
  }
  if (composerPlatforms.value.has('twitter')) {
    out.push({
      platform: 'twitter',
      format_label: 'Single tweet (~280 chars)',
      body: `Most-USED UFD card: Power Rankings.\nMost-SHARED UFD card: Season Awards.\n\nUsefulness ≠ shareability. People share what makes them look clever in their league chat, not what helps them manage their team.\n\nDifferent jobs. Build for both.`,
      char_count: 232, optimal_count: 280,
    })
  }
  if (composerPlatforms.value.has('tiktok')) {
    out.push({
      platform: 'tiktok',
      format_label: 'Short script (15-30s)',
      body: `[HOOK 0-3s, on camera]\n"Wanna know what people actually share from my fantasy SaaS?"\n\n[BODY 3-25s, screen recording]\n"It's not the Power Rankings — those are USEFUL but boring. It's the SEASON AWARDS card. (cut to card on screen) Why? Because sharing it makes you look clever in the group chat. Usefulness and shareability are different jobs."\n\n[CTA 25-30s]\n"Build something worth screenshotting. Link in bio."`,
      char_count: 412, optimal_count: 700,
    })
  }
  if (composerPlatforms.value.has('youtube')) {
    out.push({
      platform: 'youtube',
      format_label: 'Short script (45-60s)',
      body: `[HOOK]\n"This is the chart that surprised me building a fantasy SaaS." (show share-vs-use data)\n\n[BODY]\nPower Rankings = most used. Season Awards = most shared. Different cards, different jobs. People share what makes them feel clever, not what helps them manage.\n\n[CTA]\nFollow for more honest behind-the-scenes from a solo SaaS dev.`,
      char_count: 348, optimal_count: 700,
    })
  }
  return out
})

function togglePlatform(p: Platform) {
  if (composerPlatforms.value.has(p)) composerPlatforms.value.delete(p)
  else composerPlatforms.value.add(p)
}

// ── Listening ──────────────────────────────────────────────────────────
const inboxFilter = ref<ListeningClass | 'all'>('all')
const inboxHandled = ref<Set<string>>(new Set())

const visibleMentions = computed(() => {
  return mentions
    .filter((m) => inboxFilter.value === 'all' || m.classification === inboxFilter.value)
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
})

function handleMention(id: string) { inboxHandled.value.add(id) }

// ── Performance ────────────────────────────────────────────────────────
const topByImpressions = computed(() =>
  [...pastPosts.value].sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0)).slice(0, 5),
)
const topByTrialSignups = computed(() =>
  [...pastPosts.value].sort((a, b) => (b.trial_signups ?? 0) - (a.trial_signups ?? 0)).slice(0, 5),
)

// Aggregate per-platform performance
interface PlatformPerf { platform: Platform; posts: number; impressions: number; signups: number }
const perPlatform = computed<PlatformPerf[]>(() => {
  const map = new Map<Platform, PlatformPerf>()
  for (const p of pastPosts.value) {
    if (!map.has(p.platform)) map.set(p.platform, { platform: p.platform, posts: 0, impressions: 0, signups: 0 })
    const e = map.get(p.platform)!
    e.posts += 1
    e.impressions += p.impressions ?? 0
    e.signups += p.trial_signups ?? 0
  }
  return Array.from(map.values()).sort((a, b) => b.signups - a.signups)
})

// ── Helpers ────────────────────────────────────────────────────────────
function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
function num(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toLocaleString()
}
function pct(v: number): string { return `${(v * 100).toFixed(0)}%` }

const tabs: { key: View; label: string; badge?: number }[] = [
  { key: 'calendar',    label: 'Calendar' },
  { key: 'composer',    label: 'Composer' },
  { key: 'listening',   label: 'Reddit Listening' },
  { key: 'performance', label: 'Performance' },
]

// ── Bones-drafted social queue ─────────────────────────────────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'social-mahomes-thread',
    icon: '🐦',
    badge: 'X thread · viral spike',
    badgeClass: 'bg-danger/15 text-danger',
    title: 'Mahomes OT thread — riding the 1,840-share wave',
    recipient: 'Hot Hand Heroes card went viral · cross-post window closing',
    preview: '"Mahomes\' OT card just got shared 1,840 times. Here\'s why fantasy users won\'t shut up about it: 🧵\n\n(1/6) RZ rate up 18% over last 4 weeks — he\'s back to elite\n\n(2/6) Chemistry with Worthy: 7 targets/game, 3.2 catches, $14.4 DK avg\n\n(3/6) Defenses incoming..." — Full thread ready, 6 tweets, ends with card link.',
    approved_response: 'Posted to X. Tracking engagement window — first 90 min determines reach. If RT count >150 by then, I\'ll auto-cross-post to Threads + a Reddit comment in r/fantasyfootball.',
    ticker_after_approval: 'Mahomes thread posted to X — tracking RTs',
  },
  {
    id: 'social-reddit-startsit',
    icon: '🗨️',
    badge: 'Reddit comment',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'r/fantasyfootball start/sit thread — contrarian play',
    recipient: 'Weekly thread · 2,400 upvotes, peak discussion right now',
    preview: '"Most everyone in here is starting Saquon, fading Pierce. Look at this from the data side: Saquon faces a top-5 run D, Pierce faces the 31st-ranked. The chalk says wrong this week. (Made a card on this — link in bio if you want the breakdown.)" — Comment ready, includes the card share link.',
    approved_response: 'Posted. Reddit auto-flags links the first 30 min, but the data argument is the body — link is at the end. I\'ll surface karma + click-through 2 hours from now.',
    ticker_after_approval: 'Reddit comment posted — r/fantasyfootball start/sit thread',
  },
  {
    id: 'social-instagram-reel',
    icon: '📱',
    badge: 'Instagram reel',
    badgeClass: 'bg-accent/15 text-accent',
    title: 'Instagram reel script — top viral card from last week',
    recipient: 'Hot Hand Heroes was the breakout — adapting for vertical video',
    preview: 'Script: "What\'s up fantasy fam, Josh here from UFD. Last week\'s top-shared card was Hot Hand Heroes — Mahomes\'s overtime breakout. Here\'s what the data shows..." (30-sec voiceover, paired with the card art animating in stages). Estimated post: Wed 8 PM ET (peak fantasy IG window).',
    approved_response: 'Approved. I\'ll generate the AI voiceover from the script + cut the visuals using the card asset. Posted Wed 8 PM. First-touch on reels matters — I\'ll send you the engagement numbers Thursday AM.',
    ticker_after_approval: 'Instagram reel queued — Wed 8 PM ET',
  },
  {
    id: 'social-waiver-thread',
    icon: '🐦',
    badge: 'X thread · waivers',
    badgeClass: 'bg-success/15 text-success',
    title: 'Week 12 waiver wire — pulled from your share data',
    recipient: 'Tuesday morning post · ties to the waiver card going out',
    preview: '"Top 3 waiver pickups for Week 12 — based on which names YOUR users are clicking on this week: 🧵\n\n(1) Jaylen Wright — Achane injury, top-5 add\n\n(2) Romeo Doubs — emergent target after Watson trade\n\n(3) Cole Kmet — finally a usable TE streamer\n\nFull breakdown card 👇 link" — Thread + card cross-promo.',
    approved_response: 'Approved + scheduled for Tuesday 6 AM ET (before waivers process). Tying social to the email card creates a 2× engagement loop on Tuesdays.',
    ticker_after_approval: 'Week 12 waivers thread scheduled — Tuesday 6 AM',
  },
  {
    id: 'social-listening-watson',
    icon: '👂',
    badge: 'Listening · reply',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'High-engagement post mentioned UFD — reply drafted',
    recipient: '@FantasyFootballMod (78k followers) said "decent share-card site"',
    preview: '"Appreciate the shoutout @FantasyFootballMod. Quick note — our card-share rate is 38% (industry: 6%), and we\'re solo-built. Building this for fantasy players who want share-able info, not just rankings. If you ever want a free annual to put us through the paces, DM me. — Josh"',
    approved_response: 'Posted as a reply. Owner-replies on social mentions perform 4× normal engagement. The "free annual to test" offer is honest + low-pressure — usually gets a "thanks I will" or a public boost.',
    ticker_after_approval: 'Reply posted to @FantasyFootballMod',
  },
]

const tickerSeed = [
  { icon: '🔥', text: 'Hot Hand Heroes card hit r/fantasyfootball front page — 412 upvotes', ageSec: 6 * 60 },
  { icon: '🐦', text: 'X post engagement: 89 RTs, 1.2k likes on the OT thread', ageSec: 22 * 60 },
  { icon: '👂', text: 'New mention detected — @FantasyFootballMod (78k followers)', ageSec: 41 * 60 },
  { icon: '📈', text: 'Instagram reel from Wed: 28k views, 4.2k saves', ageSec: 6 * 3600 },
]

const tickerPool = [
  { icon: '🔥', text: 'Card share velocity spike — Bones drafting cross-post content' },
  { icon: '🐦', text: 'New mention on X — reply drafted' },
  { icon: '👂', text: 'Reddit listening picked up a relevant thread' },
  { icon: '📤', text: 'Scheduled post went live — tracking first-30-min engagement' },
  { icon: '✅', text: 'Owner reply posted — high-engagement window' },
  { icon: '📊', text: 'Social-attributed signup: from Instagram bio link' },
  { icon: '🎯', text: 'Top-performing post this week: Mahomes OT thread' },
]

const socialTicker = ref<InstanceType<typeof GraceLiveTicker> | null>(null)

function onApproved(item: ApprovalQueueItem) {
  if (item.ticker_after_approval) {
    socialTicker.value?.pushEvent({ icon: item.icon, text: item.ticker_after_approval })
  }
}
</script>

<template>
  <div class="space-y-4">
    <GraceLiveTicker
      ref="socialTicker"
      :seed="tickerSeed"
      :pool="tickerPool"
      subtitle="Social signals — viral spikes, mentions, engagement events"
    />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="14"
      heading="Social pipeline"
      subtitle="Bones drafted these from this week's viral data + listening signals. Approve to publish."
      @approved="onApproved"
    />

    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Reddit & Social</h2>
        <p class="text-sm text-ink-muted">
          Reddit-first distribution + listening. Twitter, YouTube Shorts, and TikTok as secondary channels. Every mention is treated as a lead signal.
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
        <div class="text-[11px] text-ink-disabled mt-0.5">across {{ stats.active_subreddits }} subreddits + 3 other channels</div>
      </div>
      <div class="card">
        <div class="kpi-label">Impressions (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ num(stats.impressions_30d) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ num(stats.upvotes_30d) }} upvotes total</div>
      </div>
      <div class="card">
        <div class="kpi-label">Trial signups attributed</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ stats.trial_signups_attributed }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">within 7d of post going live</div>
      </div>
      <div class="card">
        <div class="kpi-label">Inbox to address</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="stats.inbox_to_address > 0 ? 'text-warn' : 'text-ink-disabled'">{{ stats.inbox_to_address }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">mentions needing reply</div>
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
          v-if="t.key === 'listening' && stats.inbox_to_address > 0"
          class="ml-1 rounded-full bg-warn text-white px-1.5 text-[10px] font-bold"
        >{{ stats.inbox_to_address }}</span>
      </button>
    </div>

    <!-- ═════════════ CALENDAR ═════════════ -->
    <div v-if="view === 'calendar'" class="space-y-4">
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
                  >{{ p.subreddit ?? PLATFORM_META[p.platform].short }}</span>
                  <span class="text-[10px] text-ink-disabled tabular-nums">{{ fmtTime(p.scheduled_at) }}</span>
                </div>
                <div v-if="p.title" class="text-[11px] font-semibold text-ink line-clamp-2 mb-1">{{ p.title }}</div>
                <p class="text-[11px] text-ink-muted leading-snug line-clamp-3">{{ p.body }}</p>
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
                <div v-if="p.title" class="text-xs font-semibold text-ink line-clamp-1 mb-0.5">{{ p.title }}</div>
                <p class="text-xs text-ink-muted leading-snug line-clamp-2">{{ p.body }}</p>
                <div class="mt-1 flex items-center gap-x-3 text-[10px] text-ink-disabled tabular-nums">
                  <span>👁 {{ num(p.impressions ?? 0) }}</span>
                  <span>↑ {{ p.upvotes ?? 0 }}</span>
                  <span v-if="(p.trial_signups ?? 0) > 0" class="text-success">→ {{ p.trial_signups }} signups</span>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>

    <!-- ═════════════ COMPOSER ═════════════ -->
    <div v-if="view === 'composer'" class="space-y-4">
      <section class="card">
        <div class="mb-3">
          <span class="eyebrow">Idea</span>
          <p class="text-xs text-ink-muted mt-0.5">Type the seed thought. AI generates platform-specific variations below — Reddit is treated as community-discussion (not promo).</p>
        </div>
        <textarea
          v-model="composerIdea"
          class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink resize-y min-h-[100px] focus:outline-none focus:border-brand"
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

        <!-- Reddit-specific subreddit + title -->
        <div v-if="d.reddit_suggestion" class="mb-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted">Subreddit</label>
            <input
              type="text"
              :value="d.reddit_suggestion.subreddit"
              class="mt-1 w-full rounded-md border border-divider bg-surface px-2.5 py-1.5 text-sm text-ink font-mono focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted">Post title</label>
            <input
              type="text"
              :value="d.reddit_suggestion.title"
              class="mt-1 w-full rounded-md border border-divider bg-surface px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        <textarea
          :value="d.body"
          class="w-full rounded-md border border-divider bg-surface-elevated/40 px-3 py-2 text-sm text-ink resize-y min-h-[140px] font-mono focus:outline-none focus:border-brand"
        ></textarea>

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

    <!-- ═════════════ LISTENING ═════════════ -->
    <div v-if="view === 'listening'" class="space-y-3">
      <div class="card">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            :class="inboxFilter === 'all' ? 'bg-brand text-white' : 'bg-surface-elevated text-ink-muted hover:bg-surface-elevated/80'"
            @click="inboxFilter = 'all'"
          >All ({{ mentions.length }})</button>
          <button
            v-for="(meta, k) in CLASS_META"
            :key="k"
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-white"
            :style="inboxFilter === k
              ? { backgroundColor: meta.color }
              : { backgroundColor: meta.color + '22', color: meta.color }"
            @click="inboxFilter = (k as ListeningClass)"
          >{{ meta.icon }} {{ meta.label }} ({{ mentions.filter((m) => m.classification === k).length }})</button>
        </div>
      </div>

      <article
        v-for="m in visibleMentions"
        :key="m.id"
        class="card transition-opacity"
        :class="inboxHandled.has(m.id) ? 'opacity-50' : ''"
      >
        <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-0.5">
              <span
                class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                :style="{ backgroundColor: PLATFORM_META[m.platform].color }"
              >{{ m.subreddit ?? PLATFORM_META[m.platform].label }}</span>
              <span class="text-sm font-semibold text-ink">{{ m.author }}</span>
              <span v-if="m.is_existing_user" class="rounded-full bg-success/15 text-success px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Pro user</span>
            </div>
            <div class="text-[11px] text-ink-disabled">
              <span class="font-semibold text-ink-muted">{{ m.thread_title }}</span>
              · {{ fmtAgo(m.received_at) }}
              · <a :href="m.thread_url" target="_blank" rel="noopener" class="text-brand hover:underline">view thread →</a>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1 flex-shrink-0">
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white whitespace-nowrap"
              :style="{ backgroundColor: CLASS_META[m.classification].color }"
            >{{ CLASS_META[m.classification].icon }} {{ CLASS_META[m.classification].label }}</span>
            <span class="text-[10px] text-ink-disabled">AI confidence: {{ pct(m.confidence) }}</span>
          </div>
        </div>

        <div class="rounded-md bg-surface-elevated/40 border border-divider/50 p-3 mb-2.5">
          <p class="text-sm text-ink leading-relaxed">{{ m.snippet }}</p>
        </div>

        <div
          v-if="m.classification !== 'spam' && m.classification !== 'off_topic'"
          class="rounded-md border border-brand/30 bg-brand/5 p-3"
        >
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-brand text-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">AI draft</span>
              <span class="text-[10px] text-ink-muted">Reddit-friendly tone — edit before posting</span>
            </div>
          </div>
          <textarea
            :value="m.ai_suggested_reply"
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink leading-relaxed resize-y min-h-[80px] focus:outline-none focus:border-brand"
          ></textarea>
          <div class="mt-2 flex items-center justify-end gap-2">
            <button type="button" class="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink" @click="handleMention(m.id)">Skip</button>
            <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90" @click="handleMention(m.id)">Post reply</button>
          </div>
        </div>
        <div v-else class="text-[11px] text-ink-disabled italic">
          {{ m.classification === 'spam' ? '⛔ Auto-flagged for moderator.' : 'Off-topic — auto-skipped.' }}
        </div>
      </article>
    </div>

    <!-- ═════════════ PERFORMANCE ═════════════ -->
    <div v-if="view === 'performance'" class="space-y-4">
      <!-- Per-channel -->
      <section class="card overflow-hidden">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Per-Channel Performance</span>
          <span class="text-xs text-ink-muted">Sorted by trial signups attributed</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th class="px-3 py-2 font-medium">Channel</th>
                <th class="px-3 py-2 font-medium text-right">Posts (30d)</th>
                <th class="px-3 py-2 font-medium text-right">Impressions</th>
                <th class="px-3 py-2 font-medium text-right">Avg per post</th>
                <th class="px-3 py-2 font-medium text-right">Signups attributed</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="pp in perPlatform"
                :key="pp.platform"
                class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
              >
                <td class="px-3 py-2.5">
                  <div class="flex items-center gap-2">
                    <span
                      class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                      :style="{ backgroundColor: PLATFORM_META[pp.platform].color }"
                    >{{ PLATFORM_META[pp.platform].label }}</span>
                  </div>
                </td>
                <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">{{ pp.posts }}</td>
                <td class="px-3 py-2.5 text-right text-xs text-ink tabular-nums">{{ num(pp.impressions) }}</td>
                <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">{{ num(Math.round(pp.impressions / pp.posts)) }}</td>
                <td class="px-3 py-2.5 text-right text-sm font-semibold tabular-nums" :class="pp.signups > 0 ? 'text-success' : 'text-ink-disabled'">
                  +{{ pp.signups }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mt-3 text-[11px] text-ink-disabled italic">
          Reddit drives 88% of attributed signups despite only 50% of impressions. The community-discussion tone (not the promo tone) is what works.
        </div>
      </section>

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
                >{{ p.subreddit ?? PLATFORM_META[p.platform].label }}</span>
                <span class="text-[10px] text-ink-disabled">· {{ p.format }}</span>
              </div>
              <div v-if="p.title" class="text-xs font-semibold text-ink line-clamp-1">{{ p.title }}</div>
              <p class="text-[11px] text-ink-muted leading-snug line-clamp-2">{{ p.body }}</p>
            </div>
            <div class="grid grid-cols-3 gap-3 text-right flex-shrink-0">
              <div>
                <div class="text-sm font-semibold text-ink tabular-nums">{{ num(p.impressions ?? 0) }}</div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">impressions</div>
              </div>
              <div>
                <div class="text-sm font-semibold text-ink tabular-nums">{{ p.upvotes ?? 0 }}</div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">upvotes</div>
              </div>
              <div>
                <div class="text-sm font-semibold tabular-nums" :class="(p.trial_signups ?? 0) > 0 ? 'text-success' : 'text-ink-disabled'">
                  {{ p.trial_signups ?? 0 }}
                </div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">signups</div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- Top by trial signups -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Pipeline Drivers</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">By Trial Signups</span>
        </div>
        <div class="space-y-2">
          <article
            v-for="(p, i) in topByTrialSignups"
            :key="p.id"
            class="flex items-start gap-3 rounded-md border-l-4 bg-surface-elevated/40 p-3"
            :style="{ borderLeftColor: PLATFORM_META[p.platform].color }"
          >
            <div class="text-2xl font-bold text-success w-6 flex-shrink-0">{{ i + 1 }}</div>
            <div class="min-w-0 flex-1">
              <div v-if="p.title" class="text-xs font-semibold text-ink line-clamp-1">{{ p.title }}</div>
              <p class="text-[11px] text-ink-muted leading-snug line-clamp-2">{{ p.body }}</p>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-base font-bold text-success tabular-nums">+{{ p.trial_signups ?? 0 }}</div>
              <div class="text-[9px] uppercase tracking-wide text-ink-disabled">signups in 7d</div>
            </div>
          </article>
        </div>
      </section>

      <!-- Insights -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">What's Working</span>
        </div>
        <ul class="space-y-2 text-sm">
          <li class="flex items-start gap-2">
            <span class="text-success">↑</span>
            <span class="text-ink"><span class="font-semibold">r/fantasyfootball "build-in-public" posts</span> drive 4× more signups than promo posts. The "I built a tool that does X for my own league" framing wins.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-success">↑</span>
            <span class="text-ink"><span class="font-semibold">r/Sleeperapp threads</span> have a smaller audience but 3.4× higher signup rate per impression. Sleeper users are the strongest ICP fit.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-warn">↓</span>
            <span class="text-ink"><span class="font-semibold">YouTube Shorts</span> getting decent views but minimal signups (3 in 30d). Test adding a clearer "link in description" overlay at 2s + at end.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-success">↑</span>
            <span class="text-ink"><span class="font-semibold">Replying to mentions within 2 hours</span> doubles the chance of the original poster trying the trial. Lean into the listening inbox.</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
