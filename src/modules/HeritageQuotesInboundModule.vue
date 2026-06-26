<script setup lang="ts">
/**
 * Heritage Bath & Kitchen Co. — Quotes & Inbound tab.
 *
 * Quote Chaser is the killer role for this vertical — 30-90 day sales cycles
 * mean follow-up is the engine of close rate. This module leads with the
 * quote pipeline (sorted by aging) and pairs it with the inbound front-desk
 * stream below.
 *
 * Interaction model:
 *   - Click any quote card → expands inline to show Ada's drafted next nudge
 *     + action buttons (Approve & send / Edit / Skip / Mark won / Pause).
 *   - Aging visual escalates by stage:
 *       Day 1-3: neutral
 *       Day 7:   informational blue tint (in cadence)
 *       Day 14:  amber warn (getting stale)
 *       Day 30:  red danger (last chance)
 *   - Won/Lost collapsed into "Closed this period" summary section.
 */
import { ref, computed } from 'vue'
import type { Client } from '@/types/database'
import { quotes as initialQuotes, totalPipelineValueCents, agingQuoteCount } from '@/lib/clients/heritage/quotes'
import type { QuoteRecord, QuoteStage } from '@/lib/clients/heritage/types'
import { fmtMoney, DEMO_BEAT_MS } from '@/lib/clients/heritage/format'
import AdaRecommendations, { type AdaRecommendation } from '@/components/heritage/AdaRecommendations.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// Mutable copy so demo "Mark won" / "Mark lost" actions can reflect changes.
const quotes = ref<QuoteRecord[]>([...initialQuotes])

const expandedQuoteId = ref<string | null>(null)
const recentlySent = ref<Set<string>>(new Set())
const pausedQuotes = ref<Set<string>>(new Set())

interface StageBucket {
  stage: QuoteStage[]
  label: string
  tone: 'neutral' | 'info' | 'warn' | 'danger' | 'success' | 'muted'
  caption?: string
}

const STAGE_BUCKETS: StageBucket[] = [
  { stage: ['followup_day_1', 'followup_day_3'], label: 'Just sent (day 1-3)', tone: 'neutral', caption: 'Too fresh for a nudge yet · Ada is waiting' },
  { stage: ['followup_day_7'],  label: 'Day 7 · first nudge',    tone: 'info',    caption: 'Ada drafts a soft check-in' },
  { stage: ['followup_day_14'], label: 'Day 14 · escalation',    tone: 'warn',    caption: 'Direct tone · highlights budget-tier options' },
  { stage: ['followup_day_30'], label: 'Day 30 · last chance',   tone: 'danger',  caption: 'Final touch before Ada marks the quote cold' },
]

const stageBuckets = computed(() => {
  return STAGE_BUCKETS
    .map((b) => ({ ...b, quotes: quotes.value.filter((q) => b.stage.includes(q.stage)) }))
    .filter((b) => b.quotes.length > 0)
})

const wonQuotes = computed(() => quotes.value.filter((q) => q.stage === 'booked'))
const lostQuotes = computed(() => quotes.value.filter((q) => q.stage === 'opted_out'))

const totalActive = computed(() =>
  quotes.value.filter((q) => q.stage !== 'booked' && q.stage !== 'opted_out').length,
)

const revenueWonThisWeek = computed(() =>
  wonQuotes.value.reduce((sum, q) => sum + q.amount_cents, 0),
)

// ── Visual escalation: distinct tone per stage so the eye knows priority
function bucketBgClass(tone: StageBucket['tone']): string {
  switch (tone) {
    case 'neutral': return 'bg-surface-raised border-divider'
    case 'info':    return 'bg-brand/[0.04] border-brand/30'
    case 'warn':    return 'bg-warn/[0.06] border-warn/40'
    case 'danger':  return 'bg-danger/[0.06] border-danger/50'
    case 'success': return 'bg-success/[0.05] border-success/30'
    default:        return 'bg-surface-elevated border-divider'
  }
}

function expandedRingClass(tone: StageBucket['tone']): string {
  switch (tone) {
    case 'info':    return 'ring-brand/40'
    case 'warn':    return 'ring-warn/40'
    case 'danger':  return 'ring-danger/50'
    default:        return 'ring-divider'
  }
}

// ── Per-stage drafted nudge templates (Ada's voice, calibrated by stage)
function draftedNudgeFor(quote: QuoteRecord): { subject: string; body: string } {
  const customer = quote.customer.split(' — ')[0].split(' ')[0] // first name approximation
  if (quote.stage === 'followup_day_7') {
    return {
      subject: `Following up on the ${quote.job_type.toLowerCase()} estimate`,
      body: `Hey ${customer} — Marc here at Heritage. Wanted to check in on the proposal for ${quote.job_type.toLowerCase()}. Happy to swing by with samples if it'd help, or just answer any questions on timeline or budget. No pressure either way — just want to make sure it didn't get lost in the inbox. — Marc`,
    }
  }
  if (quote.stage === 'followup_day_14') {
    return {
      subject: `Quick options on the ${quote.job_type.toLowerCase()}`,
      body: `Hey ${customer} — Marc again. Two weeks in, so I figured I'd circle back with a few options. If the original scope feels too big right now, I can put together a phased version that gets the highest-impact part done first and saves the rest for next year. Worth a 15-min call this week to walk through it? — Marc`,
    }
  }
  if (quote.stage === 'followup_day_30') {
    return {
      subject: 'Closing out, but the door is open',
      body: `Hey ${customer} — going to stop popping in after this. I'll close the file on my end so we're not crowding your inbox. If the timing changes or you want a fresh look at the scope down the road, just text me back. No hard feelings either way — thanks for considering Heritage. — Marc`,
    }
  }
  // Day 1-3
  return {
    subject: `Proposal: ${quote.job_type}`,
    body: `Hey ${customer} — Marc at Heritage. Sent you the proposal for ${quote.job_type.toLowerCase()} ${quote.days_in_stage === 1 ? 'yesterday' : `${quote.days_in_stage} days ago`}. Just confirming it landed — if you have any questions about anything in there, I'm a text away. — Marc`,
  }
}

// Precompute drafted nudges once per quote so the template doesn't call
// draftedNudgeFor(quote) twice per expansion render.
const draftedById = computed(() => {
  const map: Record<string, { subject: string; body: string }> = {}
  for (const q of quotes.value) {
    map[q.id] = draftedNudgeFor(q)
  }
  return map
})

function nextScheduledFor(quote: QuoteRecord): string {
  if (pausedQuotes.value.has(quote.id)) return 'Paused by you'
  if (recentlySent.value.has(quote.id)) return 'Just sent · awaiting customer reply'
  if (quote.stage === 'followup_day_1' || quote.stage === 'followup_day_3') {
    const daysUntilSeven = 7 - quote.days_in_stage
    return `Next: Day 7 nudge in ${daysUntilSeven} day${daysUntilSeven === 1 ? '' : 's'}`
  }
  if (quote.stage === 'followup_day_7') return 'Next: Day 14 escalation in 7 days'
  if (quote.stage === 'followup_day_14') return 'Next: Day 30 last-chance in ~16 days'
  if (quote.stage === 'followup_day_30') return 'Next: close as cold in 7 days'
  return ''
}

// ── Card actions
function toggleExpand(quoteId: string) {
  expandedQuoteId.value = expandedQuoteId.value === quoteId ? null : quoteId
}

function approveAndSend(quote: QuoteRecord) {
  recentlySent.value.add(quote.id)
  expandedQuoteId.value = null
  setTimeout(() => {
    recentlySent.value.delete(quote.id)
  }, DEMO_BEAT_MS)
}

function markWon(quote: QuoteRecord) {
  const idx = quotes.value.findIndex((q) => q.id === quote.id)
  if (idx >= 0) {
    quotes.value[idx] = { ...quote, stage: 'booked', days_in_stage: 0, last_touch: 'call' }
  }
  expandedQuoteId.value = null
}

function markLost(quote: QuoteRecord) {
  const idx = quotes.value.findIndex((q) => q.id === quote.id)
  if (idx >= 0) {
    quotes.value[idx] = { ...quote, stage: 'opted_out', days_in_stage: 0 }
  }
  expandedQuoteId.value = null
}

function togglePause(quote: QuoteRecord) {
  if (pausedQuotes.value.has(quote.id)) {
    pausedQuotes.value.delete(quote.id)
  } else {
    pausedQuotes.value.add(quote.id)
  }
}

// ── Closed-this-period collapsed state
const showClosed = ref(false)

// ── Ada's recommendations for Quotes & Inbound ─────────────────────
// Focused on quote-pipeline decisions: which deals need your personal
// touch vs Ada's drafted nudge, what's at risk, what to escalate.
const quoteRecommendations: AdaRecommendation[] = [
  {
    id: 'q-patel-last',
    title: 'Allen & Priya Patel ($37K) is at day 31, your last chance',
    tag: 'Highest leverage',
    tagTone: 'leverage',
    body: 'This is the only deal in the last-chance bucket. They went quiet after the wet-room conversion proposal. Industry data says day-30+ deals close 4% when nudged once, 0% when ignored. I drafted a soft "thinking of you" close before I mark it cold.',
    impact: 'A 4% shot at $37K is worth the 90 seconds of review time.',
    actionLabel: 'Read the last-chance draft',
  },
  {
    id: 'q-davidh-call',
    title: 'David Hernandez has been a slow yes historically, worth a call not an email',
    tag: 'Worth your eyes',
    tagTone: 'opportunity',
    body: 'David is at day 14 ($24K guest bath). I noticed his bath last year took 22 days to close after 4 email nudges, then a call from you sealed it in 10 minutes. The pattern is repeating. I\'ll pause the email nudges if you want to call him directly.',
    impact: 'A 10-min call has closed 67% of David-pattern deals. Email nudges alone closed 21%.',
    actionLabel: 'Pause emails + remind me to call',
  },
  {
    id: 'q-whitfield-pricetier',
    title: 'Whitfield Family ($78K) might respond better to a budget-tier alternative',
    tag: 'Opportunity',
    tagTone: 'opportunity',
    body: 'Largest open quote, day 8. Houzz Pro inquiry, originally asked about "open-concept conversion + walk-in pantry." If they\'re hesitating on the $78K full scope, a "phased option" at $48K might unstick them. I can draft both versions and let you pick.',
    impact: 'Phased-option drafts have closed 38% of $60K+ quotes that went quiet vs 18% on standard nudge.',
    actionLabel: 'Draft both versions',
  },
]
</script>

<template>
  <div class="space-y-5">
    <header>
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
        Quote Chaser · Front Desk
      </div>
      <h2 class="text-xl font-semibold text-ink">Quotes &amp; Inbound</h2>
      <p class="text-sm text-ink-muted mt-1 max-w-2xl">
        Every quote you've sent, sorted by aging. Quote Chaser drafts a follow-up at day 1, 3, 7, 14, and 30 — escalating tone, your voice.
        <span class="text-ink-disabled">Click any quote to see Ada's drafted next nudge.</span>
      </p>
    </header>

    <!-- Ada's note on this week's quote pipeline -->
    <section class="rounded-card border border-brand/25 bg-brand/[0.04] px-5 py-4">
      <header class="flex items-center gap-2.5 mb-2.5">
        <div class="h-7 w-7 rounded-full bg-brand text-ink-inverse flex items-center justify-center text-xs font-bold flex-shrink-0">A</div>
        <span class="text-xs font-bold text-ink">Ada's note on quotes this week</span>
      </header>
      <p class="text-[13.5px] text-ink leading-relaxed max-w-2xl">
        You have <strong>$404K in active pipeline</strong> across 9 open quotes. I'm nudging 6 of them on schedule. Industry data says ~30% of open quotes go cold to follow-up gaps, which would be <strong>$121K of pipeline lost</strong>. That's the work I'm doing here. Last-chance bucket has one deal (Allen &amp; Priya Patel, $37K) worth your eyes before I mark it cold.
      </p>
    </section>

    <!-- KPI strip — aligned with Today page metrics -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Active quotes</div>
        <div class="text-2xl font-bold text-ink tabular-nums leading-none mt-1">{{ totalActive }}</div>
        <div class="text-[11px] text-ink-disabled mt-1">in pipeline</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Pipeline value</div>
        <div class="text-2xl font-bold text-brand tabular-nums leading-none mt-1">{{ fmtMoney(totalPipelineValueCents()) }}</div>
        <div class="text-[11px] text-ink-disabled mt-1">open quotes</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">In Ada's cadence</div>
        <div class="text-2xl font-bold text-warn tabular-nums leading-none mt-1">{{ agingQuoteCount() }}</div>
        <div class="text-[11px] text-ink-disabled mt-1">day 7+ · auto-nudged</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Revenue this week</div>
        <div class="text-2xl font-bold text-success tabular-nums leading-none mt-1">{{ fmtMoney(revenueWonThisWeek) }}</div>
        <div class="text-[11px] text-success mt-1 tabular-nums"><span aria-hidden="true">↗</span> {{ wonQuotes.length }} jobs closed</div>
      </div>
    </div>

    <!-- Quote pipeline by stage -->
    <section class="card">
      <header class="mb-3">
        <h3 class="text-base font-semibold text-ink">Pipeline</h3>
        <p class="text-xs text-ink-muted">Click any quote to see Ada's drafted next nudge and take action.</p>
      </header>

      <div class="space-y-5">
        <div v-for="bucket in stageBuckets" :key="bucket.label">
          <div class="flex items-baseline justify-between mb-2">
            <h4 class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              {{ bucket.label }} ({{ bucket.quotes.length }})
            </h4>
            <span v-if="bucket.caption" class="text-[11px] text-ink-disabled italic">{{ bucket.caption }}</span>
          </div>
          <div class="space-y-2">
            <article
              v-for="quote in bucket.quotes"
              :key="quote.id"
              class="rounded-card border transition-[border-color,box-shadow] duration-150 ease-out-quart overflow-hidden"
              :class="[
                bucketBgClass(bucket.tone),
                expandedQuoteId === quote.id ? `ring-2 ${expandedRingClass(bucket.tone)}` : 'hover:shadow-sm',
              ]"
            >
              <!-- Clickable summary row -->
              <button
                type="button"
                class="w-full text-left p-3 flex items-start justify-between gap-3 focus:outline-none focus:ring-2 focus:ring-brand/40 rounded-card"
                :aria-expanded="expandedQuoteId === quote.id"
                :aria-label="`Quote ${quote.customer}: ${expandedQuoteId === quote.id ? 'collapse' : 'expand'} details`"
                @click="toggleExpand(quote.id)"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline gap-2 flex-wrap">
                    <span class="text-sm font-semibold text-ink truncate">{{ quote.customer }}</span>
                    <span class="text-[11px] text-ink-muted">{{ quote.phone }}</span>
                  </div>
                  <p class="text-[12.5px] text-ink-muted mt-0.5 truncate">{{ quote.job_type }}</p>
                  <p class="text-[11px] text-ink-disabled mt-1">
                    Day {{ quote.days_in_stage }} · last touch: {{ quote.last_touch ?? 'none' }}
                    <span class="mx-1">·</span>
                    <span
                      :class="[
                        pausedQuotes.has(quote.id) ? 'text-warn font-semibold' : '',
                        recentlySent.has(quote.id) ? 'text-success font-semibold' : '',
                      ]"
                    >{{ nextScheduledFor(quote) }}</span>
                  </p>
                </div>
                <div class="text-right shrink-0 flex flex-col items-end gap-1">
                  <div class="text-base font-bold text-ink tabular-nums">{{ fmtMoney(quote.amount_cents) }}</div>
                  <span
                    v-if="recentlySent.has(quote.id)"
                    class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-success/15 text-success"
                  >Sent</span>
                  <span class="text-[10px] text-ink-disabled">{{ expandedQuoteId === quote.id ? '▲' : '▼' }}</span>
                </div>
              </button>

              <!-- Expansion drawer -->
              <div
                v-if="expandedQuoteId === quote.id"
                class="border-t border-divider px-3 py-3 bg-surface space-y-3"
              >
                <!-- Ada's drafted next nudge -->
                <div>
                  <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-1">
                    Ada's drafted next nudge
                  </div>
                  <div class="rounded-md border border-divider bg-surface-elevated p-2.5">
                    <p class="text-[12px] font-semibold text-ink mb-1">
                      Subject: {{ draftedById[quote.id].subject }}
                    </p>
                    <p class="text-[13px] text-ink italic leading-relaxed">
                      "{{ draftedById[quote.id].body }}"
                    </p>
                  </div>
                </div>

                <!-- Action buttons -->
                <div class="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-150 ease-out-quart active:scale-[0.97]"
                    @click="approveAndSend(quote)"
                  >
                    Approve &amp; send
                  </button>
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    title="Editor coming soon"
                    class="rounded-md border border-divider bg-surface-raised text-ink-disabled px-3 py-1.5 text-xs font-semibold opacity-60 cursor-not-allowed"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="rounded-md text-xs text-ink-muted hover:text-ink px-2 py-1.5"
                    @click="togglePause(quote)"
                  >
                    {{ pausedQuotes.has(quote.id) ? 'Resume cadence' : 'Pause Ada on this quote' }}
                  </button>
                  <span class="flex-1"></span>
                  <button
                    type="button"
                    class="rounded-md text-xs text-success hover:text-success/80 hover:bg-success/5 px-2 py-1.5 font-semibold"
                    @click="markWon(quote)"
                  >
                    Mark won
                  </button>
                  <button
                    type="button"
                    class="rounded-md text-xs text-ink-disabled hover:text-danger hover:bg-danger/5 px-2 py-1.5"
                    @click="markLost(quote)"
                  >
                    Mark lost
                  </button>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>

    <!-- Ada's Recommendations — quote-pipeline decisions worth your eye -->
    <AdaRecommendations :recommendations="quoteRecommendations" />

    <!-- Closed this period — collapsed by default -->
    <section v-if="wonQuotes.length + lostQuotes.length > 0" class="card">
      <button
        type="button"
        class="w-full text-left flex items-baseline justify-between gap-2 hover:opacity-80 transition-opacity"
        :aria-expanded="showClosed"
        @click="showClosed = !showClosed"
      >
        <div>
          <h3 class="text-base font-semibold text-ink">Closed this period</h3>
          <p class="text-xs text-ink-muted">
            {{ wonQuotes.length }} won · {{ fmtMoney(revenueWonThisWeek) }} revenue
            <span v-if="lostQuotes.length > 0"> · {{ lostQuotes.length }} lost</span>
          </p>
        </div>
        <span class="text-xs text-ink-muted">{{ showClosed ? 'Hide ▲' : 'Show ▼' }}</span>
      </button>

      <div v-if="showClosed" class="mt-3 space-y-2">
        <article
          v-for="quote in wonQuotes"
          :key="quote.id"
          class="rounded-card border bg-success/[0.05] border-success/30 p-3 flex items-start justify-between gap-3"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ quote.customer }}</span>
              <span class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-success/15 text-success">Won</span>
            </div>
            <p class="text-[12.5px] text-ink-muted mt-0.5">{{ quote.job_type }}</p>
          </div>
          <div class="text-base font-bold text-success tabular-nums">{{ fmtMoney(quote.amount_cents) }}</div>
        </article>
        <article
          v-for="quote in lostQuotes"
          :key="quote.id"
          class="rounded-card border bg-surface-elevated border-divider p-3 flex items-start justify-between gap-3 opacity-70"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ quote.customer }}</span>
              <span class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-ink-muted/15 text-ink-muted">Lost</span>
            </div>
            <p class="text-[12.5px] text-ink-muted mt-0.5">
              {{ quote.job_type }}<span v-if="quote.loss_reason"> · {{ quote.loss_reason }}</span>
            </p>
          </div>
          <div class="text-base font-bold text-ink-muted tabular-nums">{{ fmtMoney(quote.amount_cents) }}</div>
        </article>
      </div>
    </section>

    <!-- Inbound stream — front desk activity -->
    <section class="card">
      <header class="mb-3">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">Front Desk · Inbound (upstream of quotes)</div>
        <h3 class="text-base font-semibold text-ink">This week's inbound</h3>
        <p class="text-xs text-ink-muted">22 inquiries caught · 9 consultations booked · 100% answered</p>
      </header>

      <ul class="space-y-2">
        <li class="flex items-center justify-between gap-3 py-2 border-b border-divider">
          <div>
            <span class="text-sm font-semibold text-ink">Patricia Mendoza</span>
            <span class="text-xs text-ink-muted ml-2">Kitchen full renovation inquiry · LSA</span>
          </div>
          <span class="text-[11px] text-success font-semibold">Booked Tue 2pm</span>
        </li>
        <li class="flex items-center justify-between gap-3 py-2 border-b border-divider">
          <div>
            <span class="text-sm font-semibold text-ink">David Cole</span>
            <span class="text-xs text-ink-muted ml-2">Bath remodel inquiry · Google search</span>
          </div>
          <span class="text-[11px] text-success font-semibold">Booked Thu 10am</span>
        </li>
        <li class="flex items-center justify-between gap-3 py-2 border-b border-divider">
          <div>
            <span class="text-sm font-semibold text-ink">Jennifer Holt-Reyes</span>
            <span class="text-xs text-ink-muted ml-2">Powder room refresh · Houzz Pro</span>
          </div>
          <span class="text-[11px] text-success font-semibold">Booked Wed 1pm</span>
        </li>
        <li class="flex items-center justify-between gap-3 py-2 border-b border-divider">
          <div>
            <span class="text-sm font-semibold text-ink">Tom Wagner</span>
            <span class="text-xs text-ink-muted ml-2">After-hours kitchen inquiry · Direct</span>
          </div>
          <span class="text-[11px] text-warn font-semibold">Replied · waiting on response</span>
        </li>
        <li class="flex items-center justify-between gap-3 py-2">
          <div>
            <span class="text-sm font-semibold text-ink">Maria Lin</span>
            <span class="text-xs text-ink-muted ml-2">Master bath consultation · Referral</span>
          </div>
          <span class="text-[11px] text-success font-semibold">Booked Mon 11am</span>
        </li>
      </ul>
    </section>
  </div>
</template>
