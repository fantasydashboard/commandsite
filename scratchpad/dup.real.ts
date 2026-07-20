// Focal Point Church - likely-duplicate profiles in Planning Center (real,
// from scripts/pull-duplicates.mjs, enriched by scripts/gen-duplicates.mjs).
// 463 same-name groups scanned across 13000 active records; the 120
// most likely clusters kept (88 high-confidence). Per-profile serving
// activity is included, plus a reconciliation verdict for anyone on a care list
// (does combining their profiles change what the flag saw?). Three uses:
//   1. warn when a FLAGGED person may have check-ins split across profiles (badge)
//   2. the reconciliation line in the flag drawer (confirmed vs review)
//   3. the Settings "Possible duplicates" review list + Today cleanup card
// Planning Center owns the actual merge; Grace only surfaces the risk.
// LOCAL OVERRIDE (skip-worktree): real names live on disk only, never in git.
export interface DupProfile { id: string; created: string; membership: string; hasContact: boolean; checkins: number; lastServed: string }
export interface DupReconcile { verdict: "confirmed" | "review"; flag: string; activeProfiles: number; mergeTargets: string[]; note: string }
export interface DupInfo {
  name: string
  count: number
  confidence: "high" | "medium"
  sharedEmail: boolean
  sharedPhone: boolean
  profiles: DupProfile[]
  reconcile: DupReconcile | null
}
export const focalPointDuplicates: Record<string, DupInfo> = {
  "kaylani morales": {
    name: "Kaylani Morales",
    count: 6,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "89954124", created: "2021-03-24", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "139104031", created: "2023-12-07", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "139104054", created: "2023-12-07", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "139104084", created: "2023-12-07", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "139104106", created: "2023-12-07", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "139140961", created: "2023-12-08", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "ana rodriguez": {
    name: "Ana Rodriguez",
    count: 4,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "24193335", created: "2017-02-21", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "70768455", created: "2019-12-29", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "106583608", created: "2022-04-09", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "140922329", created: "2024-01-18", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jaleel abdul": {
    name: "Jaleel Abdul",
    count: 4,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "46672732", created: "2019-01-03", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "95209188", created: "2021-07-15", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "118747575", created: "2022-12-13", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "118747709", created: "2022-12-13", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jackie morales": {
    name: "Jackie Morales",
    count: 4,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "89954120", created: "2021-03-24", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "103820227", created: "2022-02-10", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "139103661", created: "2023-12-07", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "139140958", created: "2023-12-08", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jacqueline lópez": {
    name: "Jacqueline López",
    count: 4,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "124189469", created: "2023-04-06", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "124189488", created: "2023-04-06", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "124189490", created: "2023-04-06", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "124189492", created: "2023-04-06", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "nyliam connors": {
    name: "Nyliam Connors",
    count: 4,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "138957109", created: "2023-12-05", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "138957120", created: "2023-12-05", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "138957123", created: "2023-12-05", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "138957132", created: "2023-12-05", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "eddie rodriguez": {
    name: "Eddie Rodriguez",
    count: 3,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "46675520", created: "2019-01-03", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "103704912", created: "2022-02-07", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "109988533", created: "2022-06-09", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "daniel soto": {
    name: "Daniel Soto",
    count: 3,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "46675873", created: "2019-01-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "111203276", created: "2022-07-10", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "120610055", created: "2023-01-29", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "michael dotson": {
    name: "Michael Dotson",
    count: 3,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "56541432", created: "2019-07-08", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "94401486", created: "2021-06-26", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "94902040", created: "2021-07-09", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "ivette rodriguez": {
    name: "Ivette Rodriguez",
    count: 3,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "73427253", created: "2020-02-19", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "106369140", created: "2022-04-04", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "106370950", created: "2022-04-04", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "dujuan myers": {
    name: "DuJuan Myers",
    count: 3,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "85811321", created: "2020-12-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "119613029", created: "2023-01-08", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "120798181", created: "2023-02-01", membership: "Member", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "sinai matos": {
    name: "Sinai Matos",
    count: 3,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "90933586", created: "2021-04-11", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "133857298", created: "2023-09-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "133857458", created: "2023-09-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "camila vazquez": {
    name: "Camila Vazquez",
    count: 3,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "97660606", created: "2021-09-12", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "104862484", created: "2022-03-04", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "106797800", created: "2022-04-13", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "irma velez": {
    name: "Irma Velez",
    count: 3,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "106950416", created: "2022-04-15", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "118936189", created: "2022-12-18", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "124180647", created: "2023-04-05", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "kayden wilson": {
    name: "Kayden Wilson",
    count: 3,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "124192983", created: "2023-04-06", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "124354681", created: "2023-04-09", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "124358673", created: "2023-04-09", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "diego saab": {
    name: "Diego Saab",
    count: 3,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "125184558", created: "2023-04-20", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "125184565", created: "2023-04-20", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "125184570", created: "2023-04-20", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "elijah lopez": {
    name: "Elijah Lopez",
    count: 3,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "130765874", created: "2023-07-11", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "132102602", created: "2023-08-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "145192715", created: "2024-03-30", membership: "Participant", hasContact: false, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "chris blazier": {
    name: "Chris Blazier",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "24191601", created: "2017-02-21", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "123378085", created: "2023-03-21", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "lincoln brown": {
    name: "Lincoln Brown",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "24191642", created: "2017-02-21", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "131959914", created: "2023-07-31", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "nelisa lopez": {
    name: "Nelisa Lopez",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "24192661", created: "2017-02-21", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "69101392", created: "2019-11-10", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "ryan rodriguez": {
    name: "Ryan Rodriguez",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "24193360", created: "2017-02-21", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "52991574", created: "2019-05-17", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "kenneth vazquez": {
    name: "Kenneth Vazquez",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "24193739", created: "2017-02-21", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "46676129", created: "2019-01-03", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "sharell gregory": {
    name: "Sharell Gregory",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "25038254", created: "2017-02-21", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "131918374", created: "2023-07-30", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "gianpablo abreu": {
    name: "Gianpablo Abreu",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "46672737", created: "2019-01-03", membership: "Visitor", hasContact: true, checkins: 1, lastServed: "2026-02-07" },
      { id: "125128327", created: "2023-04-19", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "ashley bailey": {
    name: "Ashley Bailey",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "46672922", created: "2017-02-21", membership: "Member", hasContact: true, checkins: 0, lastServed: "" },
      { id: "139991122", created: "2023-12-31", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "gino d'amelio": {
    name: "Gino D'Amelio",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "48096001", created: "2019-02-03", membership: "none", hasContact: true, checkins: 1, lastServed: "2026-03-28" },
      { id: "46673460", created: "2019-01-03", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "cyruis familia": {
    name: "Cyruis Familia",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "46673676", created: "2019-01-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "79899737", created: "2020-07-28", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "layla ibrahim": {
    name: "Layla Ibrahim",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "46674147", created: "2019-01-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "88413674", created: "2021-01-25", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "james rowe, iii": {
    name: "James Rowe, III",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "46674161", created: "2019-01-03", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "46674287", created: "2019-01-03", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "kristen madriz": {
    name: "Kristen Madriz",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "46674531", created: "2019-01-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "141866267", created: "2024-02-04", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "annabelle morgan": {
    name: "Annabelle Morgan",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "46674864", created: "2019-01-03", membership: "Member", hasContact: true, checkins: 0, lastServed: "" },
      { id: "130763948", created: "2023-07-11", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "mariana prada": {
    name: "Mariana Prada",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "46675254", created: "2019-01-03", membership: "Member", hasContact: true, checkins: 1, lastServed: "2026-06-06" },
      { id: "136718621", created: "2023-10-25", membership: "Member", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "daniela ricardo": {
    name: "Daniela Ricardo",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "46675384", created: "2019-01-03", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "135867864", created: "2023-10-08", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "smick romain": {
    name: "Smick Romain",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "46675582", created: "2019-01-03", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "104683725", created: "2022-02-28", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "joziah valdez": {
    name: "Joziah Valdez",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "46676103", created: "2019-01-03", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "84296981", created: "2020-10-27", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "michelle vargas": {
    name: "Michelle Vargas",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "46676122", created: "2019-01-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "118831822", created: "2022-12-15", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "elizabeth rivera": {
    name: "Elizabeth Rivera",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "48208257", created: "2019-02-06", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "125239736", created: "2023-04-21", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "kc polk": {
    name: "KC Polk",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "48337342", created: "2019-02-10", membership: "Regular Attender", hasContact: true, checkins: 0, lastServed: "" },
      { id: "123842702", created: "2023-03-31", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jessica jean-paul": {
    name: "Jessica Jean-paul",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "56487802", created: "2019-06-09", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "72872496", created: "2020-02-10", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jorge palareti": {
    name: "Jorge Palareti",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "59168540", created: "2019-08-25", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "59168546", created: "2019-08-25", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "miguel albaladejo, iii": {
    name: "Miguel Albaladejo, III",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "64268775", created: "2019-10-13", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "64352895", created: "2019-10-15", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "nellie perez": {
    name: "Nellie Perez",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "70209615", created: "2019-12-10", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "139173616", created: "2023-12-09", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "carlos feliciano": {
    name: "Carlos Feliciano",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "70708079", created: "2019-12-27", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "119081725", created: "2022-12-21", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "elizabeth melendez": {
    name: "Elizabeth Melendez",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "79662714", created: "2020-07-26", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "93931642", created: "2021-06-14", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "kiara taveras": {
    name: "Kiara Taveras",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "80632153", created: "2020-08-14", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "95334209", created: "2021-07-18", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "bernadine erdmann": {
    name: "Bernadine Erdmann",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "84728271", created: "2020-11-08", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "118831824", created: "2022-12-15", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "marjorie williams": {
    name: "Marjorie Williams",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "88369852", created: "2021-02-15", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "100606325", created: "2021-11-18", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "fernanda miranda": {
    name: "Fernanda Miranda",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "89219162", created: "2021-03-07", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "91337496", created: "2021-04-18", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "ivelis morales": {
    name: "Ivelis Morales",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "89765266", created: "2019-10-30", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "139034768", created: "2023-12-06", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "andrea fennell": {
    name: "Andrea Fennell",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "90101704", created: "2021-03-27", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "90101778", created: "2021-03-27", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "erich schmalhorst": {
    name: "Erich Schmalhorst",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "90115129", created: "2021-03-28", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "90115131", created: "2021-03-28", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "vanessa gomez": {
    name: "Vanessa Gomez",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "90274662", created: "2021-03-31", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" },
      { id: "102226575", created: "2022-01-02", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "nagham nasseh": {
    name: "Nagham Nasseh",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "90319616", created: "2021-04-01", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "145157107", created: "2024-03-30", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "tamara richardson": {
    name: "Tamara Richardson",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "92309956", created: "2021-05-10", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "145139643", created: "2024-03-29", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "christian melendez": {
    name: "Christian Melendez",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "95308044", created: "2021-07-18", membership: "Member", hasContact: true, checkins: 0, lastServed: "" },
      { id: "106318928", created: "2022-04-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "gabriella lopez": {
    name: "Gabriella Lopez",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "96525323", created: "2021-08-15", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "118904491", created: "2022-12-17", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "george lopez": {
    name: "George Lopez",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "97137194", created: "2021-08-29", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "118904489", created: "2022-12-17", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "cynthia chaparro": {
    name: "Cynthia Chaparro",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "97904265", created: "2021-09-15", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "98366249", created: "2021-09-26", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "mildred fernandez": {
    name: "Mildred Fernandez",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "101366398", created: "2021-12-09", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "101448806", created: "2021-12-10", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jeffrey gonzalez": {
    name: "Jeffrey Gonzalez",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "101509719", created: "2021-03-29", membership: "Regular Attender", hasContact: true, checkins: 0, lastServed: "" },
      { id: "115084493", created: "2022-09-25", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "karla uzcategui": {
    name: "Karla Uzcategui",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "106443588", created: "2022-04-06", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "106767834", created: "2022-04-12", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "adriel benjamin": {
    name: "Adriel Benjamin",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "106795129", created: "2022-04-13", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "106795172", created: "2022-04-13", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "tiona clarke": {
    name: "Tiona Clarke",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "106950850", created: "2022-04-15", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "139175434", created: "2023-12-09", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "ethan martinez": {
    name: "Ethan Martinez",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "106980173", created: "2022-04-16", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "113082974", created: "2022-08-17", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "diana colon": {
    name: "Diana Colon",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "107223227", created: "2022-04-19", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "116537260", created: "2022-10-23", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "hamutal nunes": {
    name: "Hamutal Nunes",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "110533455", created: "2022-06-21", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "145035471", created: "2024-03-27", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jayceanel serrano": {
    name: "Jayceanel Serrano",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "111541274", created: "2022-07-17", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "112241586", created: "2022-07-31", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "nicolas davila": {
    name: "Nicolas Davila",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "120769121", created: "2023-01-31", membership: "none", hasContact: true, checkins: 9, lastServed: "2026-05-27" },
      { id: "116689132", created: "2022-10-27", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: { verdict: "confirmed", flag: "Stopped serving", activeProfiles: 1, mergeTargets: ["116689132"], note: "All serving activity sits on one profile; the duplicate has no check-ins. This flag is real. Merge to keep the record clean." },
  },
  "maralise rodriguez-berrios": {
    name: "Maralise Rodriguez-Berrios",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "118898161", created: "2022-12-16", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "125183306", created: "2023-04-20", membership: "Regular Attender", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "juan lassala": {
    name: "Juan Lassala",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "118923143", created: "2022-12-17", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "124288750", created: "2023-04-08", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "anthony edmonds": {
    name: "Anthony Edmonds",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "119030922", created: "2022-12-20", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "124291197", created: "2023-04-08", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "zachory judd": {
    name: "Zachory Judd",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "120287188", created: "2023-01-22", membership: "Member", hasContact: true, checkins: 0, lastServed: "" },
      { id: "123247354", created: "2023-03-19", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "juan cartagena": {
    name: "Juan Cartagena",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "120496608", created: "2023-01-25", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "121810357", created: "2023-02-21", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "miguel gonzalez": {
    name: "Miguel Gonzalez",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "121212211", created: "2023-02-08", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "121364055", created: "2023-02-12", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "aiden maze": {
    name: "Aiden Maze",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "136466082", created: "2023-10-19", membership: "none", hasContact: true, checkins: 14, lastServed: "2026-06-21" },
      { id: "123663136", created: "2023-03-27", membership: "none", hasContact: true, checkins: 1, lastServed: "2026-03-28" }
    ],
    reconcile: { verdict: "confirmed", flag: "Burnout risk", activeProfiles: 2, mergeTargets: [], note: "The extra profiles add no double-counted check-ins; the serving load is real. Merge to keep the record clean." },
  },
  "gabriela mazacotte": {
    name: "Gabriela Mazacotte",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "125220203", created: "2023-04-21", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "125229329", created: "2023-04-21", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "keyne suzuki": {
    name: "Keyne Suzuki",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "125220229", created: "2023-04-21", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "125239125", created: "2023-04-21", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "summer thompson": {
    name: "Summer Thompson",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "126248300", created: "2023-05-12", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "126248376", created: "2023-05-12", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "clara duarte": {
    name: "Clara Duarte",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "131056812", created: "2023-07-16", membership: "Member", hasContact: true, checkins: 10, lastServed: "2026-06-28" },
      { id: "131047912", created: "2023-07-16", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jessica vega": {
    name: "Jessica Vega",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "131052267", created: "2023-07-16", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "131059340", created: "2023-07-16", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jeranda o'shields": {
    name: "Jeranda O'shields",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "131241093", created: "2023-07-18", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "132611057", created: "2023-08-13", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "marina cherubin": {
    name: "Marina Cherubin",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: false,
    profiles: [
      { id: "135994977", created: "2023-10-10", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "136612464", created: "2023-10-22", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "filipe barros": {
    name: "Filipe Barros",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "138345333", created: "2023-11-22", membership: "Member", hasContact: true, checkins: 0, lastServed: "" },
      { id: "138995706", created: "2023-12-06", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "roman erdyneev": {
    name: "Roman Erdyneev",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "138867936", created: "2023-12-04", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" },
      { id: "138871485", created: "2023-12-04", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "daniela saa": {
    name: "Daniela Saa",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "138959888", created: "2023-12-05", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "143035508", created: "2024-02-23", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "cole munoz": {
    name: "Cole Munoz",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "143475753", created: "2024-03-02", membership: "none", hasContact: true, checkins: 1, lastServed: "2026-02-14" },
      { id: "140515397", created: "2024-01-11", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "barbara martins": {
    name: "Barbara Martins",
    count: 2,
    confidence: "high",
    sharedEmail: true,
    sharedPhone: true,
    profiles: [
      { id: "143300814", created: "2024-02-27", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "145073169", created: "2024-03-28", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "justin todd": {
    name: "Justin Todd",
    count: 2,
    confidence: "high",
    sharedEmail: false,
    sharedPhone: true,
    profiles: [
      { id: "148423386", created: "2024-05-21", membership: "none", hasContact: true, checkins: 1, lastServed: "2026-01-19" },
      { id: "149016433", created: "2024-06-02", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "maria garcia": {
    name: "Maria Garcia",
    count: 5,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "24192162", created: "2017-02-21", membership: "Member", hasContact: true, checkins: 0, lastServed: "" },
      { id: "62937671", created: "2019-09-29", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "110325929", created: "2022-06-16", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "124220960", created: "2023-04-06", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "151476763", created: "2024-07-17", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jose soto": {
    name: "Jose Soto",
    count: 4,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "24193584", created: "2017-02-21", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "53016740", created: "2019-05-19", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "120609904", created: "2023-01-29", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "138155650", created: "2023-11-19", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "michael davis": {
    name: "Michael Davis",
    count: 4,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "46673488", created: "2019-01-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "46673503", created: "2019-01-03", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "69918703", created: "2019-08-11", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "125685649", created: "2023-04-30", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "angel rodriguez": {
    name: "Angel Rodriguez",
    count: 4,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "46675504", created: "2019-01-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "56261890", created: "2019-06-30", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "124290542", created: "2023-04-08", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "136081533", created: "2023-10-11", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jose gonzalez": {
    name: "Jose Gonzalez",
    count: 4,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "56508604", created: "2019-07-07", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "106097581", created: "2022-03-30", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "124232732", created: "2023-04-07", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "131500181", created: "2023-07-23", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jonathan jimenez": {
    name: "Jonathan Jimenez",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "24192393", created: "2017-02-21", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "69068947", created: "2019-11-10", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "120986656", created: "2023-02-05", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "khaalid michel": {
    name: "Khaalid Michel",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "24192871", created: "2017-02-21", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "114742387", created: "2022-09-17", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "144600882", created: "2024-03-19", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "luis rivera": {
    name: "Luis Rivera",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "24193308", created: "2017-02-21", membership: "Member", hasContact: true, checkins: 11, lastServed: "2026-07-07" },
      { id: "142332441", created: "2024-02-11", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "144900640", created: "2024-03-25", membership: "Participant", hasContact: false, checkins: 0, lastServed: "" }
    ],
    reconcile: { verdict: "confirmed", flag: "Burnout risk", activeProfiles: 1, mergeTargets: ["142332441", "144900640"], note: "The extra profiles add no double-counted check-ins; the serving load is real. Merge to keep the record clean." },
  },
  "christopher aubain": {
    name: "Christopher Aubain",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "46672889", created: "2019-01-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "91349815", created: "2021-04-18", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "104341128", created: "2022-02-13", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "mary brown": {
    name: "Mary Brown",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "46673113", created: "2019-01-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "75995146", created: "2020-04-26", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "86452430", created: "2020-12-20", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "sebastian pedeaux": {
    name: "Sebastian Pedeaux",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "46675096", created: "2019-01-03", membership: "Visitor", hasContact: false, checkins: 0, lastServed: "" },
      { id: "146399832", created: "2024-04-16", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "148996901", created: "2024-06-02", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "ariel rodriguez": {
    name: "Ariel Rodriguez",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "46675508", created: "2019-01-03", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "118916428", created: "2022-12-17", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "138644394", created: "2023-11-29", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "enrique ruiz": {
    name: "Enrique Ruiz",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "46675630", created: "2019-01-03", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "118827062", created: "2022-12-14", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "138253938", created: "2023-11-21", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "natalia vazquez": {
    name: "Natalia Vazquez",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "46676119", created: "2019-01-03", membership: "Visitor", hasContact: true, checkins: 1, lastServed: "2026-05-24" },
      { id: "111241983", created: "2022-07-10", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "120506446", created: "2023-01-26", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jorge silva": {
    name: "Jorge Silva",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "47404269", created: "2019-01-21", membership: "none", hasContact: true, checkins: 1, lastServed: "2026-04-12" },
      { id: "124151349", created: "2023-04-05", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "126425748", created: "2023-01-12", membership: "Member", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "john smith": {
    name: "John Smith",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "51283711", created: "2019-04-13", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "76855472", created: "2020-05-26", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "145094867", created: "2024-03-28", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "lourdes torres": {
    name: "LOURDES TORRES",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "51615740", created: "2019-04-20", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "118784333", created: "2022-12-14", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" },
      { id: "151105530", created: "2024-07-11", membership: "none", hasContact: false, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "gail shillington": {
    name: "Gail Shillington",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "74531789", created: "2020-03-13", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "140007548", created: "2024-01-01", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "141809052", created: "2024-02-03", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "juan rios": {
    name: "Juan Rios",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "128937545", created: "2023-06-25", membership: "Visitor", hasContact: false, checkins: 1, lastServed: "2026-04-05" },
      { id: "88335472", created: "2021-02-14", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "125103583", created: "2023-04-19", membership: "Participant", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "gerald king": {
    name: "Gerald King",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "92645220", created: "2021-05-17", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "105956478", created: "2022-03-27", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "107568540", created: "2022-04-25", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "alejandro rivera": {
    name: "Alejandro Rivera",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "103684809", created: "2022-02-07", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "111488340", created: "2022-07-16", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "126151087", created: "2023-05-10", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "erick santana": {
    name: "Erick Santana",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "108529741", created: "2022-05-15", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "108530151", created: "2022-05-15", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "125297465", created: "2023-04-23", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "jackeline colon": {
    name: "Jackeline Colon",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "110700527", created: "2022-06-26", membership: "Visitor", hasContact: true, checkins: 1, lastServed: "2026-04-20" },
      { id: "143283004", created: "2024-02-27", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "144892381", created: "2024-03-25", membership: "none", hasContact: false, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "maria mendoza": {
    name: "Maria Mendoza",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "113274485", created: "2022-08-21", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "114467491", created: "2022-09-14", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "124263423", created: "2023-04-07", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "azariah bennett": {
    name: "Azariah Bennett",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "114807290", created: "2022-09-18", membership: "none", hasContact: true, checkins: 23, lastServed: "2026-06-21" },
      { id: "124254811", created: "2023-04-07", membership: "none", hasContact: false, checkins: 1, lastServed: "2026-05-17" },
      { id: "125026043", created: "2023-04-17", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: { verdict: "confirmed", flag: "Burnout risk", activeProfiles: 2, mergeTargets: ["125026043"], note: "The extra profiles add no double-counted check-ins; the serving load is real. Merge to keep the record clean." },
  },
  "lucio aguilar": {
    name: "Lucio Aguilar",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "118899031", created: "2022-12-16", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "118899066", created: "2022-12-16", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "118899078", created: "2022-12-16", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "apolos aguilar": {
    name: "Apolos Aguilar",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "118899032", created: "2022-12-16", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "118899065", created: "2022-12-16", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "118899077", created: "2022-12-16", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "mia machado": {
    name: "Mia Machado",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "120506843", created: "2023-01-26", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "124287597", created: "2023-04-08", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "137996999", created: "2023-11-16", membership: "Regular Attender", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "billy williams": {
    name: "Billy Williams",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "125474449", created: "2017-02-21", membership: "Visitor", hasContact: true, checkins: 0, lastServed: "" },
      { id: "126765373", created: "2023-05-23", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "134073690", created: "2023-09-07", membership: "none", hasContact: false, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "joshua carter": {
    name: "Joshua Carter",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "137623642", created: "2023-11-09", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "144892377", created: "2024-03-25", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "149368761", created: "2024-06-08", membership: "none", hasContact: false, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "crystal avendano": {
    name: "Crystal Avendano",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "138719316", created: "2023-11-30", membership: "none", hasContact: true, checkins: 0, lastServed: "" },
      { id: "141811623", created: "2024-02-03", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "141948388", created: "2024-02-05", membership: "none", hasContact: false, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  },
  "zena alequin": {
    name: "Zena Alequin",
    count: 3,
    confidence: "medium",
    sharedEmail: false,
    sharedPhone: false,
    profiles: [
      { id: "141306469", created: "2024-01-25", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "141306490", created: "2024-01-25", membership: "none", hasContact: false, checkins: 0, lastServed: "" },
      { id: "141737283", created: "2024-02-01", membership: "none", hasContact: true, checkins: 0, lastServed: "" }
    ],
    reconcile: null,
  }
}
const norm = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim()
export function duplicateInfo(name: string): DupInfo | null {
  return focalPointDuplicates[norm(name)] ?? null
}
// Full list for the Settings review view, most-profiles first.
export const focalPointDuplicateList: DupInfo[] = Object.values(focalPointDuplicates).sort(
  (a, b) => b.count - a.count,
)
export const focalPointDuplicateStats = {
  clusters: 120,
  highConfidence: 88,
  extraProfiles: 526,
  scanned: 13000,
}
