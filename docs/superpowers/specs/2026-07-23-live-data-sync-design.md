# Live Data Sync (Care & Drift, Layer 1) Design

**Date:** 2026-07-23
**Status:** Approved for planning
**Client:** Focal Point Church (`focal-point-church`), Grace customer #1

## Goal

Replace the current "run a local `.mjs` script, commit a baked `.ts` snapshot" pipeline with a server-side sync that pulls live from each church's Planning Center (PCO) OAuth connection, computes the dashboard datasets, and stores them per church for the dashboard to read at runtime. First proof slice: the Care & Drift signals (`serving`, `burnout`, `groupDrift`).

## Background and constraints

- Today, data is produced by local Node scripts in `scripts/` (for example `pull-serving-schedule.mjs`, `gen-serving.mjs`, `gen-burnout.mjs`, `pull-group-drift-v2.mjs`) that hit PCO with a personal token and write committed `.ts` files under `src/lib/clients/focal-point/`. Components import those files synchronously.
- PCO OAuth per church is already live and verified (see `focal_point_settings_pco_shipped`). Tokens live encrypted in `pco_connections`. The edge-function helpers `pcoFetch(tenant, path, init)` and `getPcoAccessToken(tenant)` in `supabase/functions/_shared/pco-auth.ts` handle auth and token refresh.
- Per CLAUDE.md, recurring product mechanics run as scheduled jobs, never as autonomous agent loops. "The cron is the contract with the buyer." This design follows that: a scheduled sync, plus a manual refresh trigger.

### Two realities that shaped the scope

1. **Care & Drift is not uniform.** It splits into mechanically computable signals (`serving`, `burnout`, `groupDrift`, `drift`, `activity`) and hand-authored material (`priority.ts` drafted pastoral messages, `carePipeline.ts` case choreography). Only the signals are a data-pull problem.
2. **`pcoFetch` provides neither pagination nor 429 backoff**, and some pulls are heavy (kids drift is roughly 380 days of check-ins, activity up to 700 pages). This is why the sync must be scheduled, not per-request, and why the sync layer adds its own pagination and backoff.

## Chosen architecture

Approach A (scheduled sync to a computed table) plus C's manual "refresh now" trigger in v1. On-demand per-request fetching (Approach B) was rejected: it fights PCO rate limits, makes every viewer pay the transform cost, and violates the house rule that recurring mechanics are scheduled jobs.

### Layered roadmap

The architecture is identical across layers. Only the datasets differ.

| Layer | Scope | Status |
| --- | --- | --- |
| 1 | `serving` + `burnout` + `groupDrift` signals live via the sync | This spec |
| 2 | `drift` (kids attendance) + `activity` drawer | Next |
| 3 | Priority feed regenerated live from L1 to L2; draft messages templated (deterministic mail-merge) | Next |
| Deferred | LLM-authored drafts (Tier-3 soft part); care-pipeline case-state (a real case-management feature); generalizing per-church config beyond Focal Point | Explicit later |

## Components

### 1. Data model

New table `church_dashboard_data`, one computed document per church per module:

```sql
create table church_dashboard_data (
  client_id         uuid references clients(id) on delete cascade,
  module_key        text not null,          -- 'serving' | 'burnout' | 'groupDrift'
  payload           jsonb not null,         -- computed dataset, same shape the component reads today
  computed_at       timestamptz not null default now(),
  source_freshness  date,                   -- newest PCO date the compute used (replaces DATA_AS_OF)
  status            text not null default 'ok',  -- 'ok' | 'error'
  error             text,
  synced_attempt_at timestamptz,
  primary key (client_id, module_key)
);
```

RLS:
- A `client` user may `SELECT` rows where `client_id` matches their own `client_id`.
- An `admin` user may `SELECT` all rows.
- Only the service role writes (the sync function uses the service role).

On a failed module sync, update `status`, `error`, and `synced_attempt_at` only. Never clobber the last-good `payload`. Stale-but-real beats blank.

New per-church config: a `pco_config jsonb` column on `clients` (1:1 with the church, avoids a join on every sync). Holds the church-specific magic values the transforms need: staff-exclusion name list, PCO event ids (for example kids service `209602`), season windows, and thresholds. Seeded with Focal Point's known values. This is what makes church #2 a config exercise rather than a code fork.

### 2. Sync edge function (`pco-sync`)

- **Request body:** `{ tenant?: string, modules?: string[] }`.
  - No `tenant`: process every connected church (cron path).
  - `tenant` given: process one church (refresh-now path). `modules` optionally narrows to specific module keys.
- **Shared helper `pcoPaginate(tenant, path, opts?)`:** wraps `pcoFetch`, follows `links.next` (absolute URLs), adds 429 backoff honoring `retry-after`, and a courtesy sleep between calls. This is the piece missing from `pcoFetch` that every legacy script re-implemented inline.
- **Sync units, not raw modules.** `serving` and `burnout` derive from the same Services-schedule pull, so they form one sync unit (pull once, compute both, upsert both rows). `groupDrift` is its own unit. So Layer 1 is two units, not three separate pulls. Each unit is wrapped in its own try/catch so one failure does not sink the others.
- **Per (church, unit):** run the unit's pure transform (see section 6), then upsert each module row it produces.
- **Time-limit guard:** cron hits a thin dispatcher that invokes the worker once per (church, unit). Each invocation stays small and independent, so no single giant pull risks the edge-function wall-clock. For one church times two units this is trivial; it is also the scaling path for church #2 and beyond.
- **Authz:** cron path authenticates with the service role. Refresh-now path reuses the `church-user-admin` authorization pattern (platform admin, or full-scope `client` user of the target tenant).

### 3. Cron

Supabase `pg_cron` calling `net.http_post` (pg_net) to the dispatcher, nightly around 4am. Token decryption already lives in the edge-function layer, so keeping the schedule in Supabase keeps auth in one place. Nightly only: church data moves on a weekly Sunday rhythm, and refresh-now covers anything ad-hoc.

### 4. Refresh-now trigger

A button on both the Care & Drift tab (primary) and the Settings page. It calls `pco-sync` with the church's tenant, shows a "Refreshing..." state, and re-reads on completion. A short server-side cooldown (roughly one refresh per few minutes per church) prevents hammering PCO.

### 5. Dashboard read path and fallback

A small async loader per module. On mount, fetch `church_dashboard_data` for (client, moduleKey). If a row exists, use `payload`. Otherwise fall back to the current baked `.ts` import. This is the migration safety: the day it ships, Focal Point goes live and every demo or unconnected church keeps working untouched.

Freshness: `dataFreshness.ts` reads `computed_at` / `source_freshness` for live churches and the baked constant otherwise, surfaced as "Updated 2h ago." A quiet "data may be stale" note appears if `computed_at` is old or the last sync errored.

### 6. Layer 1 transforms and config

Port the existing logic into shared Deno TS as pure functions (input: raw PCO responses; output: the dataset shape the component reads). The legacy scripts hold the logic procedurally at module top level and are not reusable as-is, so the threshold logic is extracted into pure functions and auth/pagination/backoff is rewritten on top of `pcoPaginate`.

- **`serving` (stopped-serving / People Drift):** from Services scheduling. A regular server is 4+ confirmed past dates; flag as stopped if the gap since last served is 6+ weeks and there is nothing upcoming. Endpoints: `/services/v2/service_types`, `.../plans?filter=past|future`, `/services/v2/plans/{id}/team_members?include=team`. Source scripts: `pull-serving-schedule.mjs`, `gen-serving.mjs`.
- **`burnout`:** derived from the same serving-schedule pull as `serving` (same sync unit, no second PCO fetch). Flag if 3+ confirmed shifts per month or serving 2+ distinct teams; tier `high` at 4+/month or 3+ teams. Staff excluded via the config list. Source script: `gen-burnout.mjs`.
- **`groupDrift`:** in-season growth-group drift. Endpoints under `/groups/v2/` (group_types, groups, events, attendances, memberships). A member drifted if they attended 5+ in-season meetings but none of the group's last 3, with a 3+ week gap. Season window from config. Source script: `pull-group-drift-v2.mjs`.

Church-specific values (staff list, event ids, season windows, thresholds) come from `clients.pco_config`, not hardcoded in the function.

### 7. Error handling, freshness, observability

- Failed module sync sets `status='error'` plus a message, preserves the last-good payload, and surfaces in `/admin/health` (per the Ruflo takeaway) and as a quiet stale note on the tab.
- Every sync run logs, per module: rows pulled, PCO calls made, 429s hit, and duration.

### 8. Testing

- Transforms are pure functions, unit-tested against the `scratchpad/pco-raw/*.json` snapshots already in the repo as fixtures.
- `pcoPaginate` backoff tested against a mock (429 with `retry-after`, then success).
- **Correctness gate:** run the live sync against Focal Point and diff the output against the current baked `.ts`. They should match within data-age drift. That diff is the proof the port is faithful before the read path is flipped.

## Out of scope (deferred, by agreement)

- LLM-authored draft pastoral messages (the Tier-3 soft part).
- Care-pipeline case-state (stages, owners, handoffs), which is a real case-management feature, not a data-pull.
- Generalizing `pco_config` and the transforms beyond Focal Point to arbitrary churches.
- `drift` (kids) and `activity` (Layer 2), and the priority feed (Layer 3).

## Open questions

None blocking. Per-church config generalization and case-state are deferred deliberately.
