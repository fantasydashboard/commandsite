import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local','utf8')
const PAT=(env.match(/PCO_PAT=(.+)/)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const AUTH='Basic '+Buffer.from(PAT).toString('base64')
const get=async(u)=>{const r=await fetch(u,{headers:{Authorization:AUTH}});if(!r.ok)throw new Error(r.status);return r.json()}
const st=(await get('https://api.planningcenteronline.com/services/v2/service_types?per_page=100')).data
console.log('service types:', st.map(s=>s.attributes.name).join(' | '))
// PCO People campuses?
try {
  const camp=(await get('https://api.planningcenteronline.com/people/v2/campuses?per_page=25')).data
  console.log('\nPCO campuses:', camp.length ? camp.map(c=>c.attributes.name).join(' | ') : '(none configured)')
} catch(e){ console.log('\ncampuses endpoint:', String(e).slice(0,40)) }
