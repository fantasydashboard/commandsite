// Pure guardrail decision for grace-send. No IO: the orchestrator gathers state
// (settings, log counts, suppression, resolved recipient) and calls decideSend.
export type SendAction =
  | 'send' | 'redirect_to_test' | 'suppressed' | 'rate_limited'
  | 'deferred_quiet_hours' | 'blocked' | 'already_sent'

export interface SendDecisionInput {
  enabled: boolean
  testMode: boolean
  alreadySent: boolean
  suppressed: boolean
  hasRecipient: boolean
  sentLastHour: number
  sentLastDay: number
  ratePerHour: number
  ratePerDay: number
  nowHourLocal: number   // 0-23 in the church's timezone
  quietStartHour: number // inclusive
  quietEndHour: number   // exclusive
}
export interface SendDecision { action: SendAction; recipient: 'real' | 'test' | null; reason: string }

function withinWindow(h: number, start: number, end: number): boolean {
  return h >= start && h < end
}

export function decideSend(i: SendDecisionInput): SendDecision {
  if (!i.enabled) return { action: 'blocked', recipient: null, reason: 'Sending is off for this church.' }
  if (i.alreadySent) return { action: 'already_sent', recipient: null, reason: 'This message was already sent.' }
  if (i.suppressed) return { action: 'suppressed', recipient: null, reason: 'Recipient is on the do-not-contact list.' }
  if (!i.hasRecipient) return { action: 'blocked', recipient: null, reason: 'No email address for this recipient.' }
  if (i.sentLastHour >= i.ratePerHour || i.sentLastDay >= i.ratePerDay) {
    return { action: 'rate_limited', recipient: null, reason: 'Sending rate limit reached; try again later.' }
  }
  if (!withinWindow(i.nowHourLocal, i.quietStartHour, i.quietEndHour)) {
    return { action: 'deferred_quiet_hours', recipient: null, reason: 'Outside the church sending hours.' }
  }
  if (i.testMode) return { action: 'redirect_to_test', recipient: 'test', reason: 'Test mode: redirected to the test address.' }
  return { action: 'send', recipient: 'real', reason: 'ok' }
}

// RFC-2822 message builder + base64url (ported from gmail-send). Subject is
// UTF-8/base64 encoded so unicode + accents (Portuguese welcomes) survive.
export function base64UrlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function buildRfc822(m: { from: string; to: string; subject: string; body: string }): string {
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(m.subject)))}?=`
  return [
    `From: ${m.from}`,
    `To: ${m.to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    m.body,
  ].join('\r\n')
}
