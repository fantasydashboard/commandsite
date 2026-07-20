import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status); return r.json() }
const B = 'https://api.planningcenteronline.com/services/v2'
const st = (await get(`${B}/service_types?per_page=25`)).data
const sunday = st.find(s => /sunday service/i.test(s.attributes.name))
const plans = (await get(`${B}/service_types/${sunday.id}/plans?filter=future&per_page=1&order=sort_date`)).data
const plan = plans[0]
const j = await get(`${B}/plans/${plan.id}/needed_positions?per_page=100&include=team`)
const teams = Object.fromEntries((j.included || []).filter(i => i.type === 'Team').map(t => [t.id, t.attributes.name]))
const byTeam = {}
for (const n of j.data) {
  const tid = n.relationships?.team?.data?.id
  const team = teams[tid] || n.attributes.team_position_name || 'Other'
  byTeam[team] = (byTeam[team] || 0) + (n.attributes.quantity || 1)
}
const grouped = Object.entries(byTeam).sort((a,b)=>b[1]-a[1]).map(([team, short]) => ({ team, short }))
console.log('Plan:', plan.attributes.sort_date, plan.attributes.title || '')
console.log('Total positions still needed:', grouped.reduce((a,g)=>a+g.short,0))
grouped.forEach(g => console.log(`  ${g.short}x  ${g.team}`))
await writeFile('scratchpad/pco-raw/roster_gaps.json', JSON.stringify({ date: plan.attributes.sort_date, grouped }, null, 2))
