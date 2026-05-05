<script setup lang="ts">
/**
 * Reviews — auto-default with confidence-gated approval.
 *
 * The flip: AI replies above ≥85% confidence post automatically.
 * Owner sees a digest of what was auto-posted + an "exceptions" queue
 * of low-confidence drafts (low ratings, ambiguous reviews) that need
 * human eyes. No more click-per-reply for high-confidence cases.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import { reviews, reviewStats } from '@/lib/clients/apex/reviews'
import { automations } from '@/lib/clients/apex/automations'
import type { ReviewRecord } from '@/lib/clients/apex/types'

defineProps<{ client: Client; config: Record<string, unknown> }>()

type SourceFilter = ReviewRecord['source'] | 'all'

const sourceFilter = ref<SourceFilter>('all')
const draftEdits = ref<Record<string, string>>({})
const sentLocally = ref<Set<string>>(new Set())

const stats = computed(() => reviewStats())
const reviewAutomation = computed(() =>
  automations.find((a) => a.kind === 'review_reply')!,
)

const sources: { key: SourceFilter; label: string; color: string }[] = [
  { key: 'all',      label: 'All',      color: 'rgb(var(--color-brand))' },
  { key: 'google',   label: 'Google',   color: '#4285F4' },
  { key: 'facebook', label: 'Facebook', color: '#1877F2' },
  { key: 'yelp',     label: 'Yelp',     color: '#D32323' },
  { key: 'nextdoor', label: 'Nextdoor', color: '#00B246' },
]

/**
 * Confidence model: high-rating + clear sentiment = auto-posted.
 * Low rating (≤ 3) or ambiguous = flagged for review.
 * In real life this comes from the AI; here we derive it deterministically.
 */
function isAutoHandled(r: ReviewRecord): boolean {
  // Already responded to in real life (existing fixture behavior)
  if (r.response) return true
  // Low-rated reviews always need owner eyes
  if (r.rating <= 3) return false
  // High-rated reviews where the AI has a draft → would have auto-posted
  return Boolean(r.ai_response_draft)
}

function isFlaggedForReview(r: ReviewRecord): boolean {
  if (r.response) return false
  if (sentLocally.value.has(r.id)) return false
  return r.rating <= 3
}

const autoPostedReviews = computed<ReviewRecord[]>(() =>
  reviews
    .filter((r) => r.response && isAutoHandled(r) && (sourceFilter.value === 'all' || r.source === sourceFilter.value))
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()),
)

const flaggedReviews = computed<ReviewRecord[]>(() =>
  reviews
    .filter((r) => isFlaggedForReview(r) && (sourceFilter.value === 'all' || r.source === sourceFilter.value))
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()),
)

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hr = Math.floor(ms / 3_600_000)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day === 0) return 'today'
  if (day === 1) return 'yesterday'
  return `${day}d ago`
}

function sourceColor(s: ReviewRecord['source']): string {
  return sources.find((o) => o.key === s)?.color ?? '#94A3B8'
}

function draftFor(r: ReviewRecord): string {
  return draftEdits.value[r.id] ?? r.ai_response_draft ?? ''
}

function send(r: ReviewRecord) { sentLocally.value.add(r.id) }

function ratingTone(rating: number): string {
  if (rating >= 4) return 'text-amber-400'
  if (rating === 3) return 'text-amber-500'
  return 'text-danger'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Reviews</h2>
        <p class="text-sm text-ink-muted">
          AI replies above 85% confidence post automatically. Low-rated or ambiguous reviews queue here for your eyes.
        </p>
      </div>
    </div>

    <!-- Automation status banner -->
    <div class="rounded-card border border-success/30 bg-success/5 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0 flex-1">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-success text-white text-base flex-shrink-0">
            🤖
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <h3 class="text-sm font-semibold text-ink">AI review replies are auto-posting</h3>
              <span class="rounded-full bg-success text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Active</span>
              <span class="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Threshold ≥ {{ Math.round((reviewAutomation.confidence_threshold ?? 0) * 100) }}%</span>
            </div>
            <p class="text-xs text-ink-muted mt-0.5">{{ reviewAutomation.description }}</p>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-disabled">
              <span>Last posted {{ fmtAgo(reviewAutomation.last_ran_at) }}</span>
              <span>· {{ reviewAutomation.auto_handled_7d }} auto-posted last 7 days</span>
              <span>· {{ flaggedReviews.length }} need your eyes right now</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand">Edit threshold</button>
          <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">Edit voice</button>
        </div>
      </div>
    </div>

    <!-- Last 30 days digest -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">What this automation did for you · last 30 days</span>
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div class="kpi-label">Auto-posted</div>
          <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ reviewAutomation.outcomes_30d?.[0]?.value }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">replies you didn't have to write</div>
        </div>
        <div>
          <div class="kpi-label">Owner reviewed</div>
          <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ reviewAutomation.outcomes_30d?.[2]?.value }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">low-confidence cases handled</div>
        </div>
        <div>
          <div class="kpi-label">Avg rating</div>
          <div class="mt-1 text-2xl font-bold tabular-nums">
            {{ reviewAutomation.outcomes_30d?.[1]?.value }}
          </div>
          <div class="text-[11px] text-ink-disabled mt-0.5">across all sources</div>
        </div>
        <div>
          <div class="kpi-label">Total reviews</div>
          <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.total }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">{{ stats.this_week }} this week</div>
        </div>
      </div>
    </section>

    <!-- Source filter -->
    <div class="card flex flex-wrap items-center gap-1.5">
      <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mr-1">Source:</span>
      <button
        v-for="s in sources"
        :key="s.key"
        type="button"
        class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
        :style="sourceFilter === s.key
          ? { backgroundColor: s.color, color: '#fff' }
          : { backgroundColor: s.color + '22', color: s.color }"
        @click="sourceFilter = s.key"
      >
        {{ s.label }}
      </button>
    </div>

    <!-- Needs your eyes — low-confidence reviews -->
    <section v-if="flaggedReviews.length > 0" class="card border border-warn/30 bg-warn/5">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow text-warn">⚠ Needs your eyes</span>
        <span class="text-xs text-ink-muted">{{ flaggedReviews.length }} review{{ flaggedReviews.length === 1 ? '' : 's' }} — too sensitive for auto-reply</span>
      </div>
      <div class="space-y-3">
        <article
          v-for="r in flaggedReviews"
          :key="r.id"
          class="rounded-card border border-warn/40 bg-surface p-3"
        >
          <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2 mb-0.5">
                <span class="text-base tabular-nums" :class="ratingTone(r.rating)">
                  {{ '★'.repeat(r.rating) }}<span class="text-ink-disabled">{{ '★'.repeat(5 - r.rating) }}</span>
                </span>
                <span class="text-sm font-semibold text-ink">{{ r.customer }}</span>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  :style="{ backgroundColor: sourceColor(r.source) }"
                >{{ r.source }}</span>
                <span v-if="r.rating <= 2" class="rounded-full bg-danger text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Low rating</span>
                <span v-else class="rounded-full bg-warn text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Mid · ambiguous</span>
              </div>
              <div class="text-[11px] text-ink-disabled">
                {{ fmtDate(r.received_at) }} · {{ fmtAgo(r.received_at) }} · {{ r.job_type }}
              </div>
            </div>
          </div>

          <p class="text-sm text-ink leading-relaxed mb-3">{{ r.text }}</p>

          <div
            v-if="!sentLocally.has(r.id)"
            class="rounded-md border border-brand/30 bg-brand/5 p-3"
          >
            <div class="flex items-center justify-between gap-2 mb-1.5">
              <div class="flex items-center gap-2">
                <span class="rounded-full bg-brand text-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">AI draft</span>
                <span class="text-[10px] text-ink-muted">Edit before posting · low-confidence so we held it</span>
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
                class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"
                @click="send(r)"
              >Approve & Post</button>
            </div>
          </div>
          <div v-else class="rounded-md bg-success/15 text-success px-3 py-2 text-sm font-semibold inline-flex items-center gap-1">
            ✓ Posted
          </div>
        </article>
      </div>
    </section>

    <!-- Auto-posted (the digest of what shipped without you) -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Auto-posted replies</span>
        <span class="text-xs text-ink-muted">{{ autoPostedReviews.length }} reviews handled without your eyes — collapse-able digest</span>
      </div>
      <details class="space-y-2">
        <summary class="cursor-pointer text-sm text-brand font-semibold hover:underline">
          View {{ autoPostedReviews.length }} auto-posted replies
        </summary>
        <div class="mt-3 space-y-2">
          <article
            v-for="r in autoPostedReviews"
            :key="r.id"
            class="rounded-md border border-divider p-3"
          >
            <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2 mb-0.5">
                  <span class="text-base tabular-nums" :class="ratingTone(r.rating)">
                    {{ '★'.repeat(r.rating) }}<span class="text-ink-disabled">{{ '★'.repeat(5 - r.rating) }}</span>
                  </span>
                  <span class="text-sm font-semibold text-ink">{{ r.customer }}</span>
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                    :style="{ backgroundColor: sourceColor(r.source) }"
                  >{{ r.source }}</span>
                  <span v-if="r.job_type" class="text-[11px] text-ink-muted">· {{ r.job_type }}</span>
                </div>
                <div class="text-[11px] text-ink-disabled">{{ fmtAgo(r.received_at) }}</div>
              </div>
            </div>

            <p class="text-sm text-ink leading-relaxed mb-2">{{ r.text }}</p>

            <div class="rounded-md bg-surface-elevated/40 border border-divider/50 p-3">
              <div class="flex items-center gap-2 mb-1">
                <span class="rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">🤖 Auto-posted</span>
                <span class="text-[10px] text-ink-disabled">{{ fmtAgo(r.response!.sent_at) }}</span>
                <button type="button" class="ml-auto text-[10px] text-ink-disabled hover:text-warn">Undo + edit</button>
              </div>
              <p class="text-sm text-ink leading-relaxed">{{ r.response!.text }}</p>
            </div>
          </article>
        </div>
      </details>
    </section>
  </div>
</template>
