import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local','utf8')
const PAT=(env.match(/PCO_PAT=(.+)/)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const AUTH='Basic '+Buffer.from(PAT).toString('base64')
const get=async(u)=>{const r=await fetch(u,{headers:{Authorization:AUTH}});if(!r.ok)return{error:r.status};return r.json()}
const wf=await get('https://api.planningcenteronline.com/people/v2/workflows?per_page=100')
const sp=wf.data.filter(w=>/starting point/i.test(w.attributes.name))
for(const w of sp){
  const a=w.attributes
  console.log(`\n${a.name} (id ${w.id})`)
  console.log(`  total cards: ${a.total_cards} | ready: ${a.total_ready_card_count ?? '?'} | recently completed: ${a.completed_card_count ?? '?'}`)
  // recent cards to see if active
  const cards=await get(`https://api.planningcenteronline.com/people/v2/workflows/${w.id}/cards?per_page=5&order=-created_at`)
  if(cards.data) console.log(`  most recent card created: ${cards.data[0]?.attributes?.created_at?.slice(0,10) ?? 'none'}`)
}
