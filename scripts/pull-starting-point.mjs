// Pulls every Starting Point card (first-time visitor entry) from both workflows,
// keyed by congregation, with just the created_at date. Powers the per-congregation
// first-timer flow (weekly), the by-year bars, and the "Average visitors" KPI.
// English = "Starting Point - Weekend Service", Brazilian = "Starting Point/Brazilian Service".
// Output: scratchpad/pco-raw/starting_point.json  { english: [dates], brazilian: [dates] }
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
const WORKFLOWS = { english: '113763', brazilian: '599785' }
const out = {}
for (const [cong, id] of Object.entries(WORKFLOWS)) {
  const dates = []
  let url = `https://api.planningcenteronline.com/people/v2/workflows/${id}/cards?per_page=100&order=created_at`
  let page = 0
  while (url) {
    page++
    const j = await get(url)
    for (const c of j.data) {
      const d = (c.attributes.created_at || '').slice(0, 10)
      if (d) dates.push(d)
    }
    if (page % 10 === 0) console.error(`  ${cong}: ${dates.length} cards`)
    url = j.links?.next
  }
  out[cong] = dates
  console.log(`${cong}: ${dates.length} Starting Point cards (${dates[0]} to ${dates[dates.length - 1]})`)
}
await writeFile('scratchpad/pco-raw/starting_point.json', JSON.stringify(out, null, 2))
console.log('wrote scratchpad/pco-raw/starting_point.json')
