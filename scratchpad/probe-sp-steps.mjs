import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local','utf8')
const PAT=(env.match(/PCO_PAT=(.+)/)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const AUTH='Basic '+Buffer.from(PAT).toString('base64')
const get=async(u)=>{const r=await fetch(u,{headers:{Authorization:AUTH}});if(!r.ok)return{error:r.status};return r.json()}
for(const [k,id] of [['english','113763'],['brazilian','599785']]){
  const steps=await get(`https://api.planningcenteronline.com/people/v2/workflows/${id}/steps?per_page=25&order=sequence`)
  console.log(`\n${k} steps:`, steps.data?.map(s=>`${s.attributes.name}(${s.attributes.my_ready_card_count ?? s.attributes.default_assignee_id ?? ''})`).join(' -> ') || 'none')
  // recent cards with person name + current step
  const cards=await get(`https://api.planningcenteronline.com/people/v2/workflows/${id}/cards?per_page=6&order=-created_at&include=person,current_step`)
  const persons=Object.fromEntries((cards.included||[]).filter(x=>x.type==='Person').map(p=>[p.id,p.attributes.name]))
  const stepNames=Object.fromEntries((cards.included||[]).filter(x=>x.type==='WorkflowStep').map(s=>[s.id,s.attributes.name]))
  console.log(`  recent ${k} cards:`)
  for(const c of cards.data.slice(0,5)){
    const pn=persons[c.relationships?.person?.data?.id]
    const st=stepNames[c.relationships?.current_step?.data?.id]
    console.log(`    ${pn} | step: ${st} | created ${c.attributes.created_at?.slice(0,10)} | completed ${c.attributes.completed_at?.slice(0,10)||'no'}`)
  }
}
