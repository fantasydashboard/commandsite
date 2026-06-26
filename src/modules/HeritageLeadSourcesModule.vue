<script setup lang="ts">
/**
 * Heritage Bath & Kitchen Co. — Lead Sources tab.
 *
 * NEW for Pro tier. The "aha" dashboard most remodelers have never seen
 * about their own business: where leads come from, what each costs per
 * lead, what closes per channel, total ROI.
 *
 * For Heritage specifically: 7 channels tracked, headline insight is that
 * referrals (zero-CAC) dramatically outperform LSA (paid). The Referral
 * Engine role is the one that compounds this advantage.
 *
 * Post-impeccable-pass additions:
 *   - ROI ($) column showing net profit per channel
 *   - Industry-benchmark callouts on each KPI
 *   - Explicit action buttons in Ada's read section
 *   - Weighted pipeline forecast at the top
 */
import { ref, computed } from 'vue'
import type { Client } from '@/types/database'
import {
  totalLeadsThisMonth,
  totalSpendThisMonth,
  totalRevenueThisMonth,
  blendedCostPerLead,
  blendedClosedRate,
  sourcesByRoi,
} from '@/lib/clients/heritage/leadSources'
import { fmtMoney } from '@/lib/clients/heritage/format'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const acceptedRecommendations = ref<Set<string>>(new Set())

function fmtPct(decimal: number): string {
  return `${Math.round(decimal * 100)}%`
}

function trendArrow(trend: string): string {
  if (trend === 'up') return '↗'
  if (trend === 'down') return '↘'
  return '→'
}

function trendColor(trend: string): string {
  if (trend === 'up') return 'text-success'
  if (trend === 'down') return 'text-danger'
  return 'text-ink-muted'
}

const ranked = computed(() => sourcesByRoi())

// Weighted pipeline forecast — projects next-30-days revenue at current
// performance levels. Owners think in dollars; this turns the dashboard
// data into a forward-looking number.
const projectedNext30Days = computed(() => {
  // Simple forecast: trailing 30-day revenue × (1 + average trend across positive channels)
  // Demo data: ~$587K trailing → ~17% blended growth → ~$687K projected
  return Math.round(totalRevenueThisMonth() * 1.17)
})

// Action: accept Ada's recommendation. Visual demo state — flips the
// recommendation card to "Done" with a checkmark.
function acceptRecommendation(id: string) {
  acceptedRecommendations.value.add(id)
}
</script>

<template>
  <div class="space-y-5">
    <header>
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
        New in Pro · Lead Sources
      </div>
      <h2 class="text-xl font-semibold text-ink">Where your leads come from</h2>
      <p class="text-sm text-ink-muted mt-1 max-w-2xl">
        Rolling 30-day window. Cost per lead, close rate, and revenue per source. Most service-business owners have never seen this view of their own business.
      </p>
    </header>

    <!-- Ada's note on lead sources this month -->
    <section class="rounded-card border border-brand/25 bg-brand/[0.04] px-5 py-4">
      <header class="flex items-center gap-2.5 mb-2.5">
        <div class="h-7 w-7 rounded-full bg-brand text-ink-inverse flex items-center justify-center text-xs font-bold flex-shrink-0">A</div>
        <span class="text-xs font-bold text-ink">Ada's note on your lead mix</span>
      </header>
      <p class="text-[13.5px] text-ink leading-relaxed max-w-2xl">
        Your blended CAC is <strong>$17</strong>, well below the $40-80 industry range. Customer referrals drove <strong>$188K at zero cost</strong>, your single biggest channel by a wide margin. LSA close rate dipped to 21% this month (your average is 28%), I flagged 3 unclosed leads worth $25-40K. A marketing consultant would charge you $200-400/hr to tell you this. I do it for free, every week, while you're on a jobsite.
      </p>
    </section>

    <!-- Blended summary KPIs with benchmark context -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Total leads</div>
        <div class="text-2xl font-bold text-ink tabular-nums leading-none mt-1">{{ totalLeadsThisMonth() }}</div>
        <div class="text-[11px] text-ink-disabled mt-1">across all sources</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Total spend</div>
        <div class="text-2xl font-bold text-ink tabular-nums leading-none mt-1">{{ fmtMoney(totalSpendThisMonth()) }}</div>
        <div class="text-[11px] text-ink-disabled mt-1">paid channels only</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Blended CAC</div>
        <div class="text-2xl font-bold text-brand tabular-nums leading-none mt-1">{{ fmtMoney(blendedCostPerLead()) }}</div>
        <div class="text-[11px] text-success mt-1">Industry: $40-80 · you're below</div>
      </div>
      <div class="rounded-card border border-divider bg-surface-elevated p-3">
        <div class="text-[10px] uppercase tracking-wider text-ink-muted">Revenue attributed</div>
        <div class="text-2xl font-bold text-success tabular-nums leading-none mt-1">{{ fmtMoney(totalRevenueThisMonth()) }}</div>
        <div class="text-[11px] text-ink-disabled mt-1">closed this 30d</div>
      </div>
    </div>

    <!-- Weighted pipeline forecast — turns this from analytics to forward-looking -->
    <section class="card bg-brand/[0.03] border-brand/30">
      <div class="flex items-start gap-3 flex-wrap">
        <div class="flex-1 min-w-0">
          <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-1">
            Next 30 days · forecast
          </div>
          <div class="text-base text-ink">
            At current performance, you're projected to close
            <strong class="text-success tabular-nums">{{ fmtMoney(projectedNext30Days) }}</strong>
            in the next 30 days.
          </div>
          <p class="text-[11px] text-ink-muted mt-1">
            Based on trailing 30-day revenue × blended channel growth trends. Referral Engine activity is the biggest driver of the upward forecast.
          </p>
        </div>
      </div>
    </section>

    <!-- Lead sources table — ranked by ROI -->
    <section class="card">
      <header class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h3 class="text-base font-semibold text-ink">By channel · ranked by ROI</h3>
          <p class="text-xs text-ink-muted">Best to worst. The first few are where to put more money. The last few are where you might be leaking.</p>
        </div>
        <span class="text-[11px] text-ink-muted">Blended close rate: <strong class="text-ink">{{ fmtPct(blendedClosedRate()) }}</strong> <span class="text-success">(industry: 20-30%)</span></span>
      </header>

      <div class="overflow-x-auto -mx-2 px-2">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-[10px] uppercase tracking-wider text-ink-muted border-b border-divider">
              <th class="text-left py-2 pr-3 font-semibold">Channel</th>
              <th class="text-right py-2 px-2 font-semibold">Leads</th>
              <th class="text-right py-2 px-2 font-semibold">Spend</th>
              <th class="text-right py-2 px-2 font-semibold">CAC</th>
              <th class="text-right py-2 px-2 font-semibold">Close</th>
              <th class="text-right py-2 px-2 font-semibold">Revenue</th>
              <th class="text-right py-2 px-2 font-semibold">ROI ($)</th>
              <th class="text-right py-2 pl-2 font-semibold">Trend</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="src in ranked"
              :key="src.channel"
              class="border-b border-divider last:border-0 hover:bg-surface-elevated/40 transition-colors"
            >
              <td class="py-3 pr-3">
                <div class="font-semibold text-ink">{{ src.label }}</div>
                <div class="text-[11px] text-ink-muted italic mt-0.5 max-w-md leading-snug">{{ src.ada_note }}</div>
              </td>
              <td class="py-3 px-2 text-right tabular-nums text-ink">{{ src.leads_count }}</td>
              <td class="py-3 px-2 text-right tabular-nums" :class="src.spend_cents > 0 ? 'text-ink' : 'text-ink-disabled'">
                {{ src.spend_cents > 0 ? fmtMoney(src.spend_cents) : '–' }}
              </td>
              <td class="py-3 px-2 text-right tabular-nums" :class="src.cost_per_lead_cents > 0 ? 'text-ink' : 'text-success font-semibold'">
                {{ src.cost_per_lead_cents > 0 ? fmtMoney(src.cost_per_lead_cents) : 'Free' }}
              </td>
              <td class="py-3 px-2 text-right tabular-nums text-ink">{{ fmtPct(src.close_rate) }}</td>
              <td class="py-3 px-2 text-right tabular-nums font-semibold text-success">{{ fmtMoney(src.revenue_cents) }}</td>
              <td class="py-3 px-2 text-right tabular-nums font-bold" :class="src.roi_cents > 0 ? 'text-success' : 'text-danger'">
                {{ fmtMoney(src.roi_cents) }}
              </td>
              <td class="py-3 pl-2 text-right">
                <span :class="trendColor(src.trend)" class="text-sm font-bold">
                  <span aria-hidden="true">{{ trendArrow(src.trend) }}</span>
                  <span class="sr-only">{{ src.trend }} </span>{{ Math.abs(src.trend_pct) }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Ada's recommendations — with explicit action buttons -->
    <section class="card bg-brand/5 border-brand/30">
      <header class="mb-3">
        <div class="flex items-baseline gap-2">
          <span class="rounded-full bg-brand/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
            Ada's recommendations
          </span>
          <span class="text-xs text-ink-muted">3 actions worth considering this week</span>
        </div>
      </header>

      <div class="space-y-3">
        <!-- Recommendation 1: Tune up LSA -->
        <article
          class="rounded-card border bg-surface-raised p-3"
          :class="acceptedRecommendations.has('lsa-tune') ? 'border-success/30 bg-success/[0.04]' : 'border-divider'"
        >
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 mb-1">
                <strong class="text-sm text-ink">Tune up your LSA spend</strong>
                <span class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-warn/15 text-warn">Highest leverage</span>
              </div>
              <p class="text-[12.5px] text-ink-muted leading-snug">
                LSA close rate dipped to <strong class="text-ink">21%</strong> (your average is 28%). I flagged 3 unclosed leads from last month that may still be responsive — they're in your Quotes pipeline.
                <span class="block mt-1 italic">Expected impact: recovering 1 of those 3 = $25K-40K revenue.</span>
              </p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                v-if="!acceptedRecommendations.has('lsa-tune')"
                type="button"
                class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-150 ease-out-quart active:scale-[0.97]"
                @click="acceptRecommendation('lsa-tune')"
              >
                Review the 3 leads
              </button>
              <span
                v-else
                class="rounded-md bg-success/15 text-success px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1"
              >
                ✓ Done
              </span>
            </div>
          </div>
        </article>

        <!-- Recommendation 2: Double down on Instagram -->
        <article
          class="rounded-card border bg-surface-raised p-3"
          :class="acceptedRecommendations.has('instagram-boost') ? 'border-success/30 bg-success/[0.04]' : 'border-divider'"
        >
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 mb-1">
                <strong class="text-sm text-ink">Double down on Instagram</strong>
                <span class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-success/15 text-success">Growing fast</span>
              </div>
              <p class="text-[12.5px] text-ink-muted leading-snug">
                Instagram is small but growing <strong class="text-success">+50%</strong> and closing at <strong class="text-ink">33%</strong>. Your before/after reels are working. Email Marketing could draft 3 more reels-style posts from completed projects this week.
                <span class="block mt-1 italic">Expected impact: 2-3 additional leads/mo at the current quality rate.</span>
              </p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                v-if="!acceptedRecommendations.has('instagram-boost')"
                type="button"
                class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-150 ease-out-quart active:scale-[0.97]"
                @click="acceptRecommendation('instagram-boost')"
              >
                Draft 3 reels posts
              </button>
              <span
                v-else
                class="rounded-md bg-success/15 text-success px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1"
              >
                ✓ Done
              </span>
            </div>
          </div>
        </article>

        <!-- Recommendation 3: Compound the Referral Engine -->
        <article
          class="rounded-card border bg-surface-raised p-3"
          :class="acceptedRecommendations.has('referral-compound') ? 'border-success/30 bg-success/[0.04]' : 'border-divider'"
        >
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 mb-1">
                <strong class="text-sm text-ink">Compound your highest-ROI channel</strong>
                <span class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-success/15 text-success">Free revenue</span>
              </div>
              <p class="text-[12.5px] text-ink-muted leading-snug">
                Referrals delivered <strong class="text-success">$188K</strong> at zero CAC — your single biggest channel. The Referral Engine has <strong class="text-warn">2 referral asks waiting on your approval</strong>. Approving both could trigger 1-2 more closed jobs in the next 60 days.
              </p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                v-if="!acceptedRecommendations.has('referral-compound')"
                type="button"
                class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-150 ease-out-quart active:scale-[0.97]"
                @click="acceptRecommendation('referral-compound')"
              >
                Open Customer Care
              </button>
              <span
                v-else
                class="rounded-md bg-success/15 text-success px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1"
              >
                ✓ Done
              </span>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
