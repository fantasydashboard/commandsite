/**
 * Heritage demo formatting helpers.
 *
 * Single shared `fmtMoney` so the same number reads consistently across
 * Today / Quotes / Customer Care / Reputation / Lead Sources / Insights /
 * Settings. M and K thresholds, 1 decimal on M, 0 decimals on K, integer
 * dollars below $1K.
 */

export function fmtMoney(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`
  return `$${Math.round(dollars)}`
}

/**
 * How long demo "Approve & send" / "Skip" actions keep their just-sent
 * highlight before fading. Tune in one place; the Heritage modules import
 * this so the demo beat stays in sync across tabs.
 */
export const DEMO_BEAT_MS = 4000
