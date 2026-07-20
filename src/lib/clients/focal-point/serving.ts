// Focal Point Church - People Drift Watch (real serving drift, from Planning
// Center SERVICES scheduling via scripts/gen-serving.mjs). "Stopped serving" =
// a regular server (4+ confirmed dates) whose last served date is 6+ weeks ago
// AND who has nothing upcoming on the schedule. Check-ins are NOT used: they
// undercount (people serve without checking in, whole teams skip the kiosk), so a
// missing check-in never means someone stopped. Staff/admins excluded.
// LOCAL OVERRIDE (skip-worktree): real names live on disk only, never in git.
export interface ServingDriftPerson { name: string; area: string; campus: "english" | "brazilian" | "both"; monthsServing: number; totalServed: number; lastServed: string; weeksSince: number }
export interface ServingDraft { id: string; name: string; area: string; context: string; draft: string }
export const focalPointServing: {
  flaggedPeople: number; totalVolunteers: number; signal: string; people: ServingDriftPerson[]; drafts: ServingDraft[]
} = { flaggedPeople: 0, totalVolunteers: 0, signal: "Regular volunteers, by the Services schedule, who have not been scheduled to serve in 6+ weeks and have nothing upcoming. A personal check-in with the individual, not the household.", people: [], drafts: [] }
