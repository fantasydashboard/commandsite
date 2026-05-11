<script setup lang="ts">
/**
 * UFD Redesign — Lifecycle Email module.
 * Three internal views: Templates / Pipeline / Performance.
 *
 * Lifecycle email is UFD's #1 retention lever, so this page should
 * make it easy to see (a) what the cadence looks like, (b) where each
 * trial user is right now, (c) what's working.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  templates,
  pipelineUsers,
  recentSends,
  emailStats,
  KIND_META,
  STEP_META,
  type EmailTemplate,
  type CampaignKind,
  type SendRecord,
  type PipelineStep,
  type PipelineUser,
} from '@/lib/clients/ufd-redesign/email'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

type View = 'templates' | 'pipeline' | 'performance'
const view = ref<View>('templates')
const stats = computed(() => emailStats())

// ── Templates view ─────────────────────────────────────────────────────
const kindFilter = ref<CampaignKind | 'all'>('all')
const previewing = ref<EmailTemplate | null>(null)
const localList = ref<EmailTemplate[]>(templates.map((t) => ({ ...t })))

const filteredTemplates = computed(() =>
  localList.value.filter((t) => kindFilter.value === 'all' || t.kind === kindFilter.value),
)

// ── Pipeline view ──────────────────────────────────────────────────────
const stepOrder: PipelineStep[] = [
  'day_1_connect', 'day_3_share', 'day_6_convert', 'day_8_last_chance',
  'paid_welcome', 'day_90_check', 'renewal_60d', 'winback',
]
function usersInStep(s: PipelineStep): PipelineUser[] {
  return pipelineUsers
    .filter((u) => u.current_step === s)
    .sort((a, b) => new Date(a.entered_step_at).getTime() - new Date(b.entered_step_at).getTime())
}

// ── Performance view ───────────────────────────────────────────────────
const topByOpen = computed(() =>
  [...templates].filter((t) => t.recipients_total > 0)
    .sort((a, b) => b.open_rate - a.open_rate).slice(0, 5),
)
const topByRevenue = computed(() =>
  [...templates].filter((t) => t.attributed_revenue_cents > 0)
    .sort((a, b) => b.attributed_revenue_cents - a.attributed_revenue_cents).slice(0, 5),
)

// ── Helpers ────────────────────────────────────────────────────────────
function pct(v: number): string { return `${(v * 100).toFixed(0)}%` }
function num(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toLocaleString()
}
function money(cents: number, opts: { compact?: boolean } = {}): string {
  if (cents === 0) return '—'
  if (opts.compact && cents >= 100_000) return '$' + Math.round(cents / 1000) + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}
function fmtAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return `${Math.floor(day / 30)}mo ago`
}
function statusMeta(s: SendRecord['status']): { label: string; color: string } {
  if (s === 'opened')   return { label: 'Opened',   color: '#0EA5E9' }
  if (s === 'clicked')  return { label: 'Clicked',  color: 'rgb(var(--color-brand))' }
  if (s === 'replied')  return { label: 'Replied',  color: '#10B981' }
  if (s === 'bounced')  return { label: 'Bounced',  color: '#EF4444' }
  return                       { label: 'Delivered',color: '#94A3B8' }
}
function templateNameById(id: string): string {
  return templates.find((t) => t.id === id)?.name ?? '—'
}

// ── Bones-drafted email queue ──────────────────────────────────────────
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'email-sunday-card',
    icon: '📧',
    badge: 'Sunday card blast',
    badgeClass: 'bg-brand/15 text-brand',
    title: '"Cooper Kupp is back" — Sunday card to 5,847 subscribers',
    recipient: 'Sunday 8 AM ET · auto-schedule · open-rate target 41%',
    preview: '"Subject: Cooper Kupp\'s RZ rate is back to 2021 levels — start him.\n\nBody: 24% RZ rate over last 3 weeks. His next three defenses rank 28th, 24th, 22nd against the WR. If you have him, start him. If you can buy low, do it now."\n\nPaired with the share-this-to-your-league card art.',
    approved_response: 'Scheduled for Sunday 8 AM ET. Past Sunday cards average 41% open / 18% click / 6% share-to-someone. I\'ll surface the metrics 4 hours after send.',
    ticker_after_approval: 'Sunday card scheduled — 5,847 recipients, 8 AM ET',
  },
  {
    id: 'email-trial-day3',
    icon: '⏰',
    badge: 'Lifecycle sequence',
    badgeClass: 'bg-accent/15 text-accent',
    title: 'Trial day-3 nudge — drafted variant',
    recipient: '47 users hitting day-3 of trial · most haven\'t shared a card yet',
    preview: '"Subject: Quick — did you share a card yet?\n\nBody: Hey, Josh here. Most users who become paying subscribers shared at least one card in week one. If you haven\'t yet, try this Cooper Kupp card — it\'s the one users are sharing most this week. [card link]\n\nIf it doesn\'t click for you, hit reply and tell me what you want and we don\'t have."',
    approved_response: 'Scheduled for daily 9 AM ET send to all day-3 trial users. Past variant of this hit 34% open, 11% reply. I\'ll surface the response thread for you to scan.',
    ticker_after_approval: 'Trial day-3 nudge live for 47 users',
  },
  {
    id: 'email-churn-batch',
    icon: '🔁',
    badge: 'Churn save · batch',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Churn save — 12 lapsed users, no login 14+ days',
    recipient: 'All paid · variety of segments · personalized per user',
    preview: '"Subject: [Name] — are we still useful?\n\nBody: Hey [name], Josh from UFD. I noticed you haven\'t logged in for a few weeks. No script here — just want to know if something\'s broken or if there\'s something you want that we don\'t have. Hit reply, I read every one. — Josh"',
    approved_response: 'Sent personalized to each. Past version of this email pulls ~28% reply rate (vs ~3% for generic dunning) because it\'s framed as listening, not selling. I\'ll route every reply directly to you.',
    ticker_after_approval: '12 personalized churn-save emails sent',
  },
  {
    id: 'email-dunning-batch',
    icon: '💳',
    badge: 'Dunning · batch',
    badgeClass: 'bg-danger/15 text-danger',
    title: '8 failed payments — drafted recovery sequence',
    recipient: '$312 MRR at risk · expired cards + insufficient funds',
    preview: 'Attempt 1: "Your card didn\'t process — here\'s an Apple Pay link [link] (takes 10 seconds)" — sent today.\nAttempt 2 (in 3 days if no fix): "Want to pause instead of cancel? [pause link]"\nAttempt 3 (in 7 days): final notice.\n\nHistorical recovery: ~60% recover on attempt 1, ~25% on attempt 2.',
    approved_response: 'Sequence live. Attempt 1 went out 30 sec ago. I\'ll surface each recovery the moment a payment succeeds and surface the at-risk MRR drop accordingly.',
    ticker_after_approval: 'Dunning sequence live — $312 MRR in recovery',
  },
  {
    id: 'email-power-thanks',
    icon: '🏆',
    badge: 'Power user thanks',
    badgeClass: 'bg-success/15 text-success',
    title: 'Top sharer thank-you — @amyjohnson (23 shares this week)',
    recipient: 'Personal note from Josh, not a templated blast',
    preview: '"Hey Amy — Josh here. Just saw you shared 23 cards this week, which is wild. I genuinely couldn\'t do this without users like you. Anything you want and we don\'t have? Hit reply. Also, you have a free 12-month coming your way as a thank-you. — Josh"',
    approved_response: 'Sent. Power-user thank-yous from the founder hit ~70% reply rate and the responses are gold for product roadmap. I\'ll surface her reply if it lands.',
    ticker_after_approval: 'Thank-you sent to @amyjohnson (top sharer)',
  },
]

const tickerSeed = [
  { icon: '📤', text: 'Tuesday waiver email delivered — 11,765 recipients, 28% open so far', ageSec: 8 * 60 },
  { icon: '✅', text: 'Trial day-3 nudge → reply landed — "actually love this, just busy"', ageSec: 47 * 60 },
  { icon: '💳', text: '3 failed-payment recoveries logged from this morning\'s batch', ageSec: 3 * 3600 },
  { icon: '🏆', text: 'New power-user identified — @amyjohnson, 23 shares this week', ageSec: 6 * 3600 },
]

const tickerPool = [
  { icon: '📤', text: 'Email blast delivered — first opens tracking now' },
  { icon: '✅', text: 'Reply received from a trial user — routing to inbox' },
  { icon: '💚', text: 'Trial → paid conversion logged from day-3 nudge' },
  { icon: '🔁', text: 'Churn-save reply landed — user wants to keep going' },
  { icon: '💳', text: 'Failed payment recovered via Apple Pay link' },
  { icon: '🎯', text: 'New sequence drafted — Bones queued for review' },
  { icon: '📊', text: 'Open rate ticked above benchmark — Sunday card outperforming' },
]

const emailTicker = ref<InstanceType<typeof GraceLiveTicker> | null>(null)

function onApproved(item: ApprovalQueueItem) {
  if (item.ticker_after_approval) {
    emailTicker.value?.pushEvent({ icon: item.icon, text: item.ticker_after_approval })
  }
}
</script>

<template>
  <div class="space-y-4">
    <GraceLiveTicker
      ref="emailTicker"
      :seed="tickerSeed"
      :pool="tickerPool"
      subtitle="Email engine — sends, opens, replies, recoveries"
    />

    <GraceApprovalQueue
      :items="queueItems"
      :initial-resolved="22"
      heading="Email pipeline"
      subtitle="Bones drafted these from this week's segments + lifecycle triggers. Approve to schedule."
      @approved="onApproved"
    />

    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Lifecycle Email</h2>
        <p class="text-sm text-ink-muted">
          Templates, the per-user pipeline (where each trial user sits in the cadence), and what's actually moving the needle.
        </p>
      </div>
      <button
        type="button"
        class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"
      >+ New template</button>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Active templates</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ stats.active_templates }} <span class="text-base text-ink-muted">/ {{ stats.total_templates }}</span>
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Sends (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ num(stats.sends_30d) }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Avg open · click</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ pct(stats.avg_open_rate) }} · <span class="text-accent">{{ pct(stats.avg_click_rate) }}</span>
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Attributed revenue (90d)</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ money(stats.attributed_revenue_90d_cents, { compact: true }) }}</div>
      </div>
    </div>

    <!-- View toggle -->
    <div class="card flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        class="chip"
        :class="view === 'templates' ? 'chip-active' : ''"
        @click="view = 'templates'"
      >Templates ({{ templates.length }})</button>
      <button
        type="button"
        class="chip"
        :class="view === 'pipeline' ? 'chip-active' : ''"
        @click="view = 'pipeline'"
      >
        Pipeline ({{ stats.pipeline_volume }})
        <span v-if="stats.pipeline_high_priority > 0" class="ml-1 rounded-full bg-warn text-white px-1.5 text-[10px] font-bold">{{ stats.pipeline_high_priority }}</span>
      </button>
      <button
        type="button"
        class="chip"
        :class="view === 'performance' ? 'chip-active' : ''"
        @click="view = 'performance'"
      >Performance</button>
    </div>

    <!-- ═════════════ TEMPLATES ═════════════ -->
    <div v-if="view === 'templates'" class="space-y-3">
      <!-- Kind filter -->
      <div class="card">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            :class="kindFilter === 'all' ? 'bg-brand text-white' : 'bg-surface-elevated text-ink-muted hover:bg-surface-elevated/80'"
            @click="kindFilter = 'all'"
          >All ({{ templates.length }})</button>
          <button
            v-for="(meta, k) in KIND_META"
            :key="k"
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-white"
            :style="kindFilter === k
              ? { backgroundColor: meta.color }
              : { backgroundColor: meta.color + '22', color: meta.color }"
            @click="kindFilter = (k as CampaignKind)"
          >{{ meta.label }} ({{ templates.filter((t) => t.kind === k).length }})</button>
        </div>
      </div>

      <article
        v-for="t in filteredTemplates"
        :key="t.id"
        class="card"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <h3 class="text-base font-semibold text-ink">{{ t.name }}</h3>
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                :style="{ backgroundColor: KIND_META[t.kind].color }"
              >{{ KIND_META[t.kind].label }}</span>
              <span v-if="!t.active" class="rounded-full bg-surface-elevated text-ink-disabled px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Inactive</span>
              <span v-if="t.variant_b" class="rounded-full bg-accent/15 text-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">A/B</span>
            </div>
            <div class="text-xs text-ink-muted">{{ t.trigger }}</div>
            <div class="mt-2 text-sm text-ink">
              <span class="font-medium">Subject:</span> {{ t.subject }}
            </div>
            <div class="text-[11px] text-ink-disabled italic mt-0.5">{{ t.preview }}</div>
            <div v-if="t.variant_b" class="mt-2 rounded-md bg-surface-elevated/40 border border-divider p-2 text-[11px]">
              <span class="font-semibold text-accent">Variant B:</span>
              <span class="text-ink">{{ t.variant_b.subject }}</span>
              <span class="text-ink-disabled ml-2 tabular-nums">— {{ pct(t.variant_b.open_rate) }} open · {{ pct(t.variant_b.click_rate) }} click</span>
            </div>
          </div>
          <div class="flex flex-col items-end gap-2 flex-shrink-0">
            <label class="inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="t.active" class="sr-only peer" />
              <span class="relative h-5 w-9 rounded-full bg-surface-elevated transition-colors peer-checked:bg-brand">
                <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4"></span>
              </span>
            </label>
            <button
              type="button"
              class="rounded-md bg-brand/10 text-brand px-2.5 py-1 text-[11px] font-semibold hover:bg-brand/20"
              @click="previewing = t"
            >Preview</button>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 border-t border-divider pt-3">
          <div>
            <div class="kpi-label">Sent</div>
            <div class="text-sm font-semibold text-ink tabular-nums">{{ t.recipients_total.toLocaleString() }}</div>
          </div>
          <div>
            <div class="kpi-label">Open</div>
            <div class="text-sm font-semibold text-ink tabular-nums">{{ pct(t.open_rate) }}</div>
          </div>
          <div>
            <div class="kpi-label">Click</div>
            <div class="text-sm font-semibold text-accent tabular-nums">{{ pct(t.click_rate) }}</div>
          </div>
          <div v-if="t.reply_rate !== undefined">
            <div class="kpi-label">Reply</div>
            <div class="text-sm font-semibold text-ink tabular-nums">{{ pct(t.reply_rate) }}</div>
          </div>
          <div v-else>
            <div class="kpi-label">Last sent</div>
            <div class="text-sm font-semibold text-ink-muted">{{ fmtAgo(t.last_sent_at) }}</div>
          </div>
          <div>
            <div class="kpi-label">Attributed revenue</div>
            <div class="text-sm font-semibold tabular-nums" :class="t.attributed_revenue_cents > 0 ? 'text-success' : 'text-ink-disabled'">
              {{ money(t.attributed_revenue_cents) }}
            </div>
          </div>
        </div>
      </article>
    </div>

    <!-- ═════════════ PIPELINE ═════════════ -->
    <div v-if="view === 'pipeline'" class="overflow-x-auto">
      <div class="flex gap-3 min-w-fit pb-2">
        <div
          v-for="step in stepOrder"
          :key="step"
          class="w-[260px] flex-shrink-0"
        >
          <!-- Column header -->
          <div
            class="rounded-t-card px-3 py-2.5 flex items-center justify-between gap-2 text-white"
            :style="{ backgroundColor: STEP_META[step].color }"
          >
            <div class="min-w-0">
              <div class="text-sm font-semibold truncate">{{ STEP_META[step].label }}</div>
              <div class="text-[10px] opacity-90 truncate">{{ STEP_META[step].sub }}</div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-base font-bold tabular-nums leading-none">{{ usersInStep(step).length }}</div>
            </div>
          </div>

          <!-- Cards -->
          <div class="rounded-b-card bg-surface-elevated/40 p-2 space-y-2 min-h-[120px]">
            <article
              v-for="u in usersInStep(step)"
              :key="u.id"
              class="rounded-md border border-divider bg-surface p-2.5"
            >
              <div class="text-sm font-semibold text-ink truncate">{{ u.user_name }}</div>
              <div class="text-[11px] text-ink-muted truncate">{{ u.user_email }}</div>
              <div class="mt-1.5 flex items-center gap-1.5 text-[10px] text-ink-disabled">
                <span v-if="u.last_email_clicked" class="rounded-full bg-success/15 text-success px-1.5 py-0.5 font-semibold">✓ clicked</span>
                <span v-else-if="u.last_email_opened" class="rounded-full bg-accent/15 text-accent px-1.5 py-0.5 font-semibold">✉ opened</span>
                <span v-else class="rounded-full bg-surface-elevated text-ink-disabled px-1.5 py-0.5 font-semibold">delivered</span>
                <span class="ml-auto">{{ fmtAgo(u.entered_step_at) }}</span>
              </div>
              <div v-if="u.flag" class="mt-1.5 text-[10px] text-warn italic">📝 {{ u.flag }}</div>
              <div class="mt-2 flex items-center gap-1">
                <button type="button" class="text-[10px] text-brand font-semibold hover:underline">Send now</button>
                <span class="text-ink-disabled">·</span>
                <button type="button" class="text-[10px] text-ink-disabled hover:text-ink-muted">Skip</button>
              </div>
            </article>

            <div
              v-if="usersInStep(step).length === 0"
              class="px-3 py-6 text-center text-[11px] text-ink-disabled italic"
            >
              No users at this step.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═════════════ PERFORMANCE ═════════════ -->
    <div v-if="view === 'performance'" class="space-y-4">
      <!-- Top by open rate -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Top by Open Rate</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">Last 30 days</span>
        </div>
        <div class="space-y-2">
          <article
            v-for="(t, i) in topByOpen"
            :key="t.id"
            class="flex items-center gap-3 rounded-md border-l-4 bg-surface-elevated/40 p-3"
            :style="{ borderLeftColor: KIND_META[t.kind].color }"
          >
            <div class="text-xl font-bold text-ink-disabled w-6 flex-shrink-0">{{ i + 1 }}</div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-ink truncate">{{ t.name }}</div>
              <div class="text-[11px] text-ink-disabled truncate">{{ t.subject }}</div>
            </div>
            <div class="grid grid-cols-3 gap-3 text-right flex-shrink-0">
              <div>
                <div class="text-sm font-semibold text-ink tabular-nums">{{ t.recipients_total }}</div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">sent</div>
              </div>
              <div>
                <div class="text-sm font-semibold text-ink tabular-nums">{{ pct(t.open_rate) }}</div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">open</div>
              </div>
              <div>
                <div class="text-sm font-semibold text-accent tabular-nums">{{ pct(t.click_rate) }}</div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">click</div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- Top by attributed revenue -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Pipeline Drivers</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">By Attributed Revenue (90d)</span>
        </div>
        <div class="space-y-2">
          <article
            v-for="(t, i) in topByRevenue"
            :key="t.id"
            class="flex items-center gap-3 rounded-md border-l-4 bg-surface-elevated/40 p-3"
            :style="{ borderLeftColor: KIND_META[t.kind].color }"
          >
            <div class="text-xl font-bold text-success w-6 flex-shrink-0">{{ i + 1 }}</div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-ink">{{ t.name }}</div>
              <div class="text-[11px] text-ink-muted">{{ KIND_META[t.kind].label }}</div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-base font-bold text-success tabular-nums">{{ money(t.attributed_revenue_cents, { compact: true }) }}</div>
            </div>
          </article>
        </div>
      </section>

      <!-- A/B insights -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">A/B Test Findings</span>
        </div>
        <ul class="space-y-2 text-sm">
          <li class="flex items-start gap-2">
            <span class="text-success">↑</span>
            <span class="text-ink">
              <span class="font-semibold">Day 3 share-nudge:</span>
              "You made N cards. Your league doesn't know." outperforms "Quick favor — try sharing one card" by <span class="text-success font-semibold">+17pts open</span>, <span class="text-success font-semibold">+19pts click</span>. The numeric specificity beats the casual ask.
            </span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-success">↑</span>
            <span class="text-ink">
              <span class="font-semibold">Day 6 conversion:</span>
              <span v-pre>First-name in subject ("Your trial ends tomorrow ({{first_name}})")</span> beats no-name by <span class="text-success font-semibold">+12pts click</span>. Worth A/B testing the same trick on welcome emails.
            </span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-warn">↓</span>
            <span class="text-ink">
              <span class="font-semibold">Day 8 last-chance:</span>
              Open rate is healthy (52%) but only 16% click. Re-thread: the 50%-off offer is buried — move it above the fold.
            </span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-success">↑</span>
            <span class="text-ink">
              <span class="font-semibold">Annual renewal 60d notice:</span>
              5% reply rate — most are positive ("can\'t wait for next season"). Use these as testimonials in onboarding.
            </span>
          </li>
        </ul>
      </section>

      <!-- Recent activity -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Recent Sends</span>
          <span class="text-xs text-ink-muted">Last 24h</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th class="px-3 py-2 font-medium">Recipient</th>
                <th class="px-3 py-2 font-medium">Template</th>
                <th class="px-3 py-2 font-medium">Status</th>
                <th class="px-3 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in recentSends"
                :key="s.id"
                class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
              >
                <td class="px-3 py-2.5">
                  <div class="text-sm font-medium text-ink">{{ s.recipient_name }}</div>
                  <div class="text-[11px] text-ink-disabled">{{ s.recipient_email }}</div>
                </td>
                <td class="px-3 py-2.5 text-xs text-ink-muted">{{ templateNameById(s.template_id) }}</td>
                <td class="px-3 py-2.5">
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                    :style="{ backgroundColor: statusMeta(s.status).color }"
                  >{{ statusMeta(s.status).label }}</span>
                  <div v-if="s.reply_excerpt" class="mt-1 text-[11px] italic text-ink-muted">💬 {{ s.reply_excerpt }}</div>
                </td>
                <td class="px-3 py-2.5 text-[11px] text-ink-muted whitespace-nowrap">{{ fmtAgo(s.sent_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Preview modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="previewing"
          class="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4"
          @click.self="previewing = null"
        >
          <div class="w-full max-w-xl rounded-card bg-surface shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div class="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="text-base font-semibold text-ink truncate">{{ previewing.name }}</h3>
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                    :style="{ backgroundColor: KIND_META[previewing.kind].color }"
                  >{{ KIND_META[previewing.kind].label }}</span>
                </div>
                <div class="text-xs text-ink-muted">{{ previewing.trigger }}</div>
              </div>
              <button
                type="button"
                class="text-ink-muted hover:text-ink text-xl leading-none p-1 -mr-1"
                @click="previewing = null"
              >×</button>
            </div>

            <div class="overflow-y-auto px-5 py-4 flex-1 bg-surface-elevated/30">
              <div class="rounded-md bg-surface border border-divider p-4">
                <div class="text-[10px] uppercase tracking-wide font-semibold text-ink-muted">From</div>
                <div class="text-sm text-ink mb-2">UFD &lt;josh@ufd.app&gt;</div>
                <div class="text-[10px] uppercase tracking-wide font-semibold text-ink-muted">Subject</div>
                <div class="text-sm font-semibold text-ink mb-3">{{ previewing.subject }}</div>
                <div class="border-t border-divider pt-3">
                  <pre class="whitespace-pre-wrap font-sans text-sm text-ink leading-relaxed">{{ previewing.body }}</pre>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 border-t border-divider px-5 py-3 bg-surface">
              <button type="button" class="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink" @click="previewing = null">Close</button>
              <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">Edit template</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 120ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
