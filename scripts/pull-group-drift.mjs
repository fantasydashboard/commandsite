// Group drift: members of a Growth Group who attended regularly, then stopped.
// Pull growth-group-type groups -> memberships -> recent events -> attendances.
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const B = 'https://api.planningcenteronline.com/groups/v2'
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status+' '+u.slice(50)); return r.json() }
const all = async (u) => { const out=[]; let url=u; while(url){const j=await get(url); out.push(...j.data); url=j.links?.next} return out }

const types = (await get(`${B}/group_types?per_page=25`)).data
const gtIds = types.filter(t=>/growth group/i.test(t.attributes.name)).map(t=>t.id)
console.error('growth group types:', types.filter(t=>/growth group/i.test(t.attributes.name)).map(t=>t.attributes.name).join(', '))

let groups = []
for (const gt of gtIds) groups.push(...await all(`${B}/group_types/${gt}/groups?per_page=100`))
groups = groups.filter(g => g.attributes.archived_at == null && (g.attributes.memberships_count||0) > 0)
console.error('active growth groups with members:', groups.length)

const now = new Date('2026-07-13')
const drifters = []
let totalMembers = 0, groupsWithEvents = 0
let done = 0
for (const g of groups) {
  done++
  if (done % 15 === 0) console.error(`  ${done}/${groups.length} groups...`)
  const members = await all(`${B}/groups/${g.id}/memberships?per_page=100&include=person`)
  // events last ~8
  let events = (await get(`${B}/groups/${g.id}/events?per_page=8&order=-starts_at`)).data
  events = events.filter(e => new Date(e.attributes.starts_at) <= now)
  if (events.length < 3) continue
  groupsWithEvents++
  // attendance map: personId -> [attended bools most-recent-first aligned to events]
  const att = {} // personId -> Set of eventIds attended
  const evOrder = events.map(e=>e.id)
  for (const e of events) {
    const a = await all(`${B}/events/${e.id}/attendances?per_page=100&include=person`)
    for (const x of a) {
      const pid = x.relationships?.person?.data?.id
      if (pid && x.attributes.attended) { (att[pid] = att[pid] || new Set()).add(e.id) }
    }
  }
  const incl = Object.fromEntries((members.filter(m=>m).length ? [] : []))
  for (const m of members) {
    const pid = m.relationships?.person?.data?.id
    if (!pid) continue
    totalMembers++
    const attended = att[pid] || new Set()
    const last3 = evOrder.slice(0,3)
    const prior = evOrder.slice(3)
    const missedLast3 = last3.every(id => !attended.has(id))
    const attendedBefore = prior.some(id => attended.has(id)) || attended.size >= 2
    if (missedLast3 && attendedBefore) {
      // weeks since last attended
      let lastIdx = evOrder.findIndex(id => attended.has(id))
      const lastEvent = lastIdx >= 0 ? events[lastIdx].attributes.starts_at : null
      const weeks = lastEvent ? Math.round((now - new Date(lastEvent)) / (7*864e5)) : null
      drifters.push({ group: g.attributes.name, personId: pid, weeks, totalAttended: attended.size })
    }
  }
}
const out = { growthGroups: groups.length, groupsWithEvents, totalMembers, drifters: drifters.length, examples: drifters.sort((a,b)=>(b.weeks||0)-(a.weeks||0)).slice(0,40) }
await writeFile('scratchpad/pco-raw/group_drift.json', JSON.stringify(out,null,2))
console.log('growth groups:', out.growthGroups, '| with events:', out.groupsWithEvents, '| members counted:', out.totalMembers)
console.log('GROUP DRIFT flagged:', out.drifters, '(attended before, missed last 3 meetings)')
console.log('sample weeks-since-attended:', out.examples.slice(0,8).map(d=>`${d.weeks}w`).join(' '))
