import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local','utf8')
const PAT=(env.match(/PCO_PAT=(.+)/)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const AUTH='Basic '+Buffer.from(PAT).toString('base64')
const sleep=ms=>new Promise(s=>setTimeout(s,ms))
const get=async(u)=>{for(let i=0;i<10;i++){const r=await fetch(u,{headers:{Authorization:AUTH}});if(r.ok){await sleep(90);return r.json()}if(r.status===429){await sleep((Number(r.headers.get('retry-after')||3)+1)*1000);continue}throw new Error(r.status)}throw new Error('rl')}
const all=async(u)=>{const o=[];let url=u;while(url){const j=await get(url);o.push(...j.data);url=j.links?.next}return o}
// find brazilian meet-the-pastor events
const ev=await get('https://api.planningcenteronline.com/check-ins/v2/events?per_page=200')
const bra=ev.data.filter(e=>/ministério brasileiro|ministerio brasileiro/i.test(e.attributes.name) && /pastor/i.test(e.attributes.name))
console.error('brazilian meet-pastor events:', bra.map(e=>`${e.attributes.name} (${e.id})`).join(' | '))
const pids=new Set()
for(const e of bra){
  // check-ins for this event
  const cis=await all(`https://api.planningcenteronline.com/check-ins/v2/events/${e.id}/check_ins?per_page=200&include=person`)
  for(const c of cis){const pid=c.relationships?.person?.data?.id; if(pid)pids.add(pid)}
}
console.log('brazilian met-pastor distinct people:', pids.size)
await writeFile('scratchpad/pco-raw/bra_met_pastor.json', JSON.stringify([...pids],null,2))
