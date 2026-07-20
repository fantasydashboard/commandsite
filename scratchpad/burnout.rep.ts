// Focal Point Church - Burnout Watch (real serving load, from Planning Center
// SERVICES scheduling via scripts/gen-burnout.mjs). Flagged = scheduled 3+ times a
// month OR across 2+ teams; high = 4+/month OR 3+ teams. Check-ins are not used
// (they undercount serving). Staff excluded.
// LOCAL OVERRIDE (skip-worktree): real names live on disk only, never in git.
export interface BurnoutPerson { name: string; areas: string[]; campus: "english" | "brazilian" | "both"; perMonth: number; tier: "high" | "medium" }
export interface BurnoutDraft { id: string; name: string; context: string; draft: string }
export const focalPointBurnout: { flaggedPeople: number; highRisk: number; activeVolunteers: number; signal: string; people: BurnoutPerson[]; drafts: BurnoutDraft[] } = {
  flaggedPeople: 0, highRisk: 0, activeVolunteers: 0,
  signal: "Volunteers scheduled 3+ times a month, often across several teams, and still going. The people most likely to burn out and drop next. Today's over-servers are next quarter's drift.",
  people: [], drafts: [],
}
