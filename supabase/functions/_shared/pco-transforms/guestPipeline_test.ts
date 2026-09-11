import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildGuestPipeline, type GuestCardRow } from './guestPipeline.ts'

const TODAY = '2026-07-27'
function card(over: Partial<GuestCardRow>): GuestCardRow {
  return { card_id: 'c1', campus: 'english', name: 'Jane Doe', created_date: '2026-07-25', completed_date: null, step_name: 'Welcome Phone Call', person_id: 'pp1', ...over }
}

Deno.test('completed card -> finished', () => {
  assertEquals(buildGuestPipeline([card({ completed_date: '2026-07-20' })], TODAY).cases[0].stage, 'finished')
})
Deno.test('week 3 step -> week3', () => {
  assertEquals(buildGuestPipeline([card({ step_name: 'Week 3 Follow Up', created_date: '2026-06-01' })], TODAY).cases[0].stage, 'week3')
})
Deno.test('week 2 step -> week2', () => {
  assertEquals(buildGuestPipeline([card({ step_name: 'Week 2', created_date: '2026-06-01' })], TODAY).cases[0].stage, 'week2')
})
// The call step had no branch before, so a card sitting on it fell through to
// 'new', or 'cooled' once old. It is step 1 of their workflow and now has its
// own column, whatever its age.
Deno.test('welcome call step -> called, however old', () => {
  assertEquals(buildGuestPipeline([card({ step_name: 'Welcome Phone Call', created_date: '2026-05-01' })], TODAY).cases[0].stage, 'called')
})
Deno.test('recent welcome call step -> called', () => {
  assertEquals(buildGuestPipeline([card({ step_name: 'Welcome Phone Call', created_date: '2026-07-25' })], TODAY).cases[0].stage, 'called')
})
// ── the Thursday come-back note ────────────────────────────────────────────
// The church texts every guest Monday at 2pm and moves cards to week 2 on
// Tuesday. So Grace sends no welcome; she drafts one come-back note on the
// Thursday after the visit, only for people nobody has seen return.
Deno.test('day 4 (Thursday after a Sunday visit) gets the come-back draft', () => {
  const c = buildGuestPipeline([card({ created_date: '2026-07-23', step_name: 'Week 2' })], TODAY).cases[0]
  assertEquals(c.note, 'Grace drafted a Thursday come-back note, awaiting your approval')
  assertEquals(c.draft?.includes('we would love to see you again'), true)
  assertEquals(c.detail, 'first visit, come-back note drafted, not sent yet')
  assertEquals(c.age, 'this week')
})
Deno.test('day 3 is too early and day 11 is too late for the come-back note', () => {
  assertEquals(buildGuestPipeline([card({ created_date: '2026-07-24' })], TODAY).cases[0].draft, undefined)
  assertEquals(buildGuestPipeline([card({ created_date: '2026-07-16' })], TODAY).cases[0].draft, undefined)
})
Deno.test('week 3 means they came back, so no come-back note', () => {
  assertEquals(buildGuestPipeline([card({ created_date: '2026-07-22', step_name: 'Week 3' })], TODAY).cases[0].draft, undefined)
})
Deno.test('brazilian come-back draft is portuguese and names no gift', () => {
  const c = buildGuestPipeline([card({ campus: 'brazilian', created_date: '2026-07-22', name: 'Acacio Lima' })], TODAY).cases[0]
  assertEquals(c.draft?.startsWith('Acacio, foi muito bom'), true)
  assertEquals(c.draft?.includes('presente'), false)
})
// ── already active ─────────────────────────────────────────────────────────
Deno.test('a child checked in after the visit marks the card already active, no draft', () => {
  const p = buildGuestPipeline([card({ created_date: '2026-07-22', step_name: 'Week 2' })], TODAY, 90, 'Pastor Mark',
    { pp1: { kind: 'kids', date: '2026-07-26', detail: 'Mia checked in at Kids Jul 26' } })
  const c = p.cases[0]
  assertEquals(c.active?.kind, 'kids')
  assertEquals(c.note, 'Already active: Mia checked in at Kids Jul 26. Clear the card.')
  assertEquals(c.draft, undefined)
  assertEquals(p.kpis.english.alreadyActive, 1)
  assertEquals(p.kpis.english.working, 0)
})
Deno.test('old serving activity before the card does not count, recent activity does', () => {
  const stale = buildGuestPipeline([card({ created_date: '2026-06-01', step_name: 'Week 2' })], TODAY, 90, 'Pastor Mark',
    { pp1: { kind: 'serving', date: '2026-01-10', detail: 'served on Ushers Jan 10' } }).cases[0]
  assertEquals(stale.active, undefined)
  const recent = buildGuestPipeline([card({ created_date: '2026-06-01', step_name: 'Week 2' })], TODAY, 90, 'Pastor Mark',
    { pp1: { kind: 'serving', date: '2026-07-12', detail: 'served on Ushers Jul 12' } }).cases[0]
  assertEquals(recent.active?.kind, 'serving')
})
Deno.test('group membership counts as active whatever its date', () => {
  const c = buildGuestPipeline([card({ created_date: '2026-06-01', step_name: 'Week 2' })], TODAY, 90, 'Pastor Mark',
    { pp1: { kind: 'group', date: '', detail: "in Dave Thomas' Men's Group" } }).cases[0]
  assertEquals(c.active?.kind, 'group')
})
Deno.test('a finished card is never marked active', () => {
  const c = buildGuestPipeline([card({ created_date: '2026-06-01', completed_date: '2026-07-01' })], TODAY, 90, 'Pastor Mark',
    { pp1: { kind: 'group', date: '', detail: 'in a group' } }).cases[0]
  assertEquals(c.active, undefined)
})
// ── triage buckets ─────────────────────────────────────────────────────────
Deno.test('buckets: working to six weeks, decision to 90 days, clear after', () => {
  const rows = [
    card({ card_id: 'a', created_date: '2026-07-01', step_name: 'Week 2' }),  // 26 days
    card({ card_id: 'b', created_date: '2026-06-01', step_name: 'Week 2' }),  // 56 days
    card({ card_id: 'c', created_date: '2026-04-28', step_name: 'Week 2' }),  // 90 days
  ]
  const p = buildGuestPipeline(rows, TODAY, 365)
  const by = Object.fromEntries(p.cases.map((c) => [c.cardId, c]))
  assertEquals(by.a.bucket, 'working')
  assertEquals(by.a.note, 'Three weeks with no return. Grace stops here; a personal reach-out or a clear is yours.')
  assertEquals(by.b.bucket, 'decision')
  assertEquals(by.b.note?.startsWith('8 weeks with no return. Reach out once or clear'), true)
  assertEquals(by.c.bucket, 'clear')
  assertEquals(by.c.note?.includes('clear the card'), true)
  assertEquals(p.kpis.english.working, 1)
  assertEquals(p.kpis.english.decision, 1)
  assertEquals(p.kpis.english.clear, 1)
  assertEquals(p.kpis.all.decision, 1)
})
Deno.test('inside three weeks with no activity carries no note', () => {
  assertEquals(buildGuestPipeline([card({ created_date: '2026-07-14', step_name: 'Week 2' })], TODAY).cases[0].note, undefined)
})
Deno.test('id is gp-{card_id}', () => {
  assertEquals(buildGuestPipeline([card({ card_id: '99887' })], TODAY).cases[0].id, 'gp-99887')
})
Deno.test('cardId and person_id carry through to the case', () => {
  const c = buildGuestPipeline([card({ card_id: '99887', person_id: 'pp42' })], TODAY).cases[0]
  assertEquals(c.cardId, '99887')
  assertEquals(c.person_id, 'pp42')
})
Deno.test('kpis and weighted all.completedPct', () => {
  const rows = [
    card({ card_id: 'e1', campus: 'english', completed_date: '2026-07-01', created_date: '2026-06-01' }),
    card({ card_id: 'e2', campus: 'english', created_date: '2026-07-25' }),
    card({ card_id: 'b1', campus: 'brazilian', created_date: '2026-07-20' }),
  ]
  const p = buildGuestPipeline(rows, TODAY)
  assertEquals(p.kpis.english.recentGuests, 2)
  assertEquals(p.kpis.english.stillVisitors, 1)
  assertEquals(p.kpis.english.completedPct, 50)
  assertEquals(p.kpis.brazilian.recentGuests, 1)
  assertEquals(p.kpis.all.recentGuests, 3)
  assertEquals(p.kpis.all.firstTimers4w, 2)
  assertEquals(p.kpis.all.completedPct, 33)
})
// ── active window ──────────────────────────────────────────────────────────
// Retention (how far back we KEEP cards, for the trend) and the worklist (who
// Grace is actually working) are different spans. Widening retention to 24
// months must not inflate "in the pipeline" into a two-year archive.
Deno.test('cases and kpis cover only the active window; monthly still sees everything', () => {
  const rows = [
    card({ card_id: 'recent', created_date: '2026-07-01' }),
    card({ card_id: 'old', created_date: '2025-09-01' }), // inside retention, outside the worklist
  ]
  const p = buildGuestPipeline(rows, TODAY, 90)
  assertEquals(p.cases.map((c) => c.cardId), ['recent'])
  assertEquals(p.kpis.all.recentGuests, 1)
  // The old card still contributes to the trend it belongs to.
  assertEquals(p.monthly.all.find((m) => m.month === '2025-09')!.firstVisits, 1)
})
Deno.test('active window boundary is inclusive', () => {
  const on = buildGuestPipeline([card({ card_id: 'on', created_date: '2026-04-28' })], TODAY, 90)
  const off = buildGuestPipeline([card({ card_id: 'off', created_date: '2026-04-27' })], TODAY, 90)
  assertEquals(on.cases.length, 1)
  assertEquals(off.cases.length, 0)
})

// ── the queue must not contradict the board ────────────────────────────────
Deno.test('a card with a pending draft never also claims a send happened', () => {
  // Week-2 step, inside the come-back window: the pending draft wins over the
  // step wording, so "awaiting your approval" never sits beside a claimed send.
  const c = buildGuestPipeline([card({ step_name: 'Week 2', created_date: '2026-07-23' })], TODAY).cases[0]
  assertEquals(typeof c.draft, 'string')
  assertEquals(c.detail.includes('sent'), true)
  assertEquals(c.detail, 'first visit, come-back note drafted, not sent yet')
})
// The detail must describe the CHURCH'S step, never a send. Their week-2 step is
// a bag handed to someone who came back; Grace has sent nothing (test mode), and
// saying "welcome sent" credited Grace with the Starting Point team's work.
Deno.test('a week-2 card describes the step, and never claims a send', () => {
  const c = buildGuestPipeline([card({ step_name: 'Week 2', created_date: '2026-06-01' })], TODAY).cases[0]
  assertEquals(c.draft, undefined)
  assertEquals(c.detail, 'week-2 step, the bag')
  assertEquals(c.detail.includes('sent'), false)
  assertEquals(c.owner, 'Starting Point team')
})
Deno.test('brazilian steps do not claim the english gifts', () => {
  const c = buildGuestPipeline([card({ campus: 'brazilian', step_name: 'Week 2', created_date: '2026-06-01' })], TODAY).cases[0]
  assertEquals(c.detail, 'week-2 step')
})

// ── monthly pulse ──────────────────────────────────────────────────────────
// Flow metrics, deliberately separate from the cohort KPIs above: a card
// COMPLETED in July was almost never CREATED in July, so these two series must
// never be divided into each other. See the note on buildMonthly.
Deno.test('monthly counts first visits by created month and completions by completed month', () => {
  const rows = [
    card({ card_id: 'a', created_date: '2026-05-04' }),
    card({ card_id: 'b', created_date: '2026-05-19' }),
    // Created in May, completed in July: must land in May's firstVisits and
    // July's completedSP, never both in one month.
    card({ card_id: 'c', created_date: '2026-05-20', completed_date: '2026-07-02' }),
    card({ card_id: 'd', created_date: '2026-07-10' }),
  ]
  const m = buildGuestPipeline(rows, TODAY).monthly.all
  const may = m.find((x) => x.month === '2026-05')!
  const jul = m.find((x) => x.month === '2026-07')!
  assertEquals(may.firstVisits, 3)
  assertEquals(may.completedSP, 0)
  assertEquals(jul.firstVisits, 1)
  assertEquals(jul.completedSP, 1)
})
Deno.test('monthly series is gap-free: empty months appear as zero', () => {
  const rows = [card({ card_id: 'a', created_date: '2026-04-02' }), card({ card_id: 'b', created_date: '2026-07-02' })]
  const m = buildGuestPipeline(rows, TODAY).monthly.all
  assertEquals(m.map((x) => x.month), ['2026-04', '2026-05', '2026-06', '2026-07'])
  assertEquals(m.map((x) => x.firstVisits), [1, 0, 0, 1])
})
Deno.test('the current month is flagged partial so a part-month dip is not read as a fall', () => {
  const m = buildGuestPipeline([card({ created_date: '2026-06-02' })], TODAY).monthly.all
  assertEquals(m[m.length - 1].month, '2026-07')
  assertEquals(m[m.length - 1].partial, true)
  assertEquals(m.slice(0, -1).every((x) => x.partial === false), true)
})
Deno.test('monthly scopes by campus and all is the sum', () => {
  const rows = [
    card({ card_id: 'e1', campus: 'english', created_date: '2026-07-01' }),
    card({ card_id: 'b1', campus: 'brazilian', created_date: '2026-07-02' }),
    card({ card_id: 'b2', campus: 'brazilian', created_date: '2026-07-03' }),
  ]
  const p = buildGuestPipeline(rows, TODAY)
  assertEquals(p.monthly.english.at(-1)!.firstVisits, 1)
  assertEquals(p.monthly.brazilian.at(-1)!.firstVisits, 2)
  assertEquals(p.monthly.all.at(-1)!.firstVisits, 3)
})
Deno.test('no rows yields an empty monthly series rather than throwing', () => {
  assertEquals(buildGuestPipeline([], TODAY).monthly.all, [])
})

Deno.test('english cases ordered before brazilian, newest first', () => {
  const rows = [
    card({ card_id: 'b1', campus: 'brazilian', created_date: '2026-07-10' }),
    card({ card_id: 'e_old', campus: 'english', created_date: '2026-06-01' }),
    card({ card_id: 'e_new', campus: 'english', created_date: '2026-07-20' }),
  ]
  assertEquals(buildGuestPipeline(rows, TODAY).cases.map((c) => c.id), ['gp-e_new', 'gp-e_old', 'gp-b1'])
})
