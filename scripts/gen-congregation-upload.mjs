// Emits SQL that puts the REAL congregation map into church_dashboard_data, so
// production can actually place people in the English / Brazilian lens.
//
// WHY THIS EXISTS
// gen-congregation.mjs writes congregation.ts, which is skip-worktree: the real
// map lives on one laptop and the committed copy is `{}`. Production therefore
// resolved every name to null, and choosing a congregation emptied Care & Drift
// (0 families, 0 groups) instead of filtering it. Same fix as the roster:
// congregant data belongs in church_dashboard_data, which is behind RLS, not in
// the public JS bundle.
//
// WHY IT REBUILDS THE MAP INSTEAD OF READING congregation.ts
// That file only carries names that appear in the BAKED snapshots (201 keys),
// because gen-congregation.mjs walks the baked lists to decide what to emit.
// Live drift and serving now come from Planning Center over a wider window and
// contain people those snapshots never had, and every one of them would resolve
// to null. The raw pulls carry ~850 people, so we key off those instead and let
// the map cover everyone we have a signal for.
//
// Usage: node scripts/gen-congregation-upload.mjs > scratchpad/upload-congregation.sql
// then paste into the Supabase SQL editor.

import fs from 'node:fs'

const read = (f) => JSON.parse(fs.readFileSync(`scratchpad/pco-raw/${f}.json`, 'utf8'))
const svc = read('service_congregation')
const grp = read('congregation_map')
const kids = read('kids_checkins')
const vols = read('volunteer_checkins')

const norm = (n) => String(n).toLowerCase().replace(/\s+/g, ' ').trim()

// Brazilian wins on conflict, matching gen-congregation.mjs. A person who shows
// up in both signals attends the 6pm service, and the lens exists to serve the
// Brazilian ministry: showing them in the Brazilian view and not the English one
// is the error worth making.
const map = {}
const set = (name, cong) => {
  if (!cong || !name) return
  const k = norm(name)
  if (!k || map[k] === 'brazilian') return
  map[k] = cong
}

const congOfId = (id) => svc.byPersonId[id] || grp.byPersonId[id] || null

// 1. Everyone we can name directly from the service signal.
for (const [name, cong] of Object.entries(svc.byName)) set(name, cong)

// 2. Everyone reachable by person id through any check-in, which is how people
//    who never matched by name get placed.
for (const c of [...kids, ...vols]) set(`${c.first} ${c.last}`, congOfId(c.person_id))

// 3. Family surnames, so "The {Name} family" display forms resolve. A surname
//    takes the congregation of the kids who check in under it.
for (const c of kids) set(c.last, congOfId(c.person_id))

const braz = Object.values(map).filter((c) => c === 'brazilian').length
console.error(
  `congregation map: ${Object.keys(map).length} keys (brazilian ${braz}, english ${Object.keys(map).length - braz})`,
)

const lit = `'${JSON.stringify(map).replace(/'/g, "''")}'::jsonb`

console.log(`-- Real congregation map for Focal Point (name -> english|brazilian).
-- Generated ${new Date().toISOString().slice(0, 10)} by scripts/gen-congregation-upload.mjs
-- from the local raw Planning Center pulls. Carries congregant names, which is
-- exactly why it goes in the database rather than the JS bundle:
-- church_dashboard_data is behind RLS, the bundle is public.
--
-- Without this row the English / Brazilian lens cannot place anybody and both
-- scoped views render empty. Safe to re-run: upserts on (client_id, module_key).

insert into public.church_dashboard_data
  (client_id, module_key, payload, status, error, computed_at, source_freshness, synced_attempt_at)
select c.id, 'congregation', ${lit}, 'ok', null, now(), current_date, now()
from public.clients c where c.slug = 'focal-point-church'
on conflict (client_id, module_key) do update
  set payload = excluded.payload, status = 'ok', error = null,
      computed_at = excluded.computed_at, source_freshness = excluded.source_freshness;

-- Verify: key count should match the number printed when this file was built.
select count(*) as congregation_keys
from public.church_dashboard_data d
join public.clients c on c.id = d.client_id,
     lateral jsonb_object_keys(d.payload)
where c.slug = 'focal-point-church' and d.module_key = 'congregation';`)
