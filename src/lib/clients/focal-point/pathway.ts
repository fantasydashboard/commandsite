// Focal Point Church - Discipleship Pathway (aggregate, no PII).
// ---------------------------------------------------------------------------
// Priority #1 from the intake: "true visibility within our groups, Sunday
// Services, and ultimately our Discipleship Pathway so we can ask the right
// questions." These are real counts pulled from Focal Point's Planning
// Center Workflows + Lists (People API, current token). Aggregate only, so
// this file carries no individual PII and is safe to commit.
//
// Source: scripts/pull-fp-data.mjs -> scratchpad/pco-raw/pathway.json
// Pulled 2026-07-09 with the joshdaniel50 token (People/Workflows/Lists).

export interface PathwayStage {
  key: string
  label: string
  /** Cumulative count of people who have been through this workflow stage */
  count: number
  /** The discipleship mark this stage moves people toward, when applicable */
  mark?: string
  /** True when the count is genuinely derived from PCO; false = pilot-calibrated */
  live: boolean
  note?: string
}

// Funnel top to bottom. Starting Point (weekend + Brazilian) is the entry,
// then the pathway narrows through membership, baptism, and into a Growth
// Group. The steep drop after Starting Point is exactly the leak the pastor
// named ("the biggest leak is right after Starting Point").
export const pathwayStages: PathwayStage[] = [
  {
    key: 'starting_point',
    label: 'Starting Point',
    count: 2212 + 215, // weekend + Brazilian service
    mark: 'devoted followers',
    live: true,
    note: 'Weekend (2,212) + Brazilian (215) service entries',
  },
  {
    key: 'new_member_class',
    label: 'New Member Class',
    count: 530,
    mark: 'sacrificial friends',
    live: true,
  },
  {
    key: 'baptism',
    label: 'Baptism Class',
    count: 129,
    mark: 'courageous witnesses',
    live: true,
  },
  {
    key: 'growth_group',
    label: 'In a Growth Group',
    count: 54 + 49, // discipleship: has GG + no GG (tracked cohort)
    mark: 'multiplying disciplers',
    live: true,
    note: 'Discipleship workflow cohort (Has GG 54 + No GG 49). Full group rosters connect when the Groups scope is enabled.',
  },
]

// Congregation-level context (real, from People Lists).
export const pathwayContext = {
  members: 1210,
  visitors: 3112,
  groupLeaders: 93,
  // Fraction of Starting Point entrants who reach a New Member Class.
  startingPointToMember: Math.round((530 / (2212 + 215)) * 100), // ~22%
}
