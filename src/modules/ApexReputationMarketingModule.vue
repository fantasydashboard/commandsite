<script setup lang="ts">
/**
 * Apex — Reputation & Marketing (Ada's roles 6 + 7).
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import { reviews, reviewStats } from '@/lib/clients/apex/reviews'
import { campaigns, recentSends, campaignStats } from '@/lib/clients/apex/emailCampaigns'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const rstats = computed(() => reviewStats())
const cstats = computed(() => campaignStats())

const recentReviews = computed(() => reviews.slice(0, 6))
const liveCampaigns = computed(() => campaigns.filter((c) => c.active).slice(0, 5))
const recentSendsList = computed(() => recentSends.slice(0, 6))

function pct(v: number): string { return Math.round(v * 100) + '%' }
function fmtAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'today'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function starColor(stars: number): string {
  if (stars >= 4) return 'text-success'
  if (stars >= 3) return 'text-warn'
  return 'text-danger'
}

function sendStatusClass(s: string): string {
  if (s === 'replied' || s === 'clicked') return 'bg-success/15 text-success'
  if (s === 'opened') return 'bg-brand/15 text-brand'
  if (s === 'bounced') return 'bg-danger/10 text-danger'
  return 'bg-ink-muted/10 text-ink-muted'
}

// ── Approval queue: review replies + campaign drafts ─────────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'rep-castellanos',
    icon: '⭐',
    badge: 'Review reply · 3★',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Apology reply — Jim Castellanos',
    recipient: 'Tech 40 min late + didn\'t call · before this goes live',
    preview: '"Jim — Brett here, owner at Apex. You\'re right — we missed on the heads-up call and that\'s on us. I\'ve talked with the tech and we\'re tightening dispatch routing so this doesn\'t happen again. I\'d like to credit your next service call to make it right if you\'ll give us another shot. — Brett"',
    approved_response: 'Posted to Google. Owner replies on negative reviews lift positive engagement by ~3.4×. Watching for Jim\'s follow-up.',
    ticker_after_approval: 'Apology reply posted to Castellanos 3★ review',
  },
  {
    id: 'rep-maria-thanks',
    icon: '⭐',
    badge: 'Review reply · 5★',
    badgeClass: 'bg-success/15 text-success',
    title: 'Thank-you reply — Maria Chen 5★',
    recipient: 'Called Tony out by name · "no pressure, just options"',
    preview: '"Maria — thanks so much for the kind words. I\'ll make sure Tony sees this — he genuinely cares about the no-pressure part of his job and it shows. Glad the new thermostat is working out. — Brett"',
    approved_response: "Posted. Public thank-you to a 5★ that names a specific tech is great recruiting material AND signals to other reviewers that we read everything.",
    ticker_after_approval: 'Thank-you reply posted to Maria Chen 5★',
  },
  {
    id: 'rep-spring-tuneup',
    icon: '📧',
    badge: 'Campaign draft',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Spring tune-up campaign — drafted',
    recipient: '847 active customers · ICP-segmented · ready to schedule',
    preview: '"Subject: Spring tune-up time — book before the May rush. Body: Hey [first_name] — quick heads-up that May fills up fast for AC tune-ups. We\'re holding tune-up pricing at last year\'s $89 if you book by April 30th..."',
    approved_response: "Scheduled for Tuesday 7 AM send. Past spring campaigns averaged 31% open + booked 40-60 tune-ups. I'll surface the booking spike as it lands.",
    ticker_after_approval: 'Spring tune-up campaign scheduled — 847 recipients',
  },
  {
    id: 'rep-yelp-batch',
    icon: '🌟',
    badge: 'Yelp replies',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Yelp review batch reply — 4 new this week',
    recipient: 'All 4★+ · personalized replies drafted for each',
    preview: 'Each reply names the tech the customer mentioned + thanks them for specific feedback. Yelp prioritizes replied-to listings in local search — every reply is SEO + reputation in one.',
    approved_response: "Posted to Yelp. Watching for any cascade replies — sometimes a thoughtful owner reply triggers other satisfied customers to leave their own review.",
    ticker_after_approval: '4 Yelp review replies posted',
  },
  {
    id: 'rep-bf-newsletter',
    icon: '🎯',
    badge: 'Local SEO post',
    badgeClass: 'bg-success/15 text-success',
    title: 'Google Business Profile post — drafted',
    recipient: '"3 signs your AC needs a tune-up before summer" · seasonal authority post',
    preview: 'Short visual post for the GBP feed — tied to spring campaign. Drives both customer engagement AND Google\'s local search algorithm reads activity as relevance signal.',
    approved_response: "Posted. GBP posts decay after 7 days so I'll auto-draft the next one for next Wednesday. Watching for click-through to the booking page.",
    ticker_after_approval: 'Google Business Profile post published',
  },
]

const tickerSeed = [
  { icon: '⭐', text: 'New 5★ — Maria Chen, named Tony in the review', ageSec: 38 * 60 },
  { icon: '📧', text: 'Spring tune-up draft auto-generated · ready for review', ageSec: 2 * 3600 },
  { icon: '🌟', text: 'Yelp review opened — auto-drafted reply queued', ageSec: 3 * 3600 },
  { icon: '🎯', text: 'GBP post engagement: 47 views, 8 clicks', ageSec: 6 * 3600 },
]
const tickerPool = [
  { icon: '⭐', text: 'Review request opened — clicked through to Google' },
  { icon: '⭐', text: 'New 5★ posted — added to homepage carousel queue' },
  { icon: '📧', text: 'Newsletter delivered to 847 — opens flowing in' },
  { icon: '📨', text: 'Email reply — campaign-attributed booking inquiry' },
  { icon: '🎯', text: 'GBP click → website → booking form view' },
  { icon: '🌟', text: 'Yelp listing impression count: +18% week-over-week' },
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
      subtitle="Reputation + marketing signals — reviews, opens, clicks"
    />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="8"
      heading="Reputation + marketing queue"
      subtitle="Review replies + campaign drafts + GBP posts. Approve to publish."
      @approved="onApproved"
    />

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Avg star rating</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ rstats.avg_rating.toFixed(1) }}★</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ rstats.total }} total reviews</div>
      </div>
      <div class="card">
        <div class="kpi-label">New reviews (7d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ rstats.this_week }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ rstats.unanswered }} awaiting reply (drafted)</div>
      </div>
      <div class="card">
        <div class="kpi-label">Active campaigns</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ cstats.active_count }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">of {{ cstats.total_count }} configured</div>
      </div>
      <div class="card">
        <div class="kpi-label">Avg open rate</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ pct(cstats.avg_open_rate) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ pct(cstats.avg_click_rate) }} click rate</div>
      </div>
    </div>

    <!-- Review Engine -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">⭐ Review Engine · Recent reviews</span>
          <span class="text-xs text-ink-muted">— Ada texts customers 2h after job completion</span>
        </div>
      </div>
      <ul class="space-y-2">
        <li
          v-for="r in recentReviews"
          :key="r.id"
          class="rounded-md bg-canvas/50 px-3 py-2"
        >
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="text-base font-bold tabular-nums" :class="starColor(r.rating)">{{ r.rating }}★</span>
            <span class="text-sm font-semibold text-ink">{{ r.customer }}</span>
            <span class="text-[10px] text-ink-disabled">— {{ r.source }} · {{ fmtAgo(r.received_at) }}</span>
            <span v-if="r.job_type" class="text-[10px] rounded bg-surface-elevated text-ink-muted px-1.5 py-0.5 font-medium">{{ r.job_type }}</span>
          </div>
          <p class="text-[11px] text-ink-muted italic leading-snug">"{{ r.text }}"</p>
          <p v-if="r.ai_response_draft && !r.response" class="text-[10px] text-brand mt-1 italic">
            ✨ Ada drafted reply: "{{ r.ai_response_draft.slice(0, 120) }}…"
          </p>
          <p v-else-if="r.response" class="text-[10px] text-success mt-1 italic">
            ✓ Replied: "{{ r.response.text.slice(0, 100) }}…"
          </p>
        </li>
      </ul>
    </section>

    <!-- Email Marketing -->
    <section class="card">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">📧 Email Marketing · Live campaigns</span>
          <span class="text-xs text-ink-muted">— what Ada is currently running</span>
        </div>
      </div>
      <ul class="space-y-2 mb-4">
        <li
          v-for="c in liveCampaigns"
          :key="c.id"
          class="rounded-md border border-divider bg-canvas/40 px-3 py-2"
        >
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="text-sm font-semibold text-ink">{{ c.name }}</span>
            <span class="rounded bg-surface-elevated text-ink-muted px-1.5 py-0.5 text-[10px] font-medium">{{ c.kind }}</span>
            <span class="rounded-full bg-success/15 text-success px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">live</span>
          </div>
          <div class="flex items-center gap-3 text-[11px] text-ink-muted flex-wrap">
            <span>{{ c.recipients_total.toLocaleString() }} recipients</span>
            <span>· {{ pct(c.open_rate) }} open</span>
            <span>· {{ pct(c.click_rate) }} click</span>
          </div>
        </li>
      </ul>

      <div>
        <div class="kpi-label mb-2">Recent sends</div>
        <ul class="space-y-1.5">
          <li
            v-for="s in recentSendsList"
            :key="s.id"
            class="flex items-center gap-2 text-xs"
          >
            <span class="font-medium text-ink truncate w-40">{{ s.recipient_name }}</span>
            <span class="text-ink-muted text-[11px] truncate flex-1">{{ s.recipient_email }}</span>
            <span class="text-[10px] text-ink-disabled">{{ fmtAgo(s.sent_at) }}</span>
            <span
              class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
              :class="sendStatusClass(s.status)"
            >{{ s.status }}</span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
