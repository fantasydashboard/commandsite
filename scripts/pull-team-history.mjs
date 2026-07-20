// Per-team real server pool from the last ~10 Sunday plans, so "Ask" means people
// who have actually served THAT team. Also probe how staff are marked in PCO.
import { readFile, writeFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status + ' ' + u.slice(55)); return r.json() }
const B = 'https://api.planningcenteronline.com/services/v2'
const PB = 'https://api.planningcenteronline.com/people/v2'

// 1) probe staff: is there a "Staff" list, and what does David Bunch look like?
const lists = (await get(`${PB}/lists?per_page=100`)).data.map(l => l.attributes.name)
console.log('People lists that look like staff:', lists.filter(n => /staff|team|employee|elder|pastor|lead/i.test(n)).join(' | ') || '(none obvious)')
const db = (await get(`${PB}/people?where[search_name]=David Bunch&per_page=3`)).data
for (const p of db) {
  const a = p.attributes
  console.log('David Bunch:', p.id, '| membership:', a.membership, '| site_admin:', a.site_administrator, '| accounting_admin:', a.accounting_administrator, '| can_email_lists:', a.can_email_lists, '| people_permissions:', a.people_permissions)
}

// 2) per-team servers from recent Sunday plans
const st = (await get(`${B}/service_types?per_page=25`)).data
const sunday = st.find(s => /sunday service/i.test(s.attributes.name))
const past = (await get(`${B}/service_types/${sunday.id}/plans?filter=past&per_page=10&order=-sort_date`)).data
const byTeam = {} // team -> Map(personName -> count)
for (const p of past) {
  const tm = await get(`${B}/plans/${p.id}/team_members?per_page=200&include=team`)
  const names = Object.fromEntries((tm.included||[]).filter(i=>i.type==='Team').map(t=>[t.id,t.attributes.name.trim()]))
  for (const m of tm.data) {
    const team = names[m.relationships?.team?.data?.id]; if (!team) continue
    const person = (m.attributes.name || '').trim(); if (!person) continue
    byTeam[team] = byTeam[team] || {}
    byTeam[team][person] = (byTeam[team][person]||0) + 1
  }
}
const out = {}
for (const [team, ppl] of Object.entries(byTeam)) {
  out[team] = Object.entries(ppl).sort((a,b)=>b[1]-a[1]).map(([name,n])=>({name,served:n}))
}
await writeFile('scratchpad/pco-raw/team_history.json', JSON.stringify(out,null,2))
for (const t of ['Safety Team','Ushers','Parking Team','Reception Team','Hospitality']) {
  console.log(`\n${t}: ` + (out[t]||[]).slice(0,10).map(x=>`${x.name}(${x.served})`).join(', '))
}
