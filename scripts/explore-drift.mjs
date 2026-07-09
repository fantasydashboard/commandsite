// Explore Check-Ins for real drift + attendance. Writes raw to scratchpad.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'scratchpad', 'pco-raw')
const BASE = 'https://api.planningcenteronline.com'

async function loadToken() {
  const text = await readFile(join(ROOT, '.env.local'), 'utf8')
  const line = text.split('\n').find((l) => l.trim().startsWith('PCO_PAT='))
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
}
const basic = Buffer.from(await loadToken()).toString('base64')
async function pco(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' } })
  return { status: res.status, json: await res.json().catch(() => null) }
}
await mkdir(RAW, { recursive: true })

// ── 1. Event periods (weekly occurrences + counts) for the two Sunday events
for (const [key, id] of [['sunday_attendance', '705299'], ['kids_sunday', '209602']]) {
  const r = await pco(`/check-ins/v2/events/${id}/event_periods?per_page=30&order=-starts_at`)
  await writeFile(join(RAW, `ep_${key}.json`), JSON.stringify(r.json, null, 2))
  const periods = r.json?.data ?? []
  console.log(`\n  ${key} (${id}): ${periods.length} recent periods, status ${r.status}`)
  periods.slice(0, 8).forEach((p) => {
    const a = p.attributes
    console.log(`    ${(a.starts_at || '').slice(0, 10)}  regular=${a.regular_count ?? '?'} guest=${a.guest_count ?? '?'} volunteer=${a.volunteer_count ?? '?'}`)
  })
}

// ── 2. Recent Kids Sunday Service check-ins with person (for drift)
console.log('\n  Pulling recent Kids Sunday Service check-ins...')
const checkins = []
let url = `/check-ins/v2/events/209602/check_ins?include=person&per_page=100&order=-created_at`
let pages = 0
while (url && pages < 20) {
  const r = await pco(url)
  if (r.status !== 200) { console.log('  stopped at status', r.status); break }
  const persons = {}
  for (const inc of r.json.included ?? []) if (inc.type === 'Person') persons[inc.id] = inc.attributes
  for (const c of r.json.data ?? []) {
    const pid = c.relationships?.person?.data?.id
    const p = persons[pid] ?? {}
    checkins.push({
      created_at: c.attributes?.created_at,
      person_id: pid,
      first: p.first_name ?? null,
      last: p.last_name ?? null,
      kind: c.attributes?.kind,
    })
  }
  pages++
  const next = r.json.links?.next
  url = next ? next.replace(BASE, '') : null
  // stop once we're past ~14 weeks of data
  const oldest = checkins[checkins.length - 1]?.created_at
  if (oldest && (Date.parse('2026-07-09') - Date.parse(oldest)) > 1000 * 60 * 60 * 24 * 100) break
}
await writeFile(join(RAW, 'kids_checkins.json'), JSON.stringify(checkins, null, 2))
console.log(`  Pulled ${checkins.length} kids check-ins across ${pages} pages`)
console.log(`  Date range: ${checkins[checkins.length-1]?.created_at?.slice(0,10)} to ${checkins[0]?.created_at?.slice(0,10)}`)
