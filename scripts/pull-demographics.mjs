// v2: honest cohort. Pull the committed core (Member + Regular Attender), which
// matches ~weekend attendance, and age-band THAT (adults there are far likelier
// to have birthdates than random visitor records). Serving penetration uses
// distinct recent servers intersected with that core. Aggregate output only.
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0,150)); return r.json() }

async function pullMembership(value) {
  const out = []
  let url = `https://api.planningcenteronline.com/people/v2/people?per_page=100&where[membership]=${encodeURIComponent(value)}`
  let pg = 0
  while (url && pg < 60) { const j = await get(url); out.push(...j.data); url = j.links?.next; pg++ }
  return out
}
const members = await pullMembership('Member')
const regulars = await pullMembership('Regular Attender')
const core = [...members, ...regulars]
console.error(`Member=${members.length} RegularAttender=${regulars.length} core=${core.length}`)

const now = new Date('2026-07-12')
const ageOf = (bd) => bd ? Math.floor((now - new Date(bd)) / (365.25 * 864e5)) : null
const BANDS = [['0-12',0,12],['13-17',13,17],['18-24',18,24],['25-34',25,34],['35-44',35,44],['45-54',45,54],['55-64',55,64],['65+',65,200]]

const coreAdultIds = new Set()
let coreAdults = 0, coreKids = 0, withBd = 0
const bandCounts = Object.fromEntries(BANDS.map(b=>[b[0],0]))
for (const p of core) {
  const a = p.attributes
  if (a.child) { coreKids++; continue }
  coreAdults++; coreAdultIds.add(p.id)
  const age = ageOf(a.birthdate)
  if (age!=null && age>=0 && age<120) { withBd++; const b=BANDS.find(x=>age>=x[1]&&age<=x[2]); if(b) bandCounts[b[0]]++ }
}

// distinct recent servers (last ~6mo) intersect core adults
const vc = JSON.parse(await readFile('scratchpad/pco-raw/volunteer_checkins.json','utf8'))
const dates = vc.map(c=>c.created_at).filter(Boolean).sort()
const distinctServers = new Set(vc.map(c=>c.person_id))
let coreServers = 0
for (const id of coreAdultIds) if (distinctServers.has(id)) coreServers++

const out = {
  core: { members: members.length, regulars: regulars.length, total: core.length, adults: coreAdults, kids: coreKids },
  ageOfCoreAdults: { withBirthdate: withBd, coverage: Math.round(withBd/coreAdults*100),
    bands: BANDS.map(b=>({band:b[0], count:bandCounts[b[0]], pct: withBd?Math.round(bandCounts[b[0]]/withBd*1000)/10:0})) },
  serving: { distinctServersAllRecords: distinctServers.size,
    servingDateRange: [dates[0]?.slice(0,10), dates[dates.length-1]?.slice(0,10)],
    coreAdultsServing: coreServers,
    servingPenetration: coreAdults?Math.round(coreServers/coreAdults*1000)/10:0 },
}
await writeFile('scratchpad/pco-raw/demographics.json', JSON.stringify(out,null,2))
console.log(JSON.stringify(out,null,2))
