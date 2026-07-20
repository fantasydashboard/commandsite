// Remove minors from the Burnout Watch (kids serving a lot is engagement, not
// burnout). Fetches child/birthdate for each flagged person and drops minors.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'scratchpad', 'pco-raw')
const BASE = 'https://api.planningcenteronline.com'
const t = (await readFile(join(ROOT, '.env.local'), 'utf8')).split('\n').find((l) => l.startsWith('PCO_PAT=')).split('=')[1].trim()
const basic = Buffer.from(t).toString('base64')
async function pco(p) {
  const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' } })
  return { s: r.status, j: await r.json().catch(() => null) }
}
const load = async (f) => JSON.parse(await readFile(join(RAW, f), 'utf8'))

const burnout = await load('burnout.json')
const vols = await load('volunteer_checkins.json')
const norm = (s) => (s || '').trim().toLowerCase()
const volId = {}
for (const c of vols) if (c.person_id) volId[`${norm(c.first)}|${norm(c.last)}`] = c.person_id

// unique person ids for burnout people
const keyToId = new Map()
for (const p of burnout) {
  const id = volId[`${norm(p.first)}|${norm(p.last)}`]
  if (id) keyToId.set(`${norm(p.first)}|${norm(p.last)}`, id)
}
const ids = [...new Set(keyToId.values())]
console.log('Checking child/age for', ids.length, 'burnout people...')

const now = Date.parse('2026-07-12'), YEAR = 365.25 * 864e5
const minorById = {}
for (const id of ids) {
  const r = await pco(`/people/v2/people/${id}`)
  const a = r.j?.data?.attributes ?? {}
  const age = a.birthdate ? (now - Date.parse(a.birthdate)) / YEAR : null
  minorById[id] = a.child === true || (age !== null && age < 18)
}

const adults = burnout.filter((p) => {
  const id = volId[`${norm(p.first)}|${norm(p.last)}`]
  return id ? !minorById[id] : true // keep if unknown
})
await writeFile(join(RAW, 'burnout.json'), JSON.stringify(adults, null, 2))
console.log(`Removed ${burnout.length - adults.length} minors. ${adults.length} adult volunteers remain (${adults.filter((r) => r.tier === 'high').length} high).`)
console.log('New top:', adults.slice(0, 6).map((r) => `${r.first} ${r.last} (${r.perMonth}/mo)`).join(', '))
