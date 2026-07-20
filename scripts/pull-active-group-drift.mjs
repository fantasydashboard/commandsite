// Group drift, but ONLY for groups actively meeting (an event in the last 5 weeks).
// Flag members who attended earlier but missed the last 2 recent meetings. Also
// count distinct real group members (participation) for the "in a group" metric.
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const B = 'https://api.planningcenteronline.com/groups/v2'
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status); return r.json() }
const all = async (u) => { const out=[]; let url=u; while(url){const j=await get(url); out.push(...j.data); url=j.links?.next} return out }
const types = (await get(`${B}/group_types?per_page=25`)).data
const gtIds = types.filter(t=>/growth group/i.test(t.attributes.name)).map(t=>t.id)
let groups=[]; for (const gt of gtIds) groups.push(...await all(`${B}/group_types/${gt}/groups?per_page=100`))
groups = groups.filter(g=>g.attributes.archived_at==null)
const now = new Date('2026-07-13')
const distinctMembers = new Set()
const drifters = []
let activeGroups = 0
for (const g of groups) {
  const members = await all(`${B}/groups/${g.id}/memberships?per_page=100&include=person`)
  const nameById = {}
  for (const inc of []) {}
  const evs = (await get(`${B}/groups/${g.id}/events?per_page=6&order=-starts_at`)).data.filter(e=>new Date(e.attributes.starts_at)<=now)
  const memberIds = members.map(m=>m.relationships?.person?.data?.id).filter(Boolean)
  memberIds.forEach(id=>distinctMembers.add(id))
  if (!evs.length) continue
  const wkLast = (now - new Date(evs[0].attributes.starts_at))/(7*864e5)
  if (wkLast > 5) continue   // group not actively meeting
  activeGroups++
  const evOrder = evs.map(e=>e.id)
  const att = {}
  for (const e of evs) { const a=await all(`${B}/events/${e.id}/attendances?per_page=100`); for(const x of a){const pid=x.relationships?.person?.data?.id; if(pid&&x.attributes.attended)(att[pid]=att[pid]||new Set()).add(e.id)} }
  const last2 = evOrder.slice(0,2), prior = evOrder.slice(2)
  for (const id of memberIds) {
    const a = att[id]||new Set()
    if (last2.every(e=>!a.has(e)) && (prior.some(e=>a.has(e)) || a.size>=1)) {
      const lastIdx = evOrder.findIndex(e=>a.has(e))
      const weeks = lastIdx>=0 ? Math.round((now-new Date(evs[lastIdx].attributes.starts_at))/(7*864e5)) : null
      if (weeks!=null && weeks<=12) drifters.push({ group:g.attributes.name, weeks })
    }
  }
}
const out = { totalGroups: groups.length, activeGroups, distinctGroupMembers: distinctMembers.size, groupDrifters: drifters.length, examples: drifters.sort((a,b)=>b.weeks-a.weeks).slice(0,20) }
await writeFile('scratchpad/pco-raw/active_group_drift.json', JSON.stringify(out,null,2))
console.log('distinct people in a growth group:', out.distinctGroupMembers)
console.log('actively-meeting groups (event <=5wk):', out.activeGroups)
console.log('REAL group drift (active groups, missed last 2, weeks<=12):', out.groupDrifters)
console.log('weeks-since sample:', out.examples.map(e=>e.weeks+'w').join(' '))
