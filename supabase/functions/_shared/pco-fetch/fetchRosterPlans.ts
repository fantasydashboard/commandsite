import { pcoAll, pcoGet } from '../pco-paginate.ts'
import type { PlanSnapshot, TeamCounts } from '../pco-transforms/roster.ts'

/**
 * Pulls the Planning Center Services plans the roster is built from: the last
 * few Sundays (to learn which teams normally run) and the next few (to see what
 * is short).
 *
 * Unlike the other resources this stages nothing. Roster data is a snapshot with
 * no historical value: last week's shortfall is not something anyone will query
 * later, and keeping it would mean a table that only ever gets overwritten. So
 * it fetches, hands the flattened plans to the pure transform, and the payload
 * is the only thing stored.
 *
 * Bounded by construction: PAST_PLANS + FUTURE_PLANS plans, two calls each, so
 * roughly two dozen requests. That fits a single run comfortably and is why this
 * needs no cursor, unlike the paging resources.
 */

const PAST_PLANS = 8
const FUTURE_PLANS = 4
const SVC = '/services/v2'

/** Names the Sunday service type. Configurable because not every church calls it
 *  the same thing, with the common default as the fallback. */
export interface RosterCfg { serviceTypeMatch?: string }

function teamNamesFrom(included: Record<string, unknown>[] | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of included ?? []) {
    const rec = i as { type?: string; id?: string; attributes?: { name?: string } }
    if (rec.type === 'Team' && rec.id) out[rec.id] = (rec.attributes?.name ?? '').trim()
  }
  return out
}

/** One plan flattened into the shape the transform expects. */
async function planSnapshot(tenant: string, planId: string, date: string): Promise<PlanSnapshot> {
  // Who is scheduled, split by confirmation status.
  const tm = await pcoGet(tenant, `${SVC}/plans/${planId}/team_members?per_page=200&include=team`)
  const tmNames = teamNamesFrom(tm.included)
  const teams: Record<string, TeamCounts> = {}
  for (const m of tm.data ?? []) {
    const row = m as { relationships?: { team?: { data?: { id?: string } } }; attributes?: { status?: string } }
    const team = tmNames[row.relationships?.team?.data?.id ?? ''] || 'Unknown'
    const s = (row.attributes?.status ?? '').toLowerCase()
    const t = (teams[team] ??= { C: 0, U: 0, D: 0, total: 0 })
    t.total++
    if (s.startsWith('c')) t.C++
    else if (s.startsWith('u')) t.U++
    else if (s.startsWith('d')) t.D++
  }

  // What is still needed, and specifically which positions.
  const np = await pcoGet(tenant, `${SVC}/plans/${planId}/needed_positions?per_page=100&include=team`)
  const npNames = teamNamesFrom(np.included)
  const need: Record<string, number> = {}
  const positions: Record<string, { pos: string; qty: number }[]> = {}
  for (const n of np.data ?? []) {
    const row = n as {
      relationships?: { team?: { data?: { id?: string } } }
      attributes?: { quantity?: number; team_position_name?: string }
    }
    const team = npNames[row.relationships?.team?.data?.id ?? ''] || row.attributes?.team_position_name || 'Other'
    const qty = row.attributes?.quantity ?? 1
    need[team] = (need[team] ?? 0) + qty
    const pos = (row.attributes?.team_position_name ?? '').trim()
    if (pos) (positions[team] ??= []).push({ pos, qty })
  }

  return { date, teams, need, positions }
}

export async function fetchRosterPlans(
  tenant: string,
  cfg: RosterCfg = {},
): Promise<{ past: PlanSnapshot[]; future: PlanSnapshot[] }> {
  const match = new RegExp(cfg.serviceTypeMatch ?? 'sunday service', 'i')
  const types = await pcoAll(tenant, `${SVC}/service_types?per_page=100`)
  const sunday = types.find((t) => match.test(((t as { attributes?: { name?: string } }).attributes?.name ?? '')))
  // No matching service type is a configuration problem, not a transient one, so
  // say which name was looked for rather than failing with an empty roster.
  if (!sunday) throw new Error(`No service type matching /${match.source}/i. Set pco_config.roster.serviceTypeMatch.`)
  const stId = (sunday as { id: string }).id

  const dateOf = (p: unknown) => ((p as { attributes?: { sort_date?: string } }).attributes?.sort_date ?? '').slice(0, 10)
  const idOf = (p: unknown) => (p as { id: string }).id

  const pastPlans = (await pcoGet(tenant, `${SVC}/service_types/${stId}/plans?filter=past&per_page=${PAST_PLANS}&order=-sort_date`)).data ?? []
  const futurePlans = (await pcoGet(tenant, `${SVC}/service_types/${stId}/plans?filter=future&per_page=${FUTURE_PLANS}&order=sort_date`)).data ?? []

  const past: PlanSnapshot[] = []
  for (const p of pastPlans) past.push(await planSnapshot(tenant, idOf(p), dateOf(p)))
  const future: PlanSnapshot[] = []
  for (const p of futurePlans) future.push(await planSnapshot(tenant, idOf(p), dateOf(p)))

  return { past, future }
}
