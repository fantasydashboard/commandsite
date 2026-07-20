// Focal Point Church - People Drift Watch (real serving drift, from Planning
// Center SERVICES scheduling via scripts/gen-serving.mjs). "Stopped serving" =
// a regular server (4+ confirmed dates) whose last served date is 6+ weeks ago
// AND who has nothing upcoming on the schedule. Check-ins are NOT used: they
// undercount (people serve without checking in, whole teams skip the kiosk), so a
// missing check-in never means someone stopped. Staff/admins excluded.
// LOCAL OVERRIDE (skip-worktree): real names live on disk only, never in git.
export interface ServingDriftPerson { name: string; area: string; campus: "english" | "brazilian" | "both"; monthsServing: number; totalServed: number; lastServed: string; weeksSince: number }
export interface ServingDraft { id: string; name: string; area: string; context: string; draft: string }
export const focalPointServing: {
  flaggedPeople: number; totalVolunteers: number; signal: string; people: ServingDriftPerson[]; drafts: ServingDraft[]
} = {
  flaggedPeople: 41, totalVolunteers: 398,
  signal: "Regular volunteers, by the Services schedule, who have not been scheduled to serve in 6+ weeks and have nothing upcoming. A personal check-in with the individual, not the household.",
  people: [
  {"name":"Mark Manigold","area":"Parking Team","campus":"english","monthsServing":5,"totalServed":17,"lastServed":"2026-05-17","weeksSince":8},
  {"name":"Nicolas Davila","area":"Media Team","campus":"english","monthsServing":5,"totalServed":16,"lastServed":"2026-05-03","weeksSince":10},
  {"name":"Daniel Rivera","area":"Ushers","campus":"english","monthsServing":3,"totalServed":14,"lastServed":"2026-02-22","weeksSince":20},
  {"name":"Junior Costa","area":"Band 4th Service","campus":"brazilian","monthsServing":3,"totalServed":10,"lastServed":"2026-03-08","weeksSince":18},
  {"name":"Johanny Moya","area":"Ushers","campus":"english","monthsServing":4,"totalServed":10,"lastServed":"2026-04-05","weeksSince":14},
  {"name":"Camilo Rojas","area":"Media Team","campus":"english","monthsServing":5,"totalServed":10,"lastServed":"2026-05-03","weeksSince":10},
  {"name":"Allen Maldonado","area":"Band","campus":"english","monthsServing":5,"totalServed":10,"lastServed":"2026-05-31","weeksSince":6},
  {"name":"JR Rivera","area":"Safety Team","campus":"english","monthsServing":3,"totalServed":9,"lastServed":"2026-03-01","weeksSince":19},
  {"name":"Allie Smallwood","area":"First Impressions Team","campus":"english","monthsServing":4,"totalServed":9,"lastServed":"2026-04-26","weeksSince":11},
  {"name":"Courtland Skipper","area":"Hospitality","campus":"english","monthsServing":4,"totalServed":9,"lastServed":"2026-05-10","weeksSince":9},
  {"name":"Abiezer Morales","area":"First Impressions Team","campus":"english","monthsServing":4,"totalServed":9,"lastServed":"2026-05-17","weeksSince":8},
  {"name":"Donna Sproat","area":"First Impressions Team","campus":"english","monthsServing":6,"totalServed":9,"lastServed":"2026-05-31","weeksSince":6},
  {"name":"Karen Abraham","area":"Ushers","campus":"english","monthsServing":6,"totalServed":9,"lastServed":"2026-05-31","weeksSince":6},
  {"name":"Cammilah Araujo","area":"Media Team","campus":"english","monthsServing":2,"totalServed":8,"lastServed":"2026-02-01","weeksSince":23},
  {"name":"Ana Gadelna","area":"Vocals","campus":"english","monthsServing":5,"totalServed":8,"lastServed":"2026-05-17","weeksSince":8},
  {"name":"Winston Knight","area":"Ushers","campus":"english","monthsServing":5,"totalServed":8,"lastServed":"2026-05-17","weeksSince":8},
  {"name":"Diego Rodriguez","area":"Kids Point","campus":"english","monthsServing":3,"totalServed":7,"lastServed":"2026-04-26","weeksSince":11},
  {"name":"Aaron Score","area":"Safety Team","campus":"english","monthsServing":4,"totalServed":7,"lastServed":"2026-04-26","weeksSince":11},
  {"name":"Emmanuel DeWayne Jordan","area":"Safety Team","campus":"english","monthsServing":4,"totalServed":7,"lastServed":"2026-05-10","weeksSince":9},
  {"name":"Marisol Rodriguez - Rivera","area":"YTH Services","campus":"english","monthsServing":3,"totalServed":7,"lastServed":"2026-05-31","weeksSince":6},
  {"name":"Yves Bwansa","area":"Ushers","campus":"english","monthsServing":2,"totalServed":6,"lastServed":"2026-03-01","weeksSince":19},
  {"name":"Monica Rivera","area":"First Steps Nursery","campus":"english","monthsServing":3,"totalServed":6,"lastServed":"2026-03-22","weeksSince":16},
  {"name":"Raquel Araujo","area":"Tech 4th Service","campus":"brazilian","monthsServing":1,"totalServed":6,"lastServed":"2026-04-05","weeksSince":14},
  {"name":"Eric Campbell","area":"WOC","campus":"english","monthsServing":1,"totalServed":5,"lastServed":"2026-01-05","weeksSince":27},
  {"name":"Johnnie Anderson Jr.","area":"WOC","campus":"english","monthsServing":1,"totalServed":5,"lastServed":"2026-01-05","weeksSince":27},
  {"name":"Marcela Bunch","area":"Band","campus":"both","monthsServing":3,"totalServed":5,"lastServed":"2026-02-22","weeksSince":20},
  {"name":"Nathan Erwin Assam","area":"First Steps Nursery","campus":"english","monthsServing":3,"totalServed":5,"lastServed":"2026-03-22","weeksSince":16},
  {"name":"Jose Oswaldo Filho","area":"Band","campus":"english","monthsServing":3,"totalServed":5,"lastServed":"2026-03-22","weeksSince":16},
  {"name":"Kelly Roberto","area":"First Steps Nursery","campus":"english","monthsServing":3,"totalServed":5,"lastServed":"2026-04-05","weeksSince":14},
  {"name":"Michelle Martinez","area":"Check-In Volunteers","campus":"english","monthsServing":3,"totalServed":5,"lastServed":"2026-04-12","weeksSince":13},
  {"name":"Trenesia Jefferson","area":"Hospitality","campus":"english","monthsServing":4,"totalServed":5,"lastServed":"2026-05-17","weeksSince":8},
  {"name":"Amaia Montalvo-Bentz","area":"Tech","campus":"english","monthsServing":6,"totalServed":5,"lastServed":"2026-05-27","weeksSince":7},
  {"name":"Caroline Da Silva","area":"Kids Point JR","campus":"english","monthsServing":5,"totalServed":5,"lastServed":"2026-05-31","weeksSince":6},
  {"name":"Roberto J Serrano","area":"WOC","campus":"english","monthsServing":1,"totalServed":4,"lastServed":"2026-01-05","weeksSince":27},
  {"name":"Carlos Porfirio, Jr. Jr.","area":"Band","campus":"english","monthsServing":1,"totalServed":4,"lastServed":"2026-02-08","weeksSince":22},
  {"name":"Beth Lima","area":"Vocals 4th Service","campus":"brazilian","monthsServing":1,"totalServed":4,"lastServed":"2026-02-08","weeksSince":22},
  {"name":"Jaqueline Costa","area":"Vocals 4th Service","campus":"brazilian","monthsServing":3,"totalServed":4,"lastServed":"2026-04-05","weeksSince":14},
  {"name":"Mika Noel","area":"First Steps Nursery","campus":"english","monthsServing":4,"totalServed":4,"lastServed":"2026-04-05","weeksSince":14},
  {"name":"Tahlia Louis","area":"Kids Point","campus":"english","monthsServing":3,"totalServed":4,"lastServed":"2026-04-19","weeksSince":12},
  {"name":"Amaris Vargas Figueroa","area":"First Steps Nursery","campus":"english","monthsServing":4,"totalServed":4,"lastServed":"2026-05-17","weeksSince":8},
  {"name":"Alexandre De Oliveira","area":"Safety Team","campus":"english","monthsServing":6,"totalServed":4,"lastServed":"2026-05-31","weeksSince":6},
  ],
  drafts: [],
}
