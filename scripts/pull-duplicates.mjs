// Detect likely-duplicate profiles in Planning Center: same normalized name, and
// stronger when they also share an email or phone. Aggregate detection; group
// members (names) are PII, so the resulting data file uses the skip-worktree pattern.
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const PB = 'https://api.planningcenteronline.com/people/v2'
const sleep = ms => new Promise(s=>setTimeout(s,ms))
const get = async (u) => { for(let i=0;i<8;i++){const r=await fetch(u,{headers:{Authorization:AUTH}});if(r.ok){await sleep(60);return r.json()}if(r.status===429){await sleep((Number(r.headers.get('retry-after')||3)+1)*1000);continue}throw new Error(r.status)}throw new Error('rl') }

const people = []
const emailById = {}, phoneById = {}
let url = `${PB}/people?per_page=100&where[status]=active&include=emails,phone_numbers`
let pages = 0
while (url && pages < 130) {
  const j = await get(url)
  for (const inc of (j.included || [])) {
    if (inc.type === 'Email') emailById[inc.id] = (inc.attributes.address || '').toLowerCase().trim()
    if (inc.type === 'PhoneNumber') phoneById[inc.id] = (inc.attributes.number || '').replace(/\D/g, '').slice(-10)
  }
  for (const p of j.data) {
    const a = p.attributes
    const emails = (p.relationships?.emails?.data || []).map(e => emailById[e.id]).filter(Boolean)
    const phones = (p.relationships?.phone_numbers?.data || []).map(e => phoneById[e.id]).filter(Boolean)
    people.push({
      id: p.id, first: a.first_name || '', last: a.last_name || '', name: (a.name || '').trim(),
      email: emails[0] || '', phone: phones[0] || '', emails, phones,
      membership: a.membership || 'none', created: (a.created_at || '').slice(0, 10),
      child: !!a.child, hasAvatar: !/initials|demographic/i.test(a.avatar || ''),
    })
  }
  url = j.links?.next; pages++
  if (pages % 20 === 0) console.error(`  ${people.length} people...`)
}
console.error('total active people:', people.length)

// group by normalized name
const norm = (p) => `${p.first} ${p.last}`.toLowerCase().replace(/\s+/g, ' ').trim()
const byName = {}
for (const p of people) { const k = norm(p); if (k.length > 2) (byName[k] = byName[k] || []).push(p) }

const groups = []
for (const [k, members] of Object.entries(byName)) {
  if (members.length < 2) continue
  // shared email or phone within the group boosts confidence
  const emailsAll = members.flatMap(m => m.emails)
  const phonesAll = members.flatMap(m => m.phones)
  const sharedEmail = emailsAll.length !== new Set(emailsAll).size
  const sharedPhone = phonesAll.length !== new Set(phonesAll).size
  const conf = sharedEmail || sharedPhone ? 'high' : 'medium'
  groups.push({
    name: members[0].name || k, count: members.length, confidence: conf,
    sharedEmail, sharedPhone,
    members: members.map(m => ({ id: m.id, name: m.name, email: m.email, phone: m.phone, membership: m.membership, created: m.created, hasAvatar: m.hasAvatar })),
  })
}
groups.sort((a, b) => (a.confidence === b.confidence ? b.count - a.count : a.confidence === 'high' ? -1 : 1))
const out = {
  totalActive: people.length,
  highConfidence: groups.filter(g => g.confidence === 'high').length,
  totalGroups: groups.length,
  duplicateProfiles: groups.reduce((s, g) => s + (g.count - 1), 0),
  groups: groups.slice(0, 120),
}
await writeFile('scratchpad/pco-raw/duplicates.json', JSON.stringify(out, null, 2))
console.log('duplicate name-groups:', out.totalGroups, '| high-confidence (shared email/phone):', out.highConfidence)
console.log('extra profiles that could be merged away:', out.duplicateProfiles)
console.log('\ntop high-confidence:')
groups.filter(g=>g.confidence==='high').slice(0,8).forEach(g=>console.log(`  ${g.name} x${g.count} ${g.sharedEmail?'[email]':''}${g.sharedPhone?'[phone]':''}`))
