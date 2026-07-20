// Focal Point Church - this Sunday's roster readiness (real, from Planning Center
// Services). Team gaps are aggregate (no PII) and real. Suggested fill names are
// individual congregants, so this file follows the skip-worktree pattern: the
// COMMITTED version uses generic labels, the local on-disk version names the real
// people. The cheat code is `skip`: Grace will not suggest someone already at
// burnout risk, and `fresh` surfaces capacity from people who rarely serve.
// Source: scripts/pull-roster*.mjs (needed_positions) + serving/burnout data.
export interface RosterGap {
  team: string
  short: number
  suggest: string[]
  skip?: { name: string; reason: string }
  fresh?: string
}

export const focalPointRoster: {
  date: string
  sundayLabel: string
  daysAway: number
  totalShort: number
  teamsShort: number
  gaps: RosterGap[]
} = {
  date: '2026-07-19',
  sundayLabel: 'Sun Jul 19',
  daysAway: 6,
  totalShort: 41,
  teamsShort: 8,
  gaps: [
    { team: 'Safety Team', short: 14, suggest: ['Volunteer A', 'Volunteer B'], skip: { name: 'a high-load volunteer', reason: 'already 6x/month' }, fresh: 'someone who has not served in 9 weeks' },
    { team: 'Ushers', short: 13, suggest: ['Volunteer C', 'Volunteer D'], skip: { name: 'a high-load volunteer', reason: '5x/month across 11 ministries' }, fresh: 'someone with open capacity' },
    { team: 'Parking Team', short: 4, suggest: ['Volunteer E', 'Volunteer F'], fresh: 'someone with open capacity' },
    { team: 'Reception Team', short: 3, suggest: ['Volunteer G', 'Volunteer H'] },
    { team: 'Band', short: 2, suggest: ['Volunteer I', 'Volunteer J'] },
    { team: 'Growth Group Agenda Writers', short: 2, suggest: ['Volunteer K', 'Volunteer L'] },
    { team: 'Hospitality', short: 2, suggest: ['Volunteer M', 'Volunteer N'] },
    { team: 'Translation Team', short: 1, suggest: ['Volunteer O'] },
  ],
}
