export type Campus = 'english' | 'brazilian' | 'both'
export interface ServingDated { date: string; team: string; status: string }
export interface PersonRec { name: string; dates: ServingDated[] }
export type ByPerson = Record<string, PersonRec>

export interface ServingCfg { regularMin: number; gapWeeks: number; lookbackMonths: number }
export interface BurnoutCfg { seasonMonths: number }
export interface GroupDriftCfg {
  seasonStart: string; seasonEnd: string; minEvents: number;
  minAttendance: number; minGapWeeks: number; groupTypeMatch: string; eventsPerGroup?: number
}
export interface FetchCfg { timeBudgetSeconds?: number; incrementalWindowDays?: number }
export interface PcoConfig {
  staffNames: string[]; serving: ServingCfg; burnout: BurnoutCfg; groupDrift: GroupDriftCfg; fetch?: FetchCfg
  drift?: { windowMonths: number; sundaysMissed: number; minEstablishedSundays: number; kidsEventMatch: string }
}

export interface ServingPerson { name: string; area: string; campus: Campus; monthsServing: number; totalServed: number; lastServed: string; weeksSince: number }
export interface ServingPayload { flaggedPeople: number; totalVolunteers: number; signal: string; people: ServingPerson[]; drafts: [] }
export interface BurnoutPerson { name: string; areas: string[]; campus: Campus; perMonth: number; tier: 'high' | 'medium' }
export interface BurnoutPayload { flaggedPeople: number; highRisk: number; activeVolunteers: number; signal: string; people: BurnoutPerson[]; drafts: [] }
export interface GroupDrifter { name: string; group: string; attended: number; weeksSince: number }
export interface GroupDriftPayload { flagged: number; groups: number; people: GroupDrifter[] }
