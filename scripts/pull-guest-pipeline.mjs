// Pulls recent first-time guests from both Starting Point workflows, per
// congregation, with their name + current follow-up step + dates, so Front Desk &
// Guests can scope by congregation with REAL guests (not a curated set). English =
// "Starting Point - Weekend Service", Brazilian = "Starting Point/Brazilian
// Service". Recent = created since the cutoff (the active pipeline).
// Output: scratchpad/pco-raw/guest_pipeline.json  { english: [...], brazilian: [...] }
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

const CUTOFF = '2026-03-01' // the active pipeline window
const WORKFLOWS = { english: '113763', brazilian: '599785' }
const out = {}
for (const [cong, id] of Object.entries(WORKFLOWS)) {
  const guests = []
  let url = `https://api.planningcenteronline.com/people/v2/workflows/${id}/cards?per_page=100&order=-created_at&include=person,current_step`
  let stop = false
  while (url && !stop) {
    const j = await get(url)
    const persons = Object.fromEntries((j.included || []).filter((x) => x.type === 'Person').map((p) => [p.id, (p.attributes.name || '').trim()]))
    const steps = Object.fromEntries((j.included || []).filter((x) => x.type === 'WorkflowStep').map((s) => [s.id, (s.attributes.name || '').trim()]))
    for (const c of j.data) {
      const created = (c.attributes.created_at || '').slice(0, 10)
      if (created && created < CUTOFF) { stop = true; break }
      guests.push({
        name: persons[c.relationships?.person?.data?.id] || '',
        created,
        completed: c.attributes.completed_at ? c.attributes.completed_at.slice(0, 10) : null,
        step: steps[c.relationships?.current_step?.data?.id] || '',
      })
    }
    url = j.links?.next
  }
  out[cong] = guests
  console.log(`${cong}: ${guests.length} recent guests (since ${CUTOFF})`)
}
await writeFile('scratchpad/pco-raw/guest_pipeline.json', JSON.stringify(out, null, 2))
console.log('wrote scratchpad/pco-raw/guest_pipeline.json')
