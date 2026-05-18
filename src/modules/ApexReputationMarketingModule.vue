<script setup lang="ts">
/**
 * Apex — Reputation & Marketing.
 * Ada's roles on this page: ⭐ Review Engine + 📧 Email Marketing + 🤝 Referral Hunter.
 */
import { computed } from 'vue'
import type { Client } from '@/types/database'
import { reviews, reviewStats } from '@/lib/clients/apex/reviews'
import { campaigns, recentSends, campaignStats } from '@/lib/clients/apex/emailCampaigns'
import { rolesOnTab, getRole } from '@/lib/clients/apex/roles'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'
import LiveActivityFeed from '@/components/ada/LiveActivityFeed.vue'
import RolesOnPage from '@/components/ada/RolesOnPage.vue'
import { useLiveActivity, seedEvent, type PoolEvent } from '@/composables/useLiveActivity'
import { money, fmtAgoCoarse } from '@/lib/format'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const rstats = computed(() => reviewStats())
const cstats = computed(() => campaignStats())

const recentReviews = computed(() => reviews.slice(0, 6))
const liveCampaigns = computed(() => campaigns.filter((c) => c.active).slice(0, 5))
const recentSendsList = computed(() => recentSends.slice(0, 6))

function pct(v: number): string { return Math.round(v * 100) + '%' }

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

// ── Referral Hunter (new section) ──────────────────────────────────────
// Ada texts past happy customers ~30 days after install asking who they'd
// refer. Conversions tracked back to original referrer (for thank-you +
// credit). Zero compliance risk — only customers who already know us.
type ReferralStatus = 'sent' | 'opened' | 'replied' | 'referred'
interface ReferralAsk {
  id: string
  customer: string
  sent_label: string
  status: ReferralStatus
  referred_to: string | null
  est_value_cents: number
}
const referralAsks: ReferralAsk[] = [
  { id: 'rf1', customer: 'Tom Bradley',       sent_label: '2 days ago', status: 'referred', referred_to: 'Mark T. (next-door neighbor)', est_value_cents: 4_200_00 },
  { id: 'rf2', customer: 'Karen Holloway',    sent_label: '4 days ago', status: 'referred', referred_to: 'Hannah W. (sister)',           est_value_cents: 2_800_00 },
  { id: 'rf3', customer: 'Maria Chen',        sent_label: 'today',      status: 'opened',   referred_to: null,                            est_value_cents: 0 },
  { id: 'rf4', customer: 'Lisa Bennett',      sent_label: '3 days ago', status: 'opened',   referred_to: null,                            est_value_cents: 0 },
  { id: 'rf5', customer: 'Jennifer Martinez', sent_label: '5 days ago', status: 'sent',     referred_to: null,                            est_value_cents: 0 },
  { id: 'rf6', customer: 'Robert Chen',       sent_label: '6 days ago', status: 'replied',  referred_to: null,                            est_value_cents: 0 },
]
const referralStats = computed(() => {
  const replied = referralAsks.filter((a) => a.status === 'replied' || a.status === 'referred').length
  const referred = referralAsks.filter((a) => a.status === 'referred').length
  const revenue = referralAsks.reduce((s, a) => s + a.est_value_cents, 0)
  return {
    count: referralAsks.length,
    replyRate: replied / referralAsks.length,
    referredCount: referred,
    revenue,
  }
})
function refStatusClass(s: ReferralStatus): string {
  if (s === 'referred') return 'bg-success/15 text-success'
  if (s === 'replied')  return 'bg-brand/15 text-brand'
  if (s === 'opened')   return 'bg-warn/15 text-warn'
  return 'bg-ink-muted/10 text-ink-muted'
}

// ── Approval queue: review replies + campaign drafts ─────────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'rep-castellanos',
    role: 'review_engine',
    icon: 'review_engine',
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
    role: 'review_engine',
    icon: 'review_engine',
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
    role: 'email_marketing',
    icon: 'email_marketing',
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
    role: 'review_engine',
    icon: 'review_engine',
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
    role: 'email_marketing',
    icon: 'deal_won_handoff',
    badge: 'Local SEO post',
    badgeClass: 'bg-success/15 text-success',
    title: 'Google Business Profile post — drafted',
    recipient: '"3 signs your AC needs a tune-up before summer" · seasonal authority post',
    preview: 'Short visual post for the GBP feed — tied to spring campaign. Drives both customer engagement AND Google\'s local search algorithm reads activity as relevance signal.',
    approved_response: "Posted. GBP posts decay after 7 days so I'll auto-draft the next one for next Wednesday. Watching for click-through to the booking page.",
    ticker_after_approval: 'Google Business Profile post published',
  },
]

// ── Live activity (scoped to Reputation & Marketing) ──────────────────
const liveSeed = [
  seedEvent(38 * 60,   'review_engine', 'New 5★ — Maria Chen, named Tony in the review',          'review_engine'),
  seedEvent(2 * 3600,  'email_marketing', 'Spring tune-up draft auto-generated · ready for review', 'email_marketing'),
  seedEvent(3 * 3600,  'review_engine', 'Yelp review opened — auto-drafted reply queued',         'review_engine'),
  seedEvent(6 * 3600,  'referral_hunter', 'Referral landed — Tom Bradley sent us his neighbor',     'referral_hunter'),
]
const livePool: PoolEvent[] = [
  { icon: 'review_engine', text: 'Review request opened — clicked through to Google',         role: 'review_engine' },
  { icon: 'review_engine', text: 'New 5★ posted — added to homepage carousel queue',           role: 'review_engine' },
  { icon: 'email_marketing', text: 'Newsletter delivered to 847 — opens flowing in',            role: 'email_marketing' },
  { icon: 'email_marketing', text: 'Email reply — campaign-attributed booking inquiry',         role: 'email_marketing' },
  { icon: 'deal_won_handoff', text: 'GBP click → website → booking form view',                    role: 'email_marketing' },
  { icon: 'review_engine', text: 'Yelp listing impression count: +18% week-over-week',         role: 'review_engine' },
  { icon: 'referral_hunter', text: 'Referral ask opened — past customer reading the link',       role: 'referral_hunter' },
  { icon: 'check-circle', text: 'Referral converted — Hannah W. booked $2,800 install',      role: 'referral_hunter' },
]

const { events: liveEvents, fmtAgo: fmtLiveAgo, pushEvent } = useLiveActivity({
  seed: liveSeed,
  pool: livePool,
})

function onApproved(item: ApprovalQueueItem) {
  if (!item.ticker_after_approval) return
  const role = item.role ?? 'review_engine'
  pushEvent({ icon: item.icon, text: item.ticker_after_approval, role })
}

const pageRoles = rolesOnTab('reputation-marketing')
</script>

<template>
  <div class="space-y-4">
    <RolesOnPage :roles="pageRoles" />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="8"
      assistant-name="Ada"
      :push-approved-to-chat="false"
      heading="Reputation + marketing"
      subtitle="Review replies + campaign drafts + GBP posts. Co-sign to publish."
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
    <section id="review_engine" class="card scroll-mt-24">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Review Engine · Recent reviews</span>
          <span class="text-xs text-ink-muted">Ada texts customers 2h after job completion</span>
        </div>
      </div>
      <ul class="space-y-2">
        <li
          v-for="r in recentReviews"
          :key="r.id"
          class="rounded-md bg-surface-elevated/60 px-3 py-2"
        >
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="text-base font-bold tabular-nums" :class="starColor(r.rating)">{{ r.rating }}★</span>
            <span class="text-sm font-semibold text-ink">{{ r.customer }}</span>
            <span class="text-[10px] text-ink-disabled">{{ r.source }} · {{ fmtAgoCoarse(r.received_at) }}</span>
            <span v-if="r.job_type" class="text-[10px] rounded bg-surface-elevated text-ink-muted px-1.5 py-0.5 font-medium">{{ r.job_type }}</span>
          </div>
          <p class="text-[11px] text-ink-muted italic leading-snug">"{{ r.text }}"</p>
          <p v-if="r.ai_response_draft && !r.response" class="text-[10px] text-brand mt-1 italic">
            Ada drafted reply: "{{ r.ai_response_draft.slice(0, 120) }}…"
          </p>
          <p v-else-if="r.response" class="text-[10px] text-success mt-1 italic">
            ✓ Replied: "{{ r.response.text.slice(0, 100) }}…"
          </p>
        </li>
      </ul>
    </section>

    <!-- Email Marketing -->
    <section id="email_marketing" class="card scroll-mt-24">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Email Marketing · Live campaigns</span>
          <span class="text-xs text-ink-muted">what Ada is currently running</span>
        </div>
      </div>
      <ul class="space-y-2 mb-4">
        <li
          v-for="c in liveCampaigns"
          :key="c.id"
          class="rounded-md border border-divider bg-surface-elevated/40 px-3 py-2"
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
            <span class="text-[10px] text-ink-disabled">{{ fmtAgoCoarse(s.sent_at) }}</span>
            <span
              class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
              :class="sendStatusClass(s.status)"
            >{{ s.status }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Referral Hunter (NEW) -->
    <section id="referral_hunter" class="card scroll-mt-24">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Referral Hunter · Recent asks</span>
          <span class="text-xs text-ink-muted">Ada texts past happy customers ~30d after install</span>
        </div>
      </div>

      <!-- Referral KPI row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div class="rounded-md bg-surface-elevated/60 px-3 py-2">
          <div class="kpi-label">Asks this week</div>
          <div class="mt-0.5 text-lg font-bold text-ink tabular-nums">{{ referralStats.count }}</div>
        </div>
        <div class="rounded-md bg-surface-elevated/60 px-3 py-2">
          <div class="kpi-label">Reply rate</div>
          <div class="mt-0.5 text-lg font-bold text-brand tabular-nums">{{ Math.round(referralStats.replyRate * 100) }}%</div>
        </div>
        <div class="rounded-md bg-surface-elevated/60 px-3 py-2">
          <div class="kpi-label">Referrals in</div>
          <div class="mt-0.5 text-lg font-bold text-success tabular-nums">{{ referralStats.referredCount }}</div>
        </div>
        <div class="rounded-md bg-surface-elevated/60 px-3 py-2">
          <div class="kpi-label">Referred $ pipeline</div>
          <div class="mt-0.5 text-lg font-bold text-success tabular-nums">{{ money(referralStats.revenue) }}</div>
        </div>
      </div>

      <!-- Asks list -->
      <ul class="space-y-2">
        <li
          v-for="a in referralAsks"
          :key="a.id"
          class="rounded-md bg-surface-elevated/60 px-3 py-2 flex items-center gap-2 flex-wrap"
        >
          <span class="text-sm font-semibold text-ink min-w-0 truncate w-40">{{ a.customer }}</span>
          <span class="text-[11px] text-ink-muted truncate flex-1">
            asked {{ a.sent_label }}<span v-if="a.referred_to"> · referred {{ a.referred_to }}</span>
          </span>
          <span v-if="a.est_value_cents > 0" class="text-[10px] text-success font-semibold">{{ money(a.est_value_cents) }}</span>
          <span
            class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
            :class="refStatusClass(a.status)"
          >{{ a.status }}</span>
        </li>
      </ul>
    </section>

    <LiveActivityFeed
      :events="liveEvents"
      :fmt-ago="fmtLiveAgo"
      :get-role="getRole"
      title="Reputation + marketing signals"
      subtitle="Reviews, opens, clicks, referrals · auto-updates"
    />
  </div>
</template>
