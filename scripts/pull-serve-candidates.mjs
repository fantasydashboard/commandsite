// Who should we ask to serve?
//
// Ranks the congregation by how likely they are to say yes, using the two
// signals that actually predict it, and excluding anyone already carrying load.
//
//   Tier 1  in a Growth Group AND dropping kids off      strongest
//   Tier 2  in a Growth Group
//   Tier 3  dropping kids off
//
// Within every tier, more regular attendance ranks higher. Regularity is
// measured as distinct Sundays they physically showed up (a kids drop-off is a
// recorded, dated appearance; group membership on its own is not).
//
// EXCLUSIONS, and why they matter more than the ranking:
//   - anyone who already serves at all in the season (they are on a team)
//   - anyone the burnout rule would flag (never suggest someone we elsewhere
//     tell the church to protect)
// Suggesting a name that is already on the burnout list would discredit the
// whole feature, so the same rule is applied here as in computeBurnout.
//
// The parent link comes from check-ins `checked_in_by`, which is a real adult
// person record. pco_kids_checkins stores only the CHILD, which is why this
// cannot be computed from the synced tables today and runs as a pull.
//
// Usage: node scripts/pull-serve-candidates.mjs
// Writes scratchpad/pco-raw/serve_candidates.json

import { readFile, writeFile } from 'node:fs/promises'

const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const get = async (u) => {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(u, { headers: { Authorization: AUTH } })
    if (r.status === 429 && attempt < 5) { await new Promise((s) => setTimeout(s, 2000 * (attempt + 1))); continue }
    if (!r.ok) throw new Error(`${r.status} ${u}`)
    return r.json()
  }
}

const DAYS = 120
const today = new Date().toISOString().slice(0, 10)
const cutoff = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5)

// ── 1. Group members ────────────────────────────────────────────────────────
console.error('pulling groups...')
const groups = []
let gurl = 'https://api.planningcenteronline.com/groups/v2/groups?per_page=100'
while (gurl) {
  const j = await get(gurl)
  groups.push(...j.data.filter((g) => !g.attributes?.archived_at))
  gurl = j.links?.next ?? null
}
console.error(`  ${groups.length} active groups`)

const inGroup = new Map() // personId -> { name, groups: Set }
for (const [i, g] of groups.entries()) {
  if (i % 25 === 0) console.error(`  memberships ${i}/${groups.length}`)
  let murl = `https://api.planningcenteronline.com/groups/v2/groups/${g.id}/memberships?per_page=100&include=person`
  while (murl) {
    const j = await get(murl)
    for (const p of (j.included ?? []).filter((x) => x.type === 'Person')) {
      const rec = inGroup.get(p.id) ?? { name: `${p.attributes?.first_name ?? ''} ${p.attributes?.last_name ?? ''}`.trim(), groups: new Set() }
      rec.groups.add(g.attributes?.name ?? 'Group')
      inGroup.set(p.id, rec)
    }
    murl = j.links?.next ?? null
  }
}
console.error(`  ${inGroup.size} distinct group members`)

// ── 2. Adults dropping kids off ─────────────────────────────────────────────
console.error('pulling kids check-ins...')
const events = (await get('https://api.planningcenteronline.com/check-ins/v2/events?per_page=100')).data
const kidsEvents = events.filter((e) => /kids/i.test(e.attributes?.name ?? '') && /sunday|service/i.test(e.attributes?.name ?? ''))
console.error(`  ${kidsEvents.length} kids events: ${kidsEvents.map((e) => e.attributes.name).join(', ')}`)

const dropOffs = new Map() // personId -> { name, dates: Set }
for (const ev of kidsEvents) {
  let url = `https://api.planningcenteronline.com/check-ins/v2/events/${ev.id}/check_ins?per_page=100&order=-created_at&include=checked_in_by`
  let done = false
  while (url && !done) {
    const j = await get(url)
    const byId = Object.fromEntries((j.included ?? []).filter((x) => x.type === 'Person').map((p) => [p.id, p]))
    for (const c of j.data) {
      const date = (c.attributes?.created_at ?? '').slice(0, 10)
      if (!date) continue
      if (date < cutoff) { done = true; break }
      const pid = c.relationships?.checked_in_by?.data?.id
      if (!pid) continue
      const p = byId[pid]
      const nm = p ? `${p.attributes?.first_name ?? ''} ${p.attributes?.last_name ?? ''}`.trim() : null
      if (!nm) continue
      const rec = dropOffs.get(pid) ?? { name: nm, dates: new Set() }
      rec.dates.add(date)
      dropOffs.set(pid, rec)
    }
    url = done ? null : (j.links?.next ?? null)
  }
}
console.error(`  ${dropOffs.size} adults dropped a child off in the last ${DAYS} days`)

// ── 3. Who already serves ───────────────────────────────────────────────────
const sched = JSON.parse(await readFile('scratchpad/pco-raw/serving_schedule.json', 'utf8'))
const servesById = new Map()
for (const [id, rec] of Object.entries(sched.byPerson ?? {})) {
  const done = (rec.dates ?? []).filter((d) => d.status === 'C' && d.date <= today)
  const recent = done.filter((d) => daysBetween(today, d.date) <= 90)
  servesById.set(id, { count: recent.length, teams: [...new Set(done.map((d) => d.team))].length })
}
// Names too: the serving export keys on PCO person ids from Services, which are
// the same people ids, but fall back to a name match so a mismatch cannot let a
// current volunteer slip through as a "candidate".
const servingNames = new Set(Object.values(sched.byPerson ?? {}).map((r) => (r.name ?? '').toLowerCase().trim()))

const alreadyServing = (pid, name) => {
  const s = servesById.get(pid)
  if (s && s.count > 0) return true
  return servingNames.has((name ?? '').toLowerCase().trim())
}

// ── 4. Rank ─────────────────────────────────────────────────────────────────
const all = new Map()
for (const [pid, rec] of inGroup) all.set(pid, { pid, name: rec.name, groups: [...rec.groups], sundays: 0 })
for (const [pid, rec] of dropOffs) {
  const cur = all.get(pid) ?? { pid, name: rec.name, groups: [], sundays: 0 }
  cur.sundays = rec.dates.size
  all.set(pid, cur)
}

const candidates = []
for (const c of all.values()) {
  if (!c.name) continue
  if (alreadyServing(c.pid, c.name)) continue
  const hasGroup = c.groups.length > 0
  const hasKids = c.sundays > 0
  if (!hasGroup && !hasKids) continue
  const tier = hasGroup && hasKids ? 1 : hasGroup ? 2 : 3
  candidates.push({ ...c, tier, hasGroup, hasKids })
}
candidates.sort((a, b) => a.tier - b.tier || b.sundays - a.sundays || b.groups.length - a.groups.length || a.name.localeCompare(b.name))

const byTier = (t) => candidates.filter((c) => c.tier === t)
console.error('')
console.log(`Candidates (not currently serving), window ${DAYS} days:`)
console.log(`  Tier 1  group + kids drop-off : ${byTier(1).length}`)
console.log(`  Tier 2  group only            : ${byTier(2).length}`)
console.log(`  Tier 3  kids drop-off only    : ${byTier(3).length}`)
console.log(`  total                         : ${candidates.length}`)
console.log('')
for (const c of candidates.slice(0, 12)) {
  console.log(`  T${c.tier}  ${c.name.padEnd(28)} ${String(c.sundays).padStart(2)} Sundays  ${c.groups.slice(0, 2).join(', ')}`)
}

await writeFile('scratchpad/pco-raw/serve_candidates.json', JSON.stringify({ generated: today, windowDays: DAYS, candidates }, null, 2))
console.log('\nwrote scratchpad/pco-raw/serve_candidates.json')
