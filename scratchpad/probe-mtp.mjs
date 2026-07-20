import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local','utf8')
const PAT=(env.match(/PCO_PAT=(.+)/)||[])[1]?.trim().replace(/^["']|["']$/g,'')
const AUTH='Basic '+Buffer.from(PAT).toString('base64')
const get=async(u)=>{const r=await fetch(u,{headers:{Authorization:AUTH}});if(!r.ok)return{error:r.status,url:u.slice(50)};return r.json()}
// 1) workflows matching "meet the pastor"
const wf=await get('https://api.planningcenteronline.com/people/v2/workflows?per_page=100')
const mtp=wf.data.filter(w=>/meet the pastor|conheça o pastor|pastor/i.test(w.attributes.name))
console.log('MEET-THE-PASTOR workflows:')
for(const w of mtp) console.log(`  ${w.attributes.name} (id ${w.id}) - total_cards ${w.attributes.total_cards_count ?? '?'}, ready ${w.attributes.total_ready_card_count}, completed ${w.attributes.completed_card_count}`)
// 2) check-in events matching
const ci=await get('https://api.planningcenteronline.com/check-ins/v2/events?per_page=100&where[name]=Meet the Pastor')
console.log('\ncheck-in events "Meet the Pastor":', ci.data?.map(e=>e.attributes.name).join(' | ') || 'none via filter')
