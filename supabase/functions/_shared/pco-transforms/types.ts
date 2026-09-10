export type Campus = 'english' | 'brazilian' | 'both'
export interface ServingDated { date: string; team: string; status: string }
export interface PersonRec { name: string; dates: ServingDated[] }
export type ByPerson = Record<string, PersonRec>

export interface ServingCfg { regularMin: number; gapWeeks: number; lookbackMonths: number }
export interface BurnoutCfg { seasonMonths: number }
export interface GroupDriftCfg {
  seasonStart: string;
  /** Absent means the season is STILL RUNNING and ends today. A date closes the
   *  window deliberately, for looking at a finished season. */
  seasonEnd?: string;
  minEvents: number;
  minAttendance: number; minGapWeeks: number; groupTypeMatch: string; eventsPerGroup?: number
}
export interface FetchCfg { timeBudgetSeconds?: number; incrementalWindowDays?: number }
export interface PcoConfig {
  staffNames: string[]; serving: ServingCfg; burnout: BurnoutCfg; groupDrift: GroupDriftCfg; fetch?: FetchCfg
  /** Old team name -> current team name. Churches merge and rename teams, and
   *  Planning Center keeps the historical rows under the old name. Without this
   *  a merge reads as two teams, which inflates "serves on several teams" and
   *  splits one person's rhythm into two thinner ones. */
  teamAliases?: Record<string, string>
  drift?: { windowMonths: number; sundaysMissed: number; minEstablishedSundays: number; kidsEventMatch: string }
  // windowMonths = RETENTION (history kept for the monthly trend).
// activeDays  = the WORKLIST span the board + KPIs run on. Different spans on purpose.
  guests?: { englishWorkflowId: string; brazilianWorkflowId: string; windowMonths: number; activeDays?: number }
  duplicates?: { keepTopClusters: number; minNameLen: number }
}

export interface ServingPerson { name: string; area: string; campus: Campus; monthsServing: number; totalServed: number; lastServed: string; weeksSince: number }
export interface ServingPayload {
  flaggedPeople: number; totalVolunteers: number; signal: string; people: ServingPerson[]; drafts: []
  /** People NOT flagged because every team they served on has stopped running.
   *  A retired service makes its whole roster look like it drifted at once. */
  retiredTeamExcluded?: number
  retiredTeams?: string[]
}
/** One congregation's share of a person's load. tier null = does not clear the
 *  burnout bar in THIS congregation, even though they clear it church-wide. */
export interface BurnoutSlice { perMonth: number; areas: string[]; tier: 'high' | 'medium' | null }
export interface BurnoutPerson {
  name: string; areas: string[]; campus: Campus; perMonth: number; tier: 'high' | 'medium'
  /** Load split by which service the shift was for. A volunteer who serves the
   *  6pm Brazilian service seven times and an English service twice is a
   *  burnout risk to one ministry leader and a light load to the other; a
   *  single church-wide number is wrong for both of them. */
  byCampus: { english: BurnoutSlice; brazilian: BurnoutSlice }
}
export interface BurnoutPayload { flaggedPeople: number; highRisk: number; activeVolunteers: number; signal: string; people: BurnoutPerson[]; drafts: [] }
export interface GroupDrifter { name: string; group: string; attended: number; weeksSince: number }
export interface GroupDriftPayload { flagged: number; groups: number; people: GroupDrifter[] }
