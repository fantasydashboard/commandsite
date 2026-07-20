import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local','utf8')
const PAT=(env.match(/PCO_PAT=(.+)/)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const AUTH='Basic '+Buffer.from(PAT).toString('base64')
const get=async(u)=>{const r=await fetch(u,{headers:{Authorization:AUTH}});if(!r.ok)throw new Error(r.status+' '+u);return r.json()}
const j=await get('https://api.planningcenteronline.com/check-ins/v2/check_ins?include=event_times&per_page=5&order=-created_at')
console.log('check_in attrs:', JSON.stringify(j.data[0]?.attributes).slice(0,260))
console.log('relationships:', Object.keys(j.data[0]?.relationships||{}))
console.log('event_times rel data:', JSON.stringify(j.data[0]?.relationships?.event_times?.data))
console.log('person rel:', JSON.stringify(j.data[0]?.relationships?.person?.data))
const types=[...new Set((j.included||[]).map(x=>x.type))]
console.log('included types:', types)
const et=(j.included||[]).filter(x=>x.type==='EventTime')
console.log('EventTime sample attrs:', JSON.stringify(et[0]?.attributes))
