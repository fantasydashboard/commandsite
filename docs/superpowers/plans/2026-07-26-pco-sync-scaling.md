# PCO Sync Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-invocation PCO sync (which 504s on a full church) with a resumable chunked fetch into Postgres staging tables plus a fast compute-over-cache, driven by a rapid backfill cron and a nightly incremental.

**Architecture:** `pco-fetch` edge function advances one church-resource by one time-budgeted chunk per invocation, upserting PCO data into staging tables and saving a cursor. A rapid pg_cron drives the first backfill; a nightly cron drives incremental refresh. When a resource's data is complete, `pco-fetch` runs the (already-tested) transforms over the staging rows inline and writes `church_dashboard_data`. Everything downstream (`careDataLoader`, freshness badge, refresh-now button) is unchanged.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions on Deno), pg_cron + pg_net, existing `pcoPaginate`/`pcoUntil` helpers and `computeServing`/`computeBurnout`/`computeGroupDrift` transforms.

**Spec:** `docs/superpowers/specs/2026-07-26-pco-sync-scaling-design.md`

## Global Constraints

- **No em dashes** anywhere (code, comments, SQL, commit messages). Use commas, periods, parentheses.
- **PCO team-member status codes are single letters** C/U/D. The schedule shaper normalizes with `.charAt(0).toUpperCase()`; compute compares `=== 'C'` / `!== 'D'`.
- **Edge functions are Deno.** Import Supabase via `https://esm.sh/@supabase/supabase-js@2.45.0`; shared helpers via relative `../_shared/...ts`.
- **`Date.now()` is available** in edge functions (unlike workflow scripts); use it for the time budget.
- **Migrations and function deploys are applied by Josh** (`supabase db push`, `supabase functions deploy`). Tasks that add a migration or function end by asking Josh to apply; do not run apply commands.
- **Deno esm.sh proxy workaround for local type-check:** this machine's proxy blocks Deno from esm.sh. To `deno check` a file whose graph imports `@supabase/supabase-js`, use:
  `printf '{ "imports": { "https://esm.sh/@supabase/supabase-js@2.45.0": "npm:@supabase/supabase-js@2.45.0" } }' > "$CLAUDE_JOB_DIR/tmp/im.json"` then `deno check --node-modules-dir=none --import-map="$CLAUDE_JOB_DIR/tmp/im.json" <file>`. Remove any deno.lock afterward; do not commit it. A pre-existing crypto.ts ArrayBufferLike error in the graph is acceptable (not a new error). Pure files that do not import esm.sh (`deno test`) run without the workaround (`deno.land/std` is reachable).
- **`clients.pco_config` is read for per-church config;** it is `jsonb` and not in generated types (query with `supabase as any` on the frontend).
- **Live church:** slug `focal-point-church`. Latest migration is `0087`, so new migrations start at `0088`.
- Verify TypeScript for Vue files with `npm run typecheck` (filter pre-existing `src/modules/` noise).

## Input contracts (unchanged, from Layer 1)

```ts
// serving/burnout transforms consume:
type ByPerson = Record<string, { name: string; dates: { date: string; team: string; status: string }[] }>
// groupDrift transform consumes:
interface GroupInput { name: string; events: { id: string; date: string }[]; attendanceByPid: Record<string, string[]>; members: { pid: string; name: string }[] }
```

Staging shapers (Task 3) rebuild these exact shapes from staging rows.

---

## Task 1: Staging tables + sync-state migration

**Files:**
- Create: `supabase/migrations/0088_pco_staging.sql`

**Interfaces:**
- Produces tables `pco_serving_assignments`, `pco_group_attendance`, `pco_group_members`, `pco_sync_state` (schemas below). Written by `pco-fetch` (service role), read by compute (service role) and `/admin/health` (admin).

- [ ] **Step 1: Write the migration**

```sql
-- Local mirror of the PCO data the Care & Drift transforms need, filled in
-- resumable chunks by pco-fetch and read by compute-over-cache. Service role
-- writes; admins read. Church users never read staging (they read
-- church_dashboard_data).

create table if not exists public.pco_serving_assignments (
  client_id uuid not null references public.clients(id) on delete cascade,
  person_id text not null,
  name      text not null,
  date      date not null,
  team      text not null,
  status    text not null,
  primary key (client_id, person_id, date, team)
);
create index if not exists pco_serving_assignments_client_date_idx
  on public.pco_serving_assignments (client_id, date);

create table if not exists public.pco_group_attendance (
  client_id  uuid not null references public.clients(id) on delete cascade,
  group_id   text not null,
  group_name text not null,
  event_id   text not null,
  event_date date not null,
  person_id  text not null,
  name       text not null,
  primary key (client_id, group_id, event_id, person_id)
);
create index if not exists pco_group_attendance_client_group_idx
  on public.pco_group_attendance (client_id, group_id);

create table if not exists public.pco_group_members (
  client_id  uuid not null references public.clients(id) on delete cascade,
  group_id   text not null,
  group_name text not null,
  person_id  text not null,
  name       text not null,
  primary key (client_id, group_id, person_id)
);

create table if not exists public.pco_sync_state (
  client_id         uuid not null references public.clients(id) on delete cascade,
  resource          text not null,
  phase             text not null default 'backfill',
  cursor            jsonb not null default '{}'::jsonb,
  last_synced_date  date,
  backfill_complete boolean not null default false,
  updated_at        timestamptz not null default now(),
  error             text,
  primary key (client_id, resource)
);

alter table public.pco_serving_assignments enable row level security;
alter table public.pco_group_attendance   enable row level security;
alter table public.pco_group_members       enable row level security;
alter table public.pco_sync_state          enable row level security;

-- Admins read all; service role bypasses RLS for writes. No policy for
-- anon/authenticated non-admins.
create policy "admins read serving assignments" on public.pco_serving_assignments
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "admins read group attendance" on public.pco_group_attendance
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "admins read group members" on public.pco_group_members
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "admins read sync state" on public.pco_sync_state
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
```

- [ ] **Step 2: Self-check** PKs support chunk upserts (assignment unique per person/date/team; attendance per group/event/person); `pco_sync_state` PK is (client_id, resource); no non-admin read policy so only service role writes. No em dashes.

- [ ] **Step 3: Commit + hand off**

```bash
git add supabase/migrations/0088_pco_staging.sql
git commit -m "Migration: PCO staging tables + sync state cursor"
```
Ask Josh to run `supabase db push`.

---

## Task 2: pco_config additions migration

**Files:**
- Create: `supabase/migrations/0089_pco_config_fetch.sql`

**Interfaces:**
- Produces config keys `groupDrift.eventsPerGroup` (12), `fetch.timeBudgetSeconds` (90), `fetch.incrementalWindowDays` (21) on `clients.pco_config`, merged into Focal Point's existing config.

- [ ] **Step 1: Write the migration**

```sql
-- Add fetch/chunking config, merged into the existing pco_config for the live church.
update public.clients
set pco_config = pco_config
  || jsonb_build_object('fetch', jsonb_build_object('timeBudgetSeconds', 90, 'incrementalWindowDays', 21))
  || jsonb_build_object('groupDrift', (coalesce(pco_config->'groupDrift','{}'::jsonb) || jsonb_build_object('eventsPerGroup', 12)))
where slug = 'focal-point-church';
```

- [ ] **Step 2: Self-check** the `groupDrift` merge preserves existing groupDrift keys (seasonStart, seasonEnd, minEvents, minAttendance, minGapWeeks, groupTypeMatch) and only adds eventsPerGroup. No em dashes.

- [ ] **Step 3: Commit + hand off**

```bash
git add supabase/migrations/0089_pco_config_fetch.sql
git commit -m "Migration: add fetch + eventsPerGroup config to pco_config"
```
Ask Josh to run `supabase db push`.

---

## Task 3: Staging shapers (pure, deno-tested)

**Files:**
- Create: `supabase/functions/_shared/pco-transforms/fromStaging.ts`
- Test: `supabase/functions/_shared/pco-transforms/fromStaging_test.ts`

**Interfaces:**
- Consumes: arrays of staging rows.
- Produces:
  - `assignmentsToByPerson(rows: {person_id,name,date,team,status}[]): ByPerson`
  - `groupRowsToInputs(attendance: {group_id,group_name,event_id,event_date,person_id,name}[], members: {group_id,group_name,person_id,name}[]): GroupInput[]`

- [ ] **Step 1: Write the failing test**

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { assignmentsToByPerson, groupRowsToInputs } from './fromStaging.ts'

Deno.test('assignmentsToByPerson groups by person, dates desc', () => {
  const rows = [
    { person_id: 'p1', name: 'Ann', date: '2026-05-03', team: 'Kids', status: 'C' },
    { person_id: 'p1', name: 'Ann', date: '2026-05-10', team: 'Kids', status: 'C' },
    { person_id: 'p2', name: 'Bob', date: '2026-05-03', team: 'Parking', status: 'U' },
  ]
  const bp = assignmentsToByPerson(rows)
  assertEquals(Object.keys(bp).sort(), ['p1', 'p2'])
  assertEquals(bp.p1.name, 'Ann')
  assertEquals(bp.p1.dates.map((d) => d.date), ['2026-05-10', '2026-05-03']) // desc
  assertEquals(bp.p2.dates[0].status, 'U')
})

Deno.test('groupRowsToInputs builds events, attendanceByPid, members', () => {
  const att = [
    { group_id: 'g1', group_name: 'Mens Group', event_id: 'e1', event_date: '2026-05-10', person_id: 'p1', name: 'Ann' },
    { group_id: 'g1', group_name: 'Mens Group', event_id: 'e2', event_date: '2026-05-17', person_id: 'p1', name: 'Ann' },
  ]
  const mem = [{ group_id: 'g1', group_name: 'Mens Group', person_id: 'p1', name: 'Ann' }]
  const gi = groupRowsToInputs(att, mem)
  assertEquals(gi.length, 1)
  assertEquals(gi[0].name, 'Mens Group')
  assertEquals(gi[0].events.map((e) => e.date), ['2026-05-17', '2026-05-10']) // desc
  assertEquals(gi[0].attendanceByPid.p1.sort(), ['2026-05-10', '2026-05-17'])
  assertEquals(gi[0].members, [{ pid: 'p1', name: 'Ann' }])
})
```

- [ ] **Step 2: Run, verify RED**

Run: `deno test --allow-read supabase/functions/_shared/pco-transforms/fromStaging_test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// fromStaging.ts
import type { ByPerson } from './types.ts'
import type { GroupInput } from './groupDrift.ts'

export interface AssignmentRow { person_id: string; name: string; date: string; team: string; status: string }
export interface AttendanceRow { group_id: string; group_name: string; event_id: string; event_date: string; person_id: string; name: string }
export interface MemberRow { group_id: string; group_name: string; person_id: string; name: string }

export function assignmentsToByPerson(rows: AssignmentRow[]): ByPerson {
  const bp: ByPerson = {}
  for (const r of rows) {
    ;(bp[r.person_id] ??= { name: r.name, dates: [] }).dates.push({ date: r.date, team: r.team, status: r.status })
  }
  for (const rec of Object.values(bp)) rec.dates.sort((a, b) => (a.date < b.date ? 1 : -1))
  return bp
}

export function groupRowsToInputs(attendance: AttendanceRow[], members: MemberRow[]): GroupInput[] {
  const groups = new Map<string, { name: string; events: Map<string, string>; attendanceByPid: Record<string, string[]> }>()
  for (const r of attendance) {
    const g = groups.get(r.group_id) ?? { name: r.group_name, events: new Map(), attendanceByPid: {} }
    g.events.set(r.event_id, r.event_date)
    ;(g.attendanceByPid[r.person_id] ??= []).push(r.event_date)
    groups.set(r.group_id, g)
  }
  const membersByGroup = new Map<string, { pid: string; name: string }[]>()
  const nameByGroup = new Map<string, string>()
  for (const m of members) {
    ;(membersByGroup.get(m.group_id) ?? membersByGroup.set(m.group_id, []).get(m.group_id)!).push({ pid: m.person_id, name: m.name })
    nameByGroup.set(m.group_id, m.group_name)
  }
  const out: GroupInput[] = []
  for (const [gid, g] of groups) {
    const events = [...g.events.entries()].map(([id, date]) => ({ id, date })).sort((a, b) => (a.date < b.date ? 1 : -1))
    out.push({ name: g.name || nameByGroup.get(gid) || 'Group', events, attendanceByPid: g.attendanceByPid, members: membersByGroup.get(gid) ?? [] })
  }
  return out
}
```

- [ ] **Step 4: Run, verify GREEN**

Run: `deno test --allow-read supabase/functions/_shared/pco-transforms/fromStaging_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/pco-transforms/fromStaging.ts supabase/functions/_shared/pco-transforms/fromStaging_test.ts
git commit -m "Add staging-row shapers (rows to ByPerson / GroupInput) with tests"
```

---

## Task 4: Cursor helpers (pure, deno-tested)

**Files:**
- Create: `supabase/functions/_shared/pco-fetch/cursor.ts`
- Test: `supabase/functions/_shared/pco-fetch/cursor_test.ts`

**Interfaces:**
- Produces a deadline helper and cursor types used by the fetchers:
  - `makeDeadline(budgetSeconds: number): () => boolean` (returns true when time is up).
  - Types `ScheduleCursor = { serviceTypeIds: string[]; stIndex: number; planIds: string[]; planIndex: number }` and `GroupsCursor = { groups: {id:string;name:string}[]; gIndex: number }`.

- [ ] **Step 1: Write the failing test**

```ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { makeDeadline } from './cursor.ts'

Deno.test('makeDeadline flips true after the budget elapses', async () => {
  const over = makeDeadline(0) // 0-second budget => immediately over
  assertEquals(over(), true)
  const plenty = makeDeadline(60)
  assertEquals(plenty(), false)
})
```

- [ ] **Step 2: Run, verify RED**

Run: `deno test supabase/functions/_shared/pco-fetch/cursor_test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// cursor.ts
export interface ScheduleCursor { serviceTypeIds: string[]; stIndex: number; planIds: string[]; planIndex: number }
export interface GroupsCursor { groups: { id: string; name: string }[]; gIndex: number }

// Returns a function that reports whether the time budget has elapsed. Check it
// before starting each new expensive unit (a plan, a group) so a chunk always
// stops cleanly under the platform ceiling.
export function makeDeadline(budgetSeconds: number): () => boolean {
  const end = Date.now() + budgetSeconds * 1000
  return () => Date.now() >= end
}
```

- [ ] **Step 4: Run, verify GREEN**

Run: `deno test supabase/functions/_shared/pco-fetch/cursor_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/pco-fetch/cursor.ts supabase/functions/_shared/pco-fetch/cursor_test.ts
git commit -m "Add fetch cursor types + time-budget deadline helper"
```

---

## Task 5: Chunked schedule fetcher

**Files:**
- Create: `supabase/functions/_shared/pco-fetch/fetchScheduleChunk.ts`

**Interfaces:**
- Consumes: `pcoAll`, `pcoUntil`, `pcoAllPages` (from `../pco-paginate.ts`), `monthsAgo` (from `../pco-transforms/serving.ts`), a service-role Supabase client, config, and the current `ScheduleCursor`.
- Produces: `fetchScheduleChunk(db, clientId, tenant, cfg, state, isOver): Promise<{ cursor: ScheduleCursor; done: boolean; lastDate: string | null }>` where it upserts `pco_serving_assignments` rows as it goes and returns the advanced cursor and whether the resource backfill is complete.

Verified end to end in Task 11 (live), plus `deno check` here.

- [ ] **Step 1: Implement**

```ts
// fetchScheduleChunk.ts
import { pcoAll, pcoUntil, pcoAllPages } from '../pco-paginate.ts'
import { monthsAgo } from '../pco-transforms/serving.ts'
import type { ScheduleCursor } from './cursor.ts'

// deno-lint-ignore no-explicit-any
type Db = any
interface ServingCfg { lookbackMonths: number }

// Advances the schedule backfill by one time-budgeted chunk. Resumes from the
// cursor: iterate service types, and within each, its plans; for each plan upsert
// team-member assignments. Stops when isOver() is true, persisting progress in
// the returned cursor. done=true when all service types are exhausted.
export async function fetchScheduleChunk(
  db: Db, clientId: string, tenant: string, cfg: ServingCfg, cursor: ScheduleCursor, isOver: () => boolean,
): Promise<{ cursor: ScheduleCursor; done: boolean; lastDate: string | null }> {
  const cutoff = monthsAgo(new Date().toISOString().slice(0, 10), cfg.lookbackMonths)
  let { serviceTypeIds, stIndex, planIds, planIndex } = cursor
  let lastDate: string | null = null

  if (!serviceTypeIds || serviceTypeIds.length === 0) {
    const sts = await pcoAll(tenant, '/services/v2/service_types?per_page=100')
    serviceTypeIds = sts.map((s: any) => s.id)
    stIndex = 0; planIds = []; planIndex = 0
  }

  while (stIndex < serviceTypeIds.length) {
    if (!planIds || planIndex >= planIds.length) {
      if (planIndex >= (planIds?.length ?? 0) && planIds && planIds.length > 0 && planIndex > 0) {
        // finished this service type's plans; advance
        stIndex++; planIds = []; planIndex = 0
        if (stIndex >= serviceTypeIds.length) break
      }
      const stId = serviceTypeIds[stIndex]
      const past = await pcoUntil(tenant, `/services/v2/service_types/${stId}/plans?filter=past&per_page=50&order=-sort_date`,
        (p: any) => { const d = (p.attributes?.sort_date ?? '').slice(0, 10); return !!d && d < cutoff })
      const future = await pcoAll(tenant, `/services/v2/service_types/${stId}/plans?filter=future&per_page=50&order=sort_date`)
      planIds = [...past, ...future].map((p: any) => p.id)
      planIndex = 0
      if (planIds.length === 0) { stIndex++; continue }
    }
    while (planIndex < planIds.length) {
      if (isOver()) return { cursor: { serviceTypeIds, stIndex, planIds, planIndex }, done: false, lastDate }
      const planId = planIds[planIndex]
      const pages = await pcoAllPages(tenant, `/services/v2/plans/${planId}/team_members?per_page=200&include=team`)
      const rows: any[] = []
      for (const page of pages) {
        const teamName: Record<string, string> = {}
        for (const inc of page.included ?? []) if (inc.type === 'Team') teamName[inc.id] = inc.attributes?.name ?? ''
        // plan date: fetch once from the plan record is avoidable; team_members lack date, so read from the plan list is needed.
        for (const m of page.data ?? []) {
          const pid = m.relationships?.person?.data?.id
          const name = (m.attributes?.name ?? '').trim()
          if (!pid || !name) continue
          const team = teamName[m.relationships?.team?.data?.id] || 'Serving'
          const status = (m.attributes?.status ?? '').charAt(0).toUpperCase()
          rows.push({ client_id: clientId, person_id: pid, name, date: (m as any)._planDate, team, status })
        }
      }
      // NOTE: team_members do not carry the plan date; capture it alongside planIds.
      planIndex++
    }
    stIndex++; planIds = []; planIndex = 0
  }
  return { cursor: { serviceTypeIds, stIndex, planIds: [], planIndex: 0 }, done: true, lastDate }
}
```

- [ ] **Step 2: Fix the plan-date gap.** team_members responses do not include the plan date, and assignments need it. Change the cursor's plan tracking to store `{ id, date }` pairs, not bare ids: make `planIds: { id: string; date: string }[]` in `ScheduleCursor` (update `cursor.ts` and its usages), capture `date` from the plan record when building the list (`p.attributes?.sort_date`), and use `plan.date` when building each assignment row. Then upsert the rows for the plan:

```ts
      if (rows.length) {
        const { error } = await db.from('pco_serving_assignments').upsert(rows, { onConflict: 'client_id,person_id,date,team' })
        if (error) throw new Error(`upsert assignments failed: ${error.message}`)
        lastDate = rows.reduce((mx: string, r: any) => (r.date > mx ? r.date : mx), lastDate ?? '')
      }
```

Place this block right after the per-plan `rows` are built and before `planIndex++`, using `plan.date` (from the `{id,date}` pair) as the assignment date.

- [ ] **Step 3: Type-check** with the esm.sh workaround (this file's graph imports pco-auth via pco-paginate).

Run the workaround `deno check` from Global Constraints on `fetchScheduleChunk.ts`. Expected: no new errors (crypto.ts pre-existing error acceptable).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/pco-fetch/fetchScheduleChunk.ts supabase/functions/_shared/pco-fetch/cursor.ts
git commit -m "Add chunked, resumable schedule fetcher (upserts serving assignments)"
```

---

## Task 6: Chunked groups fetcher

**Files:**
- Create: `supabase/functions/_shared/pco-fetch/fetchGroupsChunk.ts`

**Interfaces:**
- Consumes: `pcoAll`, `pcoGet` (from `../pco-paginate.ts`), a service-role client, config (`groupDrift` incl. `eventsPerGroup`, `seasonStart`, `seasonEnd`, `groupTypeMatch`), and `GroupsCursor`.
- Produces: `fetchGroupsChunk(db, clientId, tenant, cfg, cursor, isOver): Promise<{ cursor: GroupsCursor; done: boolean }>`; upserts `pco_group_attendance` and `pco_group_members`.

- [ ] **Step 1: Implement**

```ts
// fetchGroupsChunk.ts
import { pcoAll, pcoGet } from '../pco-paginate.ts'
import type { GroupsCursor } from './cursor.ts'

// deno-lint-ignore no-explicit-any
type Db = any
interface GroupDriftCfg { seasonStart: string; seasonEnd: string; groupTypeMatch: string; eventsPerGroup: number }

export async function fetchGroupsChunk(
  db: Db, clientId: string, tenant: string, cfg: GroupDriftCfg, cursor: GroupsCursor, isOver: () => boolean,
): Promise<{ cursor: GroupsCursor; done: boolean }> {
  let { groups, gIndex } = cursor
  const start = Date.parse(cfg.seasonStart), end = Date.parse(cfg.seasonEnd)

  if (!groups || groups.length === 0) {
    const types = (await pcoAll(tenant, '/groups/v2/group_types?per_page=25'))
      .filter((t: any) => new RegExp(cfg.groupTypeMatch, 'i').test(t.attributes?.name ?? ''))
    groups = []
    for (const t of types) {
      const gs = (await pcoAll(tenant, `/groups/v2/group_types/${t.id}/groups?per_page=100`))
        .filter((g: any) => !g.attributes?.archived_at)
      for (const g of gs) groups.push({ id: g.id, name: g.attributes?.name ?? 'Group' })
    }
    gIndex = 0
  }

  while (gIndex < groups.length) {
    if (isOver()) return { cursor: { groups, gIndex }, done: false }
    const g = groups[gIndex]
    // Most recent eventsPerGroup events within the season.
    const events = (await pcoAll(tenant, `/groups/v2/groups/${g.id}/events?per_page=100&order=-starts_at`))
      .map((e: any) => ({ id: e.id, date: (e.attributes?.starts_at ?? '').slice(0, 10), t: Date.parse(e.attributes?.starts_at ?? '') }))
      .filter((e: any) => e.t >= start && e.t <= end)
      .slice(0, cfg.eventsPerGroup)
    const attRows: any[] = []
    for (const e of events) {
      const att = await pcoAll(tenant, `/groups/v2/events/${e.id}/attendances?per_page=200`)
      for (const x of att) {
        if (!x.attributes?.attended) continue
        const pid = x.relationships?.person?.data?.id
        if (pid) attRows.push({ client_id: clientId, group_id: g.id, group_name: g.name, event_id: e.id, event_date: e.date, person_id: pid, name: '' })
      }
    }
    const mj = await pcoGet(tenant, `/groups/v2/groups/${g.id}/memberships?per_page=100&include=person`)
    const nm: Record<string, string> = {}
    for (const inc of mj.included ?? []) if (inc.type === 'Person') nm[inc.id] = `${inc.attributes?.first_name ?? ''} ${inc.attributes?.last_name ?? ''}`.trim()
    const memRows = (mj.data ?? []).map((m: any) => ({ client_id: clientId, group_id: g.id, group_name: g.name, person_id: m.relationships?.person?.data?.id, name: nm[m.relationships?.person?.data?.id] || 'Member' })).filter((m: any) => m.person_id)
    // Fill attendance names from membership where known.
    for (const r of attRows) r.name = nm[r.person_id] || 'Member'
    if (attRows.length) { const { error } = await db.from('pco_group_attendance').upsert(attRows, { onConflict: 'client_id,group_id,event_id,person_id' }); if (error) throw new Error(`att upsert: ${error.message}`) }
    if (memRows.length) { const { error } = await db.from('pco_group_members').upsert(memRows, { onConflict: 'client_id,group_id,person_id' }); if (error) throw new Error(`mem upsert: ${error.message}`) }
    gIndex++
  }
  return { cursor: { groups, gIndex }, done: true }
}
```

- [ ] **Step 2: Type-check** with the esm.sh workaround on `fetchGroupsChunk.ts`. Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/pco-fetch/fetchGroupsChunk.ts
git commit -m "Add chunked groups fetcher (bounded eventsPerGroup; upserts attendance + members)"
```

---

## Task 7: Compute-over-cache module

**Files:**
- Create: `supabase/functions/_shared/pco-fetch/computeFromCache.ts`

**Interfaces:**
- Consumes: service-role client, `assignmentsToByPerson`/`groupRowsToInputs` (Task 3), `computeServing`/`computeBurnout`/`computeGroupDrift`, config, `monthsAgo`.
- Produces: `computeServingBurnout(db, clientId, cfg)` and `computeGroups(db, clientId, cfg)`, each reading staging, running transforms, and upserting `church_dashboard_data` (same write contract as Layer 1's `writeOk`: full payload + status ok + computed_at + source_freshness; check the `{error}`).

- [ ] **Step 1: Implement**

```ts
// computeFromCache.ts
import { assignmentsToByPerson, groupRowsToInputs } from '../pco-transforms/fromStaging.ts'
import { computeServing, computeBurnout, monthsAgo } from '../pco-transforms/serving.ts'
import { computeGroupDrift } from '../pco-transforms/groupDrift.ts'
import type { PcoConfig } from '../pco-transforms/types.ts'

// deno-lint-ignore no-explicit-any
type Db = any
const today = () => new Date().toISOString().slice(0, 10)

async function writeOk(db: Db, clientId: string, moduleKey: string, payload: unknown) {
  const now = new Date().toISOString()
  const { error } = await db.from('church_dashboard_data').upsert(
    { client_id: clientId, module_key: moduleKey, payload, status: 'ok', error: null, computed_at: now, source_freshness: today(), synced_attempt_at: now },
    { onConflict: 'client_id,module_key' })
  if (error) throw new Error(`write ${moduleKey}: ${error.message}`)
}

export async function computeServingBurnout(db: Db, clientId: string, cfg: PcoConfig) {
  const cutoff = monthsAgo(today(), cfg.serving.lookbackMonths)
  const { data, error } = await db.from('pco_serving_assignments')
    .select('person_id,name,date,team,status').eq('client_id', clientId).gte('date', cutoff)
  if (error) throw new Error(`read assignments: ${error.message}`)
  const staff = new Set(Array.isArray(cfg.staffNames) ? cfg.staffNames : [])
  const byPerson = assignmentsToByPerson(data ?? [])
  await writeOk(db, clientId, 'serving', computeServing(byPerson, staff, cfg.serving, today()))
  await writeOk(db, clientId, 'burnout', computeBurnout(byPerson, staff, cfg.burnout, today()))
}

export async function computeGroups(db: Db, clientId: string, cfg: PcoConfig) {
  const { data: att, error: e1 } = await db.from('pco_group_attendance')
    .select('group_id,group_name,event_id,event_date,person_id,name').eq('client_id', clientId)
  if (e1) throw new Error(`read attendance: ${e1.message}`)
  const { data: mem, error: e2 } = await db.from('pco_group_members')
    .select('group_id,group_name,person_id,name').eq('client_id', clientId)
  if (e2) throw new Error(`read members: ${e2.message}`)
  const inputs = groupRowsToInputs(att ?? [], mem ?? [])
  await writeOk(db, clientId, 'groupDrift', computeGroupDrift(inputs, cfg.groupDrift))
}
```

Note: `PcoConfig` must include `serving`, `burnout`, `groupDrift`, `staffNames` (already defined in `types.ts` from Layer 1). Reads use the service-role client so RLS does not block them.

- [ ] **Step 2: Type-check** with the esm.sh workaround on `computeFromCache.ts`. Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/pco-fetch/computeFromCache.ts
git commit -m "Add compute-over-cache (staging rows to dashboard payloads)"
```

---

## Task 8: `pco-fetch` orchestrator edge function

**Files:**
- Create: `supabase/functions/pco-fetch/index.ts`

**Interfaces:**
- Consumes: everything above, plus a service-role client and the auth pattern from `pco-sync` (service role or `X-Cron-Secret` matching `PCO_SYNC_CRON_SECRET`).
- Body: `{ tenant?: string }` (given = that church; absent = all churches whose `pco_sync_state` is not idle, i.e. the cron path). Per church, advances the due resource by one chunk and runs compute inline at completion/incremental.

- [ ] **Step 1: Implement**

Mirror the CORS/json/auth boilerplate from `supabase/functions/pco-sync/index.ts` (service-role bypass or `X-Cron-Secret` == `PCO_SYNC_CRON_SECRET`; the cron-secret check must run before the `!token` gate, as in pco-sync). Then, per church:

```ts
// For each resource in ['schedule','groups']:
//   load pco_sync_state row (create with phase 'backfill' if missing)
//   if phase === 'backfill':
//     const isOver = makeDeadline(cfg.fetch.timeBudgetSeconds)
//     if resource === 'schedule': const r = await fetchScheduleChunk(db, clientId, tenant, cfg.serving, cursorOrEmpty, isOver)
//       else: const r = await fetchGroupsChunk(db, clientId, tenant, cfg.groupDrift, cursorOrEmpty, isOver)
//     upsert pco_sync_state { cursor: r.cursor, backfill_complete: r.done, phase: r.done ? 'incremental' : 'backfill', last_synced_date, updated_at: now, error: null }
//     if r.done: run the matching compute (computeServingBurnout for schedule, computeGroups for groups)
//   else if phase === 'incremental':
//     (schedule) re-fetch recent window: run fetchScheduleChunk against a cursor whose cutoff is today - fetch.incrementalWindowDays, to completion within the budget (recent slice is small), then computeServingBurnout
//     (groups) recompute from cache only (season is fixed/complete; new-event fetch for an active season is deferred): computeGroups
//   wrap each resource in try/catch: on failure set pco_sync_state.error and continue to the next resource/church (never abort the batch)
```

Concrete requirements for the implementer:
- Reuse `makeDeadline`, `fetchScheduleChunk`, `fetchGroupsChunk`, `computeServingBurnout`, `computeGroups`.
- Cursor is stored/loaded as `pco_sync_state.cursor` (jsonb). An empty cursor is `{}` cast to the resource cursor shape (the fetchers treat empty `serviceTypeIds`/`groups` as "start fresh").
- The incremental schedule re-fetch can reuse `fetchScheduleChunk` by passing a config whose effective cutoff is `today - incrementalWindowDays` (add an optional `cutoffOverride` param to `fetchScheduleChunk`, or compute lookbackMonths-equivalent); simplest is to add an optional `cutoffOverride?: string` param to `fetchScheduleChunk` used instead of `monthsAgo(...)` when present. Update Task 5's signature accordingly and note it in that task's Produces.
- Response: `{ ok: true, results: { [tenant]: { schedule: 'backfill'|'incremental'|'error', groups: ... } } }`.
- Each church wrapped in try/catch (one church's failure cannot abort the cron batch), same as pco-sync's cron loop.

- [ ] **Step 2: Type-check** with the esm.sh workaround on `pco-fetch/index.ts`. Expected: no new errors.

- [ ] **Step 3: Commit + hand off**

```bash
git add supabase/functions/pco-fetch/index.ts supabase/functions/_shared/pco-fetch/fetchScheduleChunk.ts
git commit -m "Add pco-fetch orchestrator (chunked backfill + incremental + inline compute)"
```
Add `[functions.pco-fetch]` `verify_jwt = false` to `supabase/config.toml` (mirror the pco-sync entry) in this commit. Ask Josh to run `supabase functions deploy pco-fetch`.

---

## Task 9: Cron migrations (rapid backfill + nightly incremental)

**Files:**
- Create: `supabase/migrations/0090_pco_fetch_cron.sql`

**Interfaces:**
- Rapid pg_cron (every 2 minutes) and a nightly pg_cron, both POSTing to `pco-fetch` with the hardcoded URL + `X-Cron-Secret` header (the `supabase_functions_base_url` Vault secret does not exist; hardcode as the working health crons do). Unschedules the Layer 1 `pco-sync-nightly` job.

- [ ] **Step 1: Write the migration**

```sql
-- Retire the Layer 1 single-shot nightly sync.
select cron.unschedule('pco-sync-nightly');

-- Rapid backfill driver: advance any church still catching up. Cheap no-op once
-- all resources are in the incremental phase.
select cron.schedule('pco-fetch-backfill', '*/2 * * * *', $cron$
  select net.http_post(
    url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/pco-fetch',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'health_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$cron$);

-- Nightly incremental refresh for all connected churches.
select cron.schedule('pco-fetch-nightly', '0 4 * * *', $cron$
  select net.http_post(
    url := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/pco-fetch',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'health_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$cron$);
```

- [ ] **Step 2: Self-check** job names unique; `pco-sync-nightly` unschedule matches the Layer 1 job name; hardcoded URL + `health_cron_secret` header match the working pattern. No em dashes.

- [ ] **Step 3: Commit + hand off**

```bash
git add supabase/migrations/0090_pco_fetch_cron.sql
git commit -m "Migration: rapid backfill + nightly incremental cron for pco-fetch; retire pco-sync-nightly"
```
Ask Josh to run `supabase db push`.

---

## Task 10: Sync-status in the read path + fix the debug probe

**Files:**
- Modify: `src/lib/clients/church/careDataLoader.ts`
- Modify: `src/components/cornerstone/DataFreshnessBadge.vue`
- Modify: `supabase/functions/pco-sync/index.ts` (fix the debug probe to single-page)

**Interfaces:**
- `careDataLoader` also reads `pco_sync_state` and exposes `syncPhase(slug)` (e.g. `'backfill' | 'incremental' | null`) so the badge can show "Syncing, catching up" until backfill completes.

- [ ] **Step 1: Loader reads sync state**

In `careDataLoader.ts`, after loading `church_dashboard_data`, also `sb.from('pco_sync_state').select('resource,phase,backfill_complete').eq('client_id', client.id)`; store on the reactive store; expose `careSyncing()` returning true when any resource has `backfill_complete === false`. Guard with the existing `as any` handle.

- [ ] **Step 2: Badge shows syncing state**

In `DataFreshnessBadge.vue`, if `careSyncing()` is true, show "Syncing with Planning Center, catching up" with the existing icon+label styling (status color paired with label per the design system); otherwise the existing live/baked freshness label.

- [ ] **Step 3: Fix the debug probe**

In `pco-sync/index.ts`, the debug probe uses `pcoAll` (which paginates the whole roster and times out). Change its three `check(...)` calls to use a single page via `pcoGet` (import `pcoGet` from `../_shared/pco-paginate.ts`) and read `.data` directly, e.g. `const j = await pcoGet(t, path); probe[label] = { count: (j.data ?? []).length, sample: (j.data ?? []).slice(0,8).map(name) }`. This makes the probe safe.

- [ ] **Step 4: Type-check**

Run `npm run typecheck` (no new errors in the two Vue/TS files) and the esm.sh `deno check` workaround on `pco-sync/index.ts` (no new errors).

- [ ] **Step 5: Commit + hand off**

```bash
git add src/lib/clients/church/careDataLoader.ts src/components/cornerstone/DataFreshnessBadge.vue supabase/functions/pco-sync/index.ts
git commit -m "Show catching-up sync status; fix debug probe to single-page"
```
Ask Josh to run `supabase functions deploy pco-sync`.

---

## Task 11: Live gate + verification + finish

**Files:** none.

- [ ] **Step 1: Confirm migrations + deploys applied** (Josh: `db push` for 0088/0089/0090, `functions deploy pco-fetch` and `pco-sync`).

- [ ] **Step 2: Kick off backfill.** Insert/confirm `pco_sync_state` rows exist for focal-point-church (the function creates them on first run). Let the rapid cron run, or trigger manually via the SQL-editor `net.http_post` to `pco-fetch` with the `X-Cron-Secret` header. Watch progress:
```sql
select resource, phase, backfill_complete, last_synced_date, updated_at, left(coalesce(error,''),200) error
from pco_sync_state where client_id = (select id from clients where slug='focal-point-church');
```
Repeat until both resources show `backfill_complete = true` / `phase = 'incremental'` (roughly 15-30 minutes of ticks).

- [ ] **Step 3: Correctness gate.** Read the computed counts:
```sql
select module_key, status, jsonb_array_length(payload->'people') as people, computed_at
from church_dashboard_data where client_id=(select id from clients where slug='focal-point-church') order by module_key;
```
Expected: serving near 41, burnout near 117, groupDrift in the general range of ~169 (group drift is bounded to recent events, so it may differ more). Near, not exact, since the live window has moved. Investigate only large deltas or `status='error'`.

- [ ] **Step 4: Staging sanity.** Confirm `select count(*) from pco_serving_assignments where client_id=...` is in the thousands and `pco_group_attendance` is populated, proving the chunked backfill accumulated the full dataset without a single long request.

- [ ] **Step 5: Finish.** Use superpowers:finishing-a-development-branch. "Tests" here = the `deno test` suites pass (shapers, cursor, Layer 1 transforms), `npm run typecheck` clean, and the Step 3 live counts within tolerance. Open the PR (Josh merges). Include the live counts and backfill duration in the PR body.

---

## Self-review notes

- **Spec coverage:** staging + state (T1), config (T2), shapers (T3), cursor/deadline (T4), chunked schedule fetch (T5), chunked groups fetch (T6), compute-over-cache (T7), orchestrator with backfill/incremental phases + inline compute (T8), rapid + nightly crons retiring the old job (T9), status UX + probe fix (T10), live gate (T11). All spec sections map to a task.
- **Known follow-ups (deferred, per spec):** rolling the group-drift season to the current program year; strict delta cursors for incremental; staging pruning; active-season group incremental fetch.
- **Type consistency:** `ScheduleCursor.planIds` becomes `{id,date}[]` (Task 5 Step 2) and `fetchScheduleChunk` gains an optional `cutoffOverride` (Task 8) for the incremental path; both are called out in the tasks that own them.
- **Tolerance:** live counts will not equal baked exactly (window moved; group drift bounded to recent events). Task 11 treats near-match as success.
