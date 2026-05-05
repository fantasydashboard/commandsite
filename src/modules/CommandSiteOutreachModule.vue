<script setup lang="ts">
/**
 * CommandSite Outreach — solo-founder mode.
 *
 * The flip from per-reply approval to auto-default + digest. Cold-email
 * sequences send themselves. Replies get auto-classified. Positive
 * replies above 90% confidence auto-create the pipeline deal +
 * auto-send the Calendly intro. Owner only sees objections + edge cases.
 *
 * 5 sub-views: Inbox · Lead Enrichment · Sequences · Deliverability · Demos
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  sequences,
  replies,
  enrichedLeads,
  sendingDomainsHealth,
  bookedDemos,
  demoStats,
  outreachStats,
  REPLY_CLASS_META,
  CHANNEL_META,
  type Reply,
} from '@/lib/clients/commandsite/outreach'
import { automations } from '@/lib/clients/commandsite/automations'
import { useReplies, CLASSIFICATION_META } from '@/lib/clients/commandsite/repliesApi'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// ── LIVE replies (Smartlead → smartlead-reply edge function → cs_replies) ──
const liveReplies = useReplies()
const liveStats = liveReplies.stats
const liveNeedsReview = liveReplies.needsReview
// Newest live reply timestamp — drives the "last reply N min ago" chip
const lastLiveReplyAgo = computed<string | null>(() => {
  if (liveReplies.replies.value.length === 0) return null
  const newest = liveReplies.replies.value[0]
  const ms = Date.now() - new Date(newest.received_at).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
})

type View = 'inbox' | 'leads' | 'sequences' | 'deliverability' | 'demos'
const view = ref<View>('inbox')
const stats = computed(() => outreachStats())

// Automation references — used in the auto-default banner
const replyClassifier = computed(() => automations.find((a) => a.kind === 'reply_classifier')!)
const pipelinePromoter = computed(() => automations.find((a) => a.kind === 'auto_pipeline_promote')!)
const enrichment = computed(() => automations.find((a) => a.kind === 'lead_enrichment')!)
const demoReminder = computed(() => automations.find((a) => a.kind === 'demo_reminder')!)

// ── Inbox: split into "needs your eyes" and "auto-handled digest" ─────
function isAutoHandled(r: Reply): boolean {
  // In real life: classifier confidence ≥ 90% AND the action is unambiguous
  // Demo proxy: positive replies (already ≥ 90% confident) + already-in-pipeline
  // Negative + OOF + unsubscribe always auto-handled
  if (r.classification === 'negative' || r.classification === 'oof' || r.classification === 'unsubscribe') return true
  if (r.classification === 'positive' && r.confidence >= 0.90) return true
  return false
}

function needsEyes(r: Reply): boolean {
  if (isAutoHandled(r)) return false
  // Objections + low-confidence positives + neutral
  return r.classification === 'objection' || r.classification === 'neutral' ||
         (r.classification === 'positive' && r.confidence < 0.90)
}

const exceptionReplies = computed<Reply[]>(() =>
  replies.filter(needsEyes).sort((a, b) =>
    new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
  ),
)
const autoHandledReplies = computed<Reply[]>(() =>
  replies.filter(isAutoHandled).sort((a, b) =>
    new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
  ),
)

const draftEdits = ref<Record<string, string>>({})
const inboxHandled = ref<Set<string>>(new Set())
function handle(id: string) { inboxHandled.value.add(id) }
function draftFor(r: Reply): string {
  return draftEdits.value[r.id] ?? r.ai_suggested_reply
}

// ── Helpers ────────────────────────────────────────────────────────────
function pct(v: number): string { return `${(v * 100).toFixed(0)}%` }
function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
function fmtUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms < 0) return 'Past'
  const hr = Math.floor(ms / (60 * 60 * 1000))
  if (hr < 24) return `In ${hr}h`
  return `In ${Math.floor(hr / 24)}d`
}
function rate(num: number, den: number): string {
  if (den === 0) return '—'
  return ((num / den) * 100).toFixed(0) + '%'
}

// ── View 4: Sequences ─────────────────────────────────────────────────
const sortedSequences = computed(() =>
  [...sequences].sort((a, b) => {
    const order = { active: 0, draft: 1, paused: 2 } as const
    return order[a.status] - order[b.status]
  }),
)

// ── View 5: Demos ─────────────────────────────────────────────────────
const dStats = computed(() => demoStats())
const upcomingDemos = computed(() => bookedDemos.filter((d) => d.status === 'upcoming')
  .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()))

function ddStatusColor(s: string): string {
  if (s === 'showed') return '#10B981'
  if (s === 'no_show') return '#EF4444'
  if (s === 'rescheduled') return '#F59E0B'
  return 'rgb(var(--color-brand))'
}

// ── View 3: Deliverability ────────────────────────────────────────────
function reputationColor(score: number): string {
  if (score >= 90) return '#10B981'
  if (score >= 75) return 'rgb(var(--color-brand))'
  if (score >= 60) return '#F59E0B'
  return '#EF4444'
}

const tabs: { key: View; label: string; badge?: number }[] = [
  { key: 'inbox',           label: 'Inbox' },
  { key: 'leads',           label: 'Lead enrichment' },
  { key: 'sequences',       label: 'Sequences' },
  { key: 'deliverability',  label: 'Deliverability' },
  { key: 'demos',           label: 'Demos' },
]
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Outreach</h2>
        <p class="text-sm text-ink-muted">
          Cold sequences run themselves. Replies auto-classified. Positive replies auto-create deals + send Calendly. You handle objections + edge cases.
        </p>
      </div>
      <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">+ New sequence</button>
    </div>

    <!-- Automation banner -->
    <div class="rounded-card border border-success/30 bg-success/5 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0 flex-1">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-success text-white text-base flex-shrink-0">🤖</div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <h3 class="text-sm font-semibold text-ink">Outreach is auto-running</h3>
              <span class="rounded-full bg-success text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Active</span>
              <span class="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Auto-promote ≥ 90% confidence</span>
            </div>
            <p class="text-xs text-ink-muted mt-0.5">Classifier auto-handled <strong class="text-success">{{ replyClassifier.auto_handled_7d }} replies</strong> + auto-promoted <strong class="text-success">{{ pipelinePromoter.auto_handled_7d }} positive replies</strong> straight to pipeline last 7 days. Calendly link auto-sent on each.</p>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-disabled">
              <span>{{ exceptionReplies.length }} need your eyes right now</span>
              <span>· last classified {{ fmtAgo(replyClassifier.last_ran_at) }}</span>
              <span>· {{ enrichment.outcomes_30d?.[2]?.value }} sequence-ready leads queued today</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand">Edit threshold</button>
          <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">Edit voice</button>
        </div>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Sent (7d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.sent_this_week }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">across {{ stats.active_sequences }} active sequences</div>
      </div>
      <div class="card">
        <div class="kpi-label">Reply / Positive</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ pct(stats.reply_rate) }} <span class="text-base text-success">· {{ pct(stats.positive_reply_rate) }}</span>
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">reply rate · positive of replies</div>
      </div>
      <div class="card">
        <div class="kpi-label">Auto-promoted to pipeline</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ pipelinePromoter.outcomes_30d?.[0]?.value }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">no clicks · last 30 days</div>
      </div>
      <div class="card">
        <div class="kpi-label">Demos booked (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.meetings_booked_30d }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ pct(dStats.show_up_rate_30d) }} show-up rate</div>
      </div>
    </div>

    <!-- View toggle -->
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
        <span v-if="t.key === 'inbox' && exceptionReplies.length > 0" class="ml-1 rounded-full bg-warn text-white px-1.5 text-[10px] font-bold">{{ exceptionReplies.length }}</span>
        <span v-if="t.key === 'leads' && enrichedLeads.length > 0" class="ml-1 rounded-full bg-success text-white px-1.5 text-[10px] font-bold">{{ enrichedLeads.length }}</span>
      </button>
    </div>

    <!-- ═════════════ INBOX ═════════════ -->
    <div v-if="view === 'inbox'" class="space-y-3">
      <!-- LIVE Smartlead status + needs-review banner -->
      <section class="card">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="eyebrow">Smartlead live inbox</span>
              <span
                v-if="liveReplies.usingFixture.value"
                class="inline-flex items-center gap-1 rounded-full bg-warn/15 text-warn px-2 py-0.5 text-[11px] font-semibold"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-warn"></span>
                Demo · run migration 0024 + deploy smartlead-reply edge function
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-[11px] font-semibold"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
                Live
              </span>
              <span v-if="lastLiveReplyAgo" class="text-[11px] text-ink-muted">last reply {{ lastLiveReplyAgo }}</span>
            </div>
            <p class="text-[11px] text-ink-disabled mt-1">
              Every reply is auto-classified by Claude. High-confidence OOFs / unsubscribes / clear nos auto-handle. Everything else lands here for your eyes.
            </p>
          </div>
          <div class="grid grid-cols-4 gap-2 text-center">
            <div><div class="kpi-label">24h</div><div class="text-base font-semibold tabular-nums">{{ liveStats.last_24h }}</div></div>
            <div><div class="kpi-label">Needs eyes</div><div class="text-base font-semibold tabular-nums text-warn">{{ liveStats.needs_review }}</div></div>
            <div><div class="kpi-label">Auto-handled</div><div class="text-base font-semibold tabular-nums text-success">{{ liveStats.auto_handled }}</div></div>
            <div><div class="kpi-label">Auto %</div><div class="text-base font-semibold tabular-nums">{{ Math.round(liveStats.auto_handled_pct * 100) }}%</div></div>
          </div>
        </div>

        <!-- Live needs-review list -->
        <div v-if="liveNeedsReview.length > 0" class="mt-3 space-y-2 border-t border-divider pt-3">
          <article
            v-for="r in liveNeedsReview"
            :key="r.id"
            class="rounded-card border border-divider bg-canvas/50 p-3"
          >
            <div class="flex items-start justify-between gap-2 mb-1.5 flex-wrap">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-semibold text-ink">{{ r.from_name || r.from_email }}</span>
                  <span class="text-[11px] text-ink-disabled font-mono truncate">{{ r.from_email }}</span>
                  <span
                    v-if="r.classification"
                    class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    :class="CLASSIFICATION_META[r.classification].pillClass"
                  >{{ CLASSIFICATION_META[r.classification].label }}</span>
                  <span v-if="r.classification_confidence != null" class="text-[10px] text-ink-disabled tabular-nums">
                    {{ Math.round(r.classification_confidence * 100) }}% conf
                  </span>
                </div>
                <div class="text-[11px] text-ink-disabled mt-0.5">{{ r.subject || '(no subject)' }}</div>
              </div>
              <div class="flex gap-1">
                <button
                  type="button"
                  class="rounded bg-ink-muted/10 text-ink-muted hover:bg-ink-muted/20 px-2 py-0.5 text-[11px] font-medium"
                  @click="liveReplies.markReviewed(r.id)"
                >Mark handled</button>
              </div>
            </div>
            <p class="text-xs text-ink leading-relaxed line-clamp-3">{{ r.body }}</p>
            <p v-if="r.classification_reason" class="text-[10px] text-ink-disabled italic mt-1">
              Why: {{ r.classification_reason }}
            </p>
          </article>
        </div>
        <p v-else-if="!liveReplies.usingFixture.value" class="text-xs text-ink-muted mt-3">
          🎯 Live inbox zero. Auto-handled {{ liveStats.auto_handled }} replies; nothing flagged for review.
        </p>
      </section>

      <!-- Needs your eyes -->
      <section v-if="exceptionReplies.length > 0" class="card border border-warn/30 bg-warn/5">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow text-warn">⚠ Needs your eyes</span>
          <span class="text-xs text-ink-muted">{{ exceptionReplies.length }} replies the classifier flagged for human judgment</span>
        </div>
        <div class="space-y-3">
          <article
            v-for="r in exceptionReplies"
            :key="r.id"
            class="rounded-card border border-warn/40 bg-surface p-3 transition-opacity"
            :class="inboxHandled.has(r.id) ? 'opacity-50' : ''"
          >
            <!-- Header -->
            <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2 mb-0.5">
                  <span class="text-sm font-semibold text-ink">{{ r.author_name }}</span>
                  <span v-if="r.author_title" class="text-[11px] text-ink-muted">· {{ r.author_title }}</span>
                  <span class="text-[11px] text-ink-muted">at {{ r.author_company }}</span>
                  <span v-if="r.in_pipeline" class="rounded-full bg-success/15 text-success px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">In pipeline</span>
                </div>
                <div class="text-[11px] text-ink-disabled">
                  {{ r.author_industry }} · {{ r.city }}, {{ r.state }} · {{ r.team_size }} techs · {{ fmtAgo(r.received_at) }}
                </div>
              </div>
              <div class="flex flex-col items-end gap-1 flex-shrink-0">
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  :style="{ backgroundColor: REPLY_CLASS_META[r.classification].color }"
                >{{ REPLY_CLASS_META[r.classification].icon }} {{ REPLY_CLASS_META[r.classification].label }}</span>
                <span class="text-[10px] text-ink-disabled">conf {{ pct(r.confidence) }} (below threshold)</span>
              </div>
            </div>

            <div class="rounded-md bg-surface-elevated/40 border border-divider/50 p-3 mb-2.5">
              <div class="text-[10px] uppercase tracking-wide font-semibold text-ink-disabled mb-1">Their reply</div>
              <pre class="whitespace-pre-wrap font-sans text-sm text-ink leading-relaxed">{{ r.full_body }}</pre>
            </div>

            <div class="rounded-md border border-brand/30 bg-brand/5 p-3">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <div class="flex items-center gap-2">
                  <span class="rounded-full bg-brand text-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">AI draft</span>
                  <span class="text-[10px] text-ink-muted">Edit + send · or use as-is</span>
                </div>
              </div>
              <textarea
                :value="draftFor(r)"
                class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink leading-relaxed resize-y min-h-[100px] focus:outline-none focus:border-brand"
                @input="(e) => (draftEdits[r.id] = (e.target as HTMLTextAreaElement).value)"
              ></textarea>
              <div class="mt-2 flex flex-wrap items-center justify-end gap-2">
                <button type="button" class="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink" @click="handle(r.id)">Skip</button>
                <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90" @click="handle(r.id)">Send reply</button>
              </div>
            </div>
          </article>
        </div>
      </section>
      <div v-else class="card text-center py-8 text-sm text-ink-muted italic">
        🎯 Inbox zero. The classifier handled everything that came in. Go ship.
      </div>

      <!-- Auto-handled digest (collapsed) -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Auto-handled · last 7 days</span>
          <span class="text-xs text-ink-muted">{{ autoHandledReplies.length }} replies the classifier handled without you</span>
        </div>
        <details>
          <summary class="cursor-pointer text-sm text-brand font-semibold hover:underline">
            View {{ autoHandledReplies.length }} auto-handled replies
          </summary>
          <div class="mt-3 space-y-2">
            <article
              v-for="r in autoHandledReplies"
              :key="r.id"
              class="flex items-start gap-3 rounded-md border border-divider p-3"
            >
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white whitespace-nowrap mt-0.5"
                :style="{ backgroundColor: REPLY_CLASS_META[r.classification].color }"
              >{{ REPLY_CLASS_META[r.classification].icon }} {{ REPLY_CLASS_META[r.classification].label }}</span>
              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap items-baseline gap-x-2">
                  <span class="text-sm font-semibold text-ink">{{ r.author_name }}</span>
                  <span class="text-[11px] text-ink-muted truncate">{{ r.author_company }}</span>
                  <span class="text-[10px] text-ink-disabled">· {{ fmtAgo(r.received_at) }}</span>
                </div>
                <p class="text-[11px] text-ink-muted italic mt-0.5 line-clamp-2">"{{ r.excerpt }}"</p>
                <div class="mt-1 text-[11px] text-success font-semibold">
                  ✓
                  <span v-if="r.classification === 'positive'">Auto-promoted to pipeline · Calendly auto-sent</span>
                  <span v-else-if="r.classification === 'negative'">Auto-suppressed from sequence</span>
                  <span v-else-if="r.classification === 'oof'">Sequence auto-paused until they're back</span>
                  <span v-else-if="r.classification === 'unsubscribe'">Auto-removed from list</span>
                </div>
              </div>
              <button type="button" class="text-[10px] text-ink-disabled hover:text-warn">Undo + handle manually</button>
            </article>
          </div>
        </details>
      </section>
    </div>

    <!-- ═════════════ LEAD ENRICHMENT ═════════════ -->
    <div v-if="view === 'leads'" class="space-y-3">
      <section class="card">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="eyebrow">Today's enriched leads · ICP-fit ≥ 70</span>
            <span class="chip !py-0.5 !px-2 !text-[10px]">{{ enrichedLeads.length }} ready to send</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-ink-disabled italic">Auto-pulled from Apollo + Clay daily at 6 AM</span>
            <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">Add all to suggested sequences</button>
          </div>
        </div>

        <div class="space-y-2">
          <article
            v-for="l in enrichedLeads"
            :key="l.id"
            class="rounded-md border border-divider p-3 hover:border-brand/40 transition-colors"
          >
            <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2 mb-0.5">
                  <span class="text-sm font-semibold text-ink">{{ l.name }}</span>
                  <span class="text-[11px] text-ink-muted">· {{ l.title }} at {{ l.company }}</span>
                </div>
                <div class="text-[11px] text-ink-disabled">
                  {{ l.industry }} · {{ l.city }}, {{ l.state }} · {{ l.team_size }} techs · sourced from {{ l.source }}
                </div>
              </div>
              <div class="flex flex-col items-end gap-1 flex-shrink-0">
                <div class="text-right">
                  <div class="text-xl font-bold tabular-nums" :style="{ color: l.icp_fit_score >= 85 ? '#10B981' : l.icp_fit_score >= 70 ? 'rgb(var(--color-brand))' : '#94A3B8' }">{{ l.icp_fit_score }}</div>
                  <div class="text-[9px] uppercase tracking-wide text-ink-disabled">ICP fit</div>
                </div>
              </div>
            </div>

            <div class="rounded-md bg-brand/5 border border-brand/20 p-2.5 mb-2">
              <div class="text-[10px] uppercase tracking-wide font-semibold text-brand mb-1">AI-generated opener</div>
              <p class="text-[12px] text-ink leading-snug italic">"{{ l.ai_opener }}"</p>
            </div>

            <div class="flex items-center justify-between gap-2 text-[11px]">
              <span class="text-ink-muted">→ Suggested sequence: <span class="text-ink font-semibold">{{ l.suggested_sequence }}</span></span>
              <div class="flex items-center gap-2">
                <button type="button" class="text-[11px] text-ink-disabled hover:text-warn">Skip</button>
                <button type="button" class="rounded-md bg-brand text-white px-2.5 py-1 text-[11px] font-semibold hover:opacity-90">Add to sequence</button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <!-- ═════════════ SEQUENCES ═════════════ -->
    <section v-if="view === 'sequences'" class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium">Sequence</th>
              <th class="px-3 py-2 font-medium">Channel</th>
              <th class="px-3 py-2 font-medium">Status</th>
              <th class="px-3 py-2 font-medium text-right">Leads</th>
              <th class="px-3 py-2 font-medium text-right">Sent</th>
              <th class="px-3 py-2 font-medium text-right">Open</th>
              <th class="px-3 py-2 font-medium text-right">Reply</th>
              <th class="px-3 py-2 font-medium text-right">👍</th>
              <th class="px-3 py-2 font-medium text-right">Demos</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in sortedSequences"
              :key="s.id"
              class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
            >
              <td class="px-3 py-2.5">
                <div class="text-sm font-semibold text-ink">{{ s.name }}</div>
                <div class="text-[11px] text-ink-muted">{{ s.persona }} · {{ s.touches }} touches</div>
              </td>
              <td class="px-3 py-2.5">
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  :style="{ backgroundColor: CHANNEL_META[s.channel].color }"
                >{{ CHANNEL_META[s.channel].icon }} {{ CHANNEL_META[s.channel].label }}</span>
              </td>
              <td class="px-3 py-2.5">
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  :class="s.status === 'active' ? 'bg-success/15 text-success' : s.status === 'paused' ? 'bg-warn/15 text-warn' : 'bg-surface-elevated text-ink-disabled'"
                >{{ s.status }}</span>
              </td>
              <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">{{ s.leads_total }}</td>
              <td class="px-3 py-2.5 text-right text-xs text-ink tabular-nums">{{ s.sent }}</td>
              <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">
                {{ s.opened }} <span class="text-ink-disabled">({{ rate(s.opened, s.sent) }})</span>
              </td>
              <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">
                {{ s.replied }} <span class="text-ink-disabled">({{ rate(s.replied, s.sent) }})</span>
              </td>
              <td class="px-3 py-2.5 text-right text-xs text-success font-semibold tabular-nums">{{ s.positive_replies }}</td>
              <td class="px-3 py-2.5 text-right text-sm font-semibold text-ink tabular-nums">{{ s.meetings_booked }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ═════════════ DELIVERABILITY ═════════════ -->
    <div v-if="view === 'deliverability'" class="space-y-3">
      <section
        v-for="d in sendingDomainsHealth"
        :key="d.domain"
        class="card"
        :class="d.warming_status === 'flagged' ? 'border-danger/30 bg-danger/5' : d.warming_status === 'warming' ? 'border-warn/30 bg-warn/5' : ''"
      >
        <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="text-base font-mono font-semibold text-ink">{{ d.domain }}</span>
              <span class="rounded-full bg-surface-elevated text-ink-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{{ d.purpose === 'cold_outreach' ? 'Cold outreach' : 'Transactional' }}</span>
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                :class="d.warming_status === 'verified' ? 'bg-success' : d.warming_status === 'warming' ? 'bg-warn' : 'bg-danger'"
              >{{ d.warming_status }}<span v-if="d.warming_day"> · day {{ d.warming_day }}/30</span></span>
            </div>
            <p v-if="d.notes" class="text-xs text-ink-muted italic">📝 {{ d.notes }}</p>
          </div>
          <div class="text-right flex-shrink-0">
            <div class="text-2xl font-bold tabular-nums" :style="{ color: reputationColor(d.reputation_score) }">{{ d.reputation_score }}</div>
            <div class="text-[10px] uppercase tracking-wide text-ink-disabled">reputation</div>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-divider">
          <div>
            <div class="kpi-label">Sent today</div>
            <div class="mt-0.5 text-base font-semibold text-ink tabular-nums">
              {{ d.sent_today }} <span class="text-xs text-ink-muted">/ {{ d.daily_send_cap }}</span>
            </div>
            <div class="h-1.5 mt-1 rounded-full bg-surface-elevated overflow-hidden">
              <div
                class="h-full rounded-full"
                :style="{
                  width: Math.min((d.sent_today / d.daily_send_cap) * 100, 100) + '%',
                  backgroundColor: (d.sent_today / d.daily_send_cap) >= 0.9 ? '#F59E0B' : '#10B981',
                }"
              ></div>
            </div>
          </div>
          <div>
            <div class="kpi-label">Bounce rate (7d)</div>
            <div class="mt-0.5 text-base font-semibold tabular-nums" :class="d.bounce_rate_7d >= 0.05 ? 'text-warn' : 'text-ink'">
              {{ (d.bounce_rate_7d * 100).toFixed(1) }}%
            </div>
            <div class="text-[10px] text-ink-disabled">healthy &lt; 5%</div>
          </div>
          <div>
            <div class="kpi-label">Spam rate (7d)</div>
            <div class="mt-0.5 text-base font-semibold tabular-nums" :class="d.spam_rate_7d >= 0.003 ? 'text-warn' : 'text-ink'">
              {{ (d.spam_rate_7d * 100).toFixed(2) }}%
            </div>
            <div class="text-[10px] text-ink-disabled">flag &gt; 0.3%</div>
          </div>
          <div>
            <div class="kpi-label">Status</div>
            <div class="mt-0.5 text-xs text-ink-muted">
              <span v-if="d.warming_status === 'verified'" class="text-success font-semibold">All systems go</span>
              <span v-else-if="d.warming_status === 'warming'" class="text-warn font-semibold">Smartlead pacing daily volume</span>
              <span v-else class="text-danger font-semibold">Needs attention</span>
            </div>
          </div>
        </div>
      </section>

      <div class="card">
        <div class="text-xs text-ink-muted">
          <span class="font-semibold text-ink">📚 Why this matters:</span>
          Cold email lives or dies on inbox placement. Bounce rate &gt; 5% or spam rate &gt; 0.3% is the silent killer that ends sequences inside 2 weeks. Smartlead is auto-pacing your volume — you only intervene if a domain shows up red here.
        </div>
      </div>
    </div>

    <!-- ═════════════ DEMOS ═════════════ -->
    <div v-if="view === 'demos'" class="space-y-3">
      <!-- Show-up KPI strip -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="card">
          <div class="kpi-label">Upcoming demos</div>
          <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ dStats.upcoming }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">next 7 days</div>
        </div>
        <div class="card">
          <div class="kpi-label">Show-up rate (30d)</div>
          <div class="mt-1 text-2xl font-bold tabular-nums" :class="dStats.show_up_rate_30d >= 0.7 ? 'text-success' : 'text-warn'">{{ pct(dStats.show_up_rate_30d) }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">target: ≥ 70%</div>
        </div>
        <div class="card">
          <div class="kpi-label">No-shows (30d)</div>
          <div class="mt-1 text-2xl font-bold tabular-nums" :class="dStats.no_show_30d > 0 ? 'text-warn' : 'text-ink'">{{ dStats.no_show_30d }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">{{ dStats.rescheduled_30d }} rescheduled</div>
        </div>
        <div class="card">
          <div class="kpi-label">Reminder system</div>
          <div class="mt-1 text-2xl font-bold text-success tabular-nums">2h before</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">SMS + email auto-sent</div>
        </div>
      </div>

      <!-- Upcoming list -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Upcoming demos</span>
          <span class="text-xs text-ink-muted">{{ demoReminder.outcomes_30d?.[1]?.value }} show-up rate after auto-reminders</span>
        </div>
        <div class="space-y-2">
          <article
            v-for="d in upcomingDemos"
            :key="d.id"
            class="flex items-start gap-3 rounded-md border border-divider p-3"
          >
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-base flex-shrink-0">🎥</div>
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <span class="text-sm font-semibold text-ink">{{ d.prospect_name }}</span>
                <span class="text-[11px] text-ink-muted">· {{ d.company }}</span>
                <span class="rounded-full bg-surface-elevated text-ink-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">{{ d.source.replace('_', ' ') }}</span>
              </div>
              <div class="text-[11px] text-ink-disabled mt-0.5">
                {{ fmtUntil(d.scheduled_at) }} · reminder auto-sends 2h before
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- Recent past -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">Recent demos</span>
        </div>
        <div class="space-y-1.5">
          <div
            v-for="d in bookedDemos.filter((x) => x.status !== 'upcoming')"
            :key="d.id"
            class="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-elevated/40 transition-colors text-sm"
          >
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white whitespace-nowrap"
              :style="{ backgroundColor: ddStatusColor(d.status) }"
            >{{ d.status.replace('_', ' ') }}</span>
            <span class="text-ink font-medium">{{ d.prospect_name }}</span>
            <span class="text-ink-muted text-xs">· {{ d.company }}</span>
            <span class="ml-auto text-[11px] text-ink-disabled">{{ fmtAgo(d.scheduled_at) }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
