/**
 * Shared formatters — `money()` and `fmtAgo()` were duplicated across 5+
 * Apex modules with subtly diverging rules (same `$14,800` rendered as
 * `$15k` in some places and `$14,800` in others; `fmtAgo` returned days
 * in some modules and minutes in others). Centralising them so the demo
 * stays internally consistent.
 *
 * Three exported formatters:
 *   - money(cents, opts)      → `$1,234` / `$15k` (compact) / `Free` (0 + zeroLabel)
 *   - fmtAgo(iso, now?)       → `just now / 5m ago / 3h ago / 2d ago`  (minute precision)
 *   - fmtAgoCoarse(iso, now?) → `today / 5d ago / 3mo ago / 2.1yr ago` (day precision)
 *
 * `now` is an optional override. Components that need reactivity on a
 * minute-tick (e.g. live feeds) pass their reactive `Date.now()`-equivalent
 * so the formatter re-runs when the tick advances. Default is `Date.now()`.
 */

export interface MoneyOptions {
  /** Use compact notation (`$15k`) for values ≥ 100,000 cents (= $1,000). */
  compact?: boolean
  /** What to render when `cents === 0`. Defaults to `$0`. */
  zeroLabel?: string
}

const USD_NO_DECIMALS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Format a cents value as USD. */
export function money(cents: number, opts: MoneyOptions = {}): string {
  if (cents === 0 && opts.zeroLabel) return opts.zeroLabel
  if (opts.compact && cents >= 100_000) {
    const k = cents / 100_000
    // Whole thousands ($15k), else one decimal ($14.8k).
    return '$' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k'
  }
  return USD_NO_DECIMALS.format(cents / 100)
}

/** Minute-precision relative time. Surfaces meant for "live" feeds + recent calls. */
export function fmtAgo(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

/** Day-precision relative time. Surfaces showing service intervals, review ages, etc. */
export function fmtAgoCoarse(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—'
  const days = Math.floor((now - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'today'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${(days / 365).toFixed(1)}yr ago`
}
