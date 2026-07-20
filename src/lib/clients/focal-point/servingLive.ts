// Serving reconciliation is now handled at the SOURCE. The stopped-serving list
// (serving.ts) is built from Planning Center Services scheduling and already
// excludes anyone with a recent or upcoming confirmation, so a flagged person can
// never also be "currently serving." That makes the old check-in-based "resumed"
// reconciliation obsolete: there is nothing to reconcile off, the schedule did it.
// These exports remain so callers (PeopleDrift, RecentWins, board, priority) keep
// compiling; they intentionally report "nobody resumed" now.
export interface ServingResumer {
  name: string
  area: string
  resumedOn: string
}

export function servingResumed(_name?: string, _lastServed?: string): boolean {
  return false
}
export function servingResumedByName(_name?: string): boolean {
  return false
}
export function servingResumedCount(): number {
  return 0
}
export function servingResumers(): ServingResumer[] {
  return []
}
