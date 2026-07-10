// Pull weekly first-time visitor flow (Starting Point sign-ins) for Insights.
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

// Starting Point weekend (113763) + Brazilian (599785) workflow cards, by created_at.
const dates = []
for (const wf of ['113763', '599785']) {
  let url = `/people/v2/workflows/${wf}/cards?per_page=100&order=-created_at`
  let pages = 0
  while (url && pages < 30) {
    const r = await pco(url)
    if (r.s !== 200) break
    for (const c of r.j.data ?? []) dates.push(c.attributes?.created_at)
    pages++
    url = r.j.links?.next ? r.j.links.next.replace(BASE, '') : null
    const oldest = (r.j.data ?? []).slice(-1)[0]?.attributes?.created_at
    if (oldest && Date.parse('2026-07-09') - Date.parse(oldest) > 864e5 * 200) break
  }
}
// bucket by week (Sunday)
function sunday(ts) { const d = new Date(ts); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10) }
const byWeek = {}
for (const ts of dates) { if (!ts) continue; const w = sunday(ts); byWeek[w] = (byWeek[w] || 0) + 1 }
const series = Object.entries(byWeek).map(([week, count]) => ({ week, count })).sort((a, b) => a.week.localeCompare(b.week))
await writeFile(join(RAW, 'visitor_flow.json'), JSON.stringify(series, null, 2))
console.log(`Pulled ${dates.length} Starting Point sign-ins across ${series.length} weeks`)
console.log('Recent 8 weeks:', series.slice(-8).map((s) => s.week.slice(5) + ':' + s.count).join('  '))
