import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildGuestPipeline, type GuestCardRow } from './guestPipeline.ts'

const TODAY = '2026-07-27'
function card(over: Partial<GuestCardRow>): GuestCardRow {
  return { card_id: 'c1', campus: 'english', name: 'Jane Doe', created_date: '2026-07-25', completed_date: null, step_name: 'Welcome Phone Call', person_id: 'pp1', ...over }
}

Deno.test('completed card -> belongs', () => {
  assertEquals(buildGuestPipeline([card({ completed_date: '2026-07-20' })], TODAY).cases[0].stage, 'belongs')
})
Deno.test('week 3 step -> connecting', () => {
  assertEquals(buildGuestPipeline([card({ step_name: 'Week 3 Follow Up', created_date: '2026-06-01' })], TODAY).cases[0].stage, 'connecting')
})
Deno.test('week 2 step -> welcomed', () => {
  assertEquals(buildGuestPipeline([card({ step_name: 'Week 2', created_date: '2026-06-01' })], TODAY).cases[0].stage, 'welcomed')
})
Deno.test('old unknown step -> cooled', () => {
  assertEquals(buildGuestPipeline([card({ step_name: 'Welcome Phone Call', created_date: '2026-05-01' })], TODAY).cases[0].stage, 'cooled')
})
Deno.test('recent unknown step -> new', () => {
  assertEquals(buildGuestPipeline([card({ step_name: 'Welcome Phone Call', created_date: '2026-07-25' })], TODAY).cases[0].stage, 'new')
})
Deno.test('first visit within 7 days gets a draft + note + this week', () => {
  const c = buildGuestPipeline([card({ created_date: '2026-07-24' })], TODAY).cases[0]
  assertEquals(c.note, 'Grace drafted a welcome, awaiting your approval')
  assertEquals(typeof c.draft, 'string')
  assertEquals(c.age, 'this week')
})
Deno.test('brazilian draft is portuguese', () => {
  const c = buildGuestPipeline([card({ campus: 'brazilian', created_date: '2026-07-24', name: 'Acacio Lima' })], TODAY).cases[0]
  assertEquals(c.draft?.startsWith('Acacio, foi uma alegria'), true)
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
Deno.test('a card with a pending draft never also claims the welcome was sent', () => {
  // Week-2 step (stage 'welcomed') but created inside the draft window, which
  // previously rendered "welcome sent" and "awaiting your approval" together.
  const c = buildGuestPipeline([card({ step_name: 'Week 2', created_date: '2026-07-24' })], TODAY).cases[0]
  assertEquals(typeof c.draft, 'string')
  assertEquals(c.detail.includes('welcome sent'), false)
  assertEquals(c.detail, 'first visit · welcome drafted, not sent yet')
})
Deno.test('a welcomed card with no pending draft keeps the sent wording', () => {
  const c = buildGuestPipeline([card({ step_name: 'Week 2', created_date: '2026-06-01' })], TODAY).cases[0]
  assertEquals(c.draft, undefined)
  assertEquals(c.detail, 'welcome sent · in the week-2 follow-up')
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
