import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildDuplicates, type PeopleRow, type ServingFlag } from './duplicates.ts'

const CFG = { keepTopClusters: 120, minNameLen: 3 }
function person(over: Partial<PeopleRow>): PeopleRow {
  return { person_id: 'p1', first: 'Ana', last: 'Diaz', name: 'Ana Diaz', emails: [], phones: [], membership: 'none', created: '2020-01-01', ...over }
}
const noDates = new Map<string, string[]>()
const noServing = new Map<string, ServingFlag>()
const noBurnout = new Set<string>()

Deno.test('clusters only names with 2+ members', () => {
  const r = buildDuplicates([person({ person_id: 'a' }), person({ person_id: 'b' }), person({ person_id: 'c', first: 'Bob', last: 'Kent', name: 'Bob Kent' })], noDates, noServing, noBurnout, CFG)
  assertEquals(Object.keys(r.groups), ['ana diaz'])
  assertEquals(r.groups['ana diaz'].count, 2)
})

Deno.test('shared email => high confidence, else medium', () => {
  const shared = buildDuplicates([person({ person_id: 'a', emails: ['x@y.com'] }), person({ person_id: 'b', emails: ['x@y.com'] })], noDates, noServing, noBurnout, CFG)
  assertEquals(shared.groups['ana diaz'].confidence, 'high')
  assertEquals(shared.groups['ana diaz'].sharedEmail, true)
  const distinct = buildDuplicates([person({ person_id: 'a', emails: ['x@y.com'] }), person({ person_id: 'b', emails: ['z@y.com'] })], noDates, noServing, noBurnout, CFG)
  assertEquals(distinct.groups['ana diaz'].confidence, 'medium')
})

Deno.test('shared phone => high confidence', () => {
  const r = buildDuplicates([person({ person_id: 'a', phones: ['5551234567'] }), person({ person_id: 'b', phones: ['5551234567'] })], noDates, noServing, noBurnout, CFG)
  assertEquals(r.groups['ana diaz'].confidence, 'high')
  assertEquals(r.groups['ana diaz'].sharedPhone, true)
})

Deno.test('skips names shorter than minNameLen', () => {
  const r = buildDuplicates([person({ person_id: 'a', first: 'A', last: '', name: 'A' }), person({ person_id: 'b', first: 'A', last: '', name: 'A' })], noDates, noServing, noBurnout, CFG)
  assertEquals(Object.keys(r.groups).length, 0)
})

Deno.test('stats count all groups; profiles enriched + sorted by checkins desc', () => {
  const dates = new Map<string, string[]>([['a', ['2026-06-01', '2026-06-08']], ['b', []]])
  const r = buildDuplicates([person({ person_id: 'a', emails: ['x@y.com'] }), person({ person_id: 'b', emails: ['x@y.com'] })], dates, noServing, noBurnout, CFG)
  assertEquals(r.stats.clusters, 1)
  assertEquals(r.stats.highConfidence, 1)
  assertEquals(r.stats.extraProfiles, 1)
  assertEquals(r.stats.scanned, 2)
  assertEquals(r.groups['ana diaz'].profiles[0].id, 'a')
  assertEquals(r.groups['ana diaz'].profiles[0].checkins, 2)
  assertEquals(r.groups['ana diaz'].profiles[0].lastServed, '2026-06-08')
})

Deno.test('reconcile null when not on a flag', () => {
  const r = buildDuplicates([person({ person_id: 'a', emails: ['x@y.com'] }), person({ person_id: 'b', emails: ['x@y.com'] })], noDates, noServing, noBurnout, CFG)
  assertEquals(r.groups['ana diaz'].reconcile, null)
})

Deno.test('reconcile stopped-serving: more recent other profile => review', () => {
  const dates = new Map<string, string[]>([['a', ['2026-07-01']], ['b', []]])
  const serving = new Map<string, ServingFlag>([['ana diaz', { lastServed: '2026-06-01' }]])
  const r = buildDuplicates([person({ person_id: 'a' }), person({ person_id: 'b' })], dates, serving, noBurnout, CFG)
  assertEquals(r.groups['ana diaz'].reconcile?.verdict, 'review')
  assertEquals(r.groups['ana diaz'].reconcile?.flag, 'Stopped serving')
})

Deno.test('reconcile stopped-serving: no more-recent profile => confirmed', () => {
  const dates = new Map<string, string[]>([['a', ['2026-06-01']], ['b', []]])
  const serving = new Map<string, ServingFlag>([['ana diaz', { lastServed: '2026-06-01' }]])
  const r = buildDuplicates([person({ person_id: 'a' }), person({ person_id: 'b' })], dates, serving, noBurnout, CFG)
  assertEquals(r.groups['ana diaz'].reconcile?.verdict, 'confirmed')
  assertEquals(r.groups['ana diaz'].reconcile?.mergeTargets, ['b'])
})

Deno.test('reconcile burnout: double-counted dates => review', () => {
  const dates = new Map<string, string[]>([['a', ['2026-06-01', '2026-06-08']], ['b', ['2026-06-01', '2026-06-08']]])
  const burnout = new Set<string>(['ana diaz'])
  const r = buildDuplicates([person({ person_id: 'a' }), person({ person_id: 'b' })], dates, noServing, burnout, CFG)
  assertEquals(r.groups['ana diaz'].reconcile?.verdict, 'review')
  assertEquals(r.groups['ana diaz'].reconcile?.flag, 'Burnout risk')
})

Deno.test('reconcile burnout: distinct dates => confirmed', () => {
  const dates = new Map<string, string[]>([['a', ['2026-06-01']], ['b', ['2026-06-08']]])
  const burnout = new Set<string>(['ana diaz'])
  const r = buildDuplicates([person({ person_id: 'a' }), person({ person_id: 'b' })], dates, noServing, burnout, CFG)
  assertEquals(r.groups['ana diaz'].reconcile?.verdict, 'confirmed')
})
