// Rebuild roster fills from REAL per-team history. Ask = people who actually
// serve that team, not staff, not burnout. Fresh capacity = someone who has
// served that team before but less often (a re-recruit who knows the role).
import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status); return r.json() }
const PB = 'https://api.planningcenteronline.com/people/v2'

// staff / elevated-permission people to EXCLUDE from asks
const staff = new Set()
for (const perm of ['Manager', 'Editor']) {
  let url = `${PB}/people?where[people_permissions]=${perm}&per_page=100`
  while (url) { const j = await get(url); j.data.forEach(p => staff.add(p.attributes.name.trim())); url = j.links?.next }
}
let url = `${PB}/people?where[site_administrator]=true&per_page=100`
while (url) { const j = await get(url); j.data.forEach(p => staff.add(p.attributes.name.trim())); url = j.links?.next }
console.log('staff/admins excluded:', staff.size, '| David Bunch in set:', staff.has('David Bunch'))

const hist = JSON.parse(await readFile('scratchpad/pco-raw/team_history.json', 'utf8'))
const burn = new Set(JSON.parse(await readFile('scratchpad/pco-raw/burnout.json', 'utf8')).map(b => (b.first + ' ' + b.last).trim()))

// short teams from the current roster + their gap counts / skip / (skill)
const TEAMS = [
  { team: 'Safety Team', short: 14, skip: { name: 'Mason Woodson', reason: 'already 6x/month' } },
  { team: 'Ushers', short: 13, skip: { name: 'Cindy Salopek', reason: '5x/month across 11 ministries' } },
  { team: 'Parking Team', short: 4 },
  { team: 'Reception Team', short: 3 },
  { team: 'Band', short: 2, skill: true },
  { team: 'Growth Group Agenda Writers', short: 2 },
  { team: 'Hospitality', short: 2 },
  { team: 'Translation Team', short: 1, skill: true },
]
const ok = (n) => !staff.has(n) && !burn.has(n)
const gaps = []
for (const t of TEAMS) {
  const pool = (hist[t.team] || []).filter(x => ok(x.name))
  // Ask: real servers of this team with capacity (skip the very top regulars for general teams)
  const askPool = pool
  const suggest = askPool.slice(0, 2).map(x => x.name)
  // Fresh capacity: someone who has served this team before but least often (re-recruit)
  const lapsed = pool.length > 2 ? pool[pool.length - 1] : null
  const g = { team: t.team, short: t.short, suggest }
  if (t.skip) g.skip = t.skip
  if (lapsed) g.fresh = `${lapsed.name} (served ${t.team} before, has room)`
  if (t.skill) g.skill = true
  gaps.push(g)
  console.log(`${t.team}: ask ${suggest.join(', ')||'(none in pool!)'} | fresh ${lapsed?lapsed.name:'-'}`)
}
console.log('\n---JSON---')
console.log(JSON.stringify(gaps, null, 2))
