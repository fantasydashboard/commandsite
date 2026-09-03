// Emits SQL that puts the REAL per-person activity history into
// church_dashboard_data, so the flag detail drawer can show the evidence behind
// a flag in production.
//
// WHY THIS EXISTS
// activity.ts is skip-worktree: the real map is ~130KB on one laptop and the
// committed copy exports `{}`. Unlike drift, serving, burnout and guests it had
// no live loader, so in production activityFor() returned null for everybody and
// the drawer's "Recent activity" block silently vanished. Staff being asked to
// trust Grace's flags were shown the claim without the check-ins that prove it.
//
// Third time this pattern has bitten (roster, congregation, now activity).
// Per-person data belongs in church_dashboard_data, which is behind RLS, never
// in the public JS bundle.
//
// Usage: node scripts/gen-activity-upload.mjs > scratchpad/upload-activity.sql
// then paste into the Supabase SQL editor.

import fs from 'node:fs'

const src = fs.readFileSync('src/lib/clients/focal-point/activity.ts', 'utf8')

// The file is a generated TS literal; pull the object out rather than importing
// it, so this script has no build step and no TS runtime dependency.
const start = src.indexOf('focalPointActivity: Record<string, PersonActivity> = ')
if (start === -1) throw new Error('could not find focalPointActivity in activity.ts')
const braceStart = src.indexOf('{', start)
let depth = 0, end = -1
for (let i = braceStart; i < src.length; i++) {
  if (src[i] === '{') depth++
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
}
if (end === -1) throw new Error('unbalanced braces in activity.ts')

// eslint-disable-next-line no-eval
const map = eval(`(${src.slice(braceStart, end)})`)

const people = Object.keys(map).length
const items = Object.values(map).reduce((n, v) => n + (v?.items?.length ?? 0), 0)
if (!people) throw new Error('activity map is EMPTY. You are on the committed copy, not the local one.')
console.error(`activity: ${people} people/families, ${items} activity rows`)

const lit = `'${JSON.stringify(map).replace(/'/g, "''")}'::jsonb`

console.log(`-- Real per-person activity history for Focal Point.
-- Generated ${new Date().toISOString().slice(0, 10)} by scripts/gen-activity-upload.mjs
-- from the local (skip-worktree) activity.ts. Carries congregant names and their
-- check-in history, which is exactly why it goes in the database rather than the
-- JS bundle: church_dashboard_data is behind RLS, the bundle is public.
--
-- Without this row the flag detail drawer cannot show the evidence behind a
-- flag. It now says so honestly instead of hiding the panel, but the panel is
-- the point. Safe to re-run: upserts on (client_id, module_key).

insert into public.church_dashboard_data
  (client_id, module_key, payload, status, error, computed_at, source_freshness, synced_attempt_at)
select c.id, 'activity', ${lit}, 'ok', null, now(), current_date, now()
from public.clients c where c.slug = 'focal-point-church'
on conflict (client_id, module_key) do update
  set payload = excluded.payload, status = 'ok', error = null,
      computed_at = excluded.computed_at, source_freshness = excluded.source_freshness;

-- Verify: should match the people count printed when this file was built.
select count(*) as activity_people
from public.church_dashboard_data d
join public.clients c on c.id = d.client_id,
     lateral jsonb_object_keys(d.payload)
where c.slug = 'focal-point-church' and d.module_key = 'activity';`)
