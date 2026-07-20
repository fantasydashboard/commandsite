# Focal Point Church: Grace build for the July 14 demo

**Date:** 2026-07-08
**Author:** Josh (with Claude)
**Status:** Approved design, ready for implementation plan

## Context and stakes

Focal Point Church (FPC) is CommandSite's first real Grace client. There is a
meeting on July 14 with several members of their team where the goal is to show
a working demo built on their actual Planning Center data. It does not need to
be 100% done, but a large majority of the way there.

This is customer #1. It unlocks social proof, a real testimonial, voice
calibration data, and every future reference to "a church using Grace today."
The demo carries real weight.

## Success criteria for the 14th

1. Every primary screen is backed by Focal Point's real Planning Center data
   (real names, real recent visitors, real attendance gaps), not generic
   fixtures.
2. Grace's drafted messages read in Pastor Mark's voice, not generic church
   software, calibrated from the intake voice samples.
3. The demo narrative maps directly to FPC's three stated priorities.
4. There is one genuinely live Planning Center call in the room to prove the
   connection is real.
5. The build cannot break from a live API hiccup mid-presentation.

## Client facts (from the intake questionnaire)

- **Church:** Focal Point Church, Orlando FL, non-denominational.
- **Size:** ~1,000 weekly attendance. Top of Grace's band. Multi-service and
  multi-congregation: Sunday 9 / 10:30 / Noon / 6pm, Wednesday 7pm Youth,
  Saturday 8am prayer, plus Online, Brazilian/Spanish, Kids, and Youth.
- **Pastors and staff:** Senior pastor Mark Daniel (mdaniel@focalpointchurch.com,
  signs "Pastor Mark Daniel"). Also Pastors Vinny, Andrew, Kelly, Staci, and
  Minister Tony. Ministry staff include Kristen Wiggins, Emily Bankole,
  Cindy Salopek.
- **Admin and approvals:** Christina Spoon (Office Manager, cspoon@, also the
  tech contact). Approver chain is pastor plus assistant. Alerts route to email.
- **Tools:** ChMS and giving both on Planning Center. Comms today via Mailchimp
  plus Clearstream (SMS), considering a move to Flowforth.
- **Existing welcome flow:** New visitors sign in at Starting Point, enter a
  workflow, receive an automated text plus a welcome video from Pastor Mark,
  then get assigned to a team member for personal follow-up. Grace augments this
  flow (surfaces who is stuck or unfollowed), she does not replace it.
- **Voice:** warm, casual, endearing, purposeful, "you"-oriented up front. Four
  discipleship marks: devoted followers, sacrificial friends, courageous
  witnesses, multiplying disciplers. Four strong writing samples provided
  (welcome, first-gift thank-you, drift check-in, capital-campaign update).
- **Visitors:** ~15 first-time visitors on an average Sunday. Captured via
  QR-to-form and iPad at the Starting Point table, plus Youth iPad on Wednesday,
  Kids QR, and a manual card for the Brazilian/Spanish service.
- **Drift:** Best estimate 5 to 10 committed families plus 30+ loosely connected
  people drifted in the last 6 months. Flag after 3 missed Sundays (tunable).
- **Top three priorities (their words):**
  1. Metrics and true visibility across groups, Sunday services, and the
     Discipleship Pathway, "so we can ask the right questions."
  2. Identify first-time and recent visitors to reach out to so they do not fall
     through the cracks.
  3. Identify committed people beginning to drift: stopped giving in 3 months,
     stopped serving in 6 weeks, or stopped attending group for 1 to 2 months.

## Locked decisions

1. **Data source:** Live Planning Center pull, blended for safety. Pull FPC's
   real data through the existing pco-proxy a day or two ahead, snapshot it into
   a committed `focal-point` dataset, demo against the snapshot, and wire one
   genuinely live call for proof. The Supabase ingest (scheduled sync) is the
   first work of the actual pilot, seeded from this snapshot.
2. **Demo spine:** Hybrid. Open on real numbers (Metrics), tell the human story
   with one real visitor and one real drifting family, land on the Discipleship
   Pathway vision in their own words.
3. **Giving module:** Aggregate only plus a binary drift signal. Show total
   giving trend, "The Time is Now" campaign progress, and percent of households
   giving. Never show individual amounts or personal giving history anywhere.
   "Stopped giving in 3 months" appears as a binary flag in Care.
4. **Voice for the 14th:** Everything calibrated to Pastor Mark's voice plus the
   church's four-marks framing. Per-staff voices are a pilot-week enhancement.
5. **Metrics scope on the 14th:** Everything on screen is live PCO (services,
   groups, check-ins, giving-status). External sources (podcast, YouTube, FP
   Online, Clearstream, Mailchimp) are shown as clearly labeled "connects in
   pilot week" tiles.

## Hard constraints

- **No individual giving visibility.** Grace never surfaces dollar amounts or
  personal giving history. Only aggregate totals plus binary given / not-given.
  This discipline lives in our code (what we pull and display), not in the PCO
  token scope. Pull only aggregate totals, campaign progress, and a per-household
  given / not-given flag.
- **No auto-send.** Grace drafts only. Humans send, ideally via a simple
  copy-paste. This is more conservative than a default approval queue and is a
  selling point, not a limitation.
- **Honesty.** Anything not genuinely live is labeled as a pilot-week
  integration. No fabricated data or fabricated "live" claims.

## Architecture

### The data layer

Today each module hardcodes its data import, for example
`import { todayItems } from '@/lib/clients/cornerstone/today'`. The data is
per-module hardcoded, not driven by the `client` prop. Three pieces change this
for Focal Point.

1. **Client-aware data resolver.** A thin resolver so a module asks for its data
   by `client.slug` and gets Cornerstone fixtures for the Cornerstone demo, Focal
   Point's real data for `focal-point`. This also fixes the hardcoded-fixture
   smell flagged in CLAUDE.md and makes every future church client just another
   data directory behind the same seam.

2. **One-time PCO pull plus mapping.** A script that pulls FPC's People,
   Check-Ins, Form submissions, Groups, Services, and aggregate/binary Giving
   through the proven pco-proxy path, then writes `src/lib/clients/focal-point/*.ts`
   in the exact shapes the modules already expect (`Person`/household, `Visitor`,
   `TodayItem`, care flags, aggregate giving stats). The mapping is the real
   engineering: PCO's data model to our household-centric model, rolling
   individuals into households, deriving "missed 3 Sundays" from Check-In records,
   and computing the multi-signal drift flags.

3. **Grace's generated layer on top.** Drafts, the Monday brief, drift flags, and
   the approval queue are computed and authored onto the real records, since PCO
   does not store "a follow-up text in the pastor's voice." For the 14th these are
   hand-calibrated from the voice samples. They live in the same `focal-point`
   data files so they are swappable for real generation during the pilot.

Key property: `focal-point` becomes a real, committed dataset (their names, their
recent Sunday, their drifting families) that also serves as the seed for the
Supabase ingest later.

### Client registration

Promote the existing `focal-point-test` scaffold to a real `focal-point` client:
real wordmark ("Focal Point Church", drop the TEST suffix), real theme, same
church module set. The route becomes `/dashboard/focal-point`.

### Voice card

`src/lib/clients/focal-point/voice.ts` captures the rules the samples reveal:
warm / casual / endearing / purposeful, "you"-oriented, sign-off "Blessings,
Pastor Mark," and reusable phrases pulled from their writing ("journey alongside
you this season", "you're being thought of and prayed for", Starting Point
language, the four-marks framing). This voice card becomes the voice profile that
drives real generation during the pilot.

## Scope tiers and demo order

### Tier 1: live and polished (the demo spine)

| Module | Priority | Live on the 14th |
|--------|----------|------------------|
| Metrics (elevated to lead) | #1 visibility | Real service attendance across all times, real Growth Group attendance and medians, Kids/Youth check-in trends, the Discipleship Pathway funnel, aggregate campaign progress. External tiles labeled "connects in pilot week." |
| Front Desk / Guests | #2 connect visitors | Real Starting Point / connect-card submissions from PCO Forms, actual names from a recent Sunday, each with a drafted follow-up in Pastor Mark's voice. |
| Care & Drift | #3 catch drift | Real households flagged by the exact multi-signal thresholds, each with a drafted check-in. |
| Today | ties it together | Monday-morning brief plus sign-off queue routed to pastor plus assistant, drawing from the three above. |

### Tier 2: present, lighter

- **Giving:** aggregate trend plus "The Time is Now" campaign progress plus
  percent of households giving. No individual amounts. Binary "stopped giving"
  flows into Care.
- **Sundays / Comms:** one Sunday email drafted in Mark's voice, framed as
  augmenting the existing Starting Point to Mailchimp/Clearstream workflow.

### Tier 3: proof and config

- **Settings:** the Planning Center connection screen carrying the one live call
  (live People count plus last-sync timestamp). Real config: approver chain
  (pastor plus assistant), alerts to email, drift thresholds pre-filled with
  their numbers.

### Demo narrative (the hybrid spine)

1. Open on Metrics: "here's Focal Point in real numbers, pulled from your
   Planning Center."
2. Front Desk: walk one real first-time family from a recent Sunday, show the
   drafted follow-up. "This is the family that would have fallen through the
   cracks."
3. Care & Drift: one real committed family quiet on 2 of the 4 signals. The
   "before they're gone" moment.
4. Today: "here's your Monday: open this, work the list."
5. Land on the Discipleship Pathway vision in their own words.
6. Settings, only if they ask "is this really live?": the live People count
   answers it.

## Drift definition and thresholds

A household is flagged when any one of these is true. The `people.ts` household
model already carries attendance, giving, and serving flags, which maps cleanly.

- Stopped giving for 3 months (binary given / not-given, no amounts).
- Stopped serving for 6 weeks.
- Stopped attending group for 1 to 2 months.
- Missed 3 Sundays (their default, tunable).

## Discipleship Pathway funnel (signature FPC piece)

Priority #1 explicitly names the Discipleship Pathway. Build the funnel from the
stages PCO can actually give us: first-time visitor, Starting Point, checked-in
regular, group member, serving, giving. Represent the four-marks layer (devoted
followers, sacrificial friends, courageous witnesses, multiplying disciplers) as
the framing on top, labeled honestly as "calibrated with you during the pilot"
for the parts we cannot yet derive from PCO.

## Accounts and access needed

1. **Planning Center Personal Access Token (critical path).** Josh added as an
   admin on FPC's PCO org, or a PAT from Christina in `app_id:secret` format with
   access to People, Check-Ins, Groups, Services, Forms, and Giving. Needed in
   hand by ~July 10 to leave time for the pull and mapping. This is the single
   thing that blocks everything downstream.
2. **Christina's member plus 6-month visitor export as a backup.** She confirmed
   yes. Fallback if the API is missing anything.
3. Nothing else for the 14th. Mailchimp, Clearstream, podcast, and YouTube are
   all pilot-week integrations.

## Timeline (today is July 8, demo July 14)

| When | Work | Blocked on |
|------|------|-----------|
| Now to Jul 9 | Plumbing without data: client-aware resolver, register `focal-point` client + theme + wordmark, PCO-to-shape mapper skeleton, voice card scaffold | nothing |
| Jul 10 | Real PCO pull, generate `focal-point/*.ts`, start Metrics + Discipleship Pathway funnel | PAT |
| Jul 11 | Front Desk (real submissions), finish Metrics | PAT |
| Jul 12 | Care & Drift (multi-signal flags), Today assembly, voice-calibrated drafts | PAT |
| Jul 13 | Giving aggregate + campaign, Sunday email, Settings + live proof call, /impeccable polish, typecheck, rehearsal | PAT |
| Jul 14 | Demo plus buffer | - |

If the PAT slips, the fallback is building against Christina's manual export
(still their real data, just not via live API), and the one live call becomes the
only piece that needs the token.

## Out of scope for the 14th (pilot-week and roadmap)

- Supabase ingest with scheduled PCO sync (path C, the production architecture).
- Live LLM draft generation (the voice card drives this in the pilot).
- Per-staff voices beyond Pastor Mark.
- External metric sources: podcast listeners, YouTube subscriptions, FP Online
  streaming, Clearstream and Mailchimp send data.
- The full four-marks discipleship derivation beyond what PCO structure supports.

## Risks

- **PAT slips past July 10.** Mitigation: manual export fallback, live call
  isolated to one screen.
- **PCO data shapes surprise the mapper** (custom fields, non-standard forms,
  household edge cases). Mitigation: the pco-test sandbox already lets us inspect
  real shapes before writing the mapper; do a shape-inspection pass first.
- **Discipleship Pathway over-promises.** Mitigation: label derived vs.
  pilot-calibrated stages honestly on the screen.
