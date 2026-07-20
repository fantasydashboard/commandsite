// Pulls the person-level data for the assimilation funnel: for each Starting Point
// workflow, every card's person + when they entered + whether they completed; plus
// the set of people who went through "Meet the Pastor". Combined later with the
// serving schedule + group membership (already pulled) to trace one cohort through
// visit -> Starting Point complete -> Meet the Pastor -> serving -> group.
// Output: scratchpad/pco-raw/assimilation.json
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
const cards = async (id) => {
  const out = []
  let url = `https://api.planningcenteronline.com/people/v2/workflows/${id}/cards?per_page=100&order=created_at`
  while (url) {
    const j = await get(url)
    for (const c of j.data) {
      out.push({
        pid: c.relationships?.person?.data?.id ?? null,
        created: (c.attributes.created_at || '').slice(0, 10),
        completed: c.attributes.completed_at ? c.attributes.completed_at.slice(0, 10) : null,
      })
    }
    url = j.links?.next
  }
  return out
}

const SP = { english: '113763', brazilian: '599785' }
const MEET_THE_PASTOR = '526735'

const startingPoint = {}
for (const [cong, id] of Object.entries(SP)) {
  startingPoint[cong] = await cards(id)
  console.error(`${cong} Starting Point: ${startingPoint[cong].length} cards`)
}
const mtpCards = await cards(MEET_THE_PASTOR)
const metPastor = [...new Set(mtpCards.map((c) => c.pid).filter(Boolean))]
console.log(`Meet the Pastor: ${metPastor.length} distinct people`)

await writeFile('scratchpad/pco-raw/assimilation.json', JSON.stringify({ startingPoint, metPastor }, null, 2))
console.log('wrote scratchpad/pco-raw/assimilation.json')
