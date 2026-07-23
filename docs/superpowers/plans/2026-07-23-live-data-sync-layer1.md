# Live Data Sync (Care & Drift, Layer 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the `serving`, `burnout`, and `groupDrift` Care & Drift signals off baked `.ts` snapshots onto a live PCO sync: a Supabase edge function pulls from each church's Planning Center OAuth connection, computes the datasets, and stores them per church, and the dashboard reads live-or-baked.

**Architecture:** Scheduled sync (`pg_cron` nightly) plus a manual refresh-now trigger, both hitting one edge function (`pco-sync`). Pure transforms live in `supabase/functions/_shared/pco-transforms/` and are unit-tested with `deno test` against the real `scratchpad/pco-raw/*.json` fixtures. Results land in a new `church_dashboard_data` table. A reactive `careDataLoader` store fetches those rows and falls back to the baked consts, so unconnected/demo churches are untouched.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions on Deno), pg_cron + pg_net, Vue 3 `<script setup lang="ts">` + Pinia-style reactive store, Tailwind design tokens.

## Global Constraints

- **No em dashes** anywhere (code, comments, copy, commit messages). Use commas, periods, parentheses.
- **PCO team-member status codes are single letters:** `C` (confirmed), `U` (unconfirmed), `D` (declined). Compare `status === 'C'` and `status !== 'D'`. Never compare against the word "Confirmed".
- **Edge functions are Deno.** Import Supabase via `https://esm.sh/@supabase/supabase-js@2.45.0`. Shared helpers imported with relative `../_shared/...` paths and a `.ts` extension.
- **Per-client theming:** any new UI must use Tailwind tokens that resolve through the CSS vars (`bg-brand`, `text-brand`, `border-divider`, `text-ink`, `text-ink-muted`, `bg-surface-raised`). No hardcoded hex.
- **Secrets available in the edge runtime:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PCO_OAUTH_CLIENT_ID`, `PCO_OAUTH_CLIENT_SECRET`, `TOKEN_ENC_KEY`.
- **Do not commit** the `.claude/settings.json` `bgIsolation` line.
- **Migrations and function deploys are applied by Josh** (`supabase db push`, `supabase functions deploy`). Tasks that add a migration or function end by asking Josh to apply/deploy; do not assume a local Supabase stack.
- **Live church:** slug `focal-point-church`, tenant_key `focal-point-church`. The set of live churches is `PCO_CONNECT_CHURCHES` in `src/modules/CornerstoneSettingsModule.vue`.
- Verify TypeScript with `npm run typecheck`. Filter pre-existing `src/modules/` Supabase-generic noise (see CLAUDE.md) from errors you introduce.

## Payload contracts (the shapes the transforms must emit exactly)

```ts
// serving
{ flaggedPeople: number, totalVolunteers: number, signal: string,
  people: { name: string, area: string, campus: 'english'|'brazilian'|'both', monthsServing: number, totalServed: number, lastServed: string, weeksSince: number }[],
  drafts: [] }
// burnout
{ flaggedPeople: number, highRisk: number, activeVolunteers: number, signal: string,
  people: { name: string, areas: string[], campus: 'english'|'brazilian'|'both', perMonth: number, tier: 'high'|'medium' }[],
  drafts: [] }
// groupDrift
{ flagged: number, groups: number,
  people: { name: string, group: string, attended: number, weeksSince: number }[] }
```

Signal strings (copy verbatim so payloads match the baked consts):
- serving: `Regular volunteers, by the Services schedule, who have not been scheduled to serve in 6+ weeks and have nothing upcoming. A personal check-in with the individual, not the household.`
- burnout: `Volunteers scheduled 3+ times a month, often across several teams, and still going. The people most likely to burn out and drop next. Today's over-servers are next quarter's drift.`

---

## Task 1: `church_dashboard_data` table + RLS

**Files:**
- Create: `supabase/migrations/0085_church_dashboard_data.sql`

**Interfaces:**
- Produces: table `public.church_dashboard_data (client_id uuid, module_key text, payload jsonb, computed_at timestamptz, source_freshness date, status text, error text, synced_attempt_at timestamptz)`, PK `(client_id, module_key)`. Read by the frontend loader (Task 10); written by `pco-sync` (Task 8).

- [ ] **Step 1: Write the migration**

```sql
-- Per-church computed dashboard datasets, sourced live from PCO by the pco-sync
-- edge function. One row per (church, module). The dashboard reads these and
-- falls back to baked .ts when a row is absent.
create table if not exists public.church_dashboard_data (
  client_id         uuid not null references public.clients(id) on delete cascade,
  module_key        text not null,
  payload           jsonb not null,
  computed_at       timestamptz not null default now(),
  source_freshness  date,
  status            text not null default 'ok',
  error             text,
  synced_attempt_at timestamptz,
  primary key (client_id, module_key)
);

alter table public.church_dashboard_data enable row level security;

-- A church user reads only their own church's computed data.
create policy "clients read own dashboard data"
  on public.church_dashboard_data for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.client_id = church_dashboard_data.client_id
    )
  );

-- Admins read everything.
create policy "admins read all dashboard data"
  on public.church_dashboard_data for select
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- Writes are service-role only (pco-sync). No insert/update/delete policy for
-- anon/authenticated means only the service role (which bypasses RLS) can write.
```

- [ ] **Step 2: Self-check the SQL**

Confirm: PK prevents duplicate (church, module) rows so `pco-sync` can upsert on conflict; no write policy exists for non-service callers; the select policies match the `users` columns used elsewhere (`id`, `client_id`, `role`) as seen in `supabase/functions/church-user-admin/index.ts`.

- [ ] **Step 3: Commit and hand off**

```bash
git add supabase/migrations/0085_church_dashboard_data.sql
git commit -m "Migration: church_dashboard_data table for live PCO sync"
```

Ask Josh to run `supabase db push`.

---

## Task 2: `clients.pco_config` column + Focal Point seed

**Files:**
- Create: `supabase/migrations/0086_clients_pco_config.sql`
- Read (for the seed value): `scratchpad/pco-raw/staff.json`

**Interfaces:**
- Produces: `public.clients.pco_config jsonb not null default '{}'`. Consumed by `pco-sync` (Task 8) to parameterize transforms per church.

Config shape:
```json
{
  "staffNames": ["<names from staff.json>"],
  "serving":    { "regularMin": 4, "gapWeeks": 6, "lookbackMonths": 7 },
  "burnout":    { "seasonMonths": 6 },
  "groupDrift": { "seasonStart": "2025-09-01", "seasonEnd": "2026-05-31",
                  "minEvents": 4, "minAttendance": 5, "minGapWeeks": 3,
                  "groupTypeMatch": "growth group" }
}
```

- [ ] **Step 1: Add the column**

```sql
alter table public.clients add column if not exists pco_config jsonb not null default '{}'::jsonb;
```

- [ ] **Step 2: Seed Focal Point's config**

The staff names come from `scratchpad/pco-raw/staff.json`, inlined below. Note the SQL string wraps the JSON array in single quotes, so the apostrophe in "Diana O'Dell" is doubled to `O''Dell` (SQL escaping); it stays a single apostrophe in the parsed JSON.

```sql
update public.clients
set pco_config = jsonb_build_object(
  'staffNames', '["Staci Daniel","Emily Bankole","Andrew Daniel","David Bunch","Anthony Velasquez","Kristen Wiggins","Christina Spoon","Vinny Costa","Cindy Salopek","FPC Developer","Ronaldo Almeida","Planning Center","Josh Daniel","Diana O''Dell","Kelly Sorensen","Alyssa Daniel","Receptionist Team","Fernanda Faleiros","Magdalis Bisson","Michel Moran-Claudio","Joanna Taylor","Aline Costa","Check In","Rachael Sclater","Nino Villanueva","Rob Serrano"]'::jsonb,
  'serving',    jsonb_build_object('regularMin', 4, 'gapWeeks', 6, 'lookbackMonths', 7),
  'burnout',    jsonb_build_object('seasonMonths', 6),
  'groupDrift', jsonb_build_object(
     'seasonStart', '2025-09-01', 'seasonEnd', '2026-05-31',
     'minEvents', 4, 'minAttendance', 5, 'minGapWeeks', 3, 'groupTypeMatch', 'growth group')
)
where slug = 'focal-point-church';
```

- [ ] **Step 3: Commit and hand off**

```bash
git add supabase/migrations/0086_clients_pco_config.sql
git commit -m "Migration: clients.pco_config + Focal Point seed"
```

Ask Josh to run `supabase db push`.

---

## Task 3: `pcoPaginate` helper (pagination + 429 backoff)

**Files:**
- Create: `supabase/functions/_shared/pco-paginate.ts`
- Test: `supabase/functions/_shared/pco-paginate_test.ts`

**Interfaces:**
- Consumes: `pcoFetch(tenant, path, init)` from `../_shared/pco-auth.ts` (returns a raw `Response`).
- Produces:
  - `pcoGet(tenant: string, path: string): Promise<any>` (single JSON GET with 429 retry).
  - `pcoAll(tenant: string, path: string): Promise<any[]>` (accumulates `.data` across `links.next`).
  - `pcoAllPages(tenant: string, path: string): Promise<any[]>` (returns the full page objects, for callers needing `included`).

- [ ] **Step 1: Install Deno locally (one time)**

Run: `command -v deno || brew install deno`
Expected: `deno --version` prints a version.

- [ ] **Step 2: Write the failing test**

```ts
// pco-paginate_test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { makePager } from './pco-paginate.ts'

// A fake pcoFetch that returns two pages then stops, and 429s once.
function fakeFetch() {
  const pages: Record<string, any> = {
    '/x?per_page=2': { data: [1, 2], links: { next: 'https://api.planningcenteronline.com/x?offset=2' } },
    '/x?offset=2':   { data: [3], links: {} },
  }
  let failedOnce = false
  return async (_tenant: string, path: string): Promise<Response> => {
    if (!failedOnce) { failedOnce = true; return new Response('rate', { status: 429, headers: { 'retry-after': '0' } }) }
    const body = pages[path]
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

Deno.test('pcoAll follows links.next and retries 429', async () => {
  const { pcoAll } = makePager(fakeFetch())
  const rows = await pcoAll('t', '/x?per_page=2')
  assertEquals(rows, [1, 2, 3])
})
```

- [ ] **Step 3: Run it, verify it fails**

Run: `deno test supabase/functions/_shared/pco-paginate_test.ts`
Expected: FAIL (module or `makePager` not found).

- [ ] **Step 4: Implement**

```ts
// pco-paginate.ts
import { pcoFetch } from './pco-auth.ts'

type Fetcher = (tenant: string, path: string, init?: RequestInit) => Promise<Response>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// links.next is an absolute URL; pcoFetch prepends the host, so strip it.
const rel = (u: string) => u.replace(/^https?:\/\/api\.planningcenteronline\.com/, '')

// Factory so tests can inject a fake fetcher. Production uses pcoFetch.
export function makePager(fetcher: Fetcher) {
  async function getRaw(tenant: string, path: string): Promise<any> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await fetcher(tenant, path)
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after') ?? '3')
        await sleep((retry + 1) * 1000)
        continue
      }
      if (!res.ok) throw new Error(`PCO ${res.status} on ${path}: ${await res.text()}`)
      return await res.json()
    }
    throw new Error(`PCO gave up after retries on ${path}`)
  }
  async function allPages(tenant: string, path: string): Promise<any[]> {
    const out: any[] = []
    let next: string | null = path
    while (next) {
      const j = await getRaw(tenant, next)
      out.push(j)
      next = j?.links?.next ? rel(j.links.next) : null
      if (next) await sleep(100) // courtesy pause between calls
    }
    return out
  }
  async function all(tenant: string, path: string): Promise<any[]> {
    const pages = await allPages(tenant, path)
    return pages.flatMap((p) => p.data ?? [])
  }
  return { pcoGet: getRaw, pcoAll: all, pcoAllPages: allPages }
}

const prod = makePager(pcoFetch)
export const pcoGet = prod.pcoGet
export const pcoAll = prod.pcoAll
export const pcoAllPages = prod.pcoAllPages
```

- [ ] **Step 5: Run tests, verify pass**

Run: `deno test supabase/functions/_shared/pco-paginate_test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/pco-paginate.ts supabase/functions/_shared/pco-paginate_test.ts
git commit -m "Add pcoPaginate helper (links.next + 429 backoff) with test"
```

---

## Task 4: serving + burnout transforms (pure) + config types

**Files:**
- Create: `supabase/functions/_shared/pco-transforms/types.ts`
- Create: `supabase/functions/_shared/pco-transforms/serving.ts`
- Test: `supabase/functions/_shared/pco-transforms/serving_test.ts`

**Interfaces:**
- Consumes: a `byPerson` map `{ [pid]: { name: string, dates: {date: string, team: string, status: string}[] } }` (dates sorted descending), a `Set<string>` of staff names, and config from Task 2.
- Produces:
  - `computeServing(byPerson, staff, cfg, today): ServingPayload`
  - `computeBurnout(byPerson, staff, cfg, today): BurnoutPayload`
  - helpers `weeksBetween`, `monthsBetween`, `primaryTeam`, `campusOf`, `isBrazilianTeam`, `monthsAgo`.

- [ ] **Step 1: Write the types**

```ts
// types.ts
export type Campus = 'english' | 'brazilian' | 'both'
export interface ServingDated { date: string; team: string; status: string }
export interface PersonRec { name: string; dates: ServingDated[] }
export type ByPerson = Record<string, PersonRec>

export interface ServingCfg { regularMin: number; gapWeeks: number; lookbackMonths: number }
export interface BurnoutCfg { seasonMonths: number }
export interface GroupDriftCfg {
  seasonStart: string; seasonEnd: string; minEvents: number;
  minAttendance: number; minGapWeeks: number; groupTypeMatch: string
}
export interface PcoConfig {
  staffNames: string[]; serving: ServingCfg; burnout: BurnoutCfg; groupDrift: GroupDriftCfg
}

export interface ServingPerson { name: string; area: string; campus: Campus; monthsServing: number; totalServed: number; lastServed: string; weeksSince: number }
export interface ServingPayload { flaggedPeople: number; totalVolunteers: number; signal: string; people: ServingPerson[]; drafts: [] }
export interface BurnoutPerson { name: string; areas: string[]; campus: Campus; perMonth: number; tier: 'high' | 'medium' }
export interface BurnoutPayload { flaggedPeople: number; highRisk: number; activeVolunteers: number; signal: string; people: BurnoutPerson[]; drafts: [] }
export interface GroupDrifter { name: string; group: string; attended: number; weeksSince: number }
export interface GroupDriftPayload { flagged: number; groups: number; people: GroupDrifter[] }
```

- [ ] **Step 2: Write the failing test (against the real fixture)**

```ts
// serving_test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { computeServing, computeBurnout } from './serving.ts'
import type { ByPerson, PcoConfig } from './types.ts'

const sched = JSON.parse(await Deno.readTextFile('scratchpad/pco-raw/serving_schedule.json'))
const staffArr: string[] = JSON.parse(await Deno.readTextFile('scratchpad/pco-raw/staff.json'))
const byPerson: ByPerson = sched.byPerson
const staff = new Set(staffArr)
const cfg: PcoConfig = {
  staffNames: staffArr,
  serving: { regularMin: 4, gapWeeks: 6, lookbackMonths: 7 },
  burnout: { seasonMonths: 6 },
  groupDrift: { seasonStart: '2025-09-01', seasonEnd: '2026-05-31', minEvents: 4, minAttendance: 5, minGapWeeks: 3, groupTypeMatch: 'growth group' },
}
const TODAY = '2026-07-16' // pin to the fixture's era for a deterministic assertion

Deno.test('computeServing flags regular servers with a 6+ week gap and nothing upcoming', () => {
  const out = computeServing(byPerson, staff, cfg.serving, TODAY)
  assert(out.people.length > 0)
  assertEquals(out.drafts, [])
  // No flagged person is staff; all have >= regularMin served and >= gapWeeks since.
  for (const p of out.people) {
    assert(!staff.has(p.name))
    assert(p.totalServed >= 4)
    assert(p.weeksSince >= 6)
    assert(['english', 'brazilian', 'both'].includes(p.campus))
  }
  // Sorted by totalServed desc.
  for (let i = 1; i < out.people.length; i++) assert(out.people[i - 1].totalServed >= out.people[i].totalServed)
})

Deno.test('computeBurnout flags 3+/month or 2+ teams, tiers high at 4+/3+', () => {
  const out = computeBurnout(byPerson, staff, cfg.burnout, TODAY)
  assert(out.people.length > 0)
  for (const p of out.people) {
    assert(!staff.has(p.name))
    assert(p.perMonth >= 3 || p.areas.length >= 2)
    assertEquals(p.tier, p.perMonth >= 4 || p.areas.length >= 3 ? 'high' : 'medium')
  }
  assertEquals(out.highRisk, out.people.filter((p) => p.tier === 'high').length)
})
```

- [ ] **Step 3: Run it, verify it fails**

Run: `deno test --allow-read supabase/functions/_shared/pco-transforms/serving_test.ts`
Expected: FAIL (`computeServing` not found).

- [ ] **Step 4: Implement**

```ts
// serving.ts
import type { ByPerson, ServingCfg, BurnoutCfg, ServingPayload, BurnoutPayload, Campus } from './types.ts'

const DAY = 864e5
export const weeksBetween = (a: string, b: string) => Math.floor((Date.parse(a) - Date.parse(b)) / (7 * DAY))
export const monthsBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(a) - Date.parse(b)) / (30 * DAY)))
export const isBrazilianTeam = (t: string) => /4th service|brasil|brazil|apoio pastoral|diaconia|fundamental|pré-escola|pre-escola|culto/i.test(t)
export function campusOf(teams: string[]): Campus {
  const uniq = [...new Set(teams)]
  const bra = uniq.some(isBrazilianTeam)
  const eng = uniq.some((t) => !isBrazilianTeam(t))
  return bra && eng ? 'both' : bra ? 'brazilian' : 'english'
}
export function primaryTeam(dates: { team: string }[]): string {
  const count: Record<string, number> = {}
  for (const d of dates) count[d.team] = (count[d.team] || 0) + 1
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Serving'
}
// today minus N months as a YYYY-MM-DD string (UTC).
export function monthsAgo(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString().slice(0, 10)
}

const SERVING_SIGNAL = 'Regular volunteers, by the Services schedule, who have not been scheduled to serve in 6+ weeks and have nothing upcoming. A personal check-in with the individual, not the household.'
const BURNOUT_SIGNAL = "Volunteers scheduled 3+ times a month, often across several teams, and still going. The people most likely to burn out and drop next. Today's over-servers are next quarter's drift."

export function computeServing(byPerson: ByPerson, staff: Set<string>, cfg: ServingCfg, today: string): ServingPayload {
  let totalVolunteers = 0
  const people = []
  for (const rec of Object.values(byPerson)) {
    if (staff.has(rec.name)) continue
    const dates = [...rec.dates].sort((a, b) => (a.date < b.date ? 1 : -1)) // desc
    const past = dates.filter((d) => d.date <= today && d.status === 'C')
    const upcoming = dates.filter((d) => d.date > today && d.status !== 'D')
    if (past.length >= 1) totalVolunteers++
    if (past.length < cfg.regularMin) continue
    const lastServed = past[0].date
    const weeksSince = weeksBetween(today, lastServed)
    if (weeksSince < cfg.gapWeeks || upcoming.length > 0) continue
    const firstServed = past[past.length - 1].date
    people.push({
      name: rec.name, area: primaryTeam(past), campus: campusOf(past.map((d) => d.team)),
      monthsServing: monthsBetween(lastServed, firstServed), totalServed: past.length, lastServed, weeksSince,
    })
  }
  people.sort((a, b) => b.totalServed - a.totalServed || b.weeksSince - a.weeksSince)
  return { flaggedPeople: people.length, totalVolunteers, signal: SERVING_SIGNAL, people, drafts: [] }
}

export function computeBurnout(byPerson: ByPerson, staff: Set<string>, cfg: BurnoutCfg, today: string): BurnoutPayload {
  const seasonStart = monthsAgo(today, cfg.seasonMonths)
  let activeVolunteers = 0
  const people = []
  for (const rec of Object.values(byPerson)) {
    if (staff.has(rec.name)) continue
    const shifts = rec.dates.filter((d) => d.status === 'C' && d.date >= seasonStart && d.date <= today)
    if (!shifts.length) continue
    activeVolunteers++
    const months = new Set(shifts.map((d) => d.date.slice(0, 7))).size
    const perMonth = Math.round(shifts.length / Math.max(1, months))
    const teams = [...new Set(shifts.map((d) => d.team))]
    if (!(perMonth >= 3 || teams.length >= 2)) continue
    const tier: 'high' | 'medium' = perMonth >= 4 || teams.length >= 3 ? 'high' : 'medium'
    people.push({ name: rec.name, areas: teams, campus: campusOf(teams), perMonth, tier })
  }
  people.sort((a, b) => b.perMonth - a.perMonth || b.areas.length - a.areas.length)
  return { flaggedPeople: people.length, highRisk: people.filter((p) => p.tier === 'high').length, activeVolunteers, signal: BURNOUT_SIGNAL, people, drafts: [] }
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `deno test --allow-read supabase/functions/_shared/pco-transforms/serving_test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/pco-transforms/types.ts supabase/functions/_shared/pco-transforms/serving.ts supabase/functions/_shared/pco-transforms/serving_test.ts
git commit -m "Add pure serving + burnout transforms with fixture tests"
```

---

## Task 5: groupDrift transform (pure) + decision-logic test

**Files:**
- Create: `supabase/functions/_shared/pco-transforms/groupDrift.ts`
- Test: `supabase/functions/_shared/pco-transforms/groupDrift_test.ts`

**Interfaces:**
- Consumes: `GroupInput[]` where each group is `{ name: string, events: {id: string, date: string}[], attendanceByPid: Record<string, string[]>, members: {pid: string, name: string}[] }` (events already filtered to the season and sorted descending by date).
- Produces: `computeGroupDrift(groups, cfg): GroupDriftPayload`.

- [ ] **Step 1: Write the failing test with a hand-built fixture covering each branch**

```ts
// groupDrift_test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { computeGroupDrift } from './groupDrift.ts'
import type { GroupInput } from './groupDrift.ts'

const cfg = { seasonStart: '2025-09-01', seasonEnd: '2026-05-31', minEvents: 4, minAttendance: 5, minGapWeeks: 3, groupTypeMatch: 'growth group' }
// Group with 5 events (desc). last3 = e5,e4,e3.
const evs = [
  { id: 'e5', date: '2026-05-24' }, { id: 'e4', date: '2026-05-17' }, { id: 'e3', date: '2026-05-10' },
  { id: 'e2', date: '2026-05-03' }, { id: 'e1', date: '2026-04-26' },
]
const group: GroupInput = {
  name: "Oscar Mens' Group",
  events: evs,
  attendanceByPid: {
    drifter:   ['2026-04-26', '2026-05-03', '2026-04-19', '2026-04-12', '2026-04-05'], // 5 attends, none in last3, gap >= 3wk
    returned:  ['2026-04-26', '2026-05-03', '2026-05-10', '2026-05-17', '2026-05-24'], // attended last3 -> excluded
    thin:      ['2026-04-26', '2026-05-03'],                                            // < minAttendance -> excluded
    recent:    ['2026-04-26', '2026-05-03', '2026-05-10-x', '2026-05-17', '2026-05-24-x'], // handled below
  },
  members: [
    { pid: 'drifter', name: 'Liam Secord' },
    { pid: 'returned', name: 'Nate Rowe' },
    { pid: 'thin', name: 'Sam Diaz' },
    { pid: 'oscar', name: 'Oscar Blake' }, // leader-of-own-group: token "oscar" in group name -> excluded
  ],
}

Deno.test('flags a drifter, excludes returned/thin/leader', () => {
  const out = computeGroupDrift([group], cfg)
  assertEquals(out.people.map((p) => p.name), ['Liam Secord'])
  assertEquals(out.people[0].attended, 5)
  assertEquals(out.groups, 1)
  assertEquals(out.flagged, 1)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `deno test --allow-read supabase/functions/_shared/pco-transforms/groupDrift_test.ts`
Expected: FAIL (`computeGroupDrift` not found).

- [ ] **Step 3: Implement**

```ts
// groupDrift.ts
import type { GroupDriftCfg, GroupDriftPayload, GroupDrifter } from './types.ts'

export interface GroupInput {
  name: string
  events: { id: string; date: string }[]       // season-filtered, sorted desc by date
  attendanceByPid: Record<string, string[]>     // pid -> list of attended event dates (YYYY-MM-DD)
  members: { pid: string; name: string }[]
}

const DAY = 864e5
const normGroup = (n: string) => n.replace(/\s*-\s*/g, ' · ').replace(/’s|'s/g, '').slice(0, 38)

export function computeGroupDrift(groups: GroupInput[], cfg: GroupDriftCfg): GroupDriftPayload {
  let groupsWithData = 0
  const drifters: GroupDrifter[] = []
  for (const g of groups) {
    if (g.events.length < cfg.minEvents) continue
    groupsWithData++
    const lastInSeason = g.events[0].date
    const last3 = g.events.slice(0, 3).map((e) => e.date)
    for (const m of g.members) {
      const dates = g.attendanceByPid[m.pid] ?? []
      if (dates.length < cfg.minAttendance) continue
      if (last3.some((d) => dates.includes(d))) continue // attended one of the last 3 -> not drifting
      const lastAtt = [...dates].sort((a, b) => (a < b ? 1 : -1))[0]
      const weeks = Math.round((Date.parse(lastInSeason) - Date.parse(lastAtt)) / (7 * DAY))
      if (weeks < cfg.minGapWeeks) continue
      const toks = m.name.toLowerCase().split(/\s+/)
      if (toks.some((t) => t.length > 2 && g.name.toLowerCase().includes(t))) continue // leader-of-own-group
      drifters.push({ name: m.name, group: normGroup(g.name), attended: dates.length, weeksSince: weeks })
    }
  }
  drifters.sort((a, b) => b.attended - a.attended)
  return { flagged: drifters.length, groups: groupsWithData, people: drifters }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `deno test --allow-read supabase/functions/_shared/pco-transforms/groupDrift_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/pco-transforms/groupDrift.ts supabase/functions/_shared/pco-transforms/groupDrift_test.ts
git commit -m "Add pure groupDrift transform with branch-coverage test"
```

---

## Task 6: PCO fetch layers (schedule + groups)

**Files:**
- Create: `supabase/functions/_shared/pco-transforms/fetchSchedule.ts`
- Create: `supabase/functions/_shared/pco-transforms/fetchGroups.ts`

**Interfaces:**
- Consumes: `pcoAll`, `pcoAllPages`, `pcoGet` from `../pco-paginate.ts`; config from Task 2.
- Produces:
  - `fetchServingSchedule(tenant, cfg, today): Promise<ByPerson>`
  - `fetchGroupInputs(tenant, cfg): Promise<GroupInput[]>`

These do live PCO I/O, so they are verified end to end in Task 9 (against Focal Point), not unit-tested with a mock. Keep them thin: pull and shape only, no thresholds (thresholds live in the pure transforms).

- [ ] **Step 1: Implement `fetchServingSchedule`**

```ts
// fetchSchedule.ts
import { pcoAll, pcoAllPages } from '../pco-paginate.ts'
import { monthsAgo } from './serving.ts'
import type { ByPerson, ServingCfg } from './types.ts'

// Pulls Services team-member assignments into a byPerson map, past bounded by
// lookbackMonths, plus all future plans. Dates sorted descending.
export async function fetchServingSchedule(tenant: string, cfg: ServingCfg, today: string): Promise<ByPerson> {
  const cutoff = monthsAgo(today, cfg.lookbackMonths)
  const serviceTypes = await pcoAll(tenant, '/services/v2/service_types?per_page=100')
  const plans: { id: string; date: string }[] = []
  for (const st of serviceTypes) {
    const stName = st.attributes?.name ?? 'Service'
    const past = await pcoAll(tenant, `/services/v2/service_types/${st.id}/plans?filter=past&per_page=50&order=-sort_date`)
    for (const p of past) {
      const date = (p.attributes?.sort_date ?? '').slice(0, 10)
      if (date && date < cutoff) break // pages are date-desc; stop at cutoff
      plans.push({ id: p.id, date })
    }
    const future = await pcoAll(tenant, `/services/v2/service_types/${st.id}/plans?filter=future&per_page=50&order=sort_date`)
    for (const p of future) plans.push({ id: p.id, date: (p.attributes?.sort_date ?? '').slice(0, 10) })
    void stName
  }
  const byPerson: ByPerson = {}
  for (const plan of plans) {
    const pages = await pcoAllPages(tenant, `/services/v2/plans/${plan.id}/team_members?per_page=200&include=team`)
    for (const page of pages) {
      const teamName: Record<string, string> = {}
      for (const inc of page.included ?? []) if (inc.type === 'Team') teamName[inc.id] = inc.attributes?.name ?? ''
      for (const m of page.data ?? []) {
        const pid = m.relationships?.person?.data?.id
        const name = (m.attributes?.name ?? '').trim()
        if (!pid || !name) continue
        const team = teamName[m.relationships?.team?.data?.id] || 'Serving'
        const status = (m.attributes?.status ?? '').charAt(0).toUpperCase() // normalize to first letter: C/U/D
        ;(byPerson[pid] ??= { name, dates: [] }).dates.push({ date: plan.date, team, status })
      }
    }
  }
  for (const rec of Object.values(byPerson)) rec.dates.sort((a, b) => (a.date < b.date ? 1 : -1))
  return byPerson
}
```

- [ ] **Step 2: Implement `fetchGroupInputs`**

```ts
// fetchGroups.ts
import { pcoAll, pcoGet } from '../pco-paginate.ts'
import type { GroupDriftCfg } from './types.ts'
import type { GroupInput } from './groupDrift.ts'

export async function fetchGroupInputs(tenant: string, cfg: GroupDriftCfg): Promise<GroupInput[]> {
  const start = Date.parse(cfg.seasonStart), end = Date.parse(cfg.seasonEnd)
  const types = (await pcoAll(tenant, '/groups/v2/group_types?per_page=25'))
    .filter((t) => new RegExp(cfg.groupTypeMatch, 'i').test(t.attributes?.name ?? ''))
  const out: GroupInput[] = []
  for (const t of types) {
    const groups = (await pcoAll(tenant, `/groups/v2/group_types/${t.id}/groups?per_page=100`))
      .filter((g) => !g.attributes?.archived_at)
    for (const g of groups) {
      const events = (await pcoAll(tenant, `/groups/v2/groups/${g.id}/events?per_page=100&order=-starts_at`))
        .map((e) => ({ id: e.id, date: (e.attributes?.starts_at ?? '').slice(0, 10), t: Date.parse(e.attributes?.starts_at ?? '') }))
        .filter((e) => e.t >= start && e.t <= end)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((e) => ({ id: e.id, date: e.date }))
      if (events.length < cfg.minEvents) continue
      const attendanceByPid: Record<string, string[]> = {}
      for (const e of events) {
        const att = await pcoAll(tenant, `/groups/v2/events/${e.id}/attendances?per_page=200`)
        for (const x of att) {
          if (!x.attributes?.attended) continue
          const pid = x.relationships?.person?.data?.id
          if (pid) (attendanceByPid[pid] ??= []).push(e.date)
        }
      }
      const mj = await pcoGet(tenant, `/groups/v2/groups/${g.id}/memberships?per_page=100&include=person`)
      const nm: Record<string, string> = {}
      for (const inc of mj.included ?? []) if (inc.type === 'Person') nm[inc.id] = `${inc.attributes?.first_name ?? ''} ${inc.attributes?.last_name ?? ''}`.trim()
      const members = (mj.data ?? []).map((m: any) => ({ pid: m.relationships?.person?.data?.id, name: nm[m.relationships?.person?.data?.id] || 'Member' })).filter((m: any) => m.pid)
      out.push({ name: g.attributes?.name ?? 'Group', events, attendanceByPid, members })
    }
  }
  return out
}
```

- [ ] **Step 3: Type-check the Deno modules**

Run: `deno check supabase/functions/_shared/pco-transforms/fetchSchedule.ts supabase/functions/_shared/pco-transforms/fetchGroups.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/pco-transforms/fetchSchedule.ts supabase/functions/_shared/pco-transforms/fetchGroups.ts
git commit -m "Add PCO fetch/shape layers for schedule and groups"
```

---

## Task 7: `pco-sync` edge function

**Files:**
- Create: `supabase/functions/pco-sync/index.ts`

**Interfaces:**
- Consumes: `fetchServingSchedule`, `computeServing`, `computeBurnout`, `fetchGroupInputs`, `computeGroupDrift`, config from `clients.pco_config`, `pcoFetch` (indirectly), service-role Supabase client. Mirrors the boilerplate in `supabase/functions/church-user-admin/index.ts`.
- Produces: upserted rows in `church_dashboard_data`. Response `{ ok: true, results: { module_key: 'ok'|'error' }[] }`.

- [ ] **Step 1: Implement the function**

```ts
// pco-sync/index.ts
// deno-lint-ignore no-explicit-any
declare const Deno: any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { fetchServingSchedule } from '../_shared/pco-transforms/fetchSchedule.ts'
import { fetchGroupInputs } from '../_shared/pco-transforms/fetchGroups.ts'
import { computeServing, computeBurnout } from '../_shared/pco-transforms/serving.ts'
import { computeGroupDrift } from '../_shared/pco-transforms/groupDrift.ts'
import type { PcoConfig } from '../_shared/pco-transforms/types.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const svc = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const todayUtc = () => new Date().toISOString().slice(0, 10)

// Compute one church. Each unit is isolated so one failure does not sink others.
async function syncChurch(db: any, slug: string, clientId: string, cfg: PcoConfig, modules?: string[]) {
  const staff = new Set(cfg.staffNames ?? [])
  const today = todayUtc()
  const want = (k: string) => !modules || modules.includes(k)
  const results: Record<string, string> = {}

  async function writeOk(moduleKey: string, payload: unknown, freshness: string) {
    await db.from('church_dashboard_data').upsert({
      client_id: clientId, module_key: moduleKey, payload, status: 'ok', error: null,
      computed_at: new Date().toISOString(), source_freshness: freshness, synced_attempt_at: new Date().toISOString(),
    }, { onConflict: 'client_id,module_key' })
    results[moduleKey] = 'ok'
  }
  async function writeErr(moduleKey: string, e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // Preserve last-good payload: update status/error only.
    await db.from('church_dashboard_data').update({ status: 'error', error: msg, synced_attempt_at: new Date().toISOString() })
      .eq('client_id', clientId).eq('module_key', moduleKey)
    results[moduleKey] = 'error'
  }

  // Unit 1: serving + burnout share one schedule pull.
  if (want('serving') || want('burnout')) {
    try {
      const byPerson = await fetchServingSchedule(slug, cfg.serving, today)
      if (want('serving')) await writeOk('serving', computeServing(byPerson, staff, cfg.serving, today), today)
      if (want('burnout')) await writeOk('burnout', computeBurnout(byPerson, staff, cfg.burnout, today), today)
    } catch (e) {
      if (want('serving')) await writeErr('serving', e)
      if (want('burnout')) await writeErr('burnout', e)
    }
  }
  // Unit 2: group drift.
  if (want('groupDrift')) {
    try {
      const groups = await fetchGroupInputs(slug, cfg.groupDrift)
      await writeOk('groupDrift', computeGroupDrift(groups, cfg.groupDrift), today)
    } catch (e) { await writeErr('groupDrift', e) }
  }
  return results
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing Authorization' }, 401)

  let body: { tenant?: string; modules?: string[] } = {}
  try { body = await req.json() } catch { /* empty body = cron all-churches */ }
  const db = svc()
  const isServiceRole = token === SERVICE_ROLE_KEY

  // Resolve target churches: a tenant given => that one (with authz); none => all connected (service role only).
  if (body.tenant) {
    const { data: client } = await db.from('clients').select('id, pco_config').eq('slug', body.tenant).maybeSingle()
    if (!client) return json({ error: `Unknown tenant "${body.tenant}"` }, 404)
    if (!isServiceRole) {
      const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
      const { data: userData } = await userClient.auth.getUser()
      if (!userData?.user) return json({ error: 'Invalid auth token' }, 401)
      const { data: me } = await db.from('users').select('role, client_id, permission_scope').eq('id', userData.user.id).maybeSingle()
      const ok = me?.role === 'admin' || (me?.role === 'client' && me?.client_id === client.id && me?.permission_scope === 'full')
      if (!ok) return json({ error: 'You do not have permission to refresh this church.' }, 403)
    }
    const results = await syncChurch(db, body.tenant, client.id, (client.pco_config ?? {}) as PcoConfig, body.modules)
    return json({ ok: true, results })
  }

  // Cron path: no tenant. Service role only. Sync every church that has a PCO connection.
  if (!isServiceRole) return json({ error: 'Full sync requires the service role' }, 403)
  const { data: conns } = await db.from('pco_connections').select('tenant_key')
  const all: Record<string, unknown> = {}
  for (const c of conns ?? []) {
    const { data: client } = await db.from('clients').select('id, pco_config').eq('slug', c.tenant_key).maybeSingle()
    if (!client) continue
    all[c.tenant_key] = await syncChurch(db, c.tenant_key, client.id, (client.pco_config ?? {}) as PcoConfig, body.modules)
  }
  return json({ ok: true, results: all })
})
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/pco-sync/index.ts`
Expected: no errors.

- [ ] **Step 3: Commit and hand off**

```bash
git add supabase/functions/pco-sync/index.ts
git commit -m "Add pco-sync edge function (scheduled + refresh-now, per-unit isolation)"
```

Ask Josh to run `supabase functions deploy pco-sync`.

---

## Task 8: Live correctness gate (run against Focal Point)

**Files:**
- None created. This is a manual verification task run after Task 7 is deployed and Tasks 1, 2 migrations are applied.

- [ ] **Step 1: Trigger a real sync**

Have Josh (or via an authed admin session) invoke the function for Focal Point:
`supabase functions invoke pco-sync --no-verify-jwt --body '{"tenant":"focal-point-church"}'`
(or from the browser once Task 12's button exists). Expected: `{ ok: true, results: { serving: 'ok', burnout: 'ok', groupDrift: 'ok' } }`.

- [ ] **Step 2: Compare stored payloads against the baked consts**

Read the three rows (`select module_key, jsonb_array_length(payload->'people') from church_dashboard_data where client_id = (select id from clients where slug='focal-point-church')`). Compare the counts and a few sample names against `serving.ts` / `burnout.ts` / `groupDrift.ts`.

Expected: **near-match, not exact.** The baked snapshot was pulled ~Jul 2026 with `TODAY='2026-07-16'`; the live sync uses the real current date, so windows shift. A drift of a handful of people is expected and correct. Investigate only large deltas (for example counts off by more than ~20%, or `campus`/`tier` values outside their enums), which indicate a port bug (likely a status-code or date-window mismatch).

- [ ] **Step 3: Record the outcome**

Note the live counts vs baked counts in the PR description. If they are close, the port is faithful and the read path (Task 10+) can be flipped with confidence.

---

## Task 9: `pg_cron` nightly schedule

**Files:**
- Create: `supabase/migrations/0087_pco_sync_cron.sql`

**Interfaces:**
- Consumes: the deployed `pco-sync` function; `pg_cron` + `pg_net` extensions; the service-role key.
- Produces: a nightly cron job that POSTs to `pco-sync` with no tenant (all-churches path).

- [ ] **Step 1: Write the migration**

Mirror the existing scheduled-function pattern in `supabase/migrations/0079_warm_followup_cron.sql` (same project already schedules an edge function via pg_net). Key shape:

```sql
-- Nightly live PCO sync for all connected churches (~4am UTC).
select cron.schedule(
  'pco-sync-nightly',
  '0 4 * * *',
  $$
  select net.http_post(
    url     := 'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/pco-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

Match `0079`'s exact mechanism for supplying the service-role key (it may use a Vault secret or a DB setting rather than `current_setting`). Use whatever `0079` uses; do not invent a new secret channel.

- [ ] **Step 2: Self-check against 0079**

Confirm the extension prerequisites (`pg_cron`, `pg_net`) are already enabled by an earlier migration (they are, since `0079` schedules an HTTP post). Confirm the job name is unique (`pco-sync-nightly`).

- [ ] **Step 3: Commit and hand off**

```bash
git add supabase/migrations/0087_pco_sync_cron.sql
git commit -m "Migration: nightly pg_cron schedule for pco-sync"
```

Ask Josh to run `supabase db push`.

---

## Task 10: `careDataLoader` reactive store (live-or-baked)

**Files:**
- Create: `src/lib/clients/church/careDataLoader.ts`

**Interfaces:**
- Consumes: `supabase` client; the three baked consts.
- Produces: `careData` (reactive), `servingData()`, `burnoutData()`, `groupDriftData()`, `careMeta(moduleKey)`, `loadCareData(slug)`, `refreshCareData(slug)`.

- [ ] **Step 1: Implement**

```ts
// careDataLoader.ts
// Fetches live per-church dashboard datasets (church_dashboard_data) and falls
// back to the baked snapshots when a row is absent. Reactive so components that
// read the getters re-render when live data lands.
import { reactive } from 'vue'
import { supabase } from '@/lib/supabase'
import { focalPointServing } from '@/lib/clients/focal-point/serving'
import { focalPointBurnout } from '@/lib/clients/focal-point/burnout'
import { focalPointGroupDrift } from '@/lib/clients/focal-point/groupDrift'

export interface CareMeta { computedAt: string | null; sourceFreshness: string | null; status: string; error: string | null }
const store = reactive({
  loaded: false,
  serving: null as typeof focalPointServing | null,
  burnout: null as typeof focalPointBurnout | null,
  groupDrift: null as typeof focalPointGroupDrift | null,
  meta: {} as Record<string, CareMeta>,
})

export const careData = store
export const servingData = () => store.serving ?? focalPointServing
export const burnoutData = () => store.burnout ?? focalPointBurnout
export const groupDriftData = () => store.groupDrift ?? focalPointGroupDrift
export const careMeta = (moduleKey: string): CareMeta | null => store.meta[moduleKey] ?? null

// church_dashboard_data is not in the generated Database types (added after
// codegen), so query it through an untyped handle, mirroring privacy.ts.
const sb = supabase as any

export async function loadCareData(slug: string): Promise<void> {
  const { data: client } = await sb.from('clients').select('id').eq('slug', slug).maybeSingle()
  if (!client) return
  const { data, error } = await sb.from('church_dashboard_data')
    .select('module_key, payload, computed_at, source_freshness, status, error')
    .eq('client_id', client.id)
    .in('module_key', ['serving', 'burnout', 'groupDrift'])
  if (error || !data) return
  for (const row of data as any[]) {
    store.meta[row.module_key] = { computedAt: row.computed_at, sourceFreshness: row.source_freshness, status: row.status, error: row.error }
    if (row.status !== 'ok') continue
    if (row.module_key === 'serving') store.serving = row.payload
    else if (row.module_key === 'burnout') store.burnout = row.payload
    else if (row.module_key === 'groupDrift') store.groupDrift = row.payload
  }
  store.loaded = true
}

// Triggers a live PCO sync, then reloads. Used by the refresh-now button.
export async function refreshCareData(slug: string): Promise<void> {
  const { error } = await supabase.functions.invoke('pco-sync', { body: { tenant: slug } })
  if (error) throw new Error(error.message ?? 'Refresh failed')
  await loadCareData(slug)
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: no new errors in `src/lib/clients/church/careDataLoader.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/clients/church/careDataLoader.ts
git commit -m "Add careDataLoader: live-or-baked reactive store for Care & Drift"
```

---

## Task 11: Swap the three signal components to read live-or-baked

**Files:**
- Modify: `src/components/cornerstone/PeopleDrift.vue`
- Modify: `src/components/cornerstone/BurnoutWatch.vue`
- Modify: `src/components/cornerstone/GroupDriftWatch.vue`
- Modify: `src/modules/CornerstoneCareDriftModule.vue` (counts + trigger the load)

**Interfaces:**
- Consumes: `servingData()`, `burnoutData()`, `groupDriftData()`, `loadCareData` from Task 10.
- The components keep their existing template bindings; only the data source changes.

- [ ] **Step 1: PeopleDrift.vue**

Replace the static import usage. Change:
```ts
import { focalPointServing } from '@/lib/clients/focal-point/serving'
```
to:
```ts
import { computed } from 'vue'
import { servingData } from '@/lib/clients/church/careDataLoader'
const focalPointServing = computed(() => servingData())
```
Then update template/script references from `focalPointServing.people` to `focalPointServing.people` still works if you instead keep the name but make it a computed. Simplest: rename local references to a computed `data` and read `data.value.people`, `data.value.signal`. Verify every `focalPointServing.X` reference is updated to the computed.

- [ ] **Step 2: BurnoutWatch.vue**

Same pattern with `burnoutData()`:
```ts
import { computed } from 'vue'
import { burnoutData } from '@/lib/clients/church/careDataLoader'
const fb = computed(() => burnoutData())
```
Update references from `fb.people` to `fb.value.people`.

- [ ] **Step 3: GroupDriftWatch.vue**

Same pattern with `groupDriftData()`:
```ts
import { computed } from 'vue'
import { groupDriftData } from '@/lib/clients/church/careDataLoader'
const g = computed(() => groupDriftData())
```
Update references from `g.people` / `g.groups` to `g.value.people` / `g.value.groups`.

- [ ] **Step 4: Trigger the load in CornerstoneCareDriftModule.vue**

The module receives `{ client }` props (per the module registry contract). In its `<script setup>`, add:
```ts
import { onMounted } from 'vue'
import { loadCareData, servingData, groupDriftData } from '@/lib/clients/church/careDataLoader'
const LIVE_CHURCHES = ['focal-point-church']
onMounted(() => { if (LIVE_CHURCHES.includes(props.client?.slug)) loadCareData(props.client.slug) })
```
Update its `servingCount` / `groupsCount` computeds to read `servingData().people.length` / `groupDriftData().people.length` instead of the direct baked import.

(Reuse the existing `PCO_CONNECT_CHURCHES` list if it is exported from a shared module; if it currently lives only in `CornerstoneSettingsModule.vue`, extract it to `src/lib/clients/church/liveChurches.ts` and import from both. Prefer one source of truth.)

- [ ] **Step 5: Burnout module load**

`BurnoutWatch` renders inside `CornerstoneSundaysCommsModule.vue`. Add the same `onMounted(() => loadCareData(...))` guard there, or rely on the Care & Drift module having already populated the singleton store when the user visits that tab first. To be safe, add the guarded `loadCareData` call in the Sundays/Comms module too (the loader is idempotent and cheap).

- [ ] **Step 6: Type-check**

Run: `npm run typecheck`
Expected: no new errors in the four edited files.

- [ ] **Step 7: Commit**

```bash
git add src/components/cornerstone/PeopleDrift.vue src/components/cornerstone/BurnoutWatch.vue src/components/cornerstone/GroupDriftWatch.vue src/modules/CornerstoneCareDriftModule.vue src/modules/CornerstoneSundaysCommsModule.vue
git commit -m "Care & Drift signals read live-or-baked via careDataLoader"
```

---

## Task 12: Refresh-now button + freshness label

**Files:**
- Create: `src/components/cornerstone/RefreshNowButton.vue`
- Modify: `src/modules/CornerstoneCareDriftModule.vue` (place the button on the tab)
- Modify: `src/modules/CornerstoneSettingsModule.vue` (place the button in Settings)
- Modify: `src/components/cornerstone/DataFreshnessBadge.vue` (read live meta when present)

**Interfaces:**
- Consumes: `refreshCareData(slug)`, `careMeta` from Task 10.
- Produces: a reusable button; the badge shows "Updated Nh ago" from `careMeta('serving').computedAt` for live churches.

- [ ] **Step 1: Build the button**

```vue
<!-- RefreshNowButton.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { refreshCareData } from '@/lib/clients/church/careDataLoader'
const props = defineProps<{ slug: string }>()
const busy = ref(false)
const note = ref<string | null>(null)
async function run() {
  if (busy.value) return
  busy.value = true; note.value = null
  try { await refreshCareData(props.slug); note.value = 'Updated just now' }
  catch (e) { note.value = e instanceof Error ? e.message : 'Refresh failed' }
  finally { busy.value = false }
}
</script>
<template>
  <div class="flex items-center gap-2">
    <button type="button" :disabled="busy" @click="run"
      class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand disabled:opacity-50">
      {{ busy ? 'Refreshing...' : 'Refresh now' }}
    </button>
    <span v-if="note" class="text-[11px] text-ink-muted">{{ note }}</span>
  </div>
</template>
```

- [ ] **Step 2: Place it on the Care & Drift tab and in Settings**

In both modules, render `<RefreshNowButton :slug="props.client.slug" />` inside the existing live-church branch (guard with the same `LIVE_CHURCHES` / `PCO_CONNECT_CHURCHES` check so it never shows for demo churches).

- [ ] **Step 3: Freshness badge reads live meta**

In `DataFreshnessBadge.vue`, if `careMeta('serving')?.computedAt` exists, show a relative "Updated Nh ago" from it (and a quiet "data may be stale" if `computedAt` is older than ~36h or `status === 'error'`); otherwise fall back to the existing `asOfLabel()` baked constant. Keep the icon+label pairing (status colors must pair with a label, per CLAUDE.md).

- [ ] **Step 4: Type-check**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/cornerstone/RefreshNowButton.vue src/components/cornerstone/DataFreshnessBadge.vue src/modules/CornerstoneCareDriftModule.vue src/modules/CornerstoneSettingsModule.vue
git commit -m "Add refresh-now button + live freshness label to Care & Drift"
```

---

## Task 13: End-to-end verification + finish

**Files:** none.

- [ ] **Step 1: Full type-check**

Run: `npm run typecheck`
Expected: no new errors versus the baseline `src/modules/` noise.

- [ ] **Step 2: Browser verification (dev server)**

Run `npm run dev`. As an admin (or Focal Point full-scope user), open `/dashboard/focal-point-church`, go to Care & Drift. Confirm: People Drift, Burnout, and Group Drift render live counts (matching Task 8's stored rows), the freshness badge shows a recent "Updated" time, and "Refresh now" runs and updates the note. Then open a demo church (Cornerstone) and confirm it still renders the baked data unchanged (fallback path intact).

- [ ] **Step 3: Confirm the deferred surfaces are untouched**

Confirm the priority feed and care-pipeline board (still baked/curated) render as before for the live church. The loader only swaps the three signal views.

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch. There is no automated test suite; "tests" here means: the `deno test` transform suites pass, `npm run typecheck` is clean, and Task 8's live diff was within tolerance. Open a PR (Josh merges). Include Task 8's live-vs-baked counts in the PR body.

---

## Self-review notes

- **Spec coverage:** data model (T1), pco_config (T2), pcoPaginate with backoff (T3), serving/burnout/groupDrift transforms (T4, T5), fetch layers (T6), pco-sync with per-unit isolation + error-preserve (T7), correctness gate (T8), nightly cron (T9), live-or-baked read path (T10, T11), refresh-now + freshness (T12), verification (T13). All spec sections map to a task.
- **Deferred, not built here:** LLM-authored drafts, care-pipeline case-state, `drift`/`activity` (Layer 2), priority feed regeneration (Layer 3), per-church generalization beyond Focal Point.
- **Known tolerance:** live counts will not exactly equal the baked snapshot because the date windows move with `now()`. Task 8 treats near-match as success; that is intended, not a bug.
