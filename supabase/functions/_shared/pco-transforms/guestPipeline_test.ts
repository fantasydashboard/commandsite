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
Deno.test('english cases ordered before brazilian, newest first', () => {
  const rows = [
    card({ card_id: 'b1', campus: 'brazilian', created_date: '2026-07-10' }),
    card({ card_id: 'e_old', campus: 'english', created_date: '2026-06-01' }),
    card({ card_id: 'e_new', campus: 'english', created_date: '2026-07-20' }),
  ]
  assertEquals(buildGuestPipeline(rows, TODAY).cases.map((c) => c.id), ['gp-e_new', 'gp-e_old', 'gp-b1'])
})
