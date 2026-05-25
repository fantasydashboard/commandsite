<script setup lang="ts">
/**
 * CommandSite Reputation — B2B reviews (G2/Capterra/ProductHunt/Reddit)
 * with AI-drafted replies for the unanswered ones, in-product NPS
 * responses, and a public mentions feed.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  reviews,
  npsResponses,
  mentions,
  reputationStats,
  SOURCE_META,
  type B2BReview,
  type ReviewSource,
} from '@/lib/clients/commandsite/reputation'

defineProps<{ client: Client; config: Record<string, unknown> }>()

type View = 'reviews' | 'nps' | 'mentions'
const view = ref<View>('reviews')

type SourceFilter = ReviewSource | 'all'
const sourceFilter = ref<SourceFilter>('all')
type AnswerFilter = 'all' | 'unanswered' | 'answered'
const answerFilter = ref<AnswerFilter>('all')

const stats = computed(() => reputationStats())

const draftEdits = ref<Record<string, string>>({})
const sentLocally = ref<Set<string>>(new Set())

const filteredReviews = computed<B2BReview[]>(() => {
  return reviews
    .filter((r) => sourceFilter.value === 'all' || r.source === sourceFilter.value)
    .filter((r) => {
      const answered = !!r.response || sentLocally.value.has(r.id)
      if (answerFilter.value === 'unanswered') return !answered
      if (answerFilter.value === 'answered') return answered
      return true
    })
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
})

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hr = Math.floor(ms / (60 * 60 * 1000))
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function ratingTone(rating: number): string {
  if (rating >= 4) return 'text-amber-400'
  if (rating === 3) return 'text-amber-500'
  return 'text-danger'
}

function draftFor(r: B2BReview): string {
  return draftEdits.value[r.id] ?? r.ai_response_draft ?? ''
}
function send(r: B2BReview) {
  sentLocally.value.add(r.id)
}

function num(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toLocaleString()
}

// NPS helpers
function npsCategory(score: number): { label: string; color: string } {
  if (score >= 9) return { label: 'Promoter',  color: '#10B981' }
  if (score >= 7) return { label: 'Passive',   color: '#94A3B8' }
  return                    { label: 'Detractor', color: '#EF4444' }
}

function mentionSentimentColor(s: string): string {
  if (s === 'positive') return '#10B981'
  if (s === 'negative') return '#EF4444'
  return '#94A3B8'
}

function mentionSourceLabel(s: string): string {
  if (s === 'twitter') return 'Twitter'
  if (s === 'linkedin') return 'LinkedIn'
  if (s === 'reddit') return 'Reddit'
  if (s === 'newsletter') return 'Newsletter'
  if (s === 'podcast') return 'Podcast'
  return 'Blog'
}

// Reference candidates (NPS promoters who opted in)
const referenceCandidates = computed(() =>
  npsResponses.filter((r) => r.score >= 9 && r.reference_optin)
    .sort((a, b) => b.score - a.score),
)

// Sort NPS responses by score (highest first)
const sortedNps = computed(() =>
  [...npsResponses].sort((a, b) => b.score - a.score),
)

// Sort mentions newest-first
const sortedMentions = computed(() =>
  [...mentions].sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()),
)

// NPS distribution as percentages for the bar
const npsBarStops = computed(() => {
  const total = npsResponses.length
  if (total === 0) return { detractors: 0, passives: 0, promoters: 0 }
  return {
    detractors: (stats.value.detractors / total) * 100,
    passives: (stats.value.passives / total) * 100,
    promoters: (stats.value.promoters / total) * 100,
  }
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Reputation</h2>
        <p class="text-sm text-ink-muted">
          B2B reviews across G2/Capterra/PH/Reddit, in-product NPS, and public mentions — with AI-drafted replies for anything unanswered.
        </p>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Avg Rating</div>
        <div class="mt-1 flex items-baseline gap-1">
          <span class="text-2xl font-bold text-ink tabular-nums">{{ stats.avg_rating.toFixed(1) }}</span>
          <span class="text-base text-amber-400">★</span>
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ stats.total_reviews }} reviews</div>
      </div>
      <div class="card">
        <div class="kpi-label">NPS</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="stats.nps_score >= 50 ? 'text-success' : stats.nps_score >= 30 ? 'text-brand' : 'text-warn'">
          {{ stats.nps_score >= 0 ? '+' : '' }}{{ stats.nps_score }}
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">
          {{ stats.promoters }}P · {{ stats.passives }}Pa · {{ stats.detractors }}D
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Unanswered Reviews</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="stats.unanswered_reviews > 0 ? 'text-warn' : 'text-ink'">
          {{ stats.unanswered_reviews }}
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">have AI drafts ready</div>
      </div>
      <div class="card">
        <div class="kpi-label">Mentions (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.mentions_30d }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">~{{ num(stats.total_reach_30d) }} total reach</div>
      </div>
    </div>

    <!-- View toggle -->
    <div class="card flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        class="chip"
        :class="view === 'reviews' ? 'chip-active' : ''"
        @click="view = 'reviews'"
      >
        Reviews ({{ reviews.length }})
        <span v-if="stats.unanswered_reviews > 0" class="ml-1 rounded-full bg-warn text-ink-inverse px-1.5 text-[10px] font-bold">{{ stats.unanswered_reviews }}</span>
      </button>
      <button
        type="button"
        class="chip"
        :class="view === 'nps' ? 'chip-active' : ''"
        @click="view = 'nps'"
      >NPS ({{ npsResponses.length }})</button>
      <button
        type="button"
        class="chip"
        :class="view === 'mentions' ? 'chip-active' : ''"
        @click="view = 'mentions'"
      >Mentions ({{ mentions.length }})</button>
    </div>

    <!-- ═════════════ REVIEWS ═════════════ -->
    <div v-if="view === 'reviews'" class="space-y-3">
      <!-- Filters -->
      <div class="card flex flex-wrap items-center gap-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            :class="sourceFilter === 'all' ? 'bg-brand text-ink-inverse' : 'bg-surface-elevated text-ink-muted hover:bg-surface-elevated/80'"
            @click="sourceFilter = 'all'"
          >All sources</button>
          <button
            v-for="(meta, src) in SOURCE_META"
            :key="src"
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-ink-inverse"
            :style="sourceFilter === src
              ? { backgroundColor: meta.color }
              : { backgroundColor: meta.color + '22', color: meta.color }"
            @click="sourceFilter = (src as ReviewSource)"
          >{{ meta.label }}</button>
        </div>
        <div class="ml-auto flex items-center gap-1.5">
          <button
            v-for="f in (['all', 'unanswered', 'answered'] as AnswerFilter[])"
            :key="f"
            type="button"
            class="chip"
            :class="answerFilter === f ? 'chip-active' : ''"
            @click="answerFilter = f"
          >{{ f === 'all' ? 'All' : f === 'unanswered' ? 'Unanswered' : 'Answered' }}</button>
        </div>
      </div>

      <!-- Review cards -->
      <article
        v-for="r in filteredReviews"
        :key="r.id"
        class="card"
      >
        <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-0.5">
              <span class="text-base tabular-nums" :class="ratingTone(r.rating)">
                {{ '★'.repeat(r.rating) }}<span class="text-ink-disabled">{{ '★'.repeat(5 - r.rating) }}</span>
              </span>
              <h3 class="text-sm font-semibold text-ink">{{ r.title }}</h3>
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-inverse"
                :style="{ backgroundColor: SOURCE_META[r.source].color }"
              >{{ SOURCE_META[r.source].label }}</span>
              <span v-if="r.verified" class="rounded-full bg-success/15 text-success px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">✓ Verified</span>
            </div>
            <div class="text-[11px] text-ink-disabled">
              {{ r.reviewer_name }} · {{ r.reviewer_title }}, {{ r.reviewer_company }} · {{ fmtAgo(r.received_at) }}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <div class="text-[10px] uppercase tracking-wide font-semibold text-success mb-1">Pros</div>
            <p class="text-sm text-ink leading-relaxed">{{ r.pros }}</p>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wide font-semibold text-warn mb-1">Cons</div>
            <p class="text-sm text-ink leading-relaxed">{{ r.cons }}</p>
          </div>
        </div>

        <!-- Owner response (real or just-sent) -->
        <div
          v-if="r.response || sentLocally.has(r.id)"
          class="rounded-md border border-divider bg-surface-elevated/40 p-3"
        >
          <div class="flex items-center gap-2 mb-1.5">
            <span class="rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Owner replied</span>
            <span v-if="r.response" class="text-[10px] text-ink-disabled">{{ fmtAgo(r.response.sent_at) }}</span>
            <span v-else class="text-[10px] text-ink-disabled">just now</span>
          </div>
          <p class="text-sm text-ink leading-relaxed">{{ r.response?.text ?? draftFor(r) }}</p>
        </div>

        <div
          v-else-if="r.ai_response_draft"
          class="rounded-md border border-brand/30 bg-brand/5 p-3"
        >
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-brand text-ink-inverse px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">AI-drafted reply</span>
              <span class="text-[10px] text-ink-muted">Approve to post publicly</span>
            </div>
          </div>
          <textarea
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink leading-relaxed resize-y min-h-[80px] focus:outline-none focus:border-brand"
            :value="draftFor(r)"
            @input="(e) => (draftEdits[r.id] = (e.target as HTMLTextAreaElement).value)"
          ></textarea>
          <div class="mt-2 flex items-center justify-end gap-2">
            <button type="button" class="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink">Skip</button>
            <button
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90"
              @click="send(r)"
            >Approve & Post</button>
          </div>
        </div>
      </article>
    </div>

    <!-- ═════════════ NPS ═════════════ -->
    <div v-if="view === 'nps'" class="space-y-3">
      <!-- NPS bar visualization -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">NPS Distribution</span>
          <span class="text-xs text-ink-muted">{{ npsResponses.length }} responses last 90 days</span>
        </div>
        <div class="flex items-center gap-1 h-10 rounded-md overflow-hidden mb-3">
          <div
            class="h-full bg-danger flex items-center justify-center text-ink-inverse text-xs font-semibold"
            :style="{ width: npsBarStops.detractors + '%' }"
          >
            <span v-if="npsBarStops.detractors >= 8">{{ stats.detractors }} detractor{{ stats.detractors === 1 ? '' : 's' }}</span>
          </div>
          <div
            class="h-full bg-slate-400 flex items-center justify-center text-ink-inverse text-xs font-semibold"
            :style="{ width: npsBarStops.passives + '%', backgroundColor: '#94A3B8' }"
          >
            <span v-if="npsBarStops.passives >= 8">{{ stats.passives }} passive{{ stats.passives === 1 ? '' : 's' }}</span>
          </div>
          <div
            class="h-full bg-success flex items-center justify-center text-ink-inverse text-xs font-semibold"
            :style="{ width: npsBarStops.promoters + '%' }"
          >
            <span v-if="npsBarStops.promoters >= 8">{{ stats.promoters }} promoter{{ stats.promoters === 1 ? '' : 's' }}</span>
          </div>
        </div>
        <div class="flex items-center justify-between text-[11px] text-ink-disabled">
          <span>0–6 detractors</span>
          <span>7–8 passives</span>
          <span>9–10 promoters</span>
        </div>
      </section>

      <!-- Reference candidates callout -->
      <section v-if="referenceCandidates.length > 0" class="card border border-success/30 bg-success/5">
        <div class="mb-2 flex items-center gap-2">
          <span class="eyebrow text-success">Reference Candidates</span>
          <span class="text-xs text-ink-muted">Promoters who opted in to be quoted</span>
        </div>
        <ul class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <li
            v-for="r in referenceCandidates"
            :key="r.id"
            class="flex items-center gap-2 rounded-md bg-surface p-2"
          >
            <span class="text-2xl font-bold text-success tabular-nums w-8">{{ r.score }}</span>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-ink truncate">{{ r.respondent_name }}</div>
              <div class="text-[11px] text-ink-muted truncate">{{ r.respondent_title }} at {{ r.customer_company }}</div>
            </div>
            <button type="button" class="text-[11px] text-brand font-semibold hover:underline whitespace-nowrap">Ask for quote →</button>
          </li>
        </ul>
      </section>

      <!-- Individual NPS responses -->
      <section class="card">
        <div class="mb-3 flex items-center gap-2">
          <span class="eyebrow">All Responses</span>
        </div>
        <div class="space-y-2">
          <article
            v-for="r in sortedNps"
            :key="r.id"
            class="flex items-start gap-3 rounded-md border border-divider p-3"
          >
            <div
              class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md text-xl font-bold text-ink-inverse"
              :style="{ backgroundColor: npsCategory(r.score).color }"
            >{{ r.score }}</div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2 mb-0.5">
                <span class="text-sm font-semibold text-ink">{{ r.respondent_name }}</span>
                <span class="text-[11px] text-ink-muted">· {{ r.respondent_title }} at {{ r.customer_company }}</span>
                <span
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-inverse"
                  :style="{ backgroundColor: npsCategory(r.score).color }"
                >{{ npsCategory(r.score).label }}</span>
                <span v-if="r.reference_optin" class="rounded-full bg-brand/10 text-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Reference OK</span>
              </div>
              <p v-if="r.comment" class="text-xs text-ink leading-relaxed italic">"{{ r.comment }}"</p>
              <div class="text-[10px] text-ink-disabled mt-1">
                {{ r.trigger === 'onboarding_30d' ? 'Onboarding day-30 survey' : 'Quarterly survey' }} · {{ fmtAgo(r.responded_at) }}
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <!-- ═════════════ MENTIONS ═════════════ -->
    <div v-if="view === 'mentions'" class="space-y-2">
      <article
        v-for="m in sortedMentions"
        :key="m.id"
        class="card"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-surface-elevated text-ink-muted"
              >{{ mentionSourceLabel(m.source) }}</span>
              <span class="text-sm font-semibold text-ink">{{ m.author }}</span>
              <span v-if="m.author_handle" class="text-[11px] text-ink-muted">@{{ m.author_handle }}</span>
              <span class="text-[10px] text-ink-disabled">· {{ fmtAgo(m.received_at) }}</span>
            </div>
            <p class="text-sm text-ink leading-relaxed">{{ m.excerpt }}</p>
          </div>
          <div class="flex flex-col items-end gap-1 flex-shrink-0">
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-inverse"
              :style="{ backgroundColor: mentionSentimentColor(m.sentiment) }"
            >{{ m.sentiment }}</span>
            <div class="text-right">
              <div class="text-sm font-semibold text-ink tabular-nums">{{ num(m.reach) }}</div>
              <div class="text-[9px] uppercase tracking-wide text-ink-disabled">est. reach</div>
            </div>
            <a :href="m.url" target="_blank" rel="noopener" class="text-[11px] text-brand font-semibold hover:underline">View →</a>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
