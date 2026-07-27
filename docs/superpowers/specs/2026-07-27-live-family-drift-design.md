# Live Family/Kids-Attendance Drift (Layer 2) Design

**Date:** 2026-07-27
**Status:** Approved for planning
**Client:** Focal Point Church (`focal-point-church`)
**Builds on:** the live-data + scalable-sync pipeline shipped 2026-07-27 (`2026-07-26-pco-sync-scaling-design.md`). This is the deferred Layer 2 signal, added onto that pipeline.

## Goal

Make the "Families drifting" signal (kids-attendance drift / Drift Watch) live from Planning Center, like the serving/burnout/group-drift signals already are. Today DriftWatch reads a baked snapshot reconciled against a frozen date, so it reports 0 families, which is wrong. Wire it to live Check-Ins data on the same chunked/incremental pipeline.

## What it must produce

DriftWatch already consumes this shape (`focalPointDrift`):

```ts
interface DriftFamily { family: string; kids: string[]; lastSeen: string; sundaysMissed: number; monthsAttending: number; totalSundays: number }
{ flaggedFamilies: number; flaggedKids: number; windowMonths: number; onboardingExcluded: number; signal: string; families: DriftFamily[]; drafts: [] }
```

Baked baseline (validation target): `flaggedFamilies 53`, `flaggedKids 70`, `windowMonths 10`, `onboardingExcluded 352`.

## Raw data

Each kids check-in is `{ created_at, person_id, first, last, kind }` (the child, and when they checked in). Roughly a year of records (thousands). `kind` is Regular / Guest / Volunteer.

## Key modeling decisions (locked with the user)

1. **Family grouping = surname.** The check-in carries the child's `last` name only, so families are grouped by surname (matches how the baked data was built). Imperfect (unrelated same-surname families merge; hyphenated names split); pulling each child's PCO household is the accurate refinement, deferred.
2. **Attendance is pooled across ALL kids services; the congregation toggle only filters display.** A family "attended" a Sunday if any of their kids checked into any kids service that week (English, Brazilian, 4th service). Drift means they missed every kids service for 3+ Sundays. This avoids false-flagging a family that is still coming, just to a different service. The English/Brazilian/All lens then filters which flagged families are shown, using the family-to-congregation mapping DriftWatch already applies (`congregationOf`).

## Architecture (same pipeline, one new "kids" resource)

### 1. Staging table

```sql
create table public.pco_kids_checkins (
  client_id    uuid not null references public.clients(id) on delete cascade,
  person_id    text not null,
  first        text not null,
  last         text not null,
  checkin_date date not null,
  kind         text not null,
  primary key (client_id, person_id, checkin_date)
);
create index pco_kids_checkins_client_date_idx on public.pco_kids_checkins (client_id, checkin_date);
```

RLS: admin read, service-role write (same as the other staging tables). Deduped on the PK (a child checking into two services the same day collapses to one row, which is correct: pooled attendance only cares that they were present that day).

### 2. Chunked fetcher

`fetchKidsCheckinsChunk` (a new resource `kids` in `pco_sync_state`, driven by the same rapid-backfill + nightly crons):
- Discover kids check-in events by a config name match (`drift.kidsEventMatch`, default matching kids services), so all kids services are covered without hardcoding ids. Cursor stores the discovered event ids + progress.
- For each event, page `/check-ins/v2/events/{eventId}/check_ins?include=person&per_page=100&order=-created_at`, bounded to the window via `pcoUntil` on `created_at < cutoff` (cutoff = today minus `drift.windowMonths`). Upsert each check-in (person_id, first, last, checkin_date = created_at date, kind) into `pco_kids_checkins`, deduped by conflict key before upsert (like the other fetchers). Advance the cursor per event, time-budgeted, resumable.
- This is the heaviest pull (a year of check-ins across services), so the chunking is load-bearing.

### 3. Shaper + reconstructed transform (pure, deno-tested)

- `checkinsToFamilies(rows)`: group check-in rows by surname (`last`). For each family, collect the distinct Sundays any of their kids checked in (map each `checkin_date` to its Sunday), and the set of kid names. Produces per-family attended-Sundays plus kids list.
- `computeFamilyDrift(families, cfg, today)`: the reconstructed regular-then-stopped logic.
  - For each family, over the window: `totalSundays` = distinct Sundays attended; `monthsAttending` = span from first to last attended Sunday; `lastSeen` = most recent attended Sunday; `sundaysMissed` = Sundays between `lastSeen` and the most recent Sunday on/before today.
  - **Exclude first-time/occasional families**: those with `totalSundays < minEstablishedSundays` (config) are counted into `onboardingExcluded`, not flagged. This reproduces the baked "352 excluded."
  - **Flag** a family that was established (passed the minimum) and has now gone quiet (`sundaysMissed >= sundaysMissedThreshold`, default 3).
  - Rank most-established first (tenure-weighted: more totalSundays / longer monthsAttending ranks higher).
  - Output `{ flaggedFamilies, flaggedKids (sum of kids across flagged families), windowMonths, onboardingExcluded, signal, families: DriftFamily[], drafts: [] }`.

### 4. Compute-over-cache

`computeDrift(db, clientId, cfg)` reads `pco_kids_checkins` (paginated past the 1000-row cap, like the others), shapes, runs `computeFamilyDrift`, and upserts `church_dashboard_data` under module key `drift`.

### 5. Orchestrator

Add `kids` to the resource list in `pco-fetch`: backfill chunk via `fetchKidsCheckinsChunk`, inline `computeDrift` on completion; incremental re-fetches the recent window then recomputes. Same phase/idle-skip/error-containment as the others.

### 6. Loader + component

- `careDataLoader`: add `drift` to the loaded module keys, a `store.drift` field (reset per church), and a `driftData()` getter returning `store.drift ?? focalPointDrift`.
- `DriftWatch.vue`: read from `driftData()` (live-or-baked) instead of the baked `focalPointDrift` + `driftLive` reconciliation. The congregation lens filtering (`congregationOf`) stays. Retire the `driftLive` reconciliation path for the live church (it was a stopgap to age the baked snapshot; live data does not need it).

### 7. Config additions (`clients.pco_config.drift`)

`kidsEventMatch` (regex to discover kids check-in events), `windowMonths` (10), `sundaysMissed` (3), `minEstablishedSundays` (the cutoff separating established from first-timer, tuned to reproduce the baked exclusion). Seeded for Focal Point.

## Validation

Run the backfill for the `kids` resource, then confirm the computed `drift` payload lands near the baked baseline (flaggedFamilies ~53, flaggedKids ~70) within date-shift tolerance. Spot-check that a family that attended a different service recently is NOT flagged (the pooled-attendance requirement), and that the English/Brazilian lens filters the list correctly.

## Out of scope (deferred)

- Household-based family grouping (surname is v1).
- Congregation mapping for brand-new families not in the baked `congregationOf` map (they default to the All lens).
- Drafted pastoral notes for flagged families (the `drafts` array stays empty; LLM drafting is the separate Tier-3 follow-up).

## Open questions

None blocking. Kids-event discovery is by name match; if the live family count diverges far from baked, tune `kidsEventMatch` / `minEstablishedSundays` against the real data during validation.
