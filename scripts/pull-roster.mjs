// Pull real PCO Services roster: teams + positions for the weekend service types,
// and the next plan's needed positions (this Sunday's gaps). Aggregate/role-level
// only. Writes scratchpad/pco-raw/roster.json.
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status + ' ' + u.slice(60) + ' ' + (await r.text()).slice(0,120)); return r.json() }
const B = 'https://api.planningcenteronline.com/services/v2'

const st = (await get(`${B}/service_types?per_page=25`)).data
const weekend = st.filter(s => /sunday|kids|nursery|check|youth/i.test(s.attributes.name))
const out = { serviceTypes: [], nextPlan: null }

for (const s of weekend.slice(0, 6)) {
  const teams = (await get(`${B}/service_types/${s.id}/teams?per_page=50`)).data
  const teamInfo = []
  for (const t of teams.slice(0, 12)) {
    const positions = (await get(`${B}/teams/${t.id}/team_positions?per_page=25`)).data
    teamInfo.push({ team: t.attributes.name, positions: positions.map(p => ({ name: p.attributes.name })) })
  }
  out.serviceTypes.push({ name: s.attributes.name, id: s.id, teams: teamInfo })
}

// next plan + needed positions for Sunday Service
const sunday = weekend.find(s => /sunday service/i.test(s.attributes.name)) || weekend[0]
if (sunday) {
  const plans = (await get(`${B}/service_types/${sunday.id}/plans?filter=future&per_page=2&order=sort_date`)).data
  if (plans[0]) {
    const np = (await get(`${B}/plans/${plans[0].id}/needed_positions?per_page=50&include=team`)).data
    out.nextPlan = { date: plans[0].attributes.sort_date, title: plans[0].attributes.title,
      needed: np.map(n => ({ quantity: n.attributes.quantity, teamPosition: n.attributes.team_position_name })) }
  }
}
await writeFile('scratchpad/pco-raw/roster.json', JSON.stringify(out, null, 2))
console.log('service types with teams:', out.serviceTypes.length)
for (const s of out.serviceTypes) console.log(`  ${s.name}: ${s.teams.map(t=>t.team).join(', ')}`)
console.log('\nnext plan:', out.nextPlan?.date, '| needed positions:', out.nextPlan?.needed?.length || 0)
if (out.nextPlan?.needed?.length) out.nextPlan.needed.slice(0,15).forEach(n=>console.log(`  ${n.quantity}x ${n.teamPosition}`))
