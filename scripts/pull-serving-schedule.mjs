// Rebuilds serving on the RIGHT signal: Planning Center SERVICES scheduling, not
// check-ins. Check-ins undercount (people serve without tapping the kiosk; whole
// teams don't use it), so absence of a check-in never means "stopped serving".
// Scheduling is complete across every team: who is put on the plan and their
// confirmation status. This pulls, per person, every scheduled date across ALL
// service types + teams (past ~7 months + all upcoming), with team + status.
// Output: scratchpad/pco-raw/serving_schedule.json
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const B = 'https://api.planningcenteronline.com/services/v2'
const sleep = (ms) => new Promise((s) => setTimeout(s, ms))
const get = async (u) => {
  for (let i = 0; i < 10; i++) {
    const r = await fetch(u, { headers: { Authorization: AUTH } })
    if (r.ok) { await sleep(90); return r.json() }
    if (r.status === 429) { await sleep((Number(r.headers.get('retry-after') || 3) + 1) * 1000); continue }
    throw new Error(`${r.status} ${u.slice(50)}`)
  }
  throw new Error('rate-limited')
}
const allPages = async (u) => {
  const out = []
  let url = u
  while (url) { const j = await get(url); out.push(j); url = j.links?.next }
  return out
}

const CUTOFF = '2025-12-01' // ~7 months back to establish a regular server
const serviceTypes = (await get(`${B}/service_types?per_page=100`)).data
console.error(`service types: ${serviceTypes.length}`)

// person id -> { name, dates: [{date, team, status}] }
const byPerson = new Map()
let planCount = 0

for (const st of serviceTypes) {
  const stName = st.attributes.name
  // past plans (bounded by CUTOFF) + all future plans
  const pastPages = await allPages(`${B}/service_types/${st.id}/plans?filter=past&per_page=50&order=-sort_date`)
  const futurePages = await allPages(`${B}/service_types/${st.id}/plans?filter=future&per_page=50&order=sort_date`)
  const plans = []
  for (const pg of pastPages) {
    let stop = false
    for (const p of pg.data) {
      const date = (p.attributes.sort_date || '').slice(0, 10)
      if (date && date < CUTOFF) { stop = true; break }
      plans.push({ id: p.id, date })
    }
    if (stop) break
  }
  for (const pg of futurePages) for (const p of pg.data) plans.push({ id: p.id, date: (p.attributes.sort_date || '').slice(0, 10) })

  for (const p of plans) {
    planCount++
    const tm = await get(`${B}/plans/${p.id}/team_members?per_page=200&include=team`)
    const teamName = Object.fromEntries((tm.included || []).filter((i) => i.type === 'Team').map((t) => [t.id, (t.attributes.name || '').trim()]))
    for (const m of tm.data) {
      const pid = m.relationships?.person?.data?.id
      const name = (m.attributes.name || '').trim()
      if (!pid || !name) continue
      const team = teamName[m.relationships?.team?.data?.id] || stName
      const status = m.attributes.status || '' // Confirmed / Unconfirmed / Declined
      const rec = byPerson.get(pid) || { name, dates: [] }
      rec.dates.push({ date: p.date, team, status })
      byPerson.set(pid, rec)
    }
    if (planCount % 25 === 0) console.error(`  ${planCount} plans, ${byPerson.size} people`)
  }
}

const out = {}
for (const [pid, rec] of byPerson) {
  rec.dates.sort((a, b) => (a.date < b.date ? 1 : -1))
  out[pid] = rec
}
console.log(`plans ${planCount}, people ${byPerson.size}`)
await writeFile('scratchpad/pco-raw/serving_schedule.json', JSON.stringify({ pulledThrough: null, byPerson: out }, null, 2))
console.log('wrote scratchpad/pco-raw/serving_schedule.json')
