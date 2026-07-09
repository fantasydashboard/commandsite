// Explore serving data: volunteer check-ins + Services scheduling.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
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
await mkdir(RAW, { recursive: true })

// ── A) Volunteer check-ins across ALL events
console.log('A) Volunteer check-ins (kind=Volunteer, all events)...')
const vol = []
let url = `/check-ins/v2/check_ins?where[kind]=Volunteer&include=person,event&per_page=100&order=-created_at`
let pages = 0
while (url && pages < 100) {
  const r = await pco(url)
  if (r.s !== 200) { console.log('  status', r.s); break }
  const persons = {}, events = {}
  for (const inc of r.j.included ?? []) {
    if (inc.type === 'Person') persons[inc.id] = inc.attributes
    if (inc.type === 'Event') events[inc.id] = inc.attributes
  }
  for (const c of r.j.data ?? []) {
    const p = persons[c.relationships?.person?.data?.id] ?? {}
    const ev = events[c.relationships?.event?.data?.id] ?? {}
    vol.push({ created_at: c.attributes?.created_at, person_id: c.relationships?.person?.data?.id, first: p.first_name, last: p.last_name, membership: p.membership, area: ev.name ?? null })
  }
  pages++
  url = r.j.links?.next ? r.j.links.next.replace(BASE, '') : null
  const oldest = vol[vol.length - 1]?.created_at
  if (oldest && Date.parse('2026-07-09') - Date.parse(oldest) > 864e5 * 300) break
}
await writeFile(join(RAW, 'volunteer_checkins.json'), JSON.stringify(vol, null, 2))
console.log(`  ${vol.length} volunteer check-ins, ${new Set(vol.map(v=>v.person_id)).size} distinct people, range ${vol[vol.length-1]?.created_at?.slice(0,10)} to ${vol[0]?.created_at?.slice(0,10)}`)

// ── B) Services scheduling: recent Sunday Service plans -> team_members
console.log('\nB) Services scheduling (Sunday Service team_members)...')
const types = await pco('/services/v2/service_types?per_page=25')
const sunday = (types.j?.data ?? []).find((x) => /^sunday service$/i.test(x.attributes.name))
console.log('  Sunday Service type id:', sunday?.id)
if (sunday) {
  const plans = await pco(`/services/v2/service_types/${sunday.id}/plans?order=-sort_date&per_page=5&filter=past`)
  console.log('  recent plans:', (plans.j?.data ?? []).map((p) => p.attributes.dates || p.attributes.sort_date?.slice(0,10)).join(', '))
  const firstPlan = plans.j?.data?.[0]
  if (firstPlan) {
    const tm = await pco(`/services/v2/service_types/${sunday.id}/plans/${firstPlan.id}/team_members?include=person&per_page=10`)
    console.log('  sample team_members on latest plan:', tm.j?.meta?.total_count, 'status', tm.s)
    ;(tm.j?.data ?? []).slice(0, 6).forEach((m) => console.log('   ', m.attributes?.name, '|', m.attributes?.team_position_name, '|', m.attributes?.status))
  }
}
