// Pulls PCO check-ins with their event + event_time, keeping each person's recent
// check-ins stamped with the SERVICE they attended (Sunday 9 / 10:30 / 12 morning
// = English, 6pm = Brazilian). This is what lets the detail drawer show someone
// switching between the English and Brazilian services over time.
// Output: scratchpad/pco-raw/checkin_activity.json  { byName: { name: [items] } }
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

function serviceLabel(et) {
  if (!et) return ''
  const { dow, hour } = et
  if (dow === 0) {
    if (hour >= 16) return 'Brazilian'
    if (hour === 9) return '9 AM'
    if (hour === 10 || hour === 11) return '10:30 AM'
    if (hour === 12 || hour === 13) return '12 PM'
    return 'Sunday'
  }
  if (dow === 6) return 'Saturday'
  return 'Midweek'
}

const CUTOFF = '2025-12-01'
const MAX_PAGES = 700
const MAX_ITEMS = 12
const byName = new Map()
let url = 'https://api.planningcenteronline.com/check-ins/v2/check_ins?include=event,event_times&per_page=100&order=-created_at'
let page = 0, seen = 0, stop = false
while (url && page < MAX_PAGES && !stop) {
  page++
  const j = await get(url)
  const eventName = new Map(), et = new Map()
  for (const inc of j.included || []) {
    if (inc.type === 'Event') eventName.set(inc.id, inc.attributes.name || '')
    if (inc.type === 'EventTime') et.set(inc.id, { dow: inc.attributes.day_of_week, hour: inc.attributes.hour })
  }
  for (const c of j.data) {
    seen++
    const date = (c.attributes.created_at || '').slice(0, 10)
    if (date && date < CUTOFF) { stop = true; break }
    const name = `${c.attributes.first_name || ''} ${c.attributes.last_name || ''}`.trim()
    if (!name) continue
    const k = name.toLowerCase().replace(/\s+/g, ' ').trim()
    const event = eventName.get(c.relationships?.event?.data?.id) || ''
    const etId = c.relationships?.event_times?.data?.[0]?.id
    const service = serviceLabel(et.get(etId))
    const kind = c.attributes.kind || ''
    const arr = byName.get(k) || []
    if (arr.length < MAX_ITEMS * 3) arr.push({ date, event, service, kind })
    byName.set(k, arr)
  }
  if (page % 20 === 0) console.error(`  page ${page}, ${seen} check-ins, ${byName.size} people`)
  url = j.links?.next
}

// keep the most recent MAX_ITEMS per person
const out = {}
for (const [k, arr] of byName) {
  out[k] = arr.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, MAX_ITEMS)
}
console.log(`pages ${page}, check-ins ${seen}, people ${byName.size}`)
await writeFile('scratchpad/pco-raw/checkin_activity.json', JSON.stringify({ byName: out }, null, 2))
console.log('wrote scratchpad/pco-raw/checkin_activity.json')
