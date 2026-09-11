// Focal Point Church - Discipleship Pathway (aggregate, no PII).
// ---------------------------------------------------------------------------
// Priority #1 from the intake: "true visibility within our groups, Sunday
// Services, and ultimately our Discipleship Pathway so we can ask the right
// questions." Real counts from Focal Point's Planning Center Workflows and
// Groups. Aggregate only, so this file carries no individual PII and is safe
// to commit.
//
// Pulled 2026-09-11 (workflow card totals, live group memberships). A snapshot,
// not the nightly sync; the page dates it.

export interface PathwayStage {
  key: string
  label: string
  /** Cumulative count of people who have been through this workflow stage */
  count: number
  /** The discipleship mark this stage moves people toward, when applicable */
  mark?: string
  /** True when the count is genuinely derived from PCO; false = pilot-calibrated */
  live: boolean
  /** False when the count is a different population from the Starting Point
   *  entrants above it, so "% of Starting Point" would be a false ratio. */
  shareOfTop?: boolean
  note?: string
}

const STARTING_POINT = 2280 + 231 // weekend + Brazilian workflows, all-time cards
const NEW_MEMBER_CLASS = 535

// Funnel top to bottom. Starting Point (weekend + Brazilian) is the entry,
// then the pathway narrows through membership and baptism. The steep drop
// after Starting Point is exactly the leak the pastor named ("the biggest leak
// is right after Starting Point").
export const pathwayStages: PathwayStage[] = [
  {
    key: 'starting_point',
    label: 'Starting Point',
    count: STARTING_POINT,
    mark: 'devoted followers',
    live: true,
    note: 'Weekend (2,280) + Brazilian (231) service entries',
  },
  {
    key: 'new_member_class',
    label: 'New Member Class',
    count: NEW_MEMBER_CLASS,
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
  // This row used to read 103, the SUM of a January 2023 discipleship cohort:
  // 54 people who had a growth group plus 49 who did not. Adding the people
  // without a group to "In a Growth Group" was simply wrong, and the cohort
  // itself was one class from two and a half years ago. Now: everyone in an
  // active group today, from the Groups API. That is a different population
  // from the Starting Point entrants above (plenty of group members never
  // came through Starting Point), so no share of the top is shown.
  {
    key: 'growth_group',
    label: 'In a Growth Group',
    count: 943,
    mark: 'multiplying disciplers',
    live: true,
    shareOfTop: false,
    note: 'In a Growth Group counts everyone in an active group today (943 people across 61 groups), not only people who came through Starting Point, so it is not shown as a share of the row above.',
  },
]

// Congregation-level context (real).
export const pathwayContext = {
  asOf: '2026-09-11',
  members: 1218, // the "Members" list in People, refreshed 2026-09-11
  visitors: STARTING_POINT,
  // Distinct people with the leader role in an active group, live from Groups.
  // The old 93 came from a People list last refreshed August 2024.
  groupLeaders: 126,
  // Fraction of Starting Point entrants who reach a New Member Class.
  startingPointToMember: Math.round((NEW_MEMBER_CLASS / STARTING_POINT) * 100), // ~21%
}
