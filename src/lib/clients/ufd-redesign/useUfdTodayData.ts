/**
 * UFD Today — live data composable.
 *
 * Wraps the ufd-stats edge function (which reads UFD's separate
 * Supabase project) and computes the Today pulse + recent-activity
 * ticker seed from real data. Replaces the static fixtures in
 * ufd-redesign/today.ts for the cards that ufd-stats can answer.
 *
 * What's wired here:
 *   • New trial signups today (free_trial cohort)
 *   • Paid conversions today (individual_monthly + individual_annual today)
 *   • MRR change today (monthly + annualized annual contribution)
 *   • Ticker seed (3 most recent real events from today's series)
 *
 * What stays mock for now:
 *   • Viral referrals — UFD doesn't track referral attribution in
 *     ufd-stats yet. Surfaced as "—" until that data lands.
 *   • Churns today — same. Returns 0 until ufd-stats exposes churn.
 *   • Approval queue items — those are Bones-drafted growth actions;
 *     real auto-drafting is a separate build (Phase 3).
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { supabase } from '@/lib/supabase'

type Cohort =
  | 'total_users'
  | 'free_trial'
  | 'at_risk'
  | 'expired'
  | 'total_passes'
  | 'individual_monthly'
  | 'individual_annual'
  | 'league_passes'

interface CardValue {
  count: number
  delta?: number
}

interface StatsResponse {
  window: string
  range: { since: string | null; now: string }
  cards: Record<Cohort, CardValue>
  series: {
    new_users: Record<string, number>
    new_passes: {
      individual_monthly: Record<string, number>
      individual_annual: Record<string, number>
      league_passes: Record<string, number>
    }
  }
}

// Approx UFD price points (cents) for MRR calculations. These are
// fallbacks — if UFD ever exposes the exact per-tier revenue, swap to
// that. For now used only to compute "MRR change today" on the pulse.
const PRICE_MONTHLY_CENTS = 1499
const PRICE_ANNUAL_CENTS = 7900       // shows as annual revenue, not MRR
const PRICE_LEAGUE_CENTS = 12000      // league pass annual

const POLL_INTERVAL_MS = 60_000

export interface UfdLivePulse {
  trials_today: number
  conversions_today: number
  mrr_change_cents: number              // sum of today's monthly conversions (proper MRR)
  annualized_today_cents: number        // includes today's annual conversions, annualized
  league_passes_today: number
  churns_today: number | null           // null when data unavailable
  viral_referrals_24h: number | null    // null when data unavailable
}

export interface UfdTickerEvent {
  icon: string
  text: string
  ageSec: number
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function sumValuesFor(series: Record<string, number>, dateKey: string): number {
  return series[dateKey] ?? 0
}

export function useUfdTodayData() {
  const stats = ref<StatsResponse | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const lastFetchAt = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: e } = await supabase.functions.invoke<StatsResponse>('ufd-stats', {
      body: { window: '30d' },
    })
    if (e) {
      error.value = e.message
      loading.value = false
      return
    }
    stats.value = data
    lastFetchAt.value = new Date().toISOString()
    loading.value = false
  }

  /** Live pulse — derived from today's series buckets. */
  const pulse = computed<UfdLivePulse>(() => {
    if (!stats.value) {
      return {
        trials_today: 0,
        conversions_today: 0,
        mrr_change_cents: 0,
        annualized_today_cents: 0,
        league_passes_today: 0,
        churns_today: null,
        viral_referrals_24h: null,
      }
    }
    const today = todayKey()
    const trials = sumValuesFor(stats.value.series.new_users, today)
    const monthlyToday = sumValuesFor(stats.value.series.new_passes.individual_monthly, today)
    const annualToday = sumValuesFor(stats.value.series.new_passes.individual_annual, today)
    const leagueToday = sumValuesFor(stats.value.series.new_passes.league_passes, today)
    const conversions = monthlyToday + annualToday + leagueToday
    const mrrChange = monthlyToday * PRICE_MONTHLY_CENTS
    const annualizedToday =
      monthlyToday * PRICE_MONTHLY_CENTS * 12 +
      annualToday * PRICE_ANNUAL_CENTS +
      leagueToday * PRICE_LEAGUE_CENTS
    return {
      trials_today: trials,
      conversions_today: conversions,
      mrr_change_cents: mrrChange,
      annualized_today_cents: annualizedToday,
      league_passes_today: leagueToday,
      churns_today: null,
      viral_referrals_24h: null,
    }
  })

  /** Recent activity events synthesized from the series data. Used to
   *  seed the live ticker with REAL signals from the last few hours
   *  instead of pure mock items. */
  const tickerSeed = computed<UfdTickerEvent[]>(() => {
    const events: UfdTickerEvent[] = []
    if (!stats.value) return events
    const today = todayKey()

    const trialsToday = sumValuesFor(stats.value.series.new_users, today)
    const monthlyToday = sumValuesFor(stats.value.series.new_passes.individual_monthly, today)
    const annualToday = sumValuesFor(stats.value.series.new_passes.individual_annual, today)
    const leagueToday = sumValuesFor(stats.value.series.new_passes.league_passes, today)

    if (trialsToday > 0) {
      events.push({
        icon: '💚',
        text: `${trialsToday} new ${trialsToday === 1 ? 'trial' : 'trials'} today`,
        ageSec: 60 * 30,
      })
    }
    if (monthlyToday > 0) {
      events.push({
        icon: '💰',
        text: `${monthlyToday} monthly ${monthlyToday === 1 ? 'conversion' : 'conversions'} today (+$${Math.round(monthlyToday * PRICE_MONTHLY_CENTS / 100)} MRR)`,
        ageSec: 60 * 60,
      })
    }
    if (annualToday > 0) {
      events.push({
        icon: '🏆',
        text: `${annualToday} annual ${annualToday === 1 ? 'conversion' : 'conversions'} today (+$${Math.round(annualToday * PRICE_ANNUAL_CENTS / 100)} annual)`,
        ageSec: 60 * 90,
      })
    }
    if (leagueToday > 0) {
      events.push({
        icon: '🏈',
        text: `${leagueToday} league ${leagueToday === 1 ? 'pass' : 'passes'} sold today`,
        ageSec: 60 * 120,
      })
    }
    // Yesterday roll-up so the ticker isn't empty on slow mornings
    if (events.length === 0) {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
      const yTrials = sumValuesFor(stats.value.series.new_users, yesterday)
      if (yTrials > 0) {
        events.push({
          icon: '📊',
          text: `${yTrials} ${yTrials === 1 ? 'trial' : 'trials'} signed up yesterday`,
          ageSec: 60 * 60 * 14,
        })
      }
    }
    return events
  })

  /** Snapshot totals from the wider window for context. */
  const totals = computed(() => {
    if (!stats.value) return null
    return {
      total_users: stats.value.cards.total_users?.count ?? 0,
      free_trial: stats.value.cards.free_trial?.count ?? 0,
      individual_monthly: stats.value.cards.individual_monthly?.count ?? 0,
      individual_annual: stats.value.cards.individual_annual?.count ?? 0,
      league_passes: stats.value.cards.league_passes?.count ?? 0,
      at_risk: stats.value.cards.at_risk?.count ?? 0,
      expired: stats.value.cards.expired?.count ?? 0,
    }
  })

  // Auto-refresh every 60s so the dashboard feels live
  let pollTimer: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    void load()
    pollTimer = setInterval(() => { void load() }, POLL_INTERVAL_MS)
  })
  onBeforeUnmount(() => {
    if (pollTimer) clearInterval(pollTimer)
  })

  return {
    pulse,
    totals,
    tickerSeed,
    loading,
    error,
    lastFetchAt,
    load,
  }
}
