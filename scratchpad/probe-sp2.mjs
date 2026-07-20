import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local','utf8')
const PAT=(env.match(/PCO_PAT=(.+)/)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const AUTH='Basic '+Buffer.from(PAT).toString('base64')
const get=async(u)=>{const r=await fetch(u,{headers:{Authorization:AUTH}});if(!r.ok)return{error:r.status,url:u};return r.json()}
const IDS={english:'113763',brazilian:'599785'}
for(const [k,id] of Object.entries(IDS)){
  // cards - default (ready) and try filter for all/completed
  const ready=await get(`https://api.planningcenteronline.com/people/v2/workflows/${id}/cards?per_page=1&order=-created_at`)
  console.log(`\n${k} workflow ${id}:`)
  console.log('  cards endpoint total_count:', ready.meta?.total_count, '| sample card attrs:', JSON.stringify(ready.data?.[0]?.attributes)?.slice(0,200))
  // does it include completed? check stage
  const withStage=await get(`https://api.planningcenteronline.com/people/v2/workflows/${id}/cards?per_page=3&include=current_step&order=created_at`)
  console.log('  earliest card created:', withStage.data?.[0]?.attributes?.created_at?.slice(0,10))
  // activities give history; but let's see completed via workflow attributes
  const wf=await get(`https://api.planningcenteronline.com/people/v2/workflows/${id}`)
  const a=wf.data?.attributes
  console.log('  workflow: total_ready', a?.total_ready_card_count, '| completed', a?.completed_card_count, '| total_cards', a?.total_cards_count ?? a?.card_count)
}
