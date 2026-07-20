# Focal Point Church Grace Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working Grace dashboard for Focal Point Church, backed by their real Planning Center data, ready to demo on July 14.

**Architecture:** Introduce a client-aware data resolver so the existing Cornerstone church modules render either Cornerstone fixtures or Focal Point's real data, keyed on `client.slug`. Phase 1 builds the resolver seam plus all Planning-Center-independent scaffolding (client registration, theme, persona, voice card, badge fix) with Focal Point initially passing through to Cornerstone data, so nothing breaks and both dashboards render. Phase 2 (gated on the PCO Personal Access Token) pulls FPC's real data through the pco-proxy, maps it into the shapes the modules already expect, and fills in each surface.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Pinia, Vue Router, Tailwind (CSS-var design tokens), Planning Center API via the existing `pco-proxy` Supabase Edge Function, TypeScript.

## Global Constraints

- **No em dashes anywhere** (code, comments, copy, commit messages). Use commas, periods, parentheses, colons. This is a hard user rule.
- **No individual giving visibility.** Never surface dollar amounts or personal giving history. Aggregate totals, campaign progress, and per-household binary given / not-given only. The discipline lives in our mapping code: do not even write individual amounts into `focal-point` data files.
- **No auto-send.** Every Grace message is a draft for a human to send. No task wires an outbound send.
- **No fabricated live claims.** Anything not genuinely pulled from PCO is labeled "connects in pilot week." No invented PCO data in committed files: real data comes from the pull in Phase 2.
- **No test runner exists** in this repo (confirmed in CLAUDE.md). Verification for every task is: `npm run typecheck` shows no NEW errors in the touched files, plus driving the running dev server (already at an assigned port, check `npm run dev`) and confirming the described behavior in the browser. Pre-existing typecheck noise in `src/modules/` is expected; filter by the file you touched.
- **Compose only with design tokens** (`bg-brand`, `text-brand`, etc.). No hardcoded hex in components. `bg-canvas` is a non-existent token; never use it.
- **Slug for the client is `focal-point-church`** (not `focal-point` or `focal-point-test`).
- **Frequent commits.** One commit per task minimum.

---

## File Structure

**Phase 1 (Planning-Center-independent):**
- Create `src/lib/clients/church/dataset.ts` — the `ChurchDataset` interface plus the slug-to-dataset resolver `churchDataset(slug)`. Bundles the existing Cornerstone data and the new Focal Point data behind one shape.
- Create `src/lib/clients/focal-point/` — one file per data domain (`today.ts`, `people.ts`, `visitors.ts`, `care.ts`, `giving.ts`, `attendance.ts`, `sundays.ts`, `comms.ts`, `settings.ts`), each re-exporting shared types/constants from the Cornerstone equivalents and (in Phase 1) re-exporting Cornerstone's data as a passthrough.
- Create `src/lib/clients/focal-point/voice.ts` — the Focal Point voice card (tone rules + reusable phrases from the intake samples).
- Modify each Cornerstone module in `src/modules/Cornerstone*.vue` — read client-varying data via `churchDataset(client.slug)` instead of importing Cornerstone data directly. Shared types and `*_META` presentation constants keep their existing direct imports.
- Modify `src/config/clients.ts` — replace the `focal-point-test` module config with `focal-point-church`.
- Modify `src/config/clientThemes.ts` — replace `FocalPointTestTheme` with a real `focal-point-church` theme and wordmark.
- Modify `src/lib/personas/registry.ts` — add a `focal-point-church` persona (Grace, Pastor Mark greeting, FPC-flavored Q&A).
- Modify `src/pages/dashboard/DashboardLayout.vue` — ensure `isChurchDemo` and self-rendered-header logic recognize `focal-point-church`.
- Modify `src/modules/registry.ts` — make the three Cornerstone tab-badge counters slug-aware.

**Phase 2 (PAT-gated):**
- Create `scripts/pull-focal-point.mjs` — one-time PCO pull + mapping that overwrites `src/lib/clients/focal-point/*.ts` with real mapped data.
- Modify `src/lib/clients/focal-point/*.ts` — replace passthrough with real mapped FPC data (written by the script, then hand-refined).
- Modify `src/modules/CornerstoneMetricsModule.vue` (and possibly a new `src/components/cornerstone/DiscipleshipPathway.vue`) — add the Discipleship Pathway funnel.
- Modify `src/modules/CornerstoneGivingModule.vue` — enforce aggregate-only for the FPC dataset.
- Modify `src/modules/CornerstoneSettingsModule.vue` — add the one live People-count call.

---

# PHASE 1: Planning-Center-independent scaffolding

No PAT needed. Do all of this now. At the end, `/dashboard/focal-point-church` renders the full church dashboard (with Cornerstone's data as a stand-in), themed and named as Focal Point, and `/dashboard/cornerstone-church` still renders exactly as before.

### Task 1: The ChurchDataset resolver seam

**Files:**
- Create: `src/lib/clients/church/dataset.ts`
- Create: `src/lib/clients/focal-point/today.ts`, `people.ts`, `visitors.ts`, `care.ts`, `giving.ts`, `attendance.ts`, `sundays.ts`, `comms.ts`, `settings.ts` (passthrough)

**Interfaces:**
- Produces: `churchDataset(slug: string): ChurchDataset`. `ChurchDataset` exposes exactly the client-varying members each module consumes (enumerated below). Later tasks call `churchDataset(client.slug)`.

The client-varying members (from the actual module consumption surface):

```ts
// src/lib/clients/church/dataset.ts
import type { TodayItem, TodayPulse, TodayStats } from '@/lib/clients/cornerstone/today'
import type { Household, Person, PeopleStats } from '@/lib/clients/cornerstone/people'
import type { VisitorRecord, VisitorStats } from '@/lib/clients/cornerstone/visitors'
import type { CareCase, CareStats } from '@/lib/clients/cornerstone/care'
import type { MonthlyGiving, StoppedGivingHousehold, DesignatedFund, GivingStats } from '@/lib/clients/cornerstone/giving'
import type { WeeklyAttendance, AttendanceStats } from '@/lib/clients/cornerstone/attendance'
import type { UpcomingService, SundayStats } from '@/lib/clients/cornerstone/sundays'
import type { Post, BrandVoice, CommsStats } from '@/lib/clients/cornerstone/comms'
import type { TeamMember, ServiceTime, IntegrationConnection, PrivacySetting, SettingsStats } from '@/lib/clients/cornerstone/settings'

export interface ChurchDataset {
  today: {
    items: TodayItem[]
    pulse: () => TodayPulse
    stats: () => TodayStats
  }
  people: {
    households: Household[]
    people: Person[]
    stats: () => PeopleStats
    inHousehold: (householdId: string) => Person[]
    totalFlagCount: (h: Household) => number
  }
  visitors: {
    records: VisitorRecord[]
    stats: () => VisitorStats
  }
  care: {
    cases: CareCase[]
    stats: () => CareStats
  }
  giving: {
    monthly: () => MonthlyGiving[]
    stoppedHouseholds: StoppedGivingHousehold[]
    designatedFunds: DesignatedFund[]
    stats: () => GivingStats
  }
  attendance: {
    weekly: () => WeeklyAttendance[]
    priorYear: () => WeeklyAttendance[]
    stats: () => AttendanceStats
  }
  sundays: {
    upcoming: UpcomingService
    stats: () => SundayStats
  }
  comms: {
    posts: Post[]
    brandVoice: BrandVoice
    stats: () => CommsStats
  }
  settings: {
    team: TeamMember[]
    serviceTimes: ServiceTime[]
    integrations: IntegrationConnection[]
    privacy: PrivacySetting[]
    stats: () => SettingsStats
  }
}
```

- [ ] **Step 1: Create the nine Focal Point passthrough files.** Each re-exports its Cornerstone counterpart verbatim so Focal Point renders identically to Cornerstone until Phase 2 replaces the data. Example for `today.ts` (repeat the pattern for all nine, adjusting the export list to match each file's exports mapped in the plan's consumption table):

```ts
// src/lib/clients/focal-point/today.ts
// PHASE 1 PASSTHROUGH. Replaced with real mapped PCO data in Phase 2.
// Re-exports Cornerstone's Today data so Focal Point renders while the
// resolver seam is proven. Types and META constants are shared, not copied.
export { todayItems, todayPulse, todayStats } from '@/lib/clients/cornerstone/today'
export type { TodayItem, TodayPulse, TodayStats, TodayKind, Priority } from '@/lib/clients/cornerstone/today'
```

- [ ] **Step 2: Write `dataset.ts`** with the interface above plus two dataset objects and the resolver:

```ts
import { todayItems, todayPulse, todayStats } from '@/lib/clients/cornerstone/today'
import { households, people, peopleStats, peopleInHousehold, totalFlagCount } from '@/lib/clients/cornerstone/people'
import { visitors, visitorStats } from '@/lib/clients/cornerstone/visitors'
import { careCases, careStats } from '@/lib/clients/cornerstone/care'
import { monthlyGiving, stoppedGivingHouseholds, designatedFunds, givingStats } from '@/lib/clients/cornerstone/giving'
import { weeklyAttendance, priorYearAttendance, attendanceStats } from '@/lib/clients/cornerstone/attendance'
import { upcomingService, sundayStats } from '@/lib/clients/cornerstone/sundays'
import { posts, brandVoice, commsStats } from '@/lib/clients/cornerstone/comms'
import { teamMembers, serviceTimes, integrations, privacySettings, settingsStats } from '@/lib/clients/cornerstone/settings'

import * as fpToday from '@/lib/clients/focal-point/today'
import * as fpPeople from '@/lib/clients/focal-point/people'
import * as fpVisitors from '@/lib/clients/focal-point/visitors'
import * as fpCare from '@/lib/clients/focal-point/care'
import * as fpGiving from '@/lib/clients/focal-point/giving'
import * as fpAttendance from '@/lib/clients/focal-point/attendance'
import * as fpSundays from '@/lib/clients/focal-point/sundays'
import * as fpComms from '@/lib/clients/focal-point/comms'
import * as fpSettings from '@/lib/clients/focal-point/settings'

const CORNERSTONE: ChurchDataset = {
  today: { items: todayItems, pulse: todayPulse, stats: todayStats },
  people: { households, people, stats: peopleStats, inHousehold: peopleInHousehold, totalFlagCount },
  visitors: { records: visitors, stats: visitorStats },
  care: { cases: careCases, stats: careStats },
  giving: { monthly: monthlyGiving, stoppedHouseholds: stoppedGivingHouseholds, designatedFunds, stats: givingStats },
  attendance: { weekly: weeklyAttendance, priorYear: priorYearAttendance, stats: attendanceStats },
  sundays: { upcoming: upcomingService, stats: sundayStats },
  comms: { posts, brandVoice, stats: commsStats },
  settings: { team: teamMembers, serviceTimes, integrations, privacy: privacySettings, stats: settingsStats },
}

const FOCAL_POINT: ChurchDataset = {
  today: { items: fpToday.todayItems, pulse: fpToday.todayPulse, stats: fpToday.todayStats },
  people: { households: fpPeople.households, people: fpPeople.people, stats: fpPeople.peopleStats, inHousehold: fpPeople.peopleInHousehold, totalFlagCount: fpPeople.totalFlagCount },
  visitors: { records: fpVisitors.visitors, stats: fpVisitors.visitorStats },
  care: { cases: fpCare.careCases, stats: fpCare.careStats },
  giving: { monthly: fpGiving.monthlyGiving, stoppedHouseholds: fpGiving.stoppedGivingHouseholds, designatedFunds: fpGiving.designatedFunds, stats: fpGiving.givingStats },
  attendance: { weekly: fpAttendance.weeklyAttendance, priorYear: fpAttendance.priorYearAttendance, stats: fpAttendance.attendanceStats },
  sundays: { upcoming: fpSundays.upcomingService, stats: fpSundays.sundayStats },
  comms: { posts: fpComms.posts, brandVoice: fpComms.brandVoice, stats: fpComms.commsStats },
  settings: { team: fpSettings.teamMembers, serviceTimes: fpSettings.serviceTimes, integrations: fpSettings.integrations, privacy: fpSettings.privacySettings, stats: fpSettings.settingsStats },
}

const BY_SLUG: Record<string, ChurchDataset> = {
  'cornerstone-church': CORNERSTONE,
  'focal-point-church': FOCAL_POINT,
}

export function churchDataset(slug: string): ChurchDataset {
  return BY_SLUG[slug] ?? CORNERSTONE
}
```

- [ ] **Step 3: Verify.** Run `npm run typecheck`. Expected: no new errors referencing `src/lib/clients/church/dataset.ts` or `src/lib/clients/focal-point/*`. If a Focal Point passthrough file is missing an export the dataset references, add the missing re-export to that file.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/clients/church/dataset.ts src/lib/clients/focal-point/
git commit -m "Add ChurchDataset resolver seam with Focal Point passthrough"
```

### Task 2: Route the Cornerstone modules through the resolver

Do this one module at a time so a regression is easy to localize. For each module: replace the direct Cornerstone data imports (data arrays and stat functions only, NOT types or `*_META` constants) with a `churchDataset(props.client.slug)` lookup, and update the template/computed references.

**Files (modify, each its own step + verify + commit):**
- `src/modules/CornerstoneTodayModule.vue` (uses today, giving, people)
- `src/modules/CornerstoneFrontDeskGuestsModule.vue` (visitors)
- `src/modules/CornerstoneCareDriftModule.vue` (people, care)
- `src/modules/CornerstoneSundaysCommsModule.vue` (sundays, comms)
- `src/modules/CornerstoneMetricsModule.vue` (attendance, giving, people)
- `src/modules/CornerstoneGivingModule.vue` (giving)
- `src/modules/CornerstoneSettingsModule.vue` (settings)

**Interfaces:**
- Consumes: `churchDataset(slug)` from Task 1.

- [ ] **Step 1 (per module): Read the module** and list every symbol it imports from `@/lib/clients/cornerstone/*`. Classify each as (a) type, (b) `*_META`/label constant, or (c) data array / stat function. Only (c) moves to the resolver.

- [ ] **Step 2 (per module): Rewrite the imports.** Keep type and META imports. Remove the data-array/stat-function imports. Add `import { churchDataset } from '@/lib/clients/church/dataset'`. After `const props = defineProps<{ client: Client; config: ... }>()` add `const data = churchDataset(props.client.slug)`. Replace each removed symbol's usage: e.g. `todayItems` becomes `data.today.items`, `givingStats()` becomes `data.giving.stats()`, `peopleInHousehold(id)` becomes `data.people.inHousehold(id)`.

Worked example for `CornerstoneTodayModule.vue`:

```ts
// BEFORE
import { todayPulse } from '@/lib/clients/cornerstone/today'
import { givingStats } from '@/lib/clients/cornerstone/giving'
import { peopleStats } from '@/lib/clients/cornerstone/people'
// AFTER
import { churchDataset } from '@/lib/clients/church/dataset'
// ...inside <script setup>, after defineProps:
const data = churchDataset(props.client.slug)
// then: todayPulse()  -> data.today.pulse()
//       givingStats() -> data.giving.stats()
//       peopleStats() -> data.people.stats()
```

- [ ] **Step 3 (per module): Verify.** Run `npm run typecheck` (filter to the touched file). Then in the browser load `/dashboard/cornerstone-church` and confirm the module renders identically to before. Because Focal Point is still a passthrough, behavior is unchanged; this step proves the seam did not break Cornerstone.

- [ ] **Step 4 (per module): Commit.**

```bash
git add src/modules/Cornerstone<Name>Module.vue
git commit -m "Route Cornerstone <name> module data through churchDataset resolver"
```

### Task 3: Register the focal-point-church client

**Files:**
- Modify: `src/config/clients.ts`

- [ ] **Step 1:** Replace the `'focal-point-test'` key in `clientModuleConfigs` with `'focal-point-church'`, keeping the same seven church module keys (`cornerstone-today`, `cornerstone-front-desk-guests`, `cornerstone-care-drift`, `cornerstone-sundays-comms`, `cornerstone-metrics`, `cornerstone-giving`, `cornerstone-settings`). Update the comment to name Focal Point Church, Orlando, and remove any "TEST" language.

- [ ] **Step 2: Verify.** Run `npm run typecheck`. Then load `/dashboard/focal-point-church` in the browser. Expected: the seven-tab church dashboard renders (with Cornerstone stand-in data). `/dashboard/focal-point-test` now 404s or redirects, which is fine.

- [ ] **Step 3: Commit.**

```bash
git add src/config/clients.ts
git commit -m "Register focal-point-church client with the church module set"
```

### Task 4: Focal Point theme, wordmark, and church-demo recognition

**Files:**
- Modify: `src/config/clientThemes.ts`
- Modify: `src/pages/dashboard/DashboardLayout.vue`
- Modify: `src/lib/personas/registry.ts`

- [ ] **Step 1: Theme + wordmark.** In `clientThemes.ts`, replace `FocalPointTestTheme` with a `FocalPointChurchTheme` and register it under `'focal-point-church'`. Set `wordmark.text` to `'Focal Point'` and `wordmark.suffix` to `'Church'` (no TEST). Keep `vars: {}` (inherits the default Grace blue) unless a distinct brand color is chosen; if chosen, set the rgb-triple CSS vars per the theming contract. Remove the old `'focal-point-test'` registration.

- [ ] **Step 2: Church-demo recognition.** In `DashboardLayout.vue`, `isChurchDemo` is `/church|cornerstone/i.test(props.slug)`; `'focal-point-church'` already matches via `church`, so confirm no change is needed. If `SLUGS_WITH_SELF_RENDERED_HEADER` lists `focal-point-test`, rename it to `focal-point-church`.

- [ ] **Step 3: Persona.** In `personas/registry.ts`, add a `'focal-point-church'` entry mirroring the `'cornerstone-church'` shape: `name: 'Grace'`, `subtitle: 'your AI ministry assistant'`, a greeting addressed to Pastor Mark and Focal Point, and 4 to 6 Q&A pairs written in Grace's voice about Focal Point (first-time visitors, drift, giving-status without amounts, care, serving). Keep them plausible and generic until Phase 2 swaps in real names; do not invent specific member names that imply real data yet.

- [ ] **Step 4: Verify.** `npm run typecheck`, then load `/dashboard/focal-point-church`: wordmark reads "Focal Point Church", the Grace persona/greeting shows Pastor Mark, and the church demo banner appears.

- [ ] **Step 5: Commit.**

```bash
git add src/config/clientThemes.ts src/pages/dashboard/DashboardLayout.vue src/lib/personas/registry.ts
git commit -m "Add Focal Point Church theme, wordmark, and Grace persona"
```

### Task 5: Make tab-badge counters slug-aware

**Files:**
- Modify: `src/modules/registry.ts`

- [ ] **Step 1: Read `registry.ts` lines 760 to 825.** Note the signature of the badge/count callback on the three Cornerstone module definitions (`cornerstone-today` urgent count, `cornerstone-care-drift` at-risk count, `cornerstone-giving` priority count). Determine whether the callback receives the client slug or client object.

- [ ] **Step 2: Rewire the three counters through the resolver.** If the callback receives a slug or client, replace `cornerstoneCareStats()` / `cornerstoneHouseholds` / `cornerstoneStoppedGiving` with `churchDataset(slug).care.stats()` / `.people.households` (+ `.people.totalFlagCount`) / `.giving.stoppedHouseholds`, and add `import { churchDataset } from '@/lib/clients/church/dataset'`. If the callback does NOT receive slug context, add a parameter for it and update the caller (the DashboardLayout tab-badge render) to pass `props.slug`. Remove the now-unused direct cornerstone imports at lines 67 to 69 if nothing else uses them.

- [ ] **Step 3: Verify.** `npm run typecheck`. In the browser, confirm `/dashboard/cornerstone-church` badges are unchanged and `/dashboard/focal-point-church` badges reflect the Focal Point dataset (identical while passthrough, but now sourced correctly).

- [ ] **Step 4: Commit.**

```bash
git add src/modules/registry.ts src/pages/dashboard/DashboardLayout.vue
git commit -m "Make Cornerstone tab-badge counters slug-aware via resolver"
```

### Task 6: Focal Point voice card

**Files:**
- Create: `src/lib/clients/focal-point/voice.ts`

**Interfaces:**
- Produces: `focalPointVoice` object consumed by Phase 2 draft-writing. Shape mirrors Cornerstone's `BrandVoice` where practical, extended with sample phrases.

- [ ] **Step 1: Author the voice card** from the intake samples. Capture verbatim, since this is real client input, not fabrication:

```ts
// src/lib/clients/focal-point/voice.ts
// Voice profile for Focal Point Church, calibrated from Pastor Mark's
// writing samples in the intake questionnaire. Drives Grace's drafts.
// This becomes the generation prompt profile during the pilot.
export const focalPointVoice = {
  pastor: { name: 'Pastor Mark', fullSignoff: 'Blessings,\nPastor Mark' },
  toneWords: ['warm', 'casual', 'endearing', 'purposeful'],
  orientation: 'Second-person ("you") oriented up front. Not pushy, but clear. Very purposeful.',
  discipleshipMarks: [
    'devoted followers',
    'sacrificial friends',
    'courageous witnesses',
    'multiplying disciplers',
  ],
  reusablePhrases: [
    "journey alongside you this season",
    "you're being thought of and prayed for",
    "we've missed you lately at Focal Point",
    "we're honored to walk with you",
    "take the first step of Starting Point",
  ],
  doNot: [
    'Never state individual giving amounts or personal giving history.',
    'Never auto-send. Draft only, for a human to send.',
    'No pressure or guilt framing.',
  ],
} as const
```

- [ ] **Step 2: Verify.** `npm run typecheck`. No consumers yet; this just needs to compile.

- [ ] **Step 3: Commit.**

```bash
git add src/lib/clients/focal-point/voice.ts
git commit -m "Add Focal Point voice card calibrated from Pastor Mark's samples"
```

**End of Phase 1 gate:** Load both `/dashboard/cornerstone-church` and `/dashboard/focal-point-church`. Both render the full seven-tab church dashboard. Cornerstone is unchanged. Focal Point is themed and named correctly and shows stand-in data. `npm run typecheck` has no new errors. Commit any stragglers.

---

# PHASE 2: Real Planning Center data (GATED ON THE PAT)

Do not start until the PCO Personal Access Token (`app_id:secret`) is in hand. Every task here replaces a Focal Point passthrough with real mapped data or adds a data-backed surface.

**Important honesty note for the implementer:** the exact PCO response shapes (custom fields, form names, list structures, check-in event names) are not known until inspected against the real account. Do NOT fabricate PCO JSON in advance. Task 7 is a shape-inspection pass; the mapping code in Tasks 8+ is finalized against what that pass reveals. The TARGET shapes (what each `focal-point/*.ts` must export) are fully known: they match the Cornerstone data files whose exports are enumerated in Phase 1.

### Task 7: Inspect real PCO shapes and stand up the pull script

**Files:**
- Create: `scripts/pull-focal-point.mjs`
- Use: `/admin/pco-test` for interactive inspection

**Interfaces:**
- Produces: a runnable `node scripts/pull-focal-point.mjs` that authenticates with the PAT (read from an env var, never committed), fetches the needed PCO resources, and writes raw JSON snapshots to `scratchpad/pco-raw/` for mapping. It does not yet write to `src/`.

- [ ] **Step 1:** Load `/admin/pco-test`, paste the PAT, and run the People, Forms, Form Submissions, Check-Ins, Groups, and Giving test calls. Record the actual field names and nesting for each resource (especially: how households are represented, how first-time-visitor status is marked, which form is the Starting Point connect card, which check-in events map to which services, and how "recurring gift / last gift date" is exposed without individual amounts).

- [ ] **Step 2:** Write `scripts/pull-focal-point.mjs` to fetch those exact endpoints (paginated) via the same proxy path the sandbox uses, reading the PAT from `process.env.PCO_PAT`. Write each resource to `scratchpad/pco-raw/<resource>.json`.

- [ ] **Step 3: Verify.** Run `PCO_PAT=... node scripts/pull-focal-point.mjs`. Expected: `scratchpad/pco-raw/*.json` populated with real records; log line prints counts (roughly ~1000-attendance church, so hundreds of people, ~15 recent first-time visitors/Sunday). Spot-check one household and one visitor record.

- [ ] **Step 4: Commit** the script only (never the raw data or the PAT).

```bash
echo "scratchpad/pco-raw/" >> .gitignore
git add scripts/pull-focal-point.mjs .gitignore
git commit -m "Add Focal Point PCO pull script (shape inspection + raw snapshot)"
```

### Task 8: Map People into the household model (drives Care & Drift + Metrics)

**Files:**
- Modify: `src/lib/clients/focal-point/people.ts` (replace passthrough with real data)
- Extend: `scripts/pull-focal-point.mjs` (add a mapping step that writes `people.ts`)

**Interfaces:**
- Consumes: raw People + Check-Ins + Groups + giving-status JSON from Task 7.
- Produces: `households: Household[]`, `people: Person[]`, `peopleStats()`, `peopleInHousehold()`, `totalFlagCount()` matching the Cornerstone `people.ts` signatures (see Phase 1 export map). Re-export shared types and `*_META` from `@/lib/clients/cornerstone/people`.

- [ ] **Step 1:** In the script, roll PCO individuals into households. For each household compute the three flags using FPC's exact thresholds: attendance flag from Check-Ins (red at 3 missed Sundays), giving flag from giving-status only (red at 3 months since last gift, binary, NO amounts stored), serving flag from group/team membership (red at 6 weeks no serving) and group attendance (yellow/red at 1 to 2 months absent). Map `HouseholdStage` from PCO membership status.

- [ ] **Step 2:** Emit `src/lib/clients/focal-point/people.ts` with the real arrays and the same stat-function implementations as Cornerstone (copy the function bodies, they operate on the arrays). Re-export types/META from the Cornerstone file. **Do not write any giving dollar figures into this file.**

- [ ] **Step 3: Verify.** `npm run typecheck`. Load `/dashboard/focal-point-church` Care & Drift tab: real family names appear, flags reflect real attendance/serving/giving-status, at-risk households (2+ red flags) match the drift definition. Cross-check a couple against the raw JSON.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/clients/focal-point/people.ts scripts/pull-focal-point.mjs
git commit -m "Map Focal Point PCO people into household model with FPC drift thresholds"
```

### Task 9: Map visitors (drives Front Desk / Guests)

**Files:**
- Modify: `src/lib/clients/focal-point/visitors.ts`
- Extend: `scripts/pull-focal-point.mjs`

**Interfaces:**
- Produces: `visitors: VisitorRecord[]`, `visitorStats()` matching Cornerstone `visitors.ts`.

- [ ] **Step 1:** Map Starting Point form submissions + first-time check-ins from the last several Sundays into `VisitorRecord[]`. Set `source` from the capture channel (QR form, iPad, Kids QR, manual for Brazilian/Spanish). Set `stage` from follow-up status.

- [ ] **Step 2:** For each recent visitor, attach a drafted follow-up message written in the voice card's style (Example 1 welcome tone). Store the draft text on the record (or in a parallel drafts map the module reads). No send.

- [ ] **Step 3: Verify.** `npm run typecheck`. Front Desk / Guests tab shows real recent first-time families, each with a personal drafted follow-up in Pastor Mark's voice. Confirm roughly 15 per recent Sunday.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/clients/focal-point/visitors.ts scripts/pull-focal-point.mjs
git commit -m "Map Focal Point real visitors with drafted follow-ups"
```

### Task 10: Map care cases and Today queue

**Files:**
- Modify: `src/lib/clients/focal-point/care.ts`, `src/lib/clients/focal-point/today.ts`
- Extend: `scripts/pull-focal-point.mjs`

**Interfaces:**
- Produces: `careCases: CareCase[]` + `careStats()`; `todayItems: TodayItem[]` + `todayPulse()` + `todayStats()`.

- [ ] **Step 1:** Derive care cases from at-risk households (Task 8) and any PCO life-event signals available. Derive `todayItems` from the union of: recent visitors needing follow-up, at-risk families, and drift flags, each with a drafted action in Grace's voice and priority set by the drift severity.

- [ ] **Step 2:** Write `todayPulse()` copy as the Monday-morning brief in Pastor Mark's voice, referencing real counts (visitors this week, families flagged), routed to the pastor-plus-assistant approver chain.

- [ ] **Step 3: Verify.** `npm run typecheck`. Today tab opens on a real brief with a real sign-off queue; "work the list" flows to Front Desk and Care items that exist in the other tabs.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/clients/focal-point/care.ts src/lib/clients/focal-point/today.ts scripts/pull-focal-point.mjs
git commit -m "Derive Focal Point care cases and Today brief from real data"
```

### Task 11: Metrics + Discipleship Pathway funnel

**Files:**
- Modify: `src/lib/clients/focal-point/attendance.ts`
- Create: `src/components/cornerstone/DiscipleshipPathway.vue`
- Modify: `src/modules/CornerstoneMetricsModule.vue`
- Extend: `scripts/pull-focal-point.mjs`

**Interfaces:**
- Produces: real `weeklyAttendance()`, `priorYearAttendance()`, `attendanceStats()`; a `DiscipleshipPathway` component that takes funnel-stage counts as a prop.

- [ ] **Step 1:** Map Check-Ins into weekly attendance across all Sunday times plus Wednesday and Saturday. Compute stats and prior-year where PCO history allows; if history is thin, show the range actually available and label the rest honestly.

- [ ] **Step 2:** Build `DiscipleshipPathway.vue` as a funnel over the stages PCO can derive: first-time visitor, Starting Point, checked-in regular, group member, serving, giving (binary). Overlay the four-marks framing (devoted followers, sacrificial friends, courageous witnesses, multiplying disciplers) as section labeling. Mark stages we cannot yet derive with a "calibrated with you during the pilot" tag. Render it in the Metrics module for the church dataset only.

- [ ] **Step 3:** Add clearly-labeled "connects in pilot week" tiles for the external metrics (podcast listeners, YouTube subscriptions, FP Online). These are placeholders by design, labeled as such. No fabricated numbers.

- [ ] **Step 4: Verify.** `npm run typecheck`. Metrics tab opens on real attendance across services, real group medians, and the Discipleship Pathway funnel. External tiles read as future integrations, not live data.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/clients/focal-point/attendance.ts src/components/cornerstone/DiscipleshipPathway.vue src/modules/CornerstoneMetricsModule.vue scripts/pull-focal-point.mjs
git commit -m "Add Focal Point real attendance metrics and Discipleship Pathway funnel"
```

### Task 12: Giving (aggregate only) with the individual-privacy guard

**Files:**
- Modify: `src/lib/clients/focal-point/giving.ts`
- Modify: `src/modules/CornerstoneGivingModule.vue`
- Extend: `scripts/pull-focal-point.mjs`

**Interfaces:**
- Produces: `monthlyGiving()` (aggregate totals only), `givingStats()` (aggregate), `stoppedGivingHouseholds` (binary flag, NO amounts), `designatedFunds` including "The Time is Now" campaign progress at the aggregate level.

- [ ] **Step 1:** Map PCO Giving into AGGREGATE monthly totals and campaign progress only. For `stoppedGivingHouseholds`, include household identity + a binary "stopped" flag + stop-reason, but strip any per-household or per-person dollar amount. Add an explicit code comment that individual amounts are intentionally omitted per the client constraint.

- [ ] **Step 2:** In `CornerstoneGivingModule.vue`, guard the church dataset path so any per-giver amount UI is hidden for `focal-point-church` (show given / not-given status and aggregate trend + campaign progress instead). Confirm no template branch can render an individual amount for this slug.

- [ ] **Step 3: Verify.** `npm run typecheck`. Giving tab shows aggregate trend, "The Time is Now" campaign progress, and percent of households giving. Inspect the DOM and the `focal-point/giving.ts` file: NO individual dollar amount anywhere.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/clients/focal-point/giving.ts src/modules/CornerstoneGivingModule.vue scripts/pull-focal-point.mjs
git commit -m "Add Focal Point aggregate-only giving with individual-privacy guard"
```

### Task 13: Sundays / Comms email draft

**Files:**
- Modify: `src/lib/clients/focal-point/sundays.ts`, `src/lib/clients/focal-point/comms.ts`
- Extend: `scripts/pull-focal-point.mjs`

**Interfaces:**
- Produces: real `upcomingService` (FPC service times + real seasonal events), `sundayStats()`, one drafted Sunday email in `posts` using the voice card, `brandVoice` set from the voice card.

- [ ] **Step 1:** Populate `upcomingService` with FPC's real service rhythm (Sun 9/10:30/12/6, Wed 7pm Youth, Sat 8am prayer) and seasonal pulses (Meet the Pastor Jul 21, Friend Day Aug 30, Back to School Bash, etc.). Set `brandVoice` from `focalPointVoice`.

- [ ] **Step 2:** Draft one Sunday email in Pastor Mark's voice, framed to augment (not replace) the Starting Point + Mailchimp/Clearstream workflow. Add a note in the UI copy that Grace drafts, the team sends.

- [ ] **Step 3: Verify.** `npm run typecheck`. Sundays / Comms tab shows real service times, real upcoming events, and one on-voice Sunday email draft.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/clients/focal-point/sundays.ts src/lib/clients/focal-point/comms.ts scripts/pull-focal-point.mjs
git commit -m "Add Focal Point service rhythm and drafted Sunday email"
```

### Task 14: Settings with the one live PCO call

**Files:**
- Modify: `src/lib/clients/focal-point/settings.ts`
- Modify: `src/modules/CornerstoneSettingsModule.vue`

**Interfaces:**
- Produces: real `teamMembers` (Christina Spoon + pastors/staff), `serviceTimes`, `integrations` (Planning Center marked connected; Mailchimp/Clearstream marked pilot-week), `privacySettings` (giving-privacy + no-auto-send + drift thresholds pre-filled), and a live People-count fetch.

- [ ] **Step 1:** Populate `settings.ts` with the real team (Christina Spoon as primary admin + tech contact; pastors Mark, Vinny, Andrew, Kelly, Staci; Minister Tony; Kristen Wiggins, Emily Bankole, Cindy Salopek), approver chain pastor-plus-assistant, alerts to email, drift thresholds (giving 3mo, serving 6wk, group 1-2mo, Sundays 3). Mark Planning Center connected; Mailchimp, Clearstream, podcast, YouTube as "connects in pilot week."

- [ ] **Step 2:** In `CornerstoneSettingsModule.vue`, for `focal-point-church` only, add a live People-count fetch through the pco-proxy (same path as the sandbox), showing the count and a last-synced timestamp on the Planning Center integration card. Handle loading + error states gracefully so a failed live call never breaks the page (fall back to "connected" without the count).

- [ ] **Step 3: Verify.** `npm run typecheck`. Settings tab shows the real team + config, and the Planning Center card shows a genuinely live member count fetched in the browser. Kill the network briefly and confirm the page still renders (graceful fallback).

- [ ] **Step 4: Commit.**

```bash
git add src/lib/clients/focal-point/settings.ts src/modules/CornerstoneSettingsModule.vue
git commit -m "Add Focal Point real settings and one live PCO People-count call"
```

### Task 15: Polish and rehearsal

**Files:** as needed across the Focal Point surfaces.

- [ ] **Step 1:** Run `/impeccable critique /dashboard/focal-point-church` on the four spine tabs (Metrics, Front Desk, Care & Drift, Today). Fix any hierarchy, spacing, or token issues it flags.
- [ ] **Step 2:** Run `npm run typecheck` and confirm no new errors across all touched files.
- [ ] **Step 3:** Walk the full demo narrative in the browser in order (Metrics, Front Desk, Care & Drift, Today, Discipleship Pathway, Settings live call). Confirm every screen shows real FPC data and every draft is on-voice.
- [ ] **Step 4:** Confirm the global constraints hold: no individual giving amounts anywhere, no send buttons that actually send, no em dashes in any new copy, external metrics labeled as pilot-week.
- [ ] **Step 5: Commit** any polish changes.

```bash
git add -A
git commit -m "Polish Focal Point demo surfaces and complete rehearsal pass"
```

---

## Self-review notes (author)

- **Spec coverage:** data layer (Tasks 1-2), client registration/theme/persona (Tasks 3-4), badge correctness (Task 5), voice (Task 6), live pull (Task 7), Care & Drift + multi-signal thresholds (Task 8), Front Desk (Task 9), Today (Task 10), Metrics + Discipleship Pathway (Task 11), aggregate-only Giving (Task 12), Sundays/Comms (Task 13), Settings + one live call (Task 14), polish/rehearsal (Task 15). All spec sections map to a task.
- **PAT-independent front-loading:** Phase 1 (Tasks 1-6) needs no PAT, matching the timeline's "now to Jul 9" row.
- **Hard constraints enforced by task:** giving privacy (Tasks 8, 12), no auto-send (9, 10, 13, 15), honesty labels (11, 15), em-dash rule (global + 15).
- **Data-shape honesty:** Phase 2 mapping code is finalized against real PCO shapes in Task 7 rather than fabricated, per the spec's risk mitigation. Target shapes are fully specified by the Cornerstone export map in Phase 1.
