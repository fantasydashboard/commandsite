// Focal Point Church - recent activity per flagged person/family, for the detail
// drawer (real, from scripts/gen-activity.mjs). Each row carries the SERVICE
// attended (English 9/10:30/12 vs Brazilian 6pm) so service-switching is visible,
// plus the team (serving) or child (kids). Keyed by person name or family surname;
// activityFor() resolves the "The {Name} family" display form.
// LOCAL OVERRIDE (skip-worktree): real names live on disk only, never in git.
export type Congregation = "brazilian" | "english"
export interface ActivityItem { date: string; label: string; service: string; tone: "serving" | "kids" | "attend" }
export interface PersonActivity { congregation: Congregation | null; items: ActivityItem[] }
export const focalPointActivity: Record<string, PersonActivity> = {}
const norm = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim()
export function activityFor(name: string): PersonActivity | null {
  const k = norm(name)
  if (focalPointActivity[k]) return focalPointActivity[k]
  const fam = k.replace(/^the\s+/, "").replace(/\s+family$/, "").trim()
  return focalPointActivity[fam] ?? null
}
