// Focal Point Church - this Sunday's roster readiness (real, from Planning Center
// Services). Team gaps are aggregate (no PII) and real. Suggested names are
// individual congregants, so this follows the skip-worktree pattern: the
// COMMITTED version uses generic labels, the local on-disk version names the real
// people. Regenerate with scripts/gen-roster-live.mjs after the pulls; do not
// hand-edit, and never carry suggestions across pulls (they are burnout-aware
// and go stale).
// Generated 2026-08-21 from the 2026-08-23 plan.
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
  date: '2026-08-23',
  sundayLabel: 'Sun Aug 23',
  totalShort: 24,
  teamsShort: 10,
  gaps: [
    { team: "Safety Team", short: 7, suggest: ["Volunteer A","Volunteer B"], pool: 13, skip: { name: "a high-load volunteer", reason: "already 5x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "Vocals", short: 5, suggest: ["Volunteer C","Volunteer D"], pool: 11, skip: { name: "a high-load volunteer", reason: "already 3x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "Hospitality", short: 2, suggest: ["Volunteer E","Volunteer F"], pool: 20, skip: { name: "a high-load volunteer", reason: "already 6x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "Media Team", short: 2, suggest: ["Volunteer G","Volunteer H"], pool: 14, skip: { name: "a high-load volunteer", reason: "already 6x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "Ushers", short: 2, suggest: ["Volunteer I","Volunteer J"], pool: 31, skip: { name: "a high-load volunteer", reason: "already 3x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "Parking Team", short: 2, suggest: ["Volunteer K","Volunteer L"], pool: 3, skip: { name: "a high-load volunteer", reason: "already 5x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "Growth Group Agenda Writers", short: 1, suggest: ["Volunteer M"], pool: 1, skip: { name: "a high-load volunteer", reason: "already 2x/month" }, fresh: "someone who has served this team before and has room" },
    { team: "Reception Team", short: 1, suggest: ["Volunteer N","Volunteer O"], pool: 8, fresh: "someone who has served this team before and has room" },
    { team: "Translation Team", short: 1, suggest: [], pool: 0 },
    { team: "Worship", short: 1, suggest: [], pool: 0 },
  ],
}
