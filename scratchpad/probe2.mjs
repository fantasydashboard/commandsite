import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local','utf8')
const PAT=(env.match(/PCO_PAT=(.+)/)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const AUTH='Basic '+Buffer.from(PAT).toString('base64')
const get=async(u)=>{const r=await fetch(u,{headers:{Authorization:AUTH}});if(!r.ok)throw new Error(r.status+' '+u);return r.json()}
// try including event + event_times + locations
const j=await get('https://api.planningcenteronline.com/check-ins/v2/check_ins?include=event,event_times,locations&per_page=10&order=-created_at')
const inc = j.included||[]
console.log('included types:', [...new Set(inc.map(x=>x.type))])
const ev = inc.filter(x=>x.type==='Event')
console.log('Event names:', [...new Set(ev.map(x=>x.attributes.name))].slice(0,12))
const et = inc.filter(x=>x.type==='EventTime')
console.log('EventTime (hour/dow/name):', et.slice(0,6).map(x=>`h${x.attributes.hour} d${x.attributes.day_of_week} ${x.attributes.name||''}`))
const loc = inc.filter(x=>x.type==='Location')
console.log('Location names:', [...new Set(loc.map(x=>x.attributes.name))].slice(0,10))
// a check-in: kind + which event/eventtime it links
const c=j.data[0]
console.log('checkin kind:', c.attributes.kind, '| rels:', Object.keys(c.relationships))
console.log('  event:', JSON.stringify(c.relationships.event?.data), '| event_times:', JSON.stringify(c.relationships.event_times?.data))
