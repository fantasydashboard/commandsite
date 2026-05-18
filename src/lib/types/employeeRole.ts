/**
 * Shared role type for both Ada (local services) and Grace (church).
 *
 * Both personas have the same structural model: a named role with an
 * icon, status, weekly activity count, and a per-event minutes-saved
 * rate that powers the "Hub saved you X hours this week" math.
 * Persona-specific catalogs (`apex/roles.ts`, `cornerstone/roles.ts`)
 * import from here so shared components (`AdaAtWorkHub`, `RolesOnPage`,
 * `LiveActivityFeed`) accept either client's data without forking.
 */

export type RoleStatus = 'active' | 'configured' | 'setup_needed'

export interface EmployeeRole {
  /** Stable identifier — used as URL hash for deep-link from Hub. */
  key: string
  /** AdaIcon name (preferred) or emoji fallback. */
  icon: string
  /** Display label, e.g. "Front Desk". */
  name: string
  /** One-line description shown on the Hub tile. */
  description: string
  /** Which dashboard tab this role's data + actions live on. */
  tab: string
  /** active / configured / setup_needed — drives status badge. */
  status: RoleStatus
  /** Qualitative one-line "what happened this week" snippet. */
  this_week_snippet: string
  /** Events this role handled this week — the count on the Hub tile. */
  this_week_count: number
  /** Owner's minutes saved per event. Per-client/per-vertical rate. */
  minutes_saved_per_event: number
}

export const ROLE_STATUS_META: Record<RoleStatus, { label: string; pillClass: string }> = {
  active:        { label: 'Active',         pillClass: 'bg-success/15 text-success' },
  configured:    { label: 'Configured',     pillClass: 'bg-brand/15 text-brand' },
  setup_needed:  { label: 'Setup needed',   pillClass: 'bg-warn/15 text-warn' },
}
