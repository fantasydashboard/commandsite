import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local','utf8')
const PAT=(env.match(/PCO_PAT=(.+)/)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const AUTH='Basic '+Buffer.from(PAT).toString('base64')
const PB='https://api.planningcenteronline.com/people/v2'
const get=async(u)=>{const r=await fetch(u,{headers:{Authorization:AUTH}});if(!r.ok)throw new Error(r.status);return r.json()}
const staff=new Set()
for (const perm of ['Manager','Editor']) { let url=`${PB}/people?where[people_permissions]=${perm}&per_page=100`; while(url){const j=await get(url);j.data.forEach(p=>staff.add(p.attributes.name.trim()));url=j.links?.next} }
let url=`${PB}/people?where[site_administrator]=true&per_page=100`; while(url){const j=await get(url);j.data.forEach(p=>staff.add(p.attributes.name.trim()));url=j.links?.next}
await writeFile('scratchpad/pco-raw/staff.json', JSON.stringify([...staff],null,2))
console.log('staff excluded:', staff.size, '| David Bunch:', staff.has('David Bunch'))
