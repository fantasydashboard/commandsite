// Emits SQL that puts the REAL roster + serve-candidate payloads into
// church_dashboard_data, so production renders real names without those names
// ever entering git or the public JS bundle.
//
// The bundle keeps the anonymised committed copy as a fallback; the loader
// prefers the database row, which is behind RLS and therefore only readable by
// a signed-in user of that church.
//
// Usage: node scripts/gen-upload-sql.mjs > scratchpad/upload-roster.sql
// then paste into the Supabase SQL editor.

import { readFile } from 'node:fs/promises'

const roster = JSON.parse(await readFile('scratchpad/roster.payload.json', 'utf8'))
const candidates = JSON.parse(await readFile('scratchpad/serveCandidates.payload.json', 'utf8'))

const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`

console.log(`-- Real roster + serve-candidate payloads for Focal Point.
-- Generated ${new Date().toISOString().slice(0, 10)} from the local (skip-worktree)
-- data files. These carry congregant names, which is exactly why they go in the
-- database rather than the JS bundle: church_dashboard_data is behind RLS, the
-- bundle is public. Re-run after regenerating the roster or candidates.
--
-- Safe to re-run: upserts on (client_id, module_key).

insert into public.church_dashboard_data
  (client_id, module_key, payload, status, error, computed_at, source_freshness, synced_attempt_at)
select c.id, 'roster', ${lit(roster)}, 'ok', null, now(), current_date, now()
from public.clients c where c.slug = 'focal-point-church'
on conflict (client_id, module_key) do update
  set payload = excluded.payload, status = 'ok', error = null,
      computed_at = excluded.computed_at, source_freshness = excluded.source_freshness;

insert into public.church_dashboard_data
  (client_id, module_key, payload, status, error, computed_at, source_freshness, synced_attempt_at)
select c.id, 'serveCandidates', ${lit(candidates)}, 'ok', null, now(), current_date, now()
from public.clients c where c.slug = 'focal-point-church'
on conflict (client_id, module_key) do update
  set payload = excluded.payload, status = 'ok', error = null,
      computed_at = excluded.computed_at, source_freshness = excluded.source_freshness;

-- Verify
select module_key,
       computed_at,
       jsonb_array_length(coalesce(payload->'gaps', payload->'people')) as rows
from public.church_dashboard_data d
join public.clients c on c.id = d.client_id
where c.slug = 'focal-point-church' and module_key in ('roster','serveCandidates');
`)
