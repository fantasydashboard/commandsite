// Focal Point Church - this Sunday's roster readiness (real, from Planning Center
// Services). Team gaps are aggregate (no PII) and real. Suggested names are
// individual congregants, so this follows the skip-worktree pattern: the
// COMMITTED version uses generic labels, the local on-disk version names the real
// people. Regenerate with scripts/gen-roster-live.mjs after the pulls; do not
// hand-edit, and never carry suggestions across pulls (they are burnout-aware
// and go stale).
// Generated 2026-08-11 from the 2026-08-16 plan.
export interface RosterGap {
  team: string
  short: number
  suggest: string[]
  /** People who have served this team and are NOT already over-serving. 0 means
   *  everyone qualified is at high load, which is a different problem from
   *  having no volunteer pool at all. */
  pool: number
  skip?: { name: string; reason: string }
  fresh?: string
}

export const focalPointRoster: {
  date: string
  sundayLabel: string
  totalShort: number
  teamsShort: number
  gaps: RosterGap[]
} = {
  date: '2026-08-16',
  sundayLabel: 'Sun Aug 16',
  totalShort: 30,
  teamsShort: 9,
  gaps: [
    { team: "Safety Team", short: 15, suggest: ["Volunteer A","Volunteer B"], pool: 13, skip: { name: "a high-load volunteer", reason: "already 6x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "Vocals", short: 5, suggest: ["Volunteer C","Volunteer D"], pool: 11, skip: { name: "a high-load volunteer", reason: "already 3x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "Growth Group Agenda Writers", short: 2, suggest: ["Volunteer E"], pool: 1, skip: { name: "a high-load volunteer", reason: "already 3x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "Worship", short: 2, suggest: [], pool: 0 },
    { team: "Ushers", short: 2, suggest: ["Volunteer F","Volunteer G"], pool: 31, skip: { name: "a high-load volunteer", reason: "already 3x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "Reception Team", short: 1, suggest: ["Volunteer H","Volunteer I"], pool: 8, fresh: "someone who has served this team before and has room" },
    { team: "Translation Team", short: 1, suggest: [], pool: 0 },
    { team: "Hospitality", short: 1, suggest: ["Volunteer J","Volunteer K"], pool: 21, skip: { name: "a high-load volunteer", reason: "already 6x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "First Impressions Team ", short: 1, suggest: [], pool: 0 },
  ],
}
