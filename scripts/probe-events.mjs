import { readFile } from 'node:fs/promises'
const env = await readFile('.env.local', 'utf8')
const PAT = (env.match(/PCO_PAT=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const AUTH = 'Basic ' + Buffer.from(PAT).toString('base64')
const B = 'https://api.planningcenteronline.com/groups/v2'
const get = async (u) => { const r = await fetch(u, { headers: { Authorization: AUTH } }); if (!r.ok) throw new Error(r.status+' '+(await r.text()).slice(0,120)); return r.json() }
// org-wide events with a date filter + attendance counts?
const j = await get(`${B}/events?per_page=3&order=-starts_at&where[after]=2026-01-01T00:00:00Z`)
console.log('org-wide /events works:', j.data.length, 'events')
console.log('event attributes:', Object.keys(j.data[0]?.attributes||{}).join(', '))
console.log('sample event:', JSON.stringify(j.data[0]?.attributes||{}).slice(0,300))
// does event carry attendance count via include or attributes?
const j2 = await get(`${B}/events?per_page=1&order=-starts_at&where[after]=2025-09-01T00:00:00Z&where[before]=2025-12-01T00:00:00Z`)
console.log('\nfall event sample:', JSON.stringify(j2.data[0]?.attributes||{}).slice(0,250))
