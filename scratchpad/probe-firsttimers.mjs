import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local','utf8')
const PAT=(env.match(/PCO_PAT=(.+)/)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const AUTH='Basic '+Buffer.from(PAT).toString('base64')
const get=async(u)=>{const r=await fetch(u,{headers:{Authorization:AUTH}});if(!r.ok)return {error:r.status};return r.json()}

// 1) Check-Ins events (first-timer capture usually lives here as an event)
const ci=await get('https://api.planningcenteronline.com/check-ins/v2/events?per_page=100&order=name')
console.log('=== CHECK-INS EVENTS ===')
if(ci.data) for(const e of ci.data) console.log('  '+e.attributes.name+(e.attributes.archived_at?' [archived]':''))

// 2) People workflows (first-timer follow-up workflows)
const wf=await get('https://api.planningcenteronline.com/people/v2/workflows?per_page=100&order=name')
console.log('\n=== PEOPLE WORKFLOWS ===')
if(wf.data) for(const w of wf.data) console.log('  '+w.attributes.name)

// 3) People forms (Starting Point / connect cards, may have a Brazilian one)
const fm=await get('https://api.planningcenteronline.com/people/v2/forms?per_page=100&order=name')
console.log('\n=== PEOPLE FORMS ===')
if(fm.data) for(const f of fm.data) console.log('  '+f.attributes.name+(f.attributes.archived?' [archived]':''))
