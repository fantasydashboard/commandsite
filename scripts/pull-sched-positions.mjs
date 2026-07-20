// For each of the next 4 Sunday plans, the specific UNFILLED positions per team
// (name + quantity), so the grid can say what is short, not just how many.
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status); return r.json() }
const B = 'https://api.planningcenteronline.com/services/v2'
const st = (await get(`${B}/service_types?per_page=25`)).data
const sunday = st.find(s => /sunday service/i.test(s.attributes.name))
const future = (await get(`${B}/service_types/${sunday.id}/plans?filter=future&per_page=4&order=sort_date`)).data
const fmt = d => { const [,m,day]=d.split('T')[0].split('-').map(Number); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]+' '+day }
const out = {}
for (const p of future) {
  const np = await get(`${B}/plans/${p.id}/needed_positions?per_page=100&include=team`)
  const teamNames = Object.fromEntries((np.included||[]).filter(i=>i.type==='Team').map(t=>[t.id,t.attributes.name.trim()]))
  const byTeam = {}
  for (const n of np.data) {
    const team = teamNames[n.relationships?.team?.data?.id] || 'Other'
    const pos = n.attributes.team_position_name || 'position'
    byTeam[team] = byTeam[team] || {}
    byTeam[team][pos] = (byTeam[team][pos]||0) + (n.attributes.quantity||1)
  }
  out[fmt(p.attributes.sort_date)] = byTeam
}
await writeFile('scratchpad/pco-raw/sched_positions.json', JSON.stringify(out, null, 2))
// print for review
for (const [wk, teams] of Object.entries(out)) {
  console.log('\n==', wk, '==')
  for (const [team, pos] of Object.entries(teams)) {
    console.log('  '+team+': '+Object.entries(pos).map(([p,q])=>`${p}${q>1?' x'+q:''}`).join(', '))
  }
}
