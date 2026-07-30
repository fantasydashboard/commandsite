import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { decideSend, buildRfc822, base64UrlEncode, type SendDecisionInput } from './decide.ts'

function base(over: Partial<SendDecisionInput> = {}): SendDecisionInput {
  return {
    enabled: true, testMode: false, alreadySent: false, suppressed: false, hasRecipient: true,
    sentLastHour: 0, sentLastDay: 0, ratePerHour: 50, ratePerDay: 200,
    nowHourLocal: 10, quietStartHour: 8, quietEndHour: 20, ...over,
  }
}

Deno.test('disabled => blocked', () => { assertEquals(decideSend(base({ enabled: false })).action, 'blocked') })
Deno.test('already sent => already_sent', () => { assertEquals(decideSend(base({ alreadySent: true })).action, 'already_sent') })
Deno.test('suppressed => suppressed', () => { assertEquals(decideSend(base({ suppressed: true })).action, 'suppressed') })
Deno.test('no recipient => blocked', () => { assertEquals(decideSend(base({ hasRecipient: false })).action, 'blocked') })
Deno.test('over hourly rate => rate_limited', () => { assertEquals(decideSend(base({ sentLastHour: 50 })).action, 'rate_limited') })
Deno.test('over daily rate => rate_limited', () => { assertEquals(decideSend(base({ sentLastDay: 200 })).action, 'rate_limited') })
Deno.test('before quiet start => deferred', () => { assertEquals(decideSend(base({ nowHourLocal: 7 })).action, 'deferred_quiet_hours') })
Deno.test('at quiet end (exclusive) => deferred', () => { assertEquals(decideSend(base({ nowHourLocal: 20 })).action, 'deferred_quiet_hours') })
Deno.test('quiet start is inclusive', () => { assertEquals(decideSend(base({ nowHourLocal: 8 })).action, 'send') })
Deno.test('test mode => redirect_to_test', () => {
  const d = decideSend(base({ testMode: true }))
  assertEquals(d.action, 'redirect_to_test'); assertEquals(d.recipient, 'test')
})
Deno.test('all clear => send real', () => {
  const d = decideSend(base()); assertEquals(d.action, 'send'); assertEquals(d.recipient, 'real')
})
Deno.test('precedence: disabled beats everything', () => {
  assertEquals(decideSend(base({ enabled: false, testMode: true, suppressed: true })).action, 'blocked')
})
Deno.test('rfc822 build + base64url', () => {
  const raw = buildRfc822({ from: 'a@b.com', to: 'c@d.com', subject: 'Hi', body: 'Hello there' })
  assertEquals(raw.includes('From: a@b.com'), true)
  assertEquals(raw.includes('To: c@d.com'), true)
  assertEquals(raw.includes('Hello there'), true)
  const enc = base64UrlEncode('x+y/z')
  assertEquals(enc.includes('+'), false); assertEquals(enc.includes('/'), false); assertEquals(enc.includes('='), false)
})
