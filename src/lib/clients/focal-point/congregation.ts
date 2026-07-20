// Focal Point Church - congregation of each flagged person and family, for the
// Brazilian lens (real, from scripts/gen-congregation.mjs).
// Signal: which Sunday service they attend (6pm = Brazilian), backed by group
// membership and, for families, their kids' service. congregationOf resolves a
// person's name OR a family surname OR the "The {Name} family" display form.
// Guests are absent (they sign in at Starting Point, not a service, so they have
// no congregation yet). People with no check-in signal are absent too and only
// show in the 'all' scope.
// LOCAL OVERRIDE (skip-worktree): real names live on disk only, never in git.
export type Congregation = "brazilian" | "english"
export const focalPointCongregation: Record<string, Congregation> = {}
const norm = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim()
export function congregationOf(name: string): Congregation | null {
  const k = norm(name)
  if (focalPointCongregation[k]) return focalPointCongregation[k]
  // family display form: "The {Name} family" -> "{name}"
  const fam = k.replace(/^the\s+/, "").replace(/\s+family$/, "").trim()
  return focalPointCongregation[fam] ?? null
}
export const focalPointCongregationStats = {
  brazilianGroups: 13,
  englishGroups: 47,
  brazilianPeople: 277,
  englishPeople: 655,
}
