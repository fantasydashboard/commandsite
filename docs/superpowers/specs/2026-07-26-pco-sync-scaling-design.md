# PCO Sync Scaling (staging + chunked + incremental) Design

**Date:** 2026-07-26
**Status:** Approved for planning
**Client:** Focal Point Church (`focal-point-church`), Grace customer #1
**Supersedes the sync-execution model in:** `2026-07-23-live-data-sync-layer1.md` (the data model, transforms, read-path, and refresh-now button from that spec all stay; only how the sync executes changes)

## Goal

Make the Care & Drift live sync actually complete for a full-size church. The Layer 1 sync pulled all of a church's Planning Center data in a single edge-function call; at Focal Point's real scale that pull takes minutes and the platform kills it (observed: HTTP 504 even on a reduced 4-month window). This design splits the sync into a slow resumable fetch and a fast compute, so no single invocation ever runs long.

## Background and constraints

- **PCO rate limits every request.** A full church pull is hundreds (serving schedule) to well over a thousand (group events and attendance) API calls. With rate limiting and 429 backoff, that is minutes of wall-clock, not seconds.
- **Supabase edge functions have a hard wall-clock ceiling** (~150s; a 504 is the platform terminating the function). Confirmed live: a 4-month serving+burnout pull returned 504.
- **The transforms are already correct.** `computeServing`, `computeBurnout`, and `computeGroupDrift` are unit-tested against real Focal Point PCO data (the `scratchpad/pco-raw` fixtures) and produce correct output. This design does not change them; it changes what feeds them.
- **The OAuth connection works** once authorized by an account with real org access. Authorizing account permissions determine data visibility (a member-level account sees almost nothing); the production flow has a church admin authorize once.
- Per CLAUDE.md, recurring mechanics run as scheduled jobs. This design stays within that: pg_cron drives the work.

## Architecture

Split the one synchronous sync into two concerns:

1. **Fetch (slow, resumable, chunked):** pull PCO data into local staging tables a little at a time, each invocation bounded to a safe time budget, resuming from a saved cursor. The first backfill catches up over several minutes of background cron ticks; after that, nightly runs pull only the recent slice.
2. **Compute (fast, over the cache):** run the existing transforms over the staging rows and write `church_dashboard_data`. Sub-second, no API calls, no timeout risk.

Everything downstream of `church_dashboard_data` (the read-path loader, freshness label, refresh-now button, per-church fallback) is unchanged.

### Decisions locked with the user

- **Backfill cadence:** a rapid pg_cron every ~2 minutes drives one chunk per tick. Focal Point's first full backfill completes in roughly 15-30 minutes of background ticks (one-time). Cron-driven (not function self-triggering) so a lost tick self-heals on the next tick.
- **Group-drift depth:** fetch only the most recent N events per group (config `eventsPerGroup`, default 12) within the configured season, not every season event. This keeps group-drift tractable while still capturing the recent attend-then-stop pattern the drift signal is about.

## Components

### 1. Data model

**Staging tables** (the church's local PCO mirror, upserted as chunks arrive):

```sql
create table public.pco_serving_assignments (
  client_id  uuid not null references public.clients(id) on delete cascade,
  person_id  text not null,
  name       text not null,
  date       date not null,
  team       text not null,
  status     text not null,          -- single letter C/U/D
  primary key (client_id, person_id, date, team)
);
create index pco_serving_assignments_client_date_idx
  on public.pco_serving_assignments (client_id, date);

create table public.pco_group_attendance (
  client_id   uuid not null references public.clients(id) on delete cascade,
  group_id    text not null,
  group_name  text not null,
  event_id    text not null,
  event_date  date not null,
  person_id   text not null,
  name        text not null,
  primary key (client_id, group_id, event_id, person_id)
);
create index pco_group_attendance_client_group_idx
  on public.pco_group_attendance (client_id, group_id);

-- Group membership + leader hints (small), needed for the leader-of-own-group rule.
create table public.pco_group_members (
  client_id  uuid not null references public.clients(id) on delete cascade,
  group_id   text not null,
  group_name text not null,
  person_id  text not null,
  name       text not null,
  primary key (client_id, group_id, person_id)
);
```

**Cursor / phase state:**

```sql
create table public.pco_sync_state (
  client_id        uuid not null references public.clients(id) on delete cascade,
  resource         text not null,          -- 'schedule' | 'groups'
  phase            text not null default 'backfill',  -- 'backfill' | 'incremental' | 'idle'
  cursor           jsonb not null default '{}'::jsonb, -- resource-specific progress
  last_synced_date date,                   -- newest data pulled (for incremental)
  backfill_complete boolean not null default false,
  updated_at       timestamptz not null default now(),
  error            text,
  primary key (client_id, resource)
);
```

RLS: all four tables are service-role write, admin read; church users do not read staging directly (they read `church_dashboard_data`). Staging select policy for admins only is sufficient.

Two fetch **resources**: `schedule` (feeds serving + burnout) and `groups` (feeds group drift).

### 2. Chunked fetch function (`pco-fetch`)

One edge function, driven by cron, that advances one church-resource by one chunk per invocation.

- **Time budget:** capture a start timestamp; stop starting new PCO page-walks once ~90 seconds have elapsed, persist the cursor, and return. Never approaches the 150s ceiling.
- **Backfill phase:** walk the resource from the cursor. For `schedule`: iterate service types and their plans within the window (`serving.lookbackMonths`), upserting `pco_serving_assignments` for each plan's team members; the cursor records `{serviceTypeIndex, planOffset}` (or last plan date) so the next tick resumes. For `groups`: iterate growth-group-typed groups; per group pull the most recent `eventsPerGroup` events plus attendance and membership, upserting `pco_group_attendance` / `pco_group_members`; cursor records `{groupIndex}`. When the walk reaches the end, set `backfill_complete = true`, `phase = 'incremental'`, and run compute inline for that resource's modules (compute is fast, so it fits in the same invocation).
- **Incremental phase:** pull only the recent slice (config `incrementalWindowDays`, default ~21) plus all future plans for `schedule`, and new events since `last_synced_date` for `groups`. Upsert, then run compute inline. This is small and finishes in one tick.
- **Idle:** if `phase = 'incremental'` and it already ran since the last nightly tick, do nothing until the nightly cron re-triggers an incremental (see below).
- **Authorization:** same model as the current `pco-sync` cron path (service role or the shared `X-Cron-Secret`). `verify_jwt = false` in `config.toml`.
- **Rate limits:** reuse `pcoPaginate` (pagination + 429 backoff + courtesy sleep). The chunk budget plus cron spacing keeps total request rate within PCO's limits.

### 3. Cron

- **Backfill driver:** pg_cron every 2 minutes calls `pco-fetch` (all churches whose `pco_sync_state` is not idle). Hardcode the function URL (the `supabase_functions_base_url` Vault secret does not exist in this project; the working health crons hardcode it). Send the `X-Cron-Secret` header from the `health_cron_secret` Vault secret. When all resources for all churches reach `phase = 'incremental'` and have run, the ticks become cheap no-ops.
- **Nightly refresh:** pg_cron once nightly calls `pco-fetch` in incremental mode for every connected church (which runs compute inline). Replaces the Layer 1 `pco-sync-nightly` job.

Both use the same hardcoded-URL + `X-Cron-Secret` pattern proven working this session.

### 4. Compute over cache

Compute is a shared module that `pco-fetch` runs inline (not a separate function or cron): when a resource finishes backfill, and after each incremental fetch. It runs the transforms over staging and upserts `church_dashboard_data`:

- Serving + burnout: load `pco_serving_assignments` for the church filtered to `today - serving.lookbackMonths`, shape into the `byPerson` structure the transforms expect, run `computeServing` / `computeBurnout`, upsert their rows.
- Group drift: load `pco_group_attendance` + `pco_group_members` filtered to the season, shape into `GroupInput[]`, run `computeGroupDrift`, upsert its row.

Compute is fast (DB reads only) and always finishes in one invocation. It writes with the same `status`/`error`/`computed_at`/`source_freshness` contract as today, so the read-path is unchanged. During backfill (before `backfill_complete`), the module rows either stay absent (dashboard falls back to baked) or carry a `status = 'syncing'` marker.

### 5. Refactor of the current `pco-sync`

- The live fetch layers (`fetchServingSchedule`, `fetchGroupInputs`) move behind `pco-fetch`, rewritten to upsert staging rows chunk-by-chunk rather than returning everything in memory.
- The transforms and their inputs are unchanged.
- The debug probe added this session is fixed (use a single-page `pcoGet`, not `pcoAll`, so it cannot walk the whole roster) or removed.
- `church_dashboard_data`, `careDataLoader`, the freshness badge, and `RefreshNowButton` are unchanged. "Refresh now" triggers an incremental fetch + compute.

### 6. First-run and status UX

Christina connects once. Backfill begins on the next cron tick and catches up over ~15-30 minutes. The dashboard reads `pco_sync_state` to show a "syncing, catching up" state (percent from the cursor) until `backfill_complete`, then shows real numbers and stays current nightly. One click, then hands-off.

### 7. Config additions (`clients.pco_config`)

Add: `groupDrift.eventsPerGroup` (default 12), `fetch.timeBudgetSeconds` (default 90), `fetch.incrementalWindowDays` (default 21). Existing `serving`/`burnout`/`groupDrift` thresholds and `staffNames` stay.

## Error handling and observability

- Per-resource `error` on `pco_sync_state`; a chunk that fails logs and records the error but leaves the cursor so the next tick retries from the same point.
- Compute preserves last-good `church_dashboard_data` payload on failure (unchanged from Layer 1).
- `/admin/health` surfaces per-church sync phase, backfill progress, last error, and last successful compute time.
- Every fetch chunk logs: rows upserted, PCO calls made, 429s hit, elapsed, cursor advanced.

## Testing

- **Pure shaping** (staging rows to `byPerson` / `GroupInput[]`): unit-tested with `deno test` against fixture rows.
- **Chunk resumability:** unit-test the cursor advance/resume logic with a mock fetcher (a chunk that hits the time budget mid-resource saves a cursor; the next call resumes and completes).
- **Transforms:** already covered by the Layer 1 tests, unchanged.
- **Live gate:** run the real backfill against Focal Point, watch it catch up over cron ticks, then confirm the computed counts land near the baked snapshots (serving 41, burnout 117, groupDrift ~169). This is the correctness gate the Layer 1 attempt could not reach.

## Out of scope (deferred)

- Rolling the group-drift `season` config to the current program year (the 2025-26 season is over; a real current-season signal is a separate product/config decision).
- Strict per-record delta cursors for incremental (this design refreshes a recent window nightly, which is simpler and sufficient); tighten later if request volume warrants.
- Pruning aged-out staging rows (accumulation is fine at one-church scale; add a periodic prune later).
- LLM-authored drafts, care-pipeline case-state (still deferred from Layer 1).

## Open questions

None blocking. The season-config and pruning items are deliberately deferred.
