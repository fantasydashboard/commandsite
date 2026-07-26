export interface ScheduleCursor { serviceTypeIds: string[]; stIndex: number; planIds: string[]; planIndex: number }
export interface GroupsCursor { groups: { id: string; name: string }[]; gIndex: number }

// Returns a function that reports whether the time budget has elapsed. Check it
// before starting each new expensive unit (a plan, a group) so a chunk always
// stops cleanly under the platform ceiling.
export function makeDeadline(budgetSeconds: number): () => boolean {
  const end = Date.now() + budgetSeconds * 1000
  return () => Date.now() >= end
}
