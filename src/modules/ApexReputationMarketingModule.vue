<script setup lang="ts">
/**
 * Apex — Reputation & Marketing (Ada's roles 6 + 7).
 */
import { computed } from 'vue'
import type { Client } from '@/types/database'
import { reviews, reviewStats } from '@/lib/clients/apex/reviews'
import { campaigns, recentSends, campaignStats } from '@/lib/clients/apex/emailCampaigns'
import ApexAdaActivityStrip from '@/components/ApexAdaActivityStrip.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const rstats = computed(() => reviewStats())
const cstats = computed(() => campaignStats())

const recentReviews = computed(() => reviews.slice(0, 6))
const liveCampaigns = computed(() => campaigns.filter((c) => c.active).slice(0, 5))
const recentSendsList = computed(() => recentSends.slice(0, 6))

function pct(v: number): string { return Math.round(v * 100) + '%' }
function money(cents: number): string {
  if (cents >= 100_000) return '$' + Math.round(cents / 100_000) + 'k'
  return '$' + Math.round(cents / 100).toLocaleString()
}
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
</script>

<template>
  <div class="space-y-4">
    <ApexAdaActivityStrip
      tab-key="reputation-marketing"
      summary="Ada handles your outbound brand work — texts every customer for a review 2 hours after the job, drafts thoughtful replies to anything 3 stars or below, and runs your monthly newsletter + seasonal campaigns."
      :activity="[
        { icon: '⭐', label: `${rstats.this_week} new reviews this week`, detail: `avg ${rstats.avg_rating.toFixed(1)}★ · ${rstats.unanswered} awaiting your reply (Ada drafted them)`, ago: 'rolling' },
        { icon: '📧', label: `${cstats.sends_30d.toLocaleString()} emails sent (30d)`, detail: `${pct(cstats.avg_open_rate)} avg open · ${money(cstats.attributed_revenue_90d_cents)} attributed revenue (90d)`, ago: 'this month' },
      ]"
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
