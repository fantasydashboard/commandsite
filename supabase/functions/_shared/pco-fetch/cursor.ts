export interface ScheduleCursor { serviceTypeIds: string[]; stIndex: number; planIds: { id: string; date: string }[]; planIndex: number }
// `type` is the Planning Center group type, carried so membership rows can be
// broken down by it without a second lookup. Optional: a cursor persisted
// before this existed resumes without it and simply records an empty type
// until the next full pass.
export interface GroupsCursor { groups: { id: string; name: string; type?: string }[]; gIndex: number }
export interface KidsCursor { events: string[]; eIndex: number }
export interface GuestsCursor { workflows: { id: string; campus: string }[]; wIndex: number }
export interface PeopleCursor { offset: number }
export interface HouseholdsCursor { offset: number }

// Returns a function that reports whether the time budget has elapsed. Check it
// before starting each new expensive unit (a plan, a group) so a chunk always
// stops cleanly under the platform ceiling.
export function makeDeadline(budgetSeconds: number): () => boolean {
  const end = Date.now() + budgetSeconds * 1000
  return () => Date.now() >= end
}
