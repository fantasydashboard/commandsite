// Group drift, active season only (Sep 1 -> May 31). Summer (Jun-Aug) is not
// counted. A member drifted if they attended >=5 in-season meetings but missed
// their group's LAST 3 in-season meetings (stopped before the season ended).
// "quiet" = weeks between their last attendance and the group's last in-season meeting.
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const B = 'https://api.planningcenteronline.com/groups/v2'
const sleep = ms => new Promise(s=>setTimeout(s,ms))
const get = async (u) => { for(let i=0;i<10;i++){const r=await fetch(u,{headers:{Authorization:AUTH}});if(r.ok){await sleep(110);return r.json()}if(r.status===429){await sleep((Number(r.headers.get('retry-after')||3)+1)*1000);continue}throw new Error(r.status)}throw new Error('rl') }
const all = async (u) => { const o=[];let url=u;while(url){const j=await get(url);o.push(...j.data);url=j.links?.next}return o }
const S=new Date('2025-09-01'), SEASON_END=new Date('2026-05-31')
const types=(await get(`${B}/group_types?per_page=25`)).data.filter(t=>/growth group/i.test(t.attributes.name))
const typeName=Object.fromEntries(types.map(t=>[t.id,t.attributes.name]))
let groups=[]; for(const t of types) for(const g of await all(`${B}/group_types/${t.id}/groups?per_page=100`)) groups.push({g,type:typeName[t.id]})
groups=groups.filter(x=>x.g.attributes.archived_at==null)
const drifters=[]
let done=0, groupsWithData=0
for(const {g,type} of groups){
  done++; if(done%15===0)console.error(`  ${done}/${groups.length}`)
  const evs=(await all(`${B}/groups/${g.id}/events?per_page=100&order=-starts_at`))
    .map(e=>({id:e.id,d:new Date(e.attributes.starts_at)})).filter(e=>e.d>=S && e.d<=SEASON_END).sort((a,b)=>b.d-a.d)
  if(evs.length<4) continue
  groupsWithData++
  const lastInSeason=evs[0].d
  const last3=evs.slice(0,3).map(e=>e.id)
  const attendByPid={}
  for(const e of evs){ const a=await all(`${B}/events/${e.id}/attendances?per_page=200`); for(const x of a){if(!x.attributes.attended)continue; const pid=x.relationships?.person?.data?.id; if(pid)(attendByPid[pid]=attendByPid[pid]||[]).push(e.d)} }
  // names
  const mj=await get(`${B}/groups/${g.id}/memberships?per_page=100&include=person`)
  const nm={}; for(const inc of (mj.included||[])) if(inc.type==='Person') nm[inc.id]=inc.attributes.first_name+' '+inc.attributes.last_name
  const attByEvent={}
  for(const e of evs) attByEvent[e.id]=new Set()
  for(const [pid,dates] of Object.entries(attendByPid)){}
  // determine last-3 attendance per person
  for(const m of mj.data){
    const pid=m.relationships?.person?.data?.id; if(!pid) continue
    const dates=attendByPid[pid]||[]
    if(dates.length<5) continue
    // did they attend any of the last 3 in-season events?
    const attendedLast3 = evs.slice(0,3).some(e=>dates.some(d=>+d===+e.d))
    if(attendedLast3) continue
    const lastAtt=dates.slice().sort((a,b)=>b-a)[0]
    const weeks=Math.round((lastInSeason-lastAtt)/(7*864e5))
    if(weeks<3) continue // stopped <3wk before season end = basically finished the season
    const name=nm[pid]||'Member'
    const toks=name.toLowerCase().split(/\s+/)
    if(toks.some(t=>t.length>2 && g.attributes.name.toLowerCase().includes(t))) continue // leader-of-own-group
    drifters.push({name,group:g.attributes.name.replace(/\s*-\s*/g,' · ').replace(/’s|'s/g,'').slice(0,38),attended:dates.length,weeksSince:weeks})
  }
}
drifters.sort((a,b)=>b.attended-a.attended)
await writeFile('scratchpad/pco-raw/group_drift_v2.json',JSON.stringify({flagged:drifters.length,groups:groupsWithData,people:drifters},null,2))
console.log('IN-SEASON group drifters:',drifters.length,'| groups w/ data:',groupsWithData)
console.log('sample:',drifters.slice(0,8).map(d=>`${d.name} (${d.attended}x, quiet ${d.weeksSince}w)`).join('\n  '))
