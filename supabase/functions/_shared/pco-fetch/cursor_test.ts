import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { makeDeadline } from './cursor.ts'

Deno.test('makeDeadline flips true after the budget elapses', async () => {
  const over = makeDeadline(0) // 0-second budget => immediately over
  assertEquals(over(), true)
  const plenty = makeDeadline(60)
  assertEquals(plenty(), false)
})
