<script setup lang="ts">
/**
 * UFD Redesign — Cards & Shares.
 * The viral-product surface. Renders the cards-as-product thesis:
 * top viral cards leaderboard, card-type performance, share funnel,
 * channel breakdown, and pattern insights.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  cardTypePerf,
  channels,
  topCards,
  shareFunnel,
  insights,
  cardStats,
  CARD_TYPE_LABEL,
  type CardType,
  type Card,
} from '@/lib/clients/ufd-redesign/cards'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => cardStats())
const funnel = computed(() => shareFunnel())

const typeFilter = ref<CardType | 'all'>('all')

const filteredCards = computed<Card[]>(() => {
  return [...topCards]
    .filter((c) => typeFilter.value === 'all' || c.type === typeFilter.value)
    .sort((a, b) => b.signups_attributed - a.signups_attributed)
})

function pct(v: number, opts: { signed?: boolean } = {}): string {
  const value = (v * 100).toFixed(0)
  if (opts.signed) return (v >= 0 ? '+' : '') + value + '%'
  return value + '%'
}

function num(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toLocaleString()
}

function money(cents: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && cents >= 100_000) return '$' + Math.round(cents / 1000) + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const day = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (day === 0) return 'today'
  return `${day}d ago`
}

function statusMeta(s: Card['status']): { label: string; color: string; icon: string } {
  if (s === 'rising') return { label: 'Rising fast', color: '#10B981', icon: '↑' }
  if (s === 'fading') return { label: 'Fading',      color: '#94A3B8', icon: '↓' }
  return { label: 'Steady', color: 'rgb(var(--color-brand))', icon: '→' }
}

function typeMeta(type: CardType) {
  return cardTypePerf.find((t) => t.type === type)!
}

function insightTone(t: string): { bg: string; text: string; label: string } {
  if (t === 'good')        return { bg: '#10B981', text: '#10B981', label: '✓ Working' }
  if (t === 'warn')        return { bg: '#EF4444', text: '#EF4444', label: '⚠ Cut it' }
  return                          { bg: '#F59E0B', text: '#F59E0B', label: '🎯 Opportunity' }
}

const sortedTypes = computed(() => [...cardTypePerf].sort((a, b) => b.signups_attributed - a.signups_attributed))
const sortedChannels = computed(() => [...channels].sort((a, b) => b.signups_attributed - a.signups_attributed))
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Cards & Shares</h2>
        <p class="text-sm text-ink-muted">
          Cards are the product. Every share is distribution. This page tells you what's traveling — and where it isn't.
        </p>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Cards made (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.cards_made_30d.toLocaleString() }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ stats.cards_shared_30d }} shared · {{ pct(stats.share_rate) }} share rate</div>
      </div>
      <div class="card">
        <div class="kpi-label">External views (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ num(stats.external_views_30d) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">non-logged-in views of share pages</div>
      </div>
      <div class="card">
        <div class="kpi-label">Signups attributed</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ stats.signups_attributed_30d }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ pct(stats.share_to_signup_rate) }} share-to-signup</div>
      </div>
      <div class="card">
        <div class="kpi-label">Viral revenue value</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ money(stats.viral_revenue_attributed_cents, { compact: true }) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">attributed signups × LTV</div>
      </div>
    </div>

    <!-- Share Funnel -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Share Funnel</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">Last 30 Days</span>
        <span class="text-xs text-ink-muted ml-1">Made → Shared → External viewed → CTA clicked → Trial started</span>
      </div>
      <div class="space-y-2">
        <div
          v-for="(step, i) in funnel"
          :key="step.stage"
        >
          <div class="flex items-baseline justify-between gap-2 mb-1">
            <div class="min-w-0">
              <span class="text-sm font-semibold text-ink">{{ step.stage }}</span>
              <span class="text-[11px] text-ink-muted ml-2">— {{ step.description }}</span>
            </div>
            <span class="text-xs text-ink-muted tabular-nums whitespace-nowrap">
              {{ step.count.toLocaleString() }}
              <span v-if="i > 0" class="text-ink-disabled">· {{ pct(step.count / funnel[0].count) }} of made</span>
            </span>
          </div>
          <div class="h-7 rounded-md bg-surface-elevated/60 overflow-hidden relative">
            <!-- Cap visual width at 100%; show actual % via label since views > made -->
            <div
              class="h-full rounded-md transition-all"
              :style="{
                width: Math.min((step.count / funnel[0].count) * 100, 100) + '%',
                backgroundColor: i === 0 ? 'rgb(var(--color-brand))'
                  : i === 2 ? '#10B981'
                  : i === funnel.length - 1 ? '#10B981'
                  : 'rgb(var(--color-accent))',
              }"
            ></div>
            <span
              v-if="i === 2"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white"
            >External views fan out beyond cards made — that's the leverage</span>
          </div>
        </div>
      </div>
      <div class="mt-3 text-[11px] text-ink-disabled italic">
        Read it: every card made generates ~3.5 external views (4,212 / 1,186). Every shared card gets ~7 external views. The leverage point is the shared card → external view → CTA click multiplier.
      </div>
    </section>

    <!-- Card Type Performance -->
    <section class="card overflow-hidden">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Card-Type Performance</span>
        <span class="text-xs text-ink-muted">Sorted by signups attributed</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium">Card type</th>
              <th class="px-3 py-2 font-medium text-right">Made</th>
              <th class="px-3 py-2 font-medium text-right">Shared</th>
              <th class="px-3 py-2 font-medium text-right">Share rate</th>
              <th class="px-3 py-2 font-medium text-right">Views/share</th>
              <th class="px-3 py-2 font-medium text-right">Signups</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in sortedTypes"
              :key="t.type"
              class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
            >
              <td class="px-3 py-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-xl">{{ t.emoji }}</span>
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-ink">{{ t.label }}</div>
                    <div class="text-[11px] text-ink-muted">{{ t.description }}</div>
                  </div>
                </div>
              </td>
              <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">{{ t.cards_made_30d }}</td>
              <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">{{ t.cards_shared_30d }}</td>
              <td class="px-3 py-2.5 text-right text-sm font-semibold tabular-nums" :class="t.share_rate >= 0.50 ? 'text-success' : 'text-ink-muted'">
                {{ pct(t.share_rate) }}
              </td>
              <td class="px-3 py-2.5 text-right text-xs tabular-nums" :class="t.avg_views_per_share >= 6 ? 'text-success' : 'text-ink-muted'">
                {{ t.avg_views_per_share.toFixed(1) }}
              </td>
              <td class="px-3 py-2.5 text-right text-sm font-semibold tabular-nums" :class="t.signups_attributed > 0 ? 'text-success' : 'text-ink-disabled'">
                +{{ t.signups_attributed }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Top Viral Cards leaderboard -->
    <section class="card">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Top Viral Cards</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">Last 30 Days</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            :class="typeFilter === 'all' ? 'bg-brand text-white' : 'bg-surface-elevated text-ink-muted hover:bg-surface-elevated/80'"
            @click="typeFilter = 'all'"
          >All types</button>
          <button
            v-for="t in cardTypePerf"
            :key="t.type"
            type="button"
            class="rounded-full px-2 py-1 text-xs font-medium transition-colors text-white"
            :title="CARD_TYPE_LABEL[t.type]"
            :style="typeFilter === t.type
              ? { backgroundColor: t.color }
              : { backgroundColor: t.color + '22', color: t.color }"
            @click="typeFilter = (t.type as CardType)"
          >{{ t.emoji }}</button>
        </div>
      </div>
      <div class="space-y-2">
        <article
          v-for="(c, i) in filteredCards"
          :key="c.id"
          class="rounded-md border border-divider p-3"
        >
          <div class="flex items-start gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full text-lg flex-shrink-0"
              :style="{ backgroundColor: typeMeta(c.type).color + '22' }"
            >{{ typeMeta(c.type).emoji }}</div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2 mb-0.5">
                <span class="text-base font-bold text-ink-disabled tabular-nums">#{{ i + 1 }}</span>
                <h3 class="text-sm font-semibold text-ink">{{ c.title }}</h3>
                <span
                  v-if="c.status"
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                  :style="{ backgroundColor: statusMeta(c.status).color }"
                >{{ statusMeta(c.status).icon }} {{ statusMeta(c.status).label }}</span>
              </div>
              <div class="text-[11px] text-ink-disabled mb-2">
                by <span class="text-ink font-medium">{{ c.created_by_name }}</span>
                · {{ typeMeta(c.type).label }}
                · {{ fmtAgo(c.created_at) }}
              </div>
              <div class="rounded-md bg-surface-elevated/40 border border-divider/50 p-2 mb-2">
                <p class="text-xs text-ink leading-snug italic">"{{ c.topline }}"</p>
              </div>
            </div>
            <div class="flex flex-col gap-1 text-right flex-shrink-0">
              <div>
                <div class="text-sm font-semibold text-ink tabular-nums">{{ c.shares }}</div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">shares</div>
              </div>
              <div>
                <div class="text-sm font-semibold text-ink tabular-nums">{{ num(c.external_views) }}</div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">views</div>
              </div>
              <div>
                <div class="text-sm font-semibold text-success tabular-nums">+{{ c.signups_attributed }}</div>
                <div class="text-[9px] uppercase tracking-wide text-ink-disabled">signups</div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- Channel breakdown -->
    <section class="card overflow-hidden">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Channel Breakdown</span>
        <span class="text-xs text-ink-muted">Where shares end up — and which ones convert</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium">Channel</th>
              <th class="px-3 py-2 font-medium text-right">Shares (30d)</th>
              <th class="px-3 py-2 font-medium text-right">Avg views/share</th>
              <th class="px-3 py-2 font-medium text-right">Signups attributed</th>
              <th class="px-3 py-2 font-medium text-right">Conv rate</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="ch in sortedChannels"
              :key="ch.channel"
              class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
            >
              <td class="px-3 py-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-base">{{ ch.icon }}</span>
                  <span class="text-sm font-medium text-ink">{{ ch.label }}</span>
                </div>
              </td>
              <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">{{ ch.shares_30d }}</td>
              <td class="px-3 py-2.5 text-right text-xs tabular-nums" :class="ch.avg_views >= 6 ? 'text-success' : 'text-ink-muted'">
                {{ ch.avg_views.toFixed(1) }}
              </td>
              <td class="px-3 py-2.5 text-right text-sm font-semibold tabular-nums" :class="ch.signups_attributed > 0 ? 'text-success' : 'text-ink-disabled'">
                +{{ ch.signups_attributed }}
              </td>
              <td class="px-3 py-2.5 text-right text-xs tabular-nums" :class="(ch.signups_attributed / ch.shares_30d) >= 0.20 ? 'text-success font-semibold' : 'text-ink-muted'">
                {{ ch.shares_30d > 0 ? pct(ch.signups_attributed / ch.shares_30d) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Pattern insights -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">What's Working — and What Isn't</span>
      </div>
      <div class="space-y-3">
        <article
          v-for="(insight, i) in insights"
          :key="i"
          class="rounded-md border border-divider p-3"
          :style="{ borderLeftWidth: '4px', borderLeftColor: insightTone(insight.tone).bg }"
        >
          <div class="flex items-start justify-between gap-2 mb-1.5">
            <p class="text-sm text-ink leading-relaxed">{{ insight.finding }}</p>
            <span
              class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap flex-shrink-0"
              :style="{ backgroundColor: insightTone(insight.tone).bg + '22', color: insightTone(insight.tone).text }"
            >{{ insightTone(insight.tone).label }}</span>
          </div>
          <div class="rounded-md bg-brand/5 border border-brand/20 p-2.5">
            <div class="text-[10px] uppercase tracking-wide font-semibold text-brand mb-0.5">Recommendation</div>
            <p class="text-xs text-ink leading-snug">{{ insight.recommendation }}</p>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
