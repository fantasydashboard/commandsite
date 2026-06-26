<script setup lang="ts">
/**
 * Heritage Bath & Kitchen Co. — Reputation & Marketing tab.
 *
 * Review Engine + Email Marketing. Reviews are critical for bath/kitchen
 * remodelers — homeowners read 4.7+ ratings before booking consultations.
 *
 * Post-impeccable-pass fixes:
 *   1. Drafted reply for un-replied < 5★ reviews shown inline with
 *      Approve & send / Edit / Skip buttons. Same pattern as Customer
 *      Care + Quotes — no context-switching to act on a review.
 *   2. Awaiting-response reviews sorted to the top with a warn-tinted
 *      visual treatment so Marc's eye lands on the action item first.
 */
import { ref, computed } from 'vue'
import type { Client } from '@/types/database'
import { DEMO_BEAT_MS } from '@/lib/clients/heritage/format'
import AdaRecommendations, { type AdaRecommendation } from '@/components/heritage/AdaRecommendations.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// ── Ada's recommendations for Reputation & Marketing ───────────────
const reputationRecommendations: AdaRecommendation[] = [
  {
    id: 'r-owens-needs-voice',
    title: 'Pat Owens 4★ review needs your voice before I post the reply',
    tag: 'Worth your eyes',
    tagTone: 'urgent',
    body: 'Pat called out a real issue (cabinet delivery slipped) and you already changed vendors because of it. I drafted an honest reply acknowledging the slip and naming the vendor switch. Owner-acknowledged 4★ reviews convert prospect-viewers at 2x the rate of ignored ones.',
    impact: 'Each well-handled 4★ review is worth ~$8-12K in deflected prospect-loss over the next 6 months.',
    actionLabel: 'Read the draft',
  },
  {
    id: 'r-threshold-140',
    title: 'You\'re 12 reviews from crossing the 140-review threshold',
    tag: 'Highest leverage',
    tagTone: 'leverage',
    body: 'Google\'s local algorithm gives a visible ranking lift at the 100/250/500 review thresholds, and a smaller-but-real one at 140 reviews. I have 18 recent customers who haven\'t been asked yet (post-job timing was off). I can draft requests for all 18 this week.',
    impact: 'Crossing 140 typically lifts Google Maps clicks by 15-25% in this category. ~3-5 extra leads/month.',
    actionLabel: 'Draft the 18 review asks',
  },
  {
    id: 'r-diego-shoutout',
    title: '3 reviews this month specifically named Diego (your installer)',
    tag: 'Opportunity',
    tagTone: 'opportunity',
    body: 'Karen W., Sandra P., and Marcus B. all called out Diego\'s installation work by name. That\'s a real signal his work is differentiating. Worth featuring him in next month\'s newsletter and / or giving him a recognition bonus. Also worth telling new customers "Diego will be your installer" upfront, it builds confidence.',
    impact: 'Named-installer trust signals lift close rates ~10% in the residential remodel space.',
    actionLabel: 'Draft Diego feature for newsletter',
  },
]

interface Review {
  id: string
  customer: string
  rating: number
  source: string
  text: string
  daysAgo: number
  response?: string
  // NEW: Ada's drafted reply when no response yet AND rating < 5
  draftedReply?: string
}

const initialReviews: Review[] = [
  {
    id: 'rv-001',
    customer: 'Marcus & Tia Bell',
    rating: 5,
    source: 'Google',
    text: 'Marc and his team made our kitchen the heart of the home. From the initial design conversation to the last detail of the backsplash, they were thoughtful, communicative, and the craftsmanship is incredible. Worth every penny.',
    daysAgo: 2,
    response: 'Marcus and Tia — thank you. Your kitchen turned out to be one of my favorite projects of the year. The light through that bay window in the morning is something else. — Marc',
  },
  {
    id: 'rv-002',
    customer: 'Olivia Reagan',
    rating: 5,
    source: 'Google',
    text: 'The powder room renovation was perfect from start to finish. Diego was a craftsman in every sense — the tile work is exceptional. Carmen kept me informed every step of the way. Highly recommend.',
    daysAgo: 5,
  },
  {
    id: 'rv-003',
    customer: 'Sandra Pham',
    rating: 5,
    source: 'Google',
    text: 'After three estimates we chose Heritage and we are so glad we did. The wet room conversion is exactly what we needed for my mother. Beautiful, accessible, and the project came in on time and on budget.',
    daysAgo: 14,
    response: 'Sandra — so glad your mother loves the new bath. Designing for accessibility while keeping the warmth was the brief, and your patience through the tile selection process made it work. — Marc',
  },
  {
    id: 'rv-004',
    customer: 'Pat Owens',
    rating: 4,
    source: 'Google',
    text: 'Install was clean and the final product is gorgeous, but the cabinet delivery slipped by a week which threw off our schedule. Communication could have been better. Would still hire them again.',
    daysAgo: 8,
    // No response yet — Ada has drafted one waiting on Marc's approval
    draftedReply: "Pat — Marc here, owner at Heritage. You're absolutely right that the cabinet delivery slip set us back a week, and that's on us to manage tighter with our suppliers. Diego's installation work was clean and I'm glad that came through. We're switching our cabinet vendor for projects starting next month for exactly this reason. Thanks for the honest feedback — it helps. — Marc",
  },
  {
    id: 'rv-005',
    customer: 'David & Jennifer Holt',
    rating: 5,
    source: 'Houzz',
    text: 'Heritage is the rare contractor who is both a craftsman and a great communicator. Marc walked us through every option, never pressured, and the bathroom is better than we imagined.',
    daysAgo: 21,
  },
  {
    id: 'rv-006',
    customer: 'Karen Whitcomb',
    rating: 5,
    source: 'Google',
    text: 'Hired Heritage based on a friend\'s referral and they exceeded expectations. The kitchen renovation took 5 weeks as promised, no surprises on the invoice, and the result is stunning.',
    daysAgo: 45,
    response: 'Karen — appreciate the trust. Glad your friend pointed you our way (and that we delivered on the recommendation). The walnut accent on the island is going to look better as it ages. — Marc',
  },
]

const reviews = ref<Review[]>([...initialReviews])
const recentlySent = ref<Set<string>>(new Set())
const requestingDraft = ref<Set<string>>(new Set())

// Pre-written contextual thank-yous for 5★ reviews. In production, Ada
// would compose these via the LLM on-demand — for demo purposes, the
// drafts are hand-written to reference specific review details (crew
// members mentioned, project specifics). Same voice as Marc's other
// replies on this page.
const FIVE_STAR_THANKYOU_DRAFTS: Record<string, string> = {
  'rv-002': "Olivia — appreciate the kind words. I'll pass it on to Diego and Carmen specifically. Diego's been with us since 2017 and the tile work is genuinely a craft he cares about. So glad we got the powder room right. — Marc",
  'rv-005': "David and Jennifer — thank you. 'Craftsman and a great communicator' is the bar I try to hit on every project, and it's not always easy. So glad we got there together on this one. — Marc",
}

// Sort: un-replied reviews with drafted replies FIRST (action items),
// then un-replied reviews without drafts, then replied reviews —
// all secondary-sorted by recency.
const sortedReviews = computed(() => {
  return [...reviews.value].sort((a, b) => {
    const aActionable = !a.response && !!a.draftedReply
    const bActionable = !b.response && !!b.draftedReply
    if (aActionable && !bActionable) return -1
    if (!aActionable && bActionable) return 1
    const aUnreplied = !a.response
    const bUnreplied = !b.response
    if (aUnreplied && !bUnreplied) return -1
    if (!aUnreplied && bUnreplied) return 1
    return a.daysAgo - b.daysAgo
  })
})

function ratingStars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

function approveAndSendReply(review: Review) {
  recentlySent.value.add(review.id)
  // Move the drafted reply into the response field
  const idx = reviews.value.findIndex((r) => r.id === review.id)
  if (idx >= 0 && reviews.value[idx].draftedReply) {
    reviews.value[idx] = {
      ...reviews.value[idx],
      response: reviews.value[idx].draftedReply,
      draftedReply: undefined,
    }
  }
  setTimeout(() => {
    recentlySent.value.delete(review.id)
  }, DEMO_BEAT_MS)
}

function skipReply(review: Review) {
  // Visual: mark as skipped by removing the drafted reply
  const idx = reviews.value.findIndex((r) => r.id === review.id)
  if (idx >= 0) {
    reviews.value[idx] = { ...reviews.value[idx], draftedReply: undefined }
  }
}

// Request a thank-you draft from Ada for a 5★ review. In production this
// would call the drafter edge function; for demo it pulls from the
// pre-written map + simulates a brief "drafting..." moment so the action
// feels real.
function requestThankYouDraft(review: Review) {
  requestingDraft.value.add(review.id)
  setTimeout(() => {
    const idx = reviews.value.findIndex((r) => r.id === review.id)
    const draft = FIVE_STAR_THANKYOU_DRAFTS[review.id]
      ?? `${review.customer.split(' ')[0]} — thank you for the kind words and for trusting us with your project. — Marc`
    if (idx >= 0) {
      reviews.value[idx] = { ...reviews.value[idx], draftedReply: draft }
    }
    requestingDraft.value.delete(review.id)
  }, 800)
}
</script>

<template>
  <div class="space-y-5">
    <header>
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
        Review Engine · Email Marketing
      </div>
      <h2 class="text-xl font-semibold text-ink">Reputation &amp; Marketing</h2>
      <p class="text-sm text-ink-muted mt-1 max-w-2xl">
        Reviews are the foundation of new lead acquisition for remodelers. Ada asks customers 48 hours after final walkthrough and drafts replies to anything below 5★.
      </p>
    </header>

    <!-- Ada's note on reputation + marketing this week -->
    <section class="rounded-card border border-brand/25 bg-brand/[0.04] px-5 py-4">
      <header class="flex items-center gap-2.5 mb-2.5">
        <div class="h-7 w-7 rounded-full bg-brand text-ink-inverse flex items-center justify-center text-xs font-bold flex-shrink-0">A</div>
        <span class="text-xs font-bold text-ink">Ada's note on your reputation this week</span>
      </header>
      <p class="text-[13.5px] text-ink leading-relaxed max-w-2xl">
        You're at a <strong>4.9★ rating across 128 reviews</strong>, top of your category in Tampa. I asked 6 customers for reviews this week, 5 are coming back 5★. Most contractors lose 5-10 reviews/month to forgetting to ask, I don't forget. The newsletter went out to 842 past customers, 38% opened it (industry: 18%). One 4★ from Pat Owens needs your voice before I post the reply, your call.
      </p>
    </section>

    <!-- Review summary -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Avg rating</div>
        <div class="text-2xl font-bold text-success tabular-nums leading-none mt-1">4.9 ★</div>
        <div class="text-[11px] text-ink-disabled mt-1">128 total reviews</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">This week</div>
        <div class="text-2xl font-bold text-ink tabular-nums leading-none mt-1">6 new</div>
        <div class="text-[11px] text-ink-disabled mt-1">5 are 5★</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Awaiting response</div>
        <div class="text-2xl font-bold text-warn tabular-nums leading-none mt-1">1</div>
        <div class="text-[11px] text-ink-disabled mt-1">Pat Owens 4★ · draft ready</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Newsletter</div>
        <div class="text-2xl font-bold text-ink tabular-nums leading-none mt-1">38%</div>
        <div class="text-[11px] text-ink-disabled mt-1">Spring kitchen open rate</div>
      </div>
    </div>

    <!-- Ada's Recommendations — reputation decisions worth your eye -->
    <AdaRecommendations :recommendations="reputationRecommendations" />

    <!-- Recent reviews -->
    <section class="card">
      <header class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h3 class="text-base font-semibold text-ink">Recent reviews</h3>
          <p class="text-xs text-ink-muted">Sorted by action priority · awaiting-response reviews first</p>
        </div>
      </header>
      <ul class="space-y-3">
        <li
          v-for="r in sortedReviews"
          :key="r.id"
          class="rounded-card border p-3"
          :class="r.draftedReply
            ? 'border-warn/40 bg-warn/[0.04]'
            : 'border-divider bg-surface-raised'"
        >
          <!-- Review header -->
          <div class="flex items-baseline justify-between gap-3 flex-wrap mb-2">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ r.customer }}</span>
              <span class="text-[11px] text-ink-muted">{{ r.source }}</span>
              <span class="text-[11px] text-ink-disabled">· {{ r.daysAgo }} days ago</span>
              <span
                v-if="r.draftedReply"
                class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-warn/15 text-warn"
              >Draft awaiting your approval</span>
              <span
                v-else-if="!r.response && recentlySent.has(r.id)"
                class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-success/15 text-success"
              >Reply sent · just now</span>
            </div>
            <span class="text-warn font-bold text-sm">{{ ratingStars(r.rating) }}</span>
          </div>

          <!-- Review text -->
          <p class="text-[13px] text-ink leading-relaxed">"{{ r.text }}"</p>

          <!-- Drafted reply (action needed) -->
          <div
            v-if="r.draftedReply"
            class="mt-3 rounded-md border border-brand/30 bg-surface p-3"
          >
            <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-1">
              Ada's drafted reply
            </div>
            <p class="text-[12.5px] text-ink-muted italic leading-snug">"{{ r.draftedReply }}"</p>
            <div class="mt-2 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-150 ease-out-quart active:scale-[0.97]"
                @click="approveAndSendReply(r)"
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
                @click="skipReply(r)"
              >
                Skip
              </button>
            </div>
          </div>

          <!-- Posted reply (already sent) -->
          <div
            v-else-if="r.response"
            class="mt-2 pl-3 border-l-2 border-brand/40"
          >
            <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-1">Marc replied</div>
            <p class="text-[12.5px] text-ink-muted italic leading-snug">"{{ r.response }}"</p>
          </div>

          <!-- Un-replied 5★ — soft "ask Ada for a thank-you" affordance -->
          <div
            v-else
            class="mt-2 flex items-center justify-between gap-3 flex-wrap"
          >
            <span class="text-[11px] text-ink-disabled italic">
              5★ reviews don't auto-draft. Replying to 5★ reviews lifts future prospect-conversion 3-4×.
            </span>
            <button
              type="button"
              class="rounded-md border border-brand/40 bg-brand/5 text-brand px-3 py-1.5 text-xs font-semibold hover:bg-brand/10 transition-colors disabled:opacity-50"
              :disabled="requestingDraft.has(r.id)"
              @click="requestThankYouDraft(r)"
            >
              {{ requestingDraft.has(r.id) ? 'Drafting…' : 'Draft a thank-you' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- Email marketing -->
    <section class="card">
      <header class="mb-3">
        <h3 class="text-base font-semibold text-ink">Email marketing</h3>
        <p class="text-xs text-ink-muted">Ada drafts; you approve; goes out from your team.</p>
      </header>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="text-[11px] font-bold uppercase tracking-wider text-success">SENT</div>
          <div class="text-sm font-semibold text-ink mt-1">Spring kitchen trends</div>
          <div class="text-[11px] text-ink-muted mt-1">842 recipients · 38% open · 12 replies</div>
        </div>
        <div class="rounded-card border border-warn/40 bg-warn/[0.04] p-3">
          <div class="text-[11px] font-bold uppercase tracking-wider text-warn">DRAFTED</div>
          <div class="text-sm font-semibold text-ink mt-1">Before/after showcase — Bell kitchen</div>
          <div class="text-[11px] text-ink-muted mt-1">Awaiting your review</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="text-[11px] font-bold uppercase tracking-wider text-ink-muted">SCHEDULED</div>
          <div class="text-sm font-semibold text-ink mt-1">Q3 kitchen-design webinar invite</div>
          <div class="text-[11px] text-ink-muted mt-1">Sends next Tuesday</div>
        </div>
      </div>
    </section>
  </div>
</template>
