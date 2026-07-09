// Focal Point: targeted data pull for the surfaces buildable with the
// current token (People / Workflows / Lists / Check-Ins / Services).
// Writes raw JSON to scratchpad/pco-raw/ (gitignored). Giving + Groups
// wait for Christina's full-access token.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'scratchpad', 'pco-raw')
const BASE = 'https://api.planningcenteronline.com'

async function loadToken() {
  if (process.env.PCO_PAT) return process.env.PCO_PAT.trim()
  const text = await readFile(join(ROOT, '.env.local'), 'utf8')
  const line = text.split('\n').find((l) => l.trim().startsWith('PCO_PAT='))
  const v = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  if (!v || v.includes('REPLACE_') || !v.includes(':')) throw new Error('PCO_PAT missing/placeholder in .env.local')
  return v
}

const token = await loadToken()
const basic = Buffer.from(token).toString('base64')
async function pco(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' } })
  const body = await res.text()
  let parsed = null
  try { parsed = JSON.parse(body) } catch {}
  return { status: res.status, parsed }
}
async function countOf(path) {
  const r = await pco(`${path}${path.includes('?') ? '&' : '?'}per_page=1`)
  return r.parsed?.meta?.total_count ?? null
}

await mkdir(RAW, { recursive: true })

// ── Discipleship Pathway: card counts per workflow stage ──────────────
const PATHWAY = [
  { key: 'starting_point_weekend', label: 'Starting Point (Weekend)', id: '113763' },
  { key: 'starting_point_brazilian', label: 'Starting Point (Brazilian)', id: '599785' },
  { key: 'new_member_class', label: 'New Member Class', id: '169808' },
  { key: 'baptism_class', label: 'Baptism Class', id: '169782' },
  { key: 'discipleship_has_gg', label: 'Discipleship: Has Growth Group', id: '406776' },
  { key: 'discipleship_no_gg', label: 'Discipleship: No Growth Group', id: '406778' },
]
const pathway = []
for (const s of PATHWAY) {
  const total = await countOf(`/people/v2/workflows/${s.id}/cards`)
  pathway.push({ ...s, total })
  console.log(`  pathway  ${String(total).padStart(5)}  ${s.label}`)
}
await writeFile(join(RAW, 'pathway.json'), JSON.stringify(pathway, null, 2))

// ── Key list totals (Members / Visitors / group leaders) ──────────────
const LISTS = [
  { key: 'members', label: 'Members', id: '189453' },
  { key: 'visitors', label: 'Visitors', id: '189434' },
  { key: 'gg_leaders', label: 'Group leaders (active)', id: '3597792' },
  { key: 'sat_prayer', label: 'Saturday Prayer attendees', id: '3411037' },
]
const lists = []
for (const l of LISTS) {
  const total = await countOf(`/people/v2/lists/${l.id}/people`)
  lists.push({ ...l, total })
  console.log(`  list     ${String(total).padStart(5)}  ${l.label}`)
}
await writeFile(join(RAW, 'list-totals.json'), JSON.stringify(lists, null, 2))

// ── Front Desk: recent Starting Point cards with the person's name ─────
async function recentCards(workflowId, howMany = 30) {
  const r = await pco(`/people/v2/workflows/${workflowId}/cards?include=person&per_page=${howMany}&order=-created_at`)
  const persons = {}
  for (const inc of r.parsed?.included ?? []) {
    if (inc.type === 'Person') persons[inc.id] = inc.attributes
  }
  return (r.parsed?.data ?? []).map((c) => {
    const pid = c.relationships?.person?.data?.id
    const p = persons[pid] ?? {}
    return {
      card_id: c.id,
      created_at: c.attributes?.created_at,
      stage: c.attributes?.stage,
      status: c.attributes?.status,
      person_name: p.name ?? null,
      person_first: p.first_name ?? null,
      person_status: p.status ?? null,
      membership: p.membership ?? null,
    }
  })
}
const startingPoint = await recentCards('113763', 30)
await writeFile(join(RAW, 'starting-point-recent.json'), JSON.stringify(startingPoint, null, 2))
console.log(`  front-desk  ${startingPoint.length} recent Starting Point cards pulled`)

console.log('\n  Wrote pathway.json, list-totals.json, starting-point-recent.json to scratchpad/pco-raw/\n')
