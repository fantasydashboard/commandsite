import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local','utf8')
const PAT=(env.match(/PCO_PAT=(.+)/)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const AUTH='Basic '+Buffer.from(PAT).toString('base64')
const get=async(u)=>{const r=await fetch(u,{headers:{Authorization:AUTH}});if(!r.ok)return{error:r.status};return r.json()}
// 1) membership status values distribution (is there a Brazilian membership status?)
const ms=await get('https://api.planningcenteronline.com/people/v2/people?per_page=1&group=membership')
// membership field values - sample by pulling a few and listing distinct
const mvals=new Set()
let url='https://api.planningcenteronline.com/people/v2/people?per_page=100&where[status]=active'
for(let i=0;i<3&&url;i++){const j=await get(url);for(const p of j.data)if(p.attributes.membership)mvals.add(p.attributes.membership);url=j.links?.next}
console.log('membership values (sample):', [...mvals].join(' | '))
// 2) lists that look like members / brazilian
const lists=await get('https://api.planningcenteronline.com/people/v2/lists?per_page=100')
const rel=lists.data.filter(l=>/member|membro|brasil|brazil|congreg/i.test(l.attributes.name))
console.log('\nrelevant lists:', rel.map(l=>`${l.attributes.name} (${l.attributes.total_people ?? '?'})`).join(' | ') || 'none')
