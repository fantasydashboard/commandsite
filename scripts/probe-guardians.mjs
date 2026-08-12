// Probe: does PCO expose who checked a child in, and are households usable?
import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json() }

const ev = (await get('https://api.planningcenteronline.com/check-ins/v2/events?per_page=100')).data
const kids = ev.filter(e => /kids/i.test(e.attributes?.name ?? ''))
console.log('kids events:', kids.map(e => `${e.id} ${e.attributes.name}`).slice(0, 4).join(' | '))
if (!kids.length) process.exit(0)
const ci = await get(`https://api.planningcenteronline.com/check-ins/v2/events/${kids[0].id}/check_ins?per_page=5&order=-created_at&include=checked_in_by,person`)
const first = ci.data?.[0]
console.log('checked_in_by rel present:', !!first?.relationships?.checked_in_by?.data)
console.log('checked_in_by:', JSON.stringify(first?.relationships?.checked_in_by?.data))
const inc = (ci.included ?? []).filter(i => i.type === 'Person')
console.log('included People:', inc.length, inc.slice(0,3).map(p => `${p.id} ${p.attributes?.first_name} ${p.attributes?.last_name}`).join(' | '))
