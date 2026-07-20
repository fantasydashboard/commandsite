// Serving rate for English vs Brazilian, using growth-group membership as the
// congregation identifier, cross-referenced with who has a volunteer check-in.
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const B = 'https://api.planningcenteronline.com/groups/v2'
const sleep = ms => new Promise(s=>setTimeout(s,ms))
const get = async (u) => { for(let i=0;i<10;i++){const r=await fetch(u,{headers:{Authorization:AUTH}});if(r.ok){await sleep(100);return r.json()}if(r.status===429){await sleep((Number(r.headers.get('retry-after')||3)+1)*1000);continue}throw new Error(r.status)}throw new Error('rl') }
const all = async (u) => { const o=[];let url=u;while(url){const j=await get(url);o.push(...j.data);url=j.links?.next}return o }
const types=(await get(`${B}/group_types?per_page=25`)).data.filter(t=>/growth group/i.test(t.attributes.name))
const typeName=Object.fromEntries(types.map(t=>[t.id,t.attributes.name]))
let groups=[]; for(const t of types) for(const g of await all(`${B}/group_types/${t.id}/groups?per_page=100`)) groups.push({g,type:typeName[t.id]})
groups=groups.filter(x=>x.g.attributes.archived_at==null)
const eng=new Set(), bra=new Set()
let done=0
for(const {g,type} of groups){
  done++; if(done%15===0)console.error(`  ${done}/${groups.length}`)
  const isYouth=type.includes('YTH'); if(isYouth) continue   // students, not the adult serving comparison
  const brazilian=/brasil|brazil/i.test(g.attributes.name)
  const mem=await all(`${B}/groups/${g.id}/memberships?per_page=100`)
  for(const m of mem){const pid=m.relationships?.person?.data?.id; if(!pid)continue; if(brazilian)bra.add(pid); else eng.add(pid)}
}
// people in both -> count as Brazilian; remove from English
for(const id of bra) eng.delete(id)
// serving set
const vc=JSON.parse(await readFile('scratchpad/pco-raw/volunteer_checkins.json','utf8'))
const serving=new Set(vc.map(c=>c.person_id))
const rate=(set)=>{let s=0;for(const id of set)if(serving.has(id))s++;return {total:set.size,serve:s,pct:Math.round(s/set.size*100)}}
const E=rate(eng), Br=rate(bra)
console.log('ENGLISH  group members:',E.total,'| serve:',E.serve,'|',E.pct+'%')
console.log('BRAZILIAN group members:',Br.total,'| serve:',Br.serve,'|',Br.pct+'%')
await writeFile('scratchpad/pco-raw/congregation_serving.json',JSON.stringify({english:E,brazilian:Br},null,2))
