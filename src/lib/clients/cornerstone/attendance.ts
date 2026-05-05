/**
 * Cornerstone — Sunday attendance time-series.
 *
 * 26 weeks of weekly attendance + a prior-year mirror window so the
 * Metrics screen can answer "are we growing?" with a YoY compare.
 *
 * Each row carries:
 *   • adults / kids split (kids = the leading indicator)
 *   • 9 AM vs 11 AM service split
 *   • visitors_first_time + visitors_returning (so we can show the
 *     "where new energy comes from" curve)
 */

export interface WeeklyAttendance {
  /** ISO date for that Sunday */
  sunday: string
  /** Human label like "Apr 28" */
  label: string
  adults: number
  kids: number
  total: number
  service_9am: number
  service_11am: number
  visitors_first_time: number
  visitors_returning: number
  baptisms: number
  new_members: number
}

// Build a deterministic 26-week window ending last Sunday so the
// chart looks the same across renders.
function lastSundayBefore(now: Date): Date {
  const d = new Date(now)
  const day = d.getDay()
  // 0 = Sun. If today is Sun, use last Sun (7 days back).
  const offset = day === 0 ? 7 : day
  d.setDate(d.getDate() - offset)
  d.setHours(10, 0, 0, 0)
  return d
}

function shortLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Generates the curve. Calibrated for a healthy ~400-attendance church
 * with mild growth, summer dip, fall spike, Easter bump, Christmas bump.
 */
function buildSeries(weeks: number, opts: {
  base_adult: number
  base_kid: number
  yearOffsetWeeks?: number
  growth?: number
}): WeeklyAttendance[] {
  const out: WeeklyAttendance[] = []
  const today = new Date()
  const lastSun = lastSundayBefore(today)
  const yearShiftDays = (opts.yearOffsetWeeks ?? 0) * 7

  // Seasonal wave (52-week period) — peaks at week 12 (Easter) + week 50 (Christmas)
  function seasonalFactor(weekOfYear: number): number {
    const easterPeak = 1 + 0.10 * Math.exp(-Math.pow((weekOfYear - 14) / 4, 2))
    const xmasPeak  = 1 + 0.18 * Math.exp(-Math.pow((weekOfYear - 51) / 3, 2))
    const summerDip = 1 - 0.08 * Math.exp(-Math.pow((weekOfYear - 30) / 5, 2))
    const back2school = 1 + 0.05 * Math.exp(-Math.pow((weekOfYear - 36) / 3, 2))
    return easterPeak * xmasPeak * summerDip * back2school
  }

  for (let i = weeks - 1; i >= 0; i--) {
    const sun = new Date(lastSun)
    sun.setDate(sun.getDate() - i * 7 - yearShiftDays)
    const weekOfYear = Math.ceil((sun.getTime() - new Date(sun.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))
    const seasonal = seasonalFactor(weekOfYear)

    // Growth — 0.4% per week compounded forward over the displayed window.
    // For prior-year (opts.growth = 0) we leave flat.
    const growthFactor = (opts.growth ?? 0.004) === 0
      ? 1
      : Math.pow(1 + (opts.growth ?? 0.004), weeks - 1 - i)

    // Per-week noise — sin wave for "weather/holiday/etc" small variance
    const noise = 1 + 0.04 * Math.sin(i * 1.7 + (opts.yearOffsetWeeks ?? 0))

    const adults = Math.round(opts.base_adult * seasonal * growthFactor * noise)
    const kids   = Math.round(opts.base_kid   * seasonal * growthFactor * noise * (1 + 0.02 * Math.cos(i * 0.9)))
    const total = adults + kids

    // 9 AM is family-heavy (slightly more kids), 11 AM is adult-heavy
    const service_9am  = Math.round(adults * 0.42 + kids * 0.62)
    const service_11am = total - service_9am

    // Visitors — first-time spike on weeks where we'd push events
    const ftBase = Math.max(0, Math.round(2 + 4 * Math.sin(i * 0.7)))
    const ftPush = (i % 5 === 0) ? 3 : 0
    const visitors_first_time = ftBase + ftPush
    const visitors_returning = Math.max(0, Math.round(visitors_first_time * 0.45))

    // Baptisms — clustered in spring + fall
    const isBaptismSunday = (i % 8 === 2 || i % 8 === 5)
    const baptisms = isBaptismSunday ? Math.floor(2 + Math.random() * 3) : 0

    // New members — small steady drip + cohort spike post Discover Cornerstone
    const isCohortSunday = (i % 6 === 1)
    const new_members = isCohortSunday ? Math.floor(3 + Math.random() * 3) : (i % 3 === 0 ? 1 : 0)

    out.push({
      sunday: sun.toISOString().slice(0, 10),
      label: shortLabel(sun),
      adults,
      kids,
      total,
      service_9am,
      service_11am,
      visitors_first_time,
      visitors_returning,
      baptisms,
      new_members,
    })
  }
  return out
}

// 26 weeks ending last Sunday, mild growth
export function weeklyAttendance(): WeeklyAttendance[] {
  return buildSeries(26, { base_adult: 230, base_kid: 145, growth: 0.004 })
}

// Prior-year mirror window (52 weeks earlier), flat — used for YoY compare
export function priorYearAttendance(): WeeklyAttendance[] {
  return buildSeries(26, { base_adult: 220, base_kid: 138, yearOffsetWeeks: 52, growth: 0 })
}

export interface AttendanceStats {
  /** Most recent Sunday total */
  last_sunday: number
  /** Average over the trailing 4 Sundays */
  avg_4w: number
  /** Average over the trailing 12 Sundays */
  avg_12w: number
  /** Same week last year (single-week point compare) */
  same_week_last_year: number
  /** YoY trailing-12 — current 12-week avg vs prior-year same 12-week avg */
  yoy_12w_pct: number
  /** Last 12-week avg of kids attendance */
  avg_kids_12w: number
  /** Last 12-week avg of adults */
  avg_adults_12w: number
  /** Visitors first-time over last 4 weeks */
  first_time_visitors_4w: number
  /** Baptisms last 12 weeks */
  baptisms_12w: number
  /** New members last 12 weeks */
  new_members_12w: number
  /** 9 AM share of last-12-week attendance */
  service_9am_share: number
}

export function attendanceStats(): AttendanceStats {
  const cur = weeklyAttendance()
  const prior = priorYearAttendance()
  const last = cur[cur.length - 1]
  const trailing4 = cur.slice(-4)
  const trailing12 = cur.slice(-12)
  const priorTrailing12 = prior.slice(-12)
  const cur12Avg = trailing12.reduce((s, w) => s + w.total, 0) / trailing12.length
  const priorAvg = priorTrailing12.reduce((s, w) => s + w.total, 0) / priorTrailing12.length
  const total9 = trailing12.reduce((s, w) => s + w.service_9am, 0)
  const total11 = trailing12.reduce((s, w) => s + w.service_11am, 0)

  return {
    last_sunday: last.total,
    avg_4w: Math.round(trailing4.reduce((s, w) => s + w.total, 0) / trailing4.length),
    avg_12w: Math.round(cur12Avg),
    same_week_last_year: prior[prior.length - 1].total,
    yoy_12w_pct: priorAvg > 0 ? (cur12Avg - priorAvg) / priorAvg : 0,
    avg_kids_12w: Math.round(trailing12.reduce((s, w) => s + w.kids, 0) / trailing12.length),
    avg_adults_12w: Math.round(trailing12.reduce((s, w) => s + w.adults, 0) / trailing12.length),
    first_time_visitors_4w: trailing4.reduce((s, w) => s + w.visitors_first_time, 0),
    baptisms_12w: trailing12.reduce((s, w) => s + w.baptisms, 0),
    new_members_12w: trailing12.reduce((s, w) => s + w.new_members, 0),
    service_9am_share: total9 + total11 > 0 ? total9 / (total9 + total11) : 0,
  }
}
