// Verify the scheduling model: for the next Sunday plan, per team, how many are
// SCHEDULED (by status) vs NEEDED (unfilled). Distinguishes: fully staffed /
// short / set-up-but-empty / not-on-plan-at-all. Also lists baseline teams.
import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0,120)); return r.json() }
const B = 'https://api.planningcenteronline.com/services/v2'

const st = (await get(`${B}/service_types?per_page=25`)).data
const sunday = st.find(s => /sunday service/i.test(s.attributes.name))

// baseline: all teams defined for Sunday Service
const allTeams = (await get(`${B}/service_types/${sunday.id}/teams?per_page=100`)).data.map(t => t.attributes.name)
console.log('BASELINE teams defined for Sunday Service:', allTeams.length)
console.log(' ', allTeams.join(', '))

// next plan
const plan = (await get(`${B}/service_types/${sunday.id}/plans?filter=future&per_page=1&order=sort_date`)).data[0]
console.log('\nPLAN:', plan.attributes.sort_date)

// scheduled people on the plan, with status, grouped by team
const tm = await get(`${B}/plans/${plan.id}/team_members?per_page=200&include=team`)
const teamNames = Object.fromEntries((tm.included||[]).filter(i=>i.type==='Team').map(t=>[t.id,t.attributes.name]))
const sched = {}
for (const m of tm.data) {
  const tid = m.relationships?.team?.data?.id
  const team = teamNames[tid] || 'Unknown'
  const status = m.attributes.status || 'unknown'
  sched[team] = sched[team] || { C:0, U:0, D:0, total:0 }
  sched[team].total++
  if (/^C/i.test(status)) sched[team].C++; else if (/^U/i.test(status)) sched[team].U++; else if (/^D/i.test(status)) sched[team].D++
}
// needed (gaps) by team
const np = await get(`${B}/plans/${plan.id}/needed_positions?per_page=100&include=team`)
const npTeams = Object.fromEntries((np.included||[]).filter(i=>i.type==='Team').map(t=>[t.id,t.attributes.name]))
const need = {}
for (const n of np.data) { const team = npTeams[n.relationships?.team?.data?.id] || n.attributes.team_position_name; need[team]=(need[team]||0)+(n.attributes.quantity||1) }

console.log('\nPER TEAM on this plan (scheduled by status  |  still needed):')
for (const t of allTeams) {
  const s = sched[t] || {C:0,U:0,D:0,total:0}
  const nd = need[t] || 0
  let flag
  if (s.total===0 && nd===0) flag = 'NOT ON PLAN (forgotten?)'
  else if (s.total===0 && nd>0) flag = 'SET UP, NOBODY SCHEDULED'
  else if (nd>0) flag = 'SHORT'
  else if (s.U>0) flag = 'unconfirmed only'
  else flag = 'ok'
  console.log(`  ${t.padEnd(30)} sched ${s.total} (C${s.C}/U${s.U}/D${s.D})  need ${String(nd).padStart(2)}   -> ${flag}`)
}
