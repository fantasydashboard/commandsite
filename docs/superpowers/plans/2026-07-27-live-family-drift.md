# Live Family/Kids-Attendance Drift (Layer 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Families drifting" signal live from Planning Center Check-Ins, on the existing chunked/incremental sync pipeline, so DriftWatch shows real drifting families instead of a stale 0.

**Architecture:** A new `kids` resource in the existing `pco-fetch` sync: a chunked kids-check-ins fetcher stages check-ins into `pco_kids_checkins`; a reconstructed pure transform (`computeFamilyDrift`) groups by surname, pools distinct attended Sundays across all kids services, and flags established-then-quiet families; compute-over-cache writes a new `drift` module row; DriftWatch reads live-or-baked.

**Tech Stack:** Supabase (Postgres + RLS + Deno Edge Functions), the existing `pcoPaginate`/`pcoUntil`, staging + cursor + compute-over-cache pattern from `2026-07-26-pco-sync-scaling.md`.

**Spec:** `docs/superpowers/specs/2026-07-27-live-family-drift-design.md`

## Global Constraints

- **No em dashes** anywhere (code, comments, SQL, commit messages).
- **Edge functions are Deno**; import Supabase via `https://esm.sh/@supabase/supabase-js@2.45.0`, shared helpers via relative `../...ts`.
- **esm.sh proxy workaround for `deno check`** (machine proxy blocks Deno from esm.sh): `printf '{ "imports": { "https://esm.sh/@supabase/supabase-js@2.45.0": "npm:@supabase/supabase-js@2.45.0" } }' > "$CLAUDE_JOB_DIR/tmp/im.json"` then `deno check --node-modules-dir=none --import-map="$CLAUDE_JOB_DIR/tmp/im.json" <file>`. Remove any deno.lock after; do not commit it. Pure `deno test` files (importing only `./x.ts` + `deno.land/std`) run without the workaround. A pre-existing crypto.ts ArrayBufferLike error is acceptable.
- **Migrations + deploys are applied by Josh** (`supabase db push`, `supabase functions deploy pco-fetch`). Tasks that add a migration or touch pco-fetch end by noting the handoff.
- **Every DB write and read checks `{ error }`.** Staging reads must paginate past PostgREST's 1000-row cap (use the same `readAll` pattern as `computeFromCache.ts`).
- **Batch upserts dedupe by conflict key** before upserting (as the other fetchers do), to avoid the "cannot affect row a second time" stall.
- **Live church:** `focal-point-church`. Latest migration is `0092`, so start at `0093`.
- Verify Vue with `npm run typecheck` (filter pre-existing `src/modules/` noise).

## Output contract (what DriftWatch consumes)

```ts
interface DriftFamily { family: string; kids: string[]; lastSeen: string; sundaysMissed: number; monthsAttending: number; totalSundays: number }
interface DriftPayload { flaggedFamilies: number; flaggedKids: number; windowMonths: number; onboardingExcluded: number; signal: string; families: DriftFamily[]; drafts: [] }
```

---

## Task 1: staging table migration

**Files:** Create `supabase/migrations/0093_pco_kids_checkins.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Local mirror of kids check-ins for the family-drift signal. Filled in chunks by
-- pco-fetch, read by compute. Service-role writes, admins read. PK dedupes a child
-- who checked into two services the same day to one row (pooled attendance only
-- cares that they were present that day).
create table if not exists public.pco_kids_checkins (
  client_id    uuid not null references public.clients(id) on delete cascade,
  person_id    text not null,
  first        text not null,
  last         text not null,
  checkin_date date not null,
  kind         text not null,
  primary key (client_id, person_id, checkin_date)
);
create index if not exists pco_kids_checkins_client_date_idx on public.pco_kids_checkins (client_id, checkin_date);

alter table public.pco_kids_checkins enable row level security;
create policy "admins read kids checkins" on public.pco_kids_checkins
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
```

- [ ] **Step 2: Self-check** PK dedupes per (child, day); admin-only read; no non-admin write policy. No em dashes.
- [ ] **Step 3: Commit** `git commit -m "Migration: pco_kids_checkins staging table"`. Ask Josh to `supabase db push`.

---

## Task 2: pco_config.drift seed migration

**Files:** Create `supabase/migrations/0094_pco_config_drift.sql`

- [ ] **Step 1: Write the migration** (merge into Focal Point's pco_config, preserving existing keys)

```sql
update public.clients
set pco_config = pco_config || jsonb_build_object('drift', jsonb_build_object(
  'kidsEventMatch', 'kids',
  'windowMonths', 10,
  'sundaysMissed', 3,
  'minEstablishedSundays', 8
))
where slug = 'focal-point-church';
```

Note: `minEstablishedSundays` (the cutoff separating an established family from a first-timer/occasional) is a starting value; it is tuned in Task 8 against the live data to reproduce the baked split (flaggedFamilies ~53, onboardingExcluded ~352). `kidsEventMatch` discovers kids check-in events by name.

- [ ] **Step 2: Self-check** the merge only adds `drift`, preserves serving/burnout/groupDrift/fetch/staffNames. No em dashes.
- [ ] **Step 3: Commit** `git commit -m "Migration: pco_config.drift seed for family drift"`. Ask Josh to `supabase db push`.

---

## Task 3: `pcoUntilPages` helper

**Files:** Modify `supabase/functions/_shared/pco-paginate.ts`; add a test to `supabase/functions/_shared/pco-paginate_test.ts`

**Interfaces:** Produces `pcoUntilPages(tenant, path, stop): Promise<any[]>` returning full page objects (each with `.data` and `.included`), paginating until a page contains a row satisfying `stop` (that boundary page is included; callers filter its rows). Needed because kids check-in names live in each page's `included`, so we cannot use `pcoUntil` (which flattens `.data` and drops `included`).

- [ ] **Step 1: Add to the `makePager` factory** (next to `until`), and add a production export:

```ts
  // Like `until`, but returns full page objects (data + included) rather than
  // flattened rows. Stops after the page that first contains a `stop` row.
  async function untilPages(tenant: string, path: string, stop: (row: any) => boolean): Promise<any[]> {
    const out: any[] = []
    let next: string | null = path
    while (next) {
      const j = await getRaw(tenant, next)
      out.push(j)
      if ((j.data ?? []).some(stop)) break
      next = j?.links?.next ? rel(j.links.next) : null
      if (next) await sleep(100)
    }
    return out
  }
```
Add `untilPages` to the returned object and `export const pcoUntilPages = prod.untilPages`.

- [ ] **Step 2: Add a test** (append a `Deno.test` to pco-paginate_test.ts):

```ts
Deno.test('pcoUntilPages returns full pages and stops at the boundary page', async () => {
  const pages: Record<string, any> = {
    '/c': { data: [{ d: '2026-05-10' }, { d: '2026-05-03' }], included: [{ x: 1 }], links: { next: 'https://api.planningcenteronline.com/c?o=2' } },
    '/c?o=2': { data: [{ d: '2026-04-01' }], included: [{ x: 2 }], links: {} },
  }
  const fetcher = async (_t: string, path: string): Promise<Response> =>
    new Response(JSON.stringify(pages[path]), { status: 200, headers: { 'content-type': 'application/json' } })
  const { pcoUntilPages } = makePager(fetcher)
  const got = await pcoUntilPages('t', '/c', (r: any) => r.d < '2026-05-01')
  assertEquals(got.length, 2)                 // page 1 (no boundary) + page 2 (has 2026-04-01 boundary)
  assertEquals(got[0].included, [{ x: 1 }])   // included preserved
})
```

- [ ] **Step 3: RED then GREEN** `deno test supabase/functions/_shared/pco-paginate_test.ts` (existing tests import esm.sh transitively; if the proxy blocks it, use the import-map workaround from Global Constraints). Confirm the new test fails before the impl, passes after.
- [ ] **Step 4: Commit** `git commit -m "Add pcoUntilPages (bounded pagination preserving included)"`.

---

## Task 4: shaper + family-drift transform (pure, deno-tested)

**Files:** Create `supabase/functions/_shared/pco-transforms/familyDrift.ts` and `familyDrift_test.ts`

**Interfaces:**
- `checkinsToFamilies(rows: {person_id,first,last,checkin_date,kind}[]): FamilyAttendance[]` where `FamilyAttendance = { family: string; kids: string[]; sundays: string[] }` (grouped by surname, distinct Sundays pooled, distinct kid names).
- `computeFamilyDrift(families: FamilyAttendance[], cfg: DriftCfg, today: string): DriftPayload` (the reconstructed logic).
- `DriftCfg = { windowMonths: number; sundaysMissed: number; minEstablishedSundays: number }`.

- [ ] **Step 1: Write the failing test**

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { checkinsToFamilies, computeFamilyDrift } from './familyDrift.ts'

Deno.test('checkinsToFamilies groups by surname, pools distinct Sundays', () => {
  const rows = [
    { person_id: 'a', first: 'Theo', last: 'Mendes', checkin_date: '2026-05-03', kind: 'Regular' },
    { person_id: 'b', first: 'Ana', last: 'Mendes', checkin_date: '2026-05-03', kind: 'Regular' },
    { person_id: 'a', first: 'Theo', last: 'Mendes', checkin_date: '2026-05-10', kind: 'Regular' },
  ]
  const fams = checkinsToFamilies(rows)
  assertEquals(fams.length, 1)
  assertEquals(fams[0].family, 'Mendes')
  assertEquals(fams[0].kids.sort(), ['Ana Mendes', 'Theo Mendes'])
  assertEquals(fams[0].sundays.sort(), ['2026-05-03', '2026-05-10'])
})

Deno.test('computeFamilyDrift flags established-then-quiet, excludes first-timers', () => {
  const cfg = { windowMonths: 10, sundaysMissed: 3, minEstablishedSundays: 5 }
  const today = '2026-07-27' // most recent Sunday on/before = 2026-07-26
  const fams = [
    // established (6 Sundays) and quiet since 2026-06-14 -> missed 6 Sundays -> FLAGGED
    { family: 'Drifter', kids: ['Kid D'], sundays: ['2026-04-05', '2026-04-12', '2026-05-03', '2026-05-31', '2026-06-07', '2026-06-14'] },
    // established but attended last Sunday -> not quiet -> not flagged
    { family: 'Regular', kids: ['Kid R'], sundays: ['2026-06-07', '2026-06-14', '2026-06-21', '2026-07-05', '2026-07-19', '2026-07-26'] },
    // only 2 Sundays -> first-timer/occasional -> excluded
    { family: 'Newcomer', kids: ['Kid N'], sundays: ['2026-07-19', '2026-07-26'] },
  ]
  const out = computeFamilyDrift(fams, cfg, today)
  assertEquals(out.families.map((f) => f.family), ['Drifter'])
  assertEquals(out.flaggedFamilies, 1)
  assertEquals(out.flaggedKids, 1)
  assertEquals(out.onboardingExcluded, 1)
  assertEquals(out.windowMonths, 10)
  assertEquals(out.families[0].totalSundays, 6)
  assertEquals(out.families[0].lastSeen, '2026-06-14')
})
```

- [ ] **Step 2: RED** `deno test --allow-read supabase/functions/_shared/pco-transforms/familyDrift_test.ts` -> fails (module missing).

- [ ] **Step 3: Implement**

```ts
// familyDrift.ts
export interface CheckinRow { person_id: string; first: string; last: string; checkin_date: string; kind: string }
export interface FamilyAttendance { family: string; kids: string[]; sundays: string[] }
export interface DriftFamily { family: string; kids: string[]; lastSeen: string; sundaysMissed: number; monthsAttending: number; totalSundays: number }
export interface DriftCfg { windowMonths: number; sundaysMissed: number; minEstablishedSundays: number }
export interface DriftPayload { flaggedFamilies: number; flaggedKids: number; windowMonths: number; onboardingExcluded: number; signal: string; families: DriftFamily[]; drafts: [] }

// Verbatim from src/lib/clients/focal-point/drift.ts (the `signal:` field) so the
// live payload matches the baked shape.
const DRIFT_SIGNAL = 'Families whose children were regular at Kids Point for months, then stopped for 3+ Sundays. Ranked by how established they were. First-time and one-or-two-visit families are excluded here (they are in the welcome funnel, not drifting).'

const DAY = 864e5
// The Sunday (UTC) of the week a date falls in.
function toSunday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}
// Sundays strictly after lastSeen, up to and including refSunday.
function sundaysMissedSince(lastSeen: string, refSunday: string): number {
  const d = new Date(`${lastSeen}T00:00:00Z`)
  const ref = new Date(`${refSunday}T00:00:00Z`)
  const next = new Date(d)
  next.setUTCDate(d.getUTCDate() + 7) // lastSeen is itself a Sunday; step to the next
  let n = 0
  while (next <= ref) { n++; next.setUTCDate(next.getUTCDate() + 7) }
  return n
}

export function checkinsToFamilies(rows: CheckinRow[]): FamilyAttendance[] {
  const byFam: Record<string, { family: string; kids: Set<string>; sundays: Set<string> }> = {}
  for (const r of rows) {
    const surname = (r.last ?? '').trim()
    if (!surname) continue
    const g = (byFam[surname] ??= { family: surname, kids: new Set(), sundays: new Set() })
    g.kids.add(`${(r.first ?? '').trim()} ${surname}`.trim())
    g.sundays.add(toSunday(r.checkin_date))
  }
  return Object.values(byFam).map((g) => ({ family: g.family, kids: [...g.kids], sundays: [...g.sundays] }))
}

export function computeFamilyDrift(families: FamilyAttendance[], cfg: DriftCfg, today: string): DriftPayload {
  const refSunday = toSunday(today)
  let onboardingExcluded = 0
  const flagged: DriftFamily[] = []
  for (const f of families) {
    const sundays = [...new Set(f.sundays)].sort()
    const totalSundays = sundays.length
    if (totalSundays < cfg.minEstablishedSundays) { onboardingExcluded++; continue }
    const lastSeen = sundays[sundays.length - 1]
    const firstSeen = sundays[0]
    const monthsAttending = Math.max(1, Math.round((Date.parse(lastSeen) - Date.parse(firstSeen)) / (30 * DAY)))
    const missed = sundaysMissedSince(lastSeen, refSunday)
    if (missed < cfg.sundaysMissed) continue
    flagged.push({ family: f.family, kids: [...new Set(f.kids)], lastSeen, sundaysMissed: missed, monthsAttending, totalSundays })
  }
  flagged.sort((a, b) => b.totalSundays - a.totalSundays || b.monthsAttending - a.monthsAttending)
  return {
    flaggedFamilies: flagged.length,
    flaggedKids: flagged.reduce((n, f) => n + f.kids.length, 0),
    windowMonths: cfg.windowMonths,
    onboardingExcluded,
    signal: DRIFT_SIGNAL,
    families: flagged,
    drafts: [],
  }
}
```

- [ ] **Step 4: GREEN** run the test, confirm 2 pass.
- [ ] **Step 5: Commit** `git commit -m "Add family-drift shaper + transform with fixture tests"`.

---

## Task 5: chunked kids-check-ins fetcher

**Files:** Create `supabase/functions/_shared/pco-fetch/fetchKidsChunk.ts`; add `KidsCursor` to `supabase/functions/_shared/pco-fetch/cursor.ts`

**Interfaces:**
- `KidsCursor = { events: string[]; eIndex: number }` (discovered kids check-in event ids + progress).
- `fetchKidsCheckinsChunk(db, clientId, tenant, cfg, cursor, isOver, cutoffOverride?): Promise<{ cursor: KidsCursor; done: boolean }>`; cfg is `{ kidsEventMatch: string; windowMonths: number }`. Upserts `pco_kids_checkins`.

- [ ] **Step 1: Add KidsCursor to cursor.ts**

```ts
export interface KidsCursor { events: string[]; eIndex: number }
```

- [ ] **Step 2: Implement fetchKidsChunk.ts**

```ts
import { pcoAll, pcoUntilPages } from '../pco-paginate.ts'
import { monthsAgo } from '../pco-transforms/serving.ts'
import type { KidsCursor } from './cursor.ts'

// deno-lint-ignore no-explicit-any
type Db = any
interface KidsCfg { kidsEventMatch: string; windowMonths: number }

// Resume by event: discover kids check-in events (by name match) on the first
// chunk, then pull each event's check-ins bounded to the window, upserting into
// pco_kids_checkins. isOver() is checked before each event.
export async function fetchKidsCheckinsChunk(
  db: Db, clientId: string, tenant: string, cfg: KidsCfg, cursor: KidsCursor, isOver: () => boolean, cutoffOverride?: string,
): Promise<{ cursor: KidsCursor; done: boolean }> {
  const cutoff = cutoffOverride ?? monthsAgo(new Date().toISOString().slice(0, 10), cfg.windowMonths)
  let { events, eIndex } = cursor
  if (!events || events.length === 0) {
    const all = await pcoAll(tenant, '/check-ins/v2/events?per_page=100')
    events = all.filter((e: any) => new RegExp(cfg.kidsEventMatch, 'i').test(e.attributes?.name ?? '')).map((e: any) => e.id)
    eIndex = 0
  }
  while (eIndex < events.length) {
    if (isOver()) return { cursor: { events, eIndex }, done: false }
    const eventId = events[eIndex]
    // pages preserve `included` (person records carry the names); stop at cutoff.
    const pages = await pcoUntilPages(tenant, `/check-ins/v2/events/${eventId}/check_ins?include=person&per_page=100&order=-created_at`,
      (c: any) => (c.attributes?.created_at ?? '').slice(0, 10) < cutoff)
    const rows: any[] = []
    for (const page of pages) {
      const persons: Record<string, any> = {}
      for (const inc of page.included ?? []) if (inc.type === 'Person') persons[inc.id] = inc.attributes
      for (const c of page.data ?? []) {
        const created = (c.attributes?.created_at ?? '')
        const date = created.slice(0, 10)
        if (!date || date < cutoff) continue
        const pid = c.relationships?.person?.data?.id
        const p = persons[pid] ?? {}
        const last = (p.last_name ?? '').trim()
        if (!pid || !last) continue
        rows.push({ client_id: clientId, person_id: pid, first: (p.first_name ?? '').trim(), last, checkin_date: date, kind: c.attributes?.kind ?? '' })
      }
    }
    // Dedupe by PK (client_id,person_id,checkin_date) before upsert.
    const deduped = [...new Map(rows.map((r: any) => [`${r.person_id}|${r.checkin_date}`, r])).values()]
    if (deduped.length) {
      const { error } = await db.from('pco_kids_checkins').upsert(deduped, { onConflict: 'client_id,person_id,checkin_date' })
      if (error) throw new Error(`kids upsert: ${error.message}`)
    }
    eIndex++
  }
  return { cursor: { events, eIndex }, done: true }
}
```

- [ ] **Step 3: Type-check** with the esm.sh workaround on `fetchKidsChunk.ts` and `cursor.ts`. No new errors.
- [ ] **Step 4: Commit** `git commit -m "Add chunked kids-check-ins fetcher (event discovery, bounded, resumable)"`.

---

## Task 6: compute-over-cache for drift

**Files:** Modify `supabase/functions/_shared/pco-fetch/computeFromCache.ts`

**Interfaces:** Add `computeDrift(db, clientId, cfg)` reading `pco_kids_checkins` (via the existing `readAll` paginator), shaping via `checkinsToFamilies`, running `computeFamilyDrift`, and `writeOk`-ing the `drift` module row.

- [ ] **Step 1: Implement** (add imports + function to computeFromCache.ts)

```ts
import { checkinsToFamilies, computeFamilyDrift } from '../pco-transforms/familyDrift.ts'
// ...
export async function computeDrift(db: Db, clientId: string, cfg: PcoConfig) {
  const rows = await readAll(
    (from, to) => db.from('pco_kids_checkins')
      .select('person_id,first,last,checkin_date,kind').eq('client_id', clientId)
      .order('person_id').order('checkin_date').range(from, to),
    'kids checkins')
  const families = checkinsToFamilies(rows)
  await writeOk(db, clientId, 'drift', computeFamilyDrift(families, cfg.drift, today()))
}
```

Note: `PcoConfig` must include `drift: DriftCfg` (add `drift?: { windowMonths: number; sundaysMissed: number; minEstablishedSundays: number; kidsEventMatch: string }` to `types.ts`, optional like the other config groups).

- [ ] **Step 2: Type-check** with the esm.sh workaround on `computeFromCache.ts` and `types.ts`. No new errors.
- [ ] **Step 3: Commit** `git commit -m "Add computeDrift (kids check-ins to family-drift payload)"`.

---

## Task 7: orchestrator wiring (add the `kids` resource)

**Files:** Modify `supabase/functions/pco-fetch/index.ts`

- [ ] **Step 1: Wire it in.** Extend `type Resource` to `'schedule' | 'groups' | 'kids'`, add `'kids'` to the `for (const resource of [...] as Resource[])` loop, and add the `kids` branches (mirror the `schedule` structure, using the kids fetcher + `computeDrift`):
  - Import `fetchKidsCheckinsChunk` and `computeDrift`.
  - **Backfill** branch: `else if (resource === 'kids') { const r = await fetchKidsCheckinsChunk(db, clientId, tenant, cfg.drift, (row.cursor ?? {}) as any, isOver); ...upsert pco_sync_state {cursor, backfill_complete: r.done, phase: r.done?'incremental':'backfill', ...}; if (r.done) await computeDrift(db, clientId, cfg) }`
  - **Incremental** branch: `else if (resource === 'kids') { const r = await fetchKidsCheckinsChunk(db, clientId, tenant, cfg.drift, {} as any, makeDeadline(cfg.fetch?.timeBudgetSeconds ?? 90), cutoff); await computeDrift(db, clientId, cfg) }` where `cutoff = today - incrementalWindowDays` (reuse the same cutoff variable the schedule incremental computes).
  - Keep the compute-before-phase-flip ordering (compute runs before the phase upsert flips to `incremental`, matching the final-review fix) and the per-resource try/catch containment.

- [ ] **Step 2: Type-check** with the esm.sh workaround on `pco-fetch/index.ts`. No new errors.
- [ ] **Step 3: Commit + hand off** `git commit -m "pco-fetch: add kids resource for live family drift"`. Ask Josh to `supabase functions deploy pco-fetch`.

---

## Task 8: loader + DriftWatch read live-or-baked

**Files:** Modify `src/lib/clients/church/careDataLoader.ts`, `src/components/cornerstone/DriftWatch.vue`

- [ ] **Step 1: Loader.** In careDataLoader.ts: add `import { focalPointDrift } from '@/lib/clients/focal-point/drift'`; add `drift: null as typeof focalPointDrift | null` to the store; reset it in `loadCareData`; add `'drift'` to the `.in('module_key', [...])` list and the row-dispatch (`else if (row.module_key === 'drift') store.drift = row.payload`); export `export const driftData = () => store.drift ?? focalPointDrift`.

- [ ] **Step 2: DriftWatch.** In DriftWatch.vue: import `driftData` from the loader. Replace the baked source with the live-or-baked one:
  - `const drift = computed(() => driftData())`.
  - Change `activeFamilies` to derive from `drift.value.families` (filtered by `!care.isHidden(...)` and `inScope(...)`), instead of `liveActiveFamilies()`. The live payload is already current, so drop the `driftLive` reconciliation for the data source (remove the `liveActiveFamilies`/`returnedFamilies` imports if now unused; `reconnected` can be `0` or derived from the live payload, since live data has no separate "returned" list). Update the `unplaced` computed and any header counts (`flaggedFamilies`, etc.) to read `drift.value` instead of the baked `focalPointDrift`.
  - Preserve the template, the congregation lens filtering (`inScope`/`congregationOf`), the collapse/showAll behavior, and `fmtDate`.

- [ ] **Step 3: Type-check** `npm run typecheck`, no new errors in the two files.
- [ ] **Step 4: Commit** `git commit -m "DriftWatch reads live-or-baked family drift via careDataLoader"`.

---

## Task 9: live gate + tune + finish

**Files:** none (verification), plus a possible one-line tune to migration 0094's `minEstablishedSundays`.

- [ ] **Step 1:** Confirm Josh applied 0093 + 0094 and deployed pco-fetch.
- [ ] **Step 2: Backfill kids.** Let the rapid cron run, or trigger `pco-fetch` (`mode: backfill`) from the SQL editor. Watch `pco_sync_state` for `resource='kids'` to reach `backfill_complete=true` (this is the heaviest pull, so it takes the most chunks).
- [ ] **Step 3: Correctness gate.** Read the `drift` payload summary: `flaggedFamilies`, `flaggedKids`, `onboardingExcluded`. Compare to baked (~53 / ~70 / ~352). If `flaggedFamilies` is far off, tune `minEstablishedSundays` in `pco_config` (higher excludes more as first-timers; lower flags more) and recompute (incremental) until it lands near baked. Persist the tuned value by updating migration 0094 to the final number.
- [ ] **Step 4: Spot-check the pooled-attendance rule.** Confirm a family that recently attended a different kids service is NOT flagged, and that the English/Brazilian lens filters the displayed list.
- [ ] **Step 5: Finish.** `deno test` suites pass, `npm run typecheck` clean, live counts within tolerance. Merge the branch to `main` (I handle the merge per Josh's standing request), and Josh deploys pco-fetch if a config tune changed it (it does not; only db push for a re-tuned 0094).

---

## Self-review notes
- Spec coverage: staging (T1), config (T2), pcoUntilPages (T3), shaper+transform (T4), kids fetcher (T5), computeDrift (T6), orchestrator wiring (T7), loader+DriftWatch (T8), live gate + tune (T9). All spec sections mapped.
- Type consistency: `KidsCursor` added in T5 (cursor.ts), consumed by T5/T7; `PcoConfig.drift` added in T6 (types.ts), consumed by T6/T7; `DriftPayload` shape matches DriftWatch's expected `focalPointDrift` shape.
- Deferred (per spec): household grouping; congregation mapping for brand-new families; drafted notes.
- The one tunable (`minEstablishedSundays`) is validated against live data in T9, not guessed.
