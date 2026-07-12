// Pull Planning Center avatar URLs for the top flagged people/families across
// all three Care & Drift signals, for the priority photo-card feed. Maps the
// aggregated (name-keyed) flags back to person ids via the raw check-in files,
// then fetches each person's avatar. Output is local-only (contains names).
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
const kids = await load('kids_checkins.json')
const vols = await load('volunteer_checkins.json')
const drift = await load('drift_committed.json')
const serving = await load('serving_drift.json')
const burnout = await load('burnout.json')

// name -> person_id maps
const norm = (s) => (s || '').trim().toLowerCase()
const kidId = {}   // "first|last" -> id
for (const c of kids) if (c.person_id) kidId[`${norm(c.first)}|${norm(c.last)}`] = c.person_id
const volId = {}
for (const c of vols) if (c.person_id) volId[`${norm(c.first)}|${norm(c.last)}`] = c.person_id

const targets = new Map() // key -> person_id
const TOP = 16
// families: key = family last name, id = first kid's person id
for (const f of drift.slice(0, TOP)) {
  const id = kidId[`${norm(f.kids[0])}|${norm(f.family)}`]
  if (id) targets.set(`family:${f.family}`, id)
}
// serving + burnout: key = "First Last"
for (const p of serving.slice(0, TOP)) {
  const id = volId[`${norm(p.first)}|${norm(p.last)}`]
  if (id) targets.set(`person:${(p.first + ' ' + p.last).trim()}`, id)
}
for (const p of burnout.slice(0, TOP)) {
  const id = volId[`${norm(p.first)}|${norm(p.last)}`]
  if (id) targets.set(`person:${(p.first + ' ' + p.last).trim()}`, id)
}

// fetch avatars (unique person ids)
const idToAvatar = {}
const uniqueIds = [...new Set(targets.values())]
console.log('Fetching avatars for', uniqueIds.length, 'people...')
for (const id of uniqueIds) {
  const r = await pco(`/people/v2/people/${id}`)
  const a = r.j?.data?.attributes?.avatar
  if (a) idToAvatar[id] = a
}
const out = {}
let real = 0
for (const [key, id] of targets) {
  const url = idToAvatar[id]
  if (url) { out[key] = url; if (!url.includes('/initials/')) real++ }
}
await writeFile(join(RAW, 'avatars.json'), JSON.stringify(out, null, 2))
console.log('Wrote', Object.keys(out).length, 'avatars (', real, 'real photos, rest PCO initials).')
