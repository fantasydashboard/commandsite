// Builds a person_id -> congregation ('brazilian' | 'english') map from growth-group
// membership. A group is Brazilian if its name matches brasil/brazil (FPC Brasil);
// everyone else in a growth group is English. A person in both lands Brazilian
// (matches the serving-rate rule). Output: scratchpad/pco-raw/congregation_map.json
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const B = 'https://api.planningcenteronline.com/groups/v2'
const sleep = (ms) => new Promise((s) => setTimeout(s, ms))
const get = async (u) => {
  for (let i = 0; i < 10; i++) {
    const r = await fetch(u, { headers: { Authorization: AUTH } })
    if (r.ok) { await sleep(110); return r.json() }
    if (r.status === 429) { await sleep((Number(r.headers.get('retry-after') || 3) + 1) * 1000); continue }
    throw new Error(String(r.status))
  }
  throw new Error('rate-limited')
}
const all = async (u) => {
  const o = []
  let url = u
  while (url) { const j = await get(url); o.push(...j.data); url = j.links?.next }
  return o
}

const types = (await get(`${B}/group_types?per_page=25`)).data.filter((t) => /growth group/i.test(t.attributes.name))
let groups = []
for (const t of types) for (const g of await all(`${B}/group_types/${t.id}/groups?per_page=100`)) groups.push(g)
groups = groups.filter((g) => g.attributes.archived_at == null)

const bra = new Set(), eng = new Set()
let braGroups = 0, engGroups = 0, done = 0
for (const g of groups) {
  done++
  if (done % 15 === 0) console.error(`  ${done}/${groups.length}`)
  const brazilian = /brasil|brazil/i.test(g.attributes.name)
  if (brazilian) braGroups++; else engGroups++
  const mem = await all(`${B}/groups/${g.id}/memberships?per_page=100`)
  for (const m of mem) {
    const pid = m.relationships?.person?.data?.id
    if (!pid) continue
    if (brazilian) bra.add(pid); else eng.add(pid)
  }
}
// Brazilian wins when a person is in both.
const byPersonId = {}
for (const id of eng) byPersonId[id] = 'english'
for (const id of bra) byPersonId[id] = 'brazilian'

const out = {
  brazilianGroups: braGroups,
  englishGroups: engGroups,
  brazilianPeople: bra.size,
  englishPeople: [...eng].filter((id) => !bra.has(id)).length,
  byPersonId,
}
console.log('Brazilian groups:', braGroups, '| English groups:', engGroups)
console.log('Brazilian people:', out.brazilianPeople, '| English people:', out.englishPeople)
await writeFile('scratchpad/pco-raw/congregation_map.json', JSON.stringify(out, null, 2))
console.log('wrote scratchpad/pco-raw/congregation_map.json')
