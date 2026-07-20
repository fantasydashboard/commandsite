// Classifies each person's congregation by which SUNDAY service they attend:
// the 6pm (evening) service is the Brazilian congregation, the morning services
// are the English congregation. Pulls PCO check-ins with their event_times,
// aggregates per person (morning vs evening Sunday check-ins), and keeps names so
// families and guests can be matched later. Output: service_congregation.json
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const sleep = (ms) => new Promise((s) => setTimeout(s, ms))
const get = async (u) => {
  for (let i = 0; i < 10; i++) {
    const r = await fetch(u, { headers: { Authorization: AUTH } })
    if (r.ok) { await sleep(90); return r.json() }
    if (r.status === 429) { await sleep((Number(r.headers.get('retry-after') || 3) + 1) * 1000); continue }
    throw new Error(String(r.status))
  }
  throw new Error('rate-limited')
}

const CUTOFF = '2025-12-01' // ~7 months, enough to establish a modal service
const MAX_PAGES = 600
// person_id -> { name, morning, evening }
const people = new Map()
let url = 'https://api.planningcenteronline.com/check-ins/v2/check_ins?include=event_times&per_page=100&order=-created_at'
let page = 0, seen = 0, stop = false
while (url && page < MAX_PAGES && !stop) {
  page++
  const j = await get(url)
  // event_time id -> { dow, hour }
  const et = new Map()
  for (const inc of j.included || []) {
    if (inc.type === 'EventTime') et.set(inc.id, { dow: inc.attributes.day_of_week, hour: inc.attributes.hour })
  }
  for (const c of j.data) {
    seen++
    const created = c.attributes.created_at || ''
    if (created && created.slice(0, 10) < CUTOFF) { stop = true; break }
    const pid = c.relationships?.person?.data?.id
    if (!pid) continue
    const times = c.relationships?.event_times?.data || []
    let morning = 0, evening = 0
    for (const t of times) {
      const e = et.get(t.id)
      if (!e || e.dow !== 0) continue // Sundays only for congregation
      if (e.hour >= 16) evening++
      else morning++
    }
    if (!morning && !evening) continue
    const rec = people.get(pid) || { name: `${c.attributes.first_name || ''} ${c.attributes.last_name || ''}`.trim(), morning: 0, evening: 0 }
    rec.morning += morning
    rec.evening += evening
    people.set(pid, rec)
  }
  if (page % 20 === 0) console.error(`  page ${page}, ${seen} check-ins, ${people.size} people`)
  url = j.links?.next
}

// classify: evening-dominant -> brazilian; otherwise english
const byPersonId = {}
const byName = {}
let bra = 0, eng = 0
for (const [pid, r] of people) {
  if (r.evening === 0 && r.morning === 0) continue
  const cong = r.evening > r.morning ? 'brazilian' : r.evening > 0 && r.evening === r.morning ? 'brazilian' : 'english'
  byPersonId[pid] = cong
  if (r.name) {
    const k = r.name.toLowerCase().replace(/\s+/g, ' ').trim()
    // brazilian wins if a name maps to multiple ids
    if (byName[k] !== 'brazilian') byName[k] = cong
  }
  if (cong === 'brazilian') bra++; else eng++
}
console.log(`pages ${page}, check-ins ${seen}, people ${people.size}`)
console.log(`classified: brazilian ${bra}, english ${eng}`)
await writeFile('scratchpad/pco-raw/service_congregation.json', JSON.stringify({ byPersonId, byName }, null, 2))
console.log('wrote scratchpad/pco-raw/service_congregation.json')
