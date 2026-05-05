// Hardcoded fantasy-sports calendar for the social planner. Used to give
// the AI temporal context — "what's actually happening in fantasy this
// week?" — so suggested posts feel reactive instead of generic.
//
// Update this once a year (or as schedules shift). Dates are inclusive
// start-of-day in UTC; "primary" sports get more weight in the planner
// prompt (their fans are most active and posts about them perform best).

export interface SportSeason {
  sport: 'football' | 'baseball' | 'basketball' | 'hockey'
  label: string
  // Regular season window (when most of the engagement happens).
  regular_start: string  // ISO date
  regular_end: string
  // Playoff window — engagement spikes again here.
  playoffs_start?: string
  playoffs_end?: string
  // Pre-season "draft hype" window — when fantasy users are most active
  // before games actually start.
  draft_start?: string
  draft_end?: string
  // Tentpole moments worth posting about.
  events: { date: string; label: string; weight: 'high' | 'medium' }[]
}

// 2025-26 calendar baseline. Adjust yearly.
export const SPORT_SEASONS: SportSeason[] = [
  {
    sport: 'football',
    label: 'NFL',
    regular_start: '2025-09-04',
    regular_end: '2026-01-04',
    playoffs_start: '2026-01-10',
    playoffs_end: '2026-02-08',
    draft_start: '2025-08-01',
    draft_end: '2025-09-04',
    events: [
      { date: '2025-09-04', label: 'NFL Week 1 kickoff', weight: 'high' },
      { date: '2025-10-01', label: 'Trade-deadline buzz starts', weight: 'medium' },
      { date: '2025-11-04', label: 'NFL trade deadline', weight: 'high' },
      { date: '2025-11-27', label: 'Thanksgiving slate', weight: 'high' },
      { date: '2025-12-21', label: 'Fantasy championship week', weight: 'high' },
      { date: '2026-02-08', label: 'Super Bowl', weight: 'high' },
    ],
  },
  {
    sport: 'baseball',
    label: 'MLB',
    regular_start: '2026-03-26',
    regular_end: '2026-09-27',
    playoffs_start: '2026-09-29',
    playoffs_end: '2026-11-01',
    draft_start: '2026-02-15',
    draft_end: '2026-03-26',
    events: [
      { date: '2026-03-26', label: 'MLB Opening Day', weight: 'high' },
      { date: '2026-07-14', label: 'All-Star break', weight: 'medium' },
      { date: '2026-07-31', label: 'MLB trade deadline', weight: 'high' },
      { date: '2026-09-29', label: 'MLB playoffs begin', weight: 'high' },
      { date: '2026-10-26', label: 'World Series', weight: 'high' },
    ],
  },
  {
    sport: 'basketball',
    label: 'NBA',
    regular_start: '2025-10-21',
    regular_end: '2026-04-12',
    playoffs_start: '2026-04-18',
    playoffs_end: '2026-06-21',
    draft_start: '2025-09-15',
    draft_end: '2025-10-21',
    events: [
      { date: '2025-10-21', label: 'NBA Opening Night', weight: 'high' },
      { date: '2026-02-05', label: 'NBA trade deadline', weight: 'high' },
      { date: '2026-02-13', label: 'NBA All-Star break', weight: 'medium' },
      { date: '2026-04-18', label: 'NBA playoffs begin', weight: 'high' },
      { date: '2026-06-04', label: 'NBA Finals begin', weight: 'high' },
    ],
  },
  {
    sport: 'hockey',
    label: 'NHL',
    regular_start: '2025-10-08',
    regular_end: '2026-04-12',
    playoffs_start: '2026-04-18',
    playoffs_end: '2026-06-21',
    draft_start: '2025-09-20',
    draft_end: '2025-10-08',
    events: [
      { date: '2025-10-08', label: 'NHL puck drop', weight: 'medium' },
      { date: '2026-03-06', label: 'NHL trade deadline', weight: 'medium' },
      { date: '2026-04-18', label: 'NHL playoffs begin', weight: 'medium' },
    ],
  },
]

export interface SportContext {
  in_season: { sport: string; label: string; phase: 'draft' | 'regular' | 'playoffs'; week_of_season?: number }[]
  upcoming_events: { date: string; label: string; sport: string; days_away: number; weight: string }[]
  primary_sport: string  // best-guess "what fans care most about right now"
}

// Given a target date, produce a snapshot of where each sport is and
// what tentpoles are coming up in the next 14 days. Feeds the AI prompt.
export function sportContextFor(date: Date): SportContext {
  const target = date.getTime()
  const dayMs = 86400000

  const in_season: SportContext['in_season'] = []
  for (const s of SPORT_SEASONS) {
    let phase: 'draft' | 'regular' | 'playoffs' | null = null
    if (s.draft_start && s.draft_end) {
      if (
        target >= new Date(s.draft_start).getTime() &&
        target <= new Date(s.draft_end).getTime()
      ) {
        phase = 'draft'
      }
    }
    if (
      target >= new Date(s.regular_start).getTime() &&
      target <= new Date(s.regular_end).getTime()
    ) {
      phase = 'regular'
    }
    if (
      s.playoffs_start &&
      s.playoffs_end &&
      target >= new Date(s.playoffs_start).getTime() &&
      target <= new Date(s.playoffs_end).getTime()
    ) {
      phase = 'playoffs'
    }
    if (phase) {
      let week_of_season: number | undefined
      if (phase === 'regular') {
        const start = new Date(s.regular_start).getTime()
        week_of_season = Math.floor((target - start) / dayMs / 7) + 1
      }
      in_season.push({ sport: s.sport, label: s.label, phase, week_of_season })
    }
  }

  // Upcoming events in next 14 days
  const upcoming_events: SportContext['upcoming_events'] = []
  for (const s of SPORT_SEASONS) {
    for (const ev of s.events) {
      const eventTime = new Date(ev.date).getTime()
      const daysAway = Math.round((eventTime - target) / dayMs)
      if (daysAway >= -1 && daysAway <= 14) {
        upcoming_events.push({
          date: ev.date,
          label: ev.label,
          sport: s.label,
          days_away: daysAway,
          weight: ev.weight,
        })
      }
    }
  }
  upcoming_events.sort((a, b) => a.days_away - b.days_away)

  // Primary sport heuristic: NFL during NFL season, MLB during MLB season,
  // tie-break NFL (largest fantasy base year-round).
  let primary = 'NFL'
  const phasePriority: Record<string, number> = { regular: 3, playoffs: 2, draft: 1 }
  let bestScore = 0
  for (const s of in_season) {
    let score = phasePriority[s.phase] ?? 0
    if (s.label === 'NFL') score += 1
    if (s.label === 'MLB' && s.phase === 'regular') score += 0.5
    if (score > bestScore) {
      bestScore = score
      primary = s.label
    }
  }

  return { in_season, upcoming_events, primary_sport: primary }
}
