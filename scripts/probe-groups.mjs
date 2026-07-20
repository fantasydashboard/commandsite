import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const B = 'https://api.planningcenteronline.com/groups/v2'
async function tryGet(url) {
  const r = await fetch(url, { headers: { Authorization: AUTH } })
  return { ok: r.ok, status: r.status, body: r.ok ? await r.json() : (await r.text()).slice(0,150) }
}
// 1) can we list groups at all?
const g = await tryGet(`${B}/groups?per_page=5`)
console.log('GET /groups ->', g.status, g.ok ? `OK, total meta: ${g.body.meta?.total_count}` : g.body)
if (!g.ok) { console.log('\nNo Groups access with this token.'); process.exit(0) }
console.log('sample groups:', g.body.data.map(x=>x.attributes.name).join(' | '))
// 2) group types
const gt = await tryGet(`${B}/group_types?per_page=25`)
console.log('\nGET /group_types ->', gt.status, gt.ok ? gt.body.data.map(x=>x.attributes.name).join(' | ') : gt.body)
// 3) memberships on first group
const gid = g.body.data[0]?.id
if (gid) {
  const m = await tryGet(`${B}/groups/${gid}/memberships?per_page=3`)
  console.log('\nGET /groups/'+gid+'/memberships ->', m.status, m.ok ? `count in page: ${m.body.data.length}, sample keys: ${Object.keys(m.body.data[0]?.attributes||{}).join(',')}` : m.body)
  // 4) events + attendance (for drift detection)
  const ev = await tryGet(`${B}/groups/${gid}/events?per_page=3&order=-starts_at`)
  console.log('GET /groups/'+gid+'/events ->', ev.status, ev.ok ? `recent events: ${ev.body.data.length}, last: ${ev.body.data[0]?.attributes?.starts_at}` : ev.body)
  const eid = ev.ok ? ev.body.data[0]?.id : null
  if (eid) {
    const at = await tryGet(`${B}/events/${eid}/attendances?per_page=3`)
    console.log('GET /events/'+eid+'/attendances ->', at.status, at.ok ? `attendances: ${at.body.data.length}, sample: ${JSON.stringify(at.body.data[0]?.attributes||{}).slice(0,120)}` : at.body)
  }
}
