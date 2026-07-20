import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const B = 'https://api.planningcenteronline.com/groups/v2'
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status); return r.json() }
const all = async (u) => { const out=[]; let url=u; while(url){const j=await get(url); out.push(...j.data); url=j.links?.next} return out }
const types = (await get(`${B}/group_types?per_page=25`)).data
const gtIds = types.filter(t=>/growth group/i.test(t.attributes.name)).map(t=>t.id)
let groups=[]; for (const gt of gtIds) groups.push(...await all(`${B}/group_types/${gt}/groups?per_page=100`))
groups = groups.filter(g=>g.attributes.archived_at==null)
const now = new Date('2026-07-13')
let recent=0, midMay=0, totalMembers=0
const buckets={'<4wk':0,'4-10wk':0,'10-20wk':0,'>20wk / never':0}
for (const g of groups) {
  totalMembers += g.attributes.memberships_count||0
  const ev=(await get(`${B}/groups/${g.id}/events?per_page=1&order=-starts_at`)).data
  const last = ev[0] ? new Date(ev[0].attributes.starts_at) : null
  const wk = last ? (now-last)/(7*864e5) : 999
  if (wk<4) buckets['<4wk']++; else if (wk<10) buckets['4-10wk']++; else if (wk<20) buckets['10-20wk']++; else buckets['>20wk / never']++
}
console.log('growth groups:', groups.length, '| total memberships:', totalMembers)
console.log('most-recent-meeting recency:', JSON.stringify(buckets))
