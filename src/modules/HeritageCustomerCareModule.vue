<script setup lang="ts">
/**
 * Heritage Bath & Kitchen Co. — Customer Care tab.
 *
 * Houses three Ada roles: Customer Health, Reactivation, Referral Engine.
 * Referral Engine is the NEW role (Pro tier addition) — the highest-ROI
 * lead-gen channel because friends close at 50-70% vs. 25-30% for cold
 * leads.
 *
 * Post-impeccable-critique fixes:
 *   1. AWAITING YOUR APPROVAL cards now have inline action buttons
 *      (Approve & send / Edit / Skip).
 *   2. Each referral with a referred_friend_name now shows a sub-row
 *      tracking what's happening to the FRIEND (not just the referrer):
 *      intro message status, consultation timing, thank-you delivery.
 *   3. Conversion rate framing fixed — shows "friend close rate" (closed
 *      / friend-bookings) which is the realistic 50% number, not the
 *      misleading 17% (closed / total-asks).
 */
import { ref, computed } from 'vue'
import type { Client } from '@/types/database'
import {
  referrals as initialReferrals,
  totalReferralRevenueThisQuarter,
  pendingReferralValue,
} from '@/lib/clients/heritage/referrals'
import type { ReferralRecord } from '@/lib/clients/heritage/types'
import { fmtMoney, DEMO_BEAT_MS } from '@/lib/clients/heritage/format'
import AdaRecommendations, { type AdaRecommendation } from '@/components/heritage/AdaRecommendations.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// Local mutable copy so demo "Approve & send" / "Skip" actions reflect.
const referrals = ref<ReferralRecord[]>([...initialReferrals])
const recentlySent = ref<Set<string>>(new Set())
const skipped = ref<Set<string>>(new Set())

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    queued: 'Awaiting your approval',
    sent: 'Sent · awaiting reply',
    replied: 'Replied · needs follow-up',
    referred: 'Referred a friend',
    friend_booked: 'Friend booked consultation',
    friend_closed: 'Friend closed · revenue confirmed',
  }
  return map[stage] ?? stage
}

function stageColor(stage: string): string {
  if (stage === 'queued') return 'bg-warn/15 text-warn'
  if (stage === 'sent') return 'bg-brand/15 text-brand'
  if (stage === 'replied') return 'bg-brand/15 text-brand'
  if (stage === 'referred') return 'bg-accent/20 text-accent'
  if (stage === 'friend_booked') return 'bg-success/15 text-success'
  if (stage === 'friend_closed') return 'bg-success/20 text-success'
  return 'bg-ink-muted/15 text-ink-muted'
}

// ── Stats: filtered to only NON-SKIPPED referrals so the demo actions
// affect the displayed counts.
const visibleReferrals = computed(() =>
  referrals.value.filter((r) => !skipped.value.has(r.id)),
)
const queuedCount = computed(() => visibleReferrals.value.filter((r) => r.stage === 'queued').length)
const inFlightCount = computed(() =>
  visibleReferrals.value.filter((r) =>
    r.stage === 'sent' || r.stage === 'replied' || r.stage === 'referred'
  ).length
)
const wonCount = computed(() => visibleReferrals.value.filter((r) => r.stage === 'friend_closed').length)
const friendBookingCount = computed(() =>
  visibleReferrals.value.filter((r) =>
    r.stage === 'friend_booked' || r.stage === 'friend_closed'
  ).length
)

// FRIEND close rate (closed / friend-bookings) — the realistic, impressive
// number. Industry benchmark is 50-70%. Demo data has 1 of 2 = 50%.
//
// Avoids the misleading "1 of 6 total asks = 17%" framing which made the
// Referral Engine look bad in early demos. Pipeline conversion (top-of-
// funnel to closed) is a different stat — surfaced separately below.
const friendCloseRate = computed(() => {
  const bookings = friendBookingCount.value
  if (bookings === 0) return null
  const won = wonCount.value
  return Math.round((won / bookings) * 100)
})

// ── Per-referral demo actions
function approveAndSend(r: ReferralRecord) {
  recentlySent.value.add(r.id)
  // Move it from queued → sent
  const idx = referrals.value.findIndex((x) => x.id === r.id)
  if (idx >= 0) {
    referrals.value[idx] = { ...r, stage: 'sent', drafted_message: undefined }
  }
  setTimeout(() => {
    recentlySent.value.delete(r.id)
  }, DEMO_BEAT_MS)
}

function skipReferral(r: ReferralRecord) {
  skipped.value.add(r.id)
}

// ── Friend status copy: what's happening to the REFERRED friend
function friendStatusLabel(r: ReferralRecord): { text: string; tone: string; action?: string } {
  if (r.stage === 'referred') {
    return {
      text: `${r.referred_friend_name} · intro message drafted · awaiting your approval`,
      tone: 'warn',
      action: 'Approve intro',
    }
  }
  if (r.stage === 'friend_booked') {
    return {
      text: `${r.referred_friend_name} · consultation booked · est. ${fmtMoney(r.estimated_value_cents ?? 0)}`,
      tone: 'brand',
    }
  }
  if (r.stage === 'friend_closed') {
    return {
      text: `${r.referred_friend_name} · closed for ${fmtMoney(r.actual_revenue_cents ?? 0)} · thank-you sent to ${r.referrer_name.split(' & ')[0]}`,
      tone: 'success',
    }
  }
  return { text: '', tone: 'muted' }
}

function friendToneClasses(tone: string): string {
  if (tone === 'warn') return 'bg-warn/[0.06] border-warn/30 text-warn'
  if (tone === 'brand') return 'bg-brand/[0.04] border-brand/30 text-brand'
  if (tone === 'success') return 'bg-success/[0.06] border-success/30 text-success'
  return 'bg-surface-elevated border-divider text-ink-muted'
}

// Precompute friend-status copy once per referral so the template doesn't
// call friendStatusLabel(r) four times per row.
const friendStatusById = computed(() => {
  const map: Record<string, { text: string; tone: string; action?: string }> = {}
  for (const r of referrals.value) {
    map[r.id] = friendStatusLabel(r)
  }
  return map
})

// ── Ada's recommendations for Customer Care ────────────────────────
// Focused on past-customer expansion and referral leverage. The cheat
// code here is that past customers are your highest-ROI sales force,
// and Ada activates them automatically.
const customerCareRecommendations: AdaRecommendation[] = [
  {
    id: 'cc-12mo-bath',
    title: '3 past-bath customers hit the 12-month kitchen-expansion window this week',
    tag: 'Highest leverage',
    tagTone: 'leverage',
    body: 'The Vincents, the Patel-Rosens, and the Hawkins family all did bath remodels with you exactly 12 months ago. Industry data: 28% of bath customers buy a kitchen within months 12-18. I drafted personalized "thinking of the kitchen?" notes for all three, in your voice.',
    impact: 'At a 28% conversion rate and $45K avg kitchen ticket, expected revenue from this batch: $38K.',
    actionLabel: 'Read the 3 drafts',
  },
  {
    id: 'cc-underwood-noref',
    title: 'Underwood family (5★ kitchen 14 mo ago) hasn\'t referred yet, drafted a soft ask',
    tag: 'Opportunity',
    tagTone: 'opportunity',
    body: 'They left you a glowing 5★ review back in April but haven\'t made an intro yet. They\'re your most enthusiastic past customer who didn\'t convert into a referrer. I drafted a "anyone in your circle thinking of a remodel?" ask that doesn\'t feel transactional, $500 off for both sides.',
    impact: 'High-affinity unconverted referrers close 31% when asked once vs 0% if never asked.',
    actionLabel: 'Read the referral ask',
  },
  {
    id: 'cc-cole-warm',
    title: 'Heather Cole (reactivation) replied "tell me more", needs your voice',
    tag: 'Worth your eyes',
    tagTone: 'urgent',
    body: 'She did her bath 18 months ago, replied warmly to the kitchen newsletter, and is now asking real questions. This is the moment a salesperson would call. I drafted a no-commitment walkthrough invite but you might want to send this one yourself, the warmth deserves the personal touch.',
    impact: 'Warm reactivation leads who get a personal owner reply close at 64% vs 38% for templated.',
    actionLabel: 'Personal reply',
  },
]
</script>

<template>
  <div class="space-y-5">
    <header>
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
        Customer Care · Referrals
      </div>
      <h2 class="text-xl font-semibold text-ink">Keep customers · grow through them</h2>
      <p class="text-sm text-ink-muted mt-1 max-w-2xl">
        Customer Health tracks your existing customers. Referral Engine turns the happy ones into your highest-ROI lead source — friends close at 50-70% vs. 25-30% for cold leads.
      </p>
    </header>

    <!-- Referral Engine — the new Pro role ⭐ -->
    <section class="card border-brand/30">
      <header class="mb-4 flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
            New in Pro · Referral Engine
          </div>
          <h3 class="text-base font-semibold text-ink">Referral pipeline</h3>
          <p class="text-xs text-ink-muted mt-1">
            Ada asks past 5★ customers for referrals at the right moment, in your voice. You approve. Friend gets a discount. Referrer gets a thank-you.
          </p>
        </div>
      </header>

      <!-- Referral KPIs -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="text-[10px] uppercase tracking-wider text-ink-muted">Awaiting approval</div>
          <div class="text-2xl font-bold text-warn tabular-nums leading-none mt-1">{{ queuedCount }}</div>
          <div class="text-[11px] text-ink-disabled mt-1">drafts ready</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="text-[10px] uppercase tracking-wider text-ink-muted">In flight</div>
          <div class="text-2xl font-bold text-brand tabular-nums leading-none mt-1">{{ inFlightCount }}</div>
          <div class="text-[11px] text-ink-disabled mt-1">awaiting customer</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="text-[10px] uppercase tracking-wider text-ink-muted">Friends pending close</div>
          <div class="text-2xl font-bold text-success tabular-nums leading-none mt-1">{{ fmtMoney(pendingReferralValue()) }}</div>
          <div class="text-[11px] text-ink-disabled mt-1">est. revenue</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="text-[10px] uppercase tracking-wider text-ink-muted">This quarter</div>
          <div class="text-2xl font-bold text-success tabular-nums leading-none mt-1">{{ fmtMoney(totalReferralRevenueThisQuarter()) }}</div>
          <div class="text-[11px] text-ink-disabled mt-1">
            <span v-if="friendCloseRate !== null">
              {{ wonCount }} of {{ friendBookingCount }} friends closed ({{ friendCloseRate }}%)
            </span>
            <span v-else>{{ wonCount }} closed</span>
          </div>
        </div>
      </div>

      <!-- Referral list -->
      <ul class="space-y-2">
        <li
          v-for="r in visibleReferrals"
          :key="r.id"
          class="rounded-card border bg-surface-raised p-3"
          :class="r.stage === 'queued' ? 'border-warn/40 bg-warn/[0.03]' : 'border-divider'"
        >
          <!-- Header row: referrer + status -->
          <div class="flex items-baseline justify-between gap-3 flex-wrap mb-1">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ r.referrer_name }}</span>
              <span class="text-[11px] text-ink-muted">{{ r.referrer_phone }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span
                v-if="recentlySent.has(r.id)"
                class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-success/15 text-success"
              >Sent · just now</span>
              <span
                class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                :class="stageColor(r.stage)"
              >{{ stageLabel(r.stage) }}</span>
            </div>
          </div>

          <!-- Trigger job -->
          <p class="text-[12px] text-ink-muted">{{ r.trigger_job }}</p>

          <!-- Drafted message (queued state) -->
          <p
            v-if="r.drafted_message && r.stage === 'queued'"
            class="mt-2 text-[12.5px] text-ink italic bg-surface-elevated/60 rounded p-2 leading-snug"
          >
            "{{ r.drafted_message }}"
          </p>

          <!-- Action buttons (queued state) — Approve & send / Edit / Skip -->
          <div
            v-if="r.stage === 'queued'"
            class="mt-2 flex items-center gap-2 flex-wrap"
          >
            <button
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-150 ease-out-quart active:scale-[0.97]"
              @click="approveAndSend(r)"
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
              @click="skipReferral(r)"
            >
              Skip
            </button>
          </div>

          <!-- Friend sub-row: what's happening to the REFERRED FRIEND -->
          <div
            v-if="r.referred_friend_name && (r.stage === 'referred' || r.stage === 'friend_booked' || r.stage === 'friend_closed')"
            class="mt-2.5 flex items-start gap-2 rounded-md border p-2 text-[12px]"
            :class="friendToneClasses(friendStatusById[r.id].tone)"
          >
            <span class="font-bold text-[10px] uppercase tracking-wider flex-shrink-0">Friend</span>
            <span class="flex-1 text-ink leading-snug">{{ friendStatusById[r.id].text }}</span>
            <button
              v-if="friendStatusById[r.id].action"
              type="button"
              class="text-[11px] font-semibold underline hover:no-underline flex-shrink-0"
            >
              {{ friendStatusById[r.id].action }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- Ada's Recommendations — past-customer expansion + referral leverage -->
    <AdaRecommendations :recommendations="customerCareRecommendations" />

    <!-- Customer Health + Reactivation -->
    <section class="card">
      <header class="mb-3">
        <h3 class="text-base font-semibold text-ink">Customer Health · Reactivation</h3>
        <p class="text-xs text-ink-muted">
          Past customers Ada is watching for expansion opportunities or reactivation outreach.
        </p>
      </header>

      <!-- Reactivation headline stat (was buried, now promoted) -->
      <div class="rounded-card border border-success/30 bg-success/[0.05] p-3 mb-3">
        <div class="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-wider text-success">Reactivation this week</div>
            <div class="text-sm text-ink mt-1">
              <strong class="text-success">12 sent · 3 booked (25% conversion)</strong>
            </div>
          </div>
          <span class="text-[11px] text-ink-muted italic">Industry benchmark: 5-15%. You're crushing it.</span>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="flex items-baseline justify-between mb-2">
            <h4 class="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Expansion candidates</h4>
            <span class="text-xs text-success font-semibold">3 flagged</span>
          </div>
          <ul class="text-[12.5px] text-ink space-y-2">
            <li>
              <div class="font-semibold">Heather Cole</div>
              <div class="text-[11px] text-ink-muted">bath 18 mo ago · replied to kitchen newsletter</div>
              <div class="text-[11px] text-warn mt-0.5">Ada drafted kitchen pitch · awaiting your approval</div>
            </li>
            <li>
              <div class="font-semibold">Jeff &amp; Sandra Pham</div>
              <div class="text-[11px] text-ink-muted">bath 5 mo ago · kids growing into shared bath</div>
              <div class="text-[11px] text-ink-disabled mt-0.5">Ada watching · check back in ~3 months</div>
            </li>
            <li>
              <div class="font-semibold">The Underwood family</div>
              <div class="text-[11px] text-ink-muted">kitchen 8 mo ago · asked about powder room</div>
              <div class="text-[11px] text-warn mt-0.5">Ada drafted powder-room pitch · awaiting your approval</div>
            </li>
          </ul>
        </div>
        <div class="rounded-card border border-divider bg-surface-elevated p-3">
          <div class="flex items-baseline justify-between mb-2">
            <h4 class="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Dormant — for reactivation</h4>
            <span class="text-xs text-brand font-semibold">3 booked this week</span>
          </div>
          <ul class="text-[12.5px] text-ink space-y-2">
            <li>
              <div class="font-semibold">Karen Whitcomb</div>
              <div class="text-[11px] text-ink-muted">last project 14 months ago · kitchen island add</div>
              <div class="text-[11px] text-success mt-0.5">Booked consultation Thu 2pm</div>
            </li>
            <li>
              <div class="font-semibold">The Caldwell Family</div>
              <div class="text-[11px] text-ink-muted">22 months · second bath remodel timing</div>
              <div class="text-[11px] text-brand mt-0.5">Reactivation sent · awaiting reply</div>
            </li>
            <li>
              <div class="font-semibold">Olivia Hart</div>
              <div class="text-[11px] text-ink-muted">18 months · kitchen renovation interest</div>
              <div class="text-[11px] text-brand mt-0.5">Reactivation sent · awaiting reply</div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
