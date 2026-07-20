// Full growth-group attendance pull (Sep 2025 -> now): monthly attendance totals
// (aggregate) + per-person group drift (attended in-season, then stopped before
// their group's last meeting). Excludes dormant groups (no meeting in 12 weeks).
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const B = 'https://api.planningcenteronline.com/groups/v2'
const get = async (u) => { for (let i=0;i<4;i++){ const r=await fetch(u,{headers:{Authorization:AUTH}}); if(r.ok) return r.json(); if(r.status===429){await new Promise(s=>setTimeout(s,2000));continue} throw new Error(r.status) } throw new Error('retry') }
const all = async (u) => { const out=[]; let url=u; while(url){const j=await get(url); out.push(...j.data); url=j.links?.next} return out }
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const now = new Date('2026-07-13')
const SINCE = new Date('2025-09-01')

const types = (await get(`${B}/group_types?per_page=25`)).data
const gtIds = types.filter(t=>/growth group/i.test(t.attributes.name)).map(t=>t.id)
let groups=[]; for (const gt of gtIds) groups.push(...await all(`${B}/group_types/${gt}/groups?per_page=100`))
groups = groups.filter(g=>g.attributes.archived_at==null)
console.error('growth groups:', groups.length)

const monthly = {}       // 'YYYY-MM' -> total attended
const nameById = {}
const perGroup = []       // {group, lastMeeting, memberAttend: Map pid-> [event dates attended]}
let done=0
for (const g of groups) {
  done++; if (done%10===0) console.error(`  ${done}/${groups.length}`)
  const evs = (await all(`${B}/groups/${g.id}/events?per_page=100&order=-starts_at`))
    .filter(e => { const d=new Date(e.attributes.starts_at); return d>=SINCE && d<=now })
  if (!evs.length) continue
  const lastMeeting = new Date(evs[0].attributes.starts_at)
  const attendByPid = {}   // pid -> [dates]
  for (const e of evs) {
    const d = new Date(e.attributes.starts_at)
    const mkey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`
    const atts = await all(`${B}/events/${e.id}/attendances?per_page=200&include=person`)
    let cnt=0
    for (const a of atts) {
      if (!a.attributes.attended) continue
      cnt++
      const pid = a.relationships?.person?.data?.id
      if (pid) (attendByPid[pid]=attendByPid[pid]||[]).push(d)
    }
    // names from include
    // (person include not returned by attendances; capture via membership below)
    monthly[mkey] = (monthly[mkey]||0) + cnt
  }
  perGroup.push({ group: g.attributes.name, groupId: g.id, lastMeeting, events: evs.map(e=>new Date(e.attributes.starts_at)), attendByPid })
}

// names: pull memberships (include person) for groups that have drift candidates
// compute drifters: group in-season (last meeting within 12 wks), member attended
// >=2 times but missed the group's last 3 meetings
const drifters = []
for (const pg of perGroup) {
  const wkLast = (now - pg.lastMeeting)/(7*864e5)
  if (wkLast > 12) continue   // dormant group, skip
  const evsSorted = pg.events.slice().sort((a,b)=>b-a)
  const last3 = evsSorted.slice(0,3).map(d=>+d)
  const members = await all(`${B}/groups/${pg.groupId}/memberships?per_page=100&include=person`)
  const nm = {}; for (const inc of []) {}
  const personName = {}
  // fetch names via the included people
  const mj = await get(`${B}/groups/${pg.groupId}/memberships?per_page=100&include=person`)
  for (const inc of (mj.included||[])) if (inc.type==='Person') personName[inc.id]=inc.attributes.first_name+' '+inc.attributes.last_name
  for (const m of members) {
    const pid = m.relationships?.person?.data?.id
    const dates = pg.attendByPid[pid] || []
    if (dates.length < 2) continue
    const attendedLast3 = dates.some(d => last3.includes(+d))
    if (!attendedLast3) {
      const lastAtt = dates.slice().sort((a,b)=>b-a)[0]
      const weeks = Math.round((now - lastAtt)/(7*864e5))
      drifters.push({ name: personName[pid] || 'Member', group: pg.group, weeksSince: weeks, attended: dates.length })
    }
  }
}
const monthlyArr = Object.entries(monthly).sort().map(([m,v])=>({ month: m, label: `${MONTHS[+m.split('-')[1]-1]} ${m.split('-')[0].slice(2)}`, total: v }))
const out = { monthly: monthlyArr, groupsWithData: perGroup.length, drifters: drifters.sort((a,b)=>b.attended-a.attended) }
await writeFile('scratchpad/pco-raw/group_full.json', JSON.stringify(out,null,2))
console.log('MONTHLY total group attendance:')
monthlyArr.forEach(m=>console.log(`  ${m.label}: ${m.total}`))
console.log('\nGROUP DRIFTERS (in-season groups, missed last 3):', drifters.length)
console.log('sample:', drifters.slice(0,8).map(d=>`${d.name} [${d.group.slice(0,20)}] ${d.weeksSince}w (${d.attended}x)`).join('\n  '))
