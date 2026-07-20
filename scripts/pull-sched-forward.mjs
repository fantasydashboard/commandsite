// Build the baseline (which teams normally serve, from past plans) and the
// forward view (next 4 Sundays, per team: scheduled-by-status + needed), then
// derive a flag per team per week: forgotten / empty / short / unconfirmed / ok.
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status); return r.json() }
const B = 'https://api.planningcenteronline.com/services/v2'
const st = (await get(`${B}/service_types?per_page=25`)).data
const sunday = st.find(s => /sunday service/i.test(s.attributes.name))

async function planTeams(planId) {
  const tm = await get(`${B}/plans/${planId}/team_members?per_page=200&include=team`)
  const names = Object.fromEntries((tm.included||[]).filter(i=>i.type==='Team').map(t=>[t.id,t.attributes.name.trim()]))
  const sched = {}
  for (const m of tm.data) {
    const team = names[m.relationships?.team?.data?.id] || 'Unknown'
    const s = (m.attributes.status||'').toLowerCase()
    sched[team] = sched[team] || { C:0,U:0,D:0,total:0 }; sched[team].total++
    if (s.startsWith('c')) sched[team].C++; else if (s.startsWith('u')) sched[team].U++; else if (s.startsWith('d')) sched[team].D++
  }
  const np = await get(`${B}/plans/${planId}/needed_positions?per_page=100&include=team`)
  const npNames = Object.fromEntries((np.included||[]).filter(i=>i.type==='Team').map(t=>[t.id,t.attributes.name.trim()]))
  const need = {}
  for (const n of np.data) { const t = npNames[n.relationships?.team?.data?.id]||n.attributes.team_position_name; need[t]=(need[t]||0)+(n.attributes.quantity||1) }
  return { sched, need }
}

const past = (await get(`${B}/service_types/${sunday.id}/plans?filter=past&per_page=8&order=-sort_date`)).data
const future = (await get(`${B}/service_types/${sunday.id}/plans?filter=future&per_page=4&order=sort_date`)).data

// baseline: fraction of past plans each team had ANY scheduled person
const presence = {}
for (const p of past) { const { sched } = await planTeams(p.id); for (const t of Object.keys(sched)) presence[t]=(presence[t]||0)+1 }
const baseline = Object.fromEntries(Object.entries(presence).map(([t,c])=>[t, +(c/past.length).toFixed(2)]))
const expected = Object.keys(baseline).filter(t => baseline[t] >= 0.6) // runs most Sundays

console.log('BASELINE (team: fraction of last', past.length, 'Sundays present):')
Object.entries(baseline).sort((a,b)=>b[1]-a[1]).forEach(([t,f])=>console.log(`  ${String(Math.round(f*100)).padStart(3)}%  ${t}`))
console.log('\nEXPECTED every Sunday (>=60%):', expected.join(', '))

const weeks = []
for (const p of future) {
  const { sched, need } = await planTeams(p.id)
  const teams = expected.map(t => {
    const s = sched[t]||{C:0,U:0,D:0,total:0}; const nd = need[t]||0
    let flag
    if (s.total===0 && nd===0) flag='forgotten'
    else if (s.total===0 && nd>0) flag='empty'
    else if (nd>0) flag='short'
    else if (s.U>0) flag='unconfirmed'
    else flag='ok'
    return { team: t, sched: s.total, C:s.C, U:s.U, D:s.D, need: nd, flag }
  })
  weeks.push({ date: p.attributes.sort_date.slice(0,10), teams })
}
await writeFile('scratchpad/pco-raw/sched_forward.json', JSON.stringify({ baseline, expected, weeks }, null, 2))
console.log('\nFORWARD FLAGS by week:')
for (const w of weeks) {
  const bad = w.teams.filter(t=>t.flag!=='ok')
  console.log(`\n  ${w.date}:  ` + (bad.length? bad.map(t=>`${t.team}[${t.flag}${t.need?' n'+t.need:''}${t.D?' D'+t.D:''}]`).join('  ') : 'all clear'))
}
