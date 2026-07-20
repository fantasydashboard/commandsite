// Focal Point Church - guest pipeline (real, from the two Starting Point
// workflows via scripts/gen-guest-pipeline.mjs). Each guest is tagged by
// congregation (English weekend service vs Brazilian service) so Front Desk &
// Guests scopes. Stage from the follow-up step. LOCAL OVERRIDE (skip-worktree):
// real congregant names live on disk only, never in git.
export type GuestStage = 'new' | 'welcomed' | 'connecting' | 'belongs' | 'cooled'
export type GuestCampus = 'english' | 'brazilian'
export const GUEST_STAGES: { key: GuestStage; label: string; positive?: boolean; leak?: boolean }[] = [
  { key: 'new', label: 'New guest' },
  { key: 'welcomed', label: 'Welcomed' },
  { key: 'connecting', label: 'Connecting' },
  { key: 'belongs', label: 'Belongs', positive: true },
  { key: 'cooled', label: 'Cooled', leak: true },
]
export interface GuestCase {
  id: string
  name: string
  campus: GuestCampus
  stage: GuestStage
  detail: string
  owner: string
  age: string
  note?: string
  draft?: string
  outcome?: string
}
export interface GuestKpis { recentGuests: number; firstTimers4w: number; stillVisitors: number; completedPct: number }
export const guestPipeline: { cases: GuestCase[]; kpis: Record<'all' | GuestCampus, GuestKpis> } = {
  cases: [],
  kpis: { all: { recentGuests: 0, firstTimers4w: 0, stillVisitors: 0, completedPct: 0 }, english: { recentGuests: 0, firstTimers4w: 0, stillVisitors: 0, completedPct: 0 }, brazilian: { recentGuests: 0, firstTimers4w: 0, stillVisitors: 0, completedPct: 0 } },
}
export function guestKpis(scope: 'all' | GuestCampus): GuestKpis {
  return guestPipeline.kpis[scope]
}
