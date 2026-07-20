import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const B = 'https://api.planningcenteronline.com/groups/v2'
const sleep = ms => new Promise(s=>setTimeout(s,ms))
const get = async (u) => {
  for(let i=0;i<10;i++){
    const r=await fetch(u,{headers:{Authorization:AUTH}})
    if(r.ok){ await sleep(120); return r.json() }
    if(r.status===429){ const ra=Number(r.headers.get('retry-after')||3); await sleep((ra+1)*1000); continue }
    if(r.status>=500){ await sleep(2500); continue }
    throw new Error(r.status)
  }
  throw new Error('rate-limited-out')
}
const all = async (u) => { const o=[];let url=u;while(url){const j=await get(url);o.push(...j.data);url=j.links?.next}return o }
const S=new Date('2025-09-01'), E=new Date('2026-05-01')
const types=(await get(`${B}/group_types?per_page=25`)).data.filter(t=>/growth group/i.test(t.attributes.name))
const typeName=Object.fromEntries(types.map(t=>[t.id,t.attributes.name]))
let groups=[]; for(const t of types) for(const g of await all(`${B}/group_types/${t.id}/groups?per_page=100`)) groups.push({g,type:typeName[t.id]})
groups=groups.filter(x=>x.g.attributes.archived_at==null)
const rows=[]
let done=0
for(const {g,type} of groups){
  done++; console.error(`  ${done}/${groups.length}`)
  const evs=(await all(`${B}/groups/${g.id}/events?per_page=100&order=-starts_at`)).filter(e=>{const d=new Date(e.attributes.starts_at);return d>=S&&d<E})
  let counts=[]
  for(const e of evs){ const a=await all(`${B}/events/${e.id}/attendances?per_page=200`); counts.push(a.filter(x=>x.attributes.attended).length) }
  const meetings=counts.filter(c=>c>0)
  const avg=meetings.length?Math.round(meetings.reduce((s,c)=>s+c,0)/meetings.length):0
  const name=g.attributes.name
  const brazilian=/brasil|brazil/i.test(name)
  const t = type.includes('Zoom')?'Zoom':type.includes('YTH')?'Youth':(brazilian?'Brazilian':'English')
  rows.push({name,type:t,members:g.g?.attributes?.memberships_count||g.attributes.memberships_count||0,avgAtt:avg,meetings:meetings.length})
}
rows.sort((a,b)=>b.avgAtt-a.avgAtt)
await writeFile('scratchpad/pco-raw/group_detail.json',JSON.stringify(rows,null,2))
console.log('DONE, wrote', rows.length, 'groups')
