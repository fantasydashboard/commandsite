/**
 * Cornerstone — Care queue. Auto-populated from at-risk household
 * flags + recent life events + active prayer requests. Each case
 * carries an AI-drafted outreach message ready for pastor approval.
 *
 * The point: replace the mental overhead of "who am I forgetting?"
 * with a single screen the pastor can work each morning.
 */

export type CareKind =
  | 'at_risk_check_in'
  | 'life_event_followup'
  | 'hospital_visit'
  | 'counseling_request'
  | 'prayer_request'
  | 'meal_train'
  | 'grief_support'
  | 'returning_welcome'

export type Urgency = 'urgent' | 'this_week' | 'soon'
export type CareStatus = 'open' | 'in_progress' | 'awaiting_response' | 'resolved'

export interface CareCase {
  id: string
  household_id: string
  household_name: string
  kind: CareKind
  urgency: Urgency
  status: CareStatus
  /** Who's assigned — defaults to "Pastor Mark" but can be care team / small-group leader */
  assigned_to: string
  opened_at: string
  /** Days the case has been open without resolution */
  days_open: number
  /** Why this case exists — surfaced flags / life event / prayer request */
  trigger_summary: string
  /** Recommended channel for the next touch */
  channel: 'sms' | 'email' | 'call' | 'in_person'
  /** AI-drafted outreach message, pastoral tone */
  ai_drafted_message: string
  /** Free-text from the pastor / care team */
  pastoral_note?: string
  /** When the team last reached out for this case */
  last_touch_at?: string
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const KIND_META: Record<CareKind, { label: string; icon: string; color: string }> = {
  at_risk_check_in:    { label: 'At-risk check-in',    icon: '⚠',  color: '#EF4444' },
  life_event_followup: { label: 'Life event',          icon: '🎉', color: '#A855F7' },
  hospital_visit:      { label: 'Hospital visit',      icon: '🏥', color: '#0EA5E9' },
  counseling_request:  { label: 'Counseling',          icon: '💭', color: 'rgb(var(--color-brand))' },
  prayer_request:      { label: 'Prayer request',      icon: '🙏', color: '#F59E0B' },
  meal_train:          { label: 'Meal train',          icon: '🍲', color: '#10B981' },
  grief_support:       { label: 'Grief support',       icon: '💔', color: '#64748B' },
  returning_welcome:   { label: 'Returning welcome',   icon: '🏡', color: '#10B981' },
}

export const URGENCY_META: Record<Urgency, { label: string; color: string }> = {
  urgent:    { label: 'Urgent',     color: '#EF4444' },
  this_week: { label: 'This Week',  color: '#F59E0B' },
  soon:      { label: 'Soon',       color: '#94A3B8' },
}

export const STATUS_META: Record<CareStatus, { label: string; color: string }> = {
  open:               { label: 'Open',                 color: '#94A3B8' },
  in_progress:        { label: 'In progress',          color: 'rgb(var(--color-accent))' },
  awaiting_response:  { label: 'Awaiting response',    color: '#A855F7' },
  resolved:           { label: 'Resolved',             color: '#10B981' },
}

export const CHANNEL_LABEL: Record<CareCase['channel'], string> = {
  sms: 'Text', email: 'Email', call: 'Phone call', in_person: 'In-person',
}

export const careCases: CareCase[] = [
  // ── URGENT
  {
    id: 'c-001',
    household_id: 'h-011',
    household_name: 'The Foster Family',
    kind: 'grief_support',
    urgency: 'urgent',
    status: 'in_progress',
    assigned_to: 'Pastor Mark',
    opened_at: ago(0, 12),
    days_open: 1,
    trigger_summary: `James's father passed away Sunday. Funeral 10 AM Friday at Woodlawn. Family is well-loved at Cornerstone.`,
    channel: 'in_person',
    ai_drafted_message: `[Talking points for the funeral home visit Wednesday afternoon]\n\n• Lead with presence, not words. Sit with them, don't try to fix.\n• Acknowledge the funeral plan but don't push details — Amanda has her hands full.\n• Concrete asks (write down + commit before leaving):\n  — Meal train for next 2 weeks (coordinate via small group sg-005)\n  — Casket flowers from Cornerstone (~$200 from benevolence fund)\n  — Cornerstone presence at Friday service (encourage worship team + sg-005 to attend)\n• Soft open for the next month: "How can we keep showing up?"\n• Schedule 30-day follow-up before leaving.`,
    pastoral_note: 'Visiting Wednesday 2 PM. Casey from care team coming with me.',
    last_touch_at: ago(0, 14),
  },
  {
    id: 'c-002',
    household_id: 'h-009',
    household_name: 'The Sullivan Family',
    kind: 'at_risk_check_in',
    urgency: 'urgent',
    status: 'open',
    assigned_to: 'Pastor Mark',
    opened_at: ago(2),
    days_open: 2,
    trigger_summary: `4 weeks no kids attendance · Recurring gift cancelled in Feb · Casey stepped off hospitality. James hasn\'t responded to last 2 texts. Time to call, not text.`,
    channel: 'call',
    ai_drafted_message: `[Phone-call talking points — 5-10 min, low pressure]\n\nOpen with:\n"Hey James — Mark from Cornerstone. Don\'t want to make this weird, just been thinking about your family. Got a couple minutes?"\n\nIf they engage:\n• "We\'ve missed seeing the kids in their classes. Anything going on we can be supporting you in?"\n• Listen 80% of the call. Don\'t lead with church-attendance — lead with curiosity about life.\n• If they bring up a frustration with Cornerstone, acknowledge first, fix never.\n• Close with: "No pressure on Sunday. But I\'d love to grab coffee with you when it makes sense."\n\nIf they don\'t pick up:\n• Voicemail: "Hey James — Mark Cornerstone. No urgency, just wanted to check in. Call back when it\'s a good time."\n• Then text: "Just left a voicemail — no rush, just wanted to say hi. We\'re here when y\'all are ready."`,
    pastoral_note: 'Last 2 texts unanswered. Going phone-first — the pattern of silence usually means hurt or just life-overwhelm. Don\'t guess which.',
    last_touch_at: ago(18),
  },

  // ── THIS WEEK
  {
    id: 'c-003',
    household_id: 'h-010',
    household_name: 'The Ellison Family',
    kind: 'meal_train',
    urgency: 'this_week',
    status: 'awaiting_response',
    assigned_to: 'Care Team — Stephanie',
    opened_at: ago(2),
    days_open: 2,
    trigger_summary: `Baby boy Ellison born Tuesday. Both healthy. Standard 2-week meal train + baby dedication scheduling.`,
    channel: 'email',
    ai_drafted_message: `Subject: Welcoming Baby Ellison — meals + a dedication date when you\'re ready\n\nWes + Tara,\n\nFirst — congratulations a thousand times over. The whole Cornerstone family is rejoicing with you this week.\n\nA few small practical things:\n\n• Meal train: I\'m setting one up through your small group (Jess Bowman is captaining it). 2 weeks of dinners, dropped at the porch, no need to host anyone. Reply to this with any allergies / dietary notes + we\'ll route from there.\n\n• Baby dedication: When you\'re ready (most folks land on 6-8 weeks), I\'d love to do that on a Sunday. No rush — let me know when it feels right and I\'ll save the date.\n\n• Visits: We\'ll respect whatever you need. Some families want company in week 1, some want quiet through week 4. Whatever you want, we\'ll match.\n\nSleep when you can. Welcome to the chaos and the joy.\n\n— Pastor Mark`,
    pastoral_note: 'Tara\'s mom is flying in Sunday for 2 weeks — so meals can probably start in week 3 not week 1.',
    last_touch_at: ago(2),
  },
  {
    id: 'c-004',
    household_id: 'h-008',
    household_name: 'The Whitaker Family',
    kind: 'at_risk_check_in',
    urgency: 'this_week',
    status: 'open',
    assigned_to: 'Pastor Mark',
    opened_at: ago(3),
    days_open: 3,
    trigger_summary: `Bowen + Reese (3 + 5) missed 3 of last 4 Sundays · Recurring gift cancelled February without comment · Brett still ushers.`,
    channel: 'sms',
    ai_drafted_message: `Hey Hannah — Mark from Cornerstone. Missed the kiddos the last few Sundays. Everything ok with y\'all? Not poking, just wanted to say hi + see if anything we can pray about or be useful in.`,
    pastoral_note: 'Hannah always replies fast to texts. Brett showing up to usher = family hasn\'t left, just drifting. Soft text first, then a follow-up over coffee if she opens the door.',
    last_touch_at: ago(74),
  },
  {
    id: 'c-005',
    household_id: 'h-007',
    household_name: 'The Castellanos Family',
    kind: 'returning_welcome',
    urgency: 'this_week',
    status: 'open',
    assigned_to: 'Care Team — David',
    opened_at: ago(4),
    days_open: 4,
    trigger_summary: `Stepped off worship team in January after their second baby. Andre still attends Sunday — could plug into something low-commitment.`,
    channel: 'in_person',
    ai_drafted_message: `[Sunday after-service ask, in-person]\n\nFind Andre in the lobby Sunday. Don\'t lead with serving:\n\n• "How\'s little Luna sleeping these days?"\n• "Y\'all surviving the baby chaos?"\n• Then, only if natural: "Hey — when y\'all are ready, prayer team meets every other Tuesday for 45 min and would love to have you. No pressure if it\'s not the season — just keeping the door open."\n\nGoal: signal that we still see them, with zero pressure to perform serving.`,
    pastoral_note: 'Don\'t push them back to worship team — that\'s a 5-hour Sunday commitment they can\'t do with a 1yo. Prayer team is the lower-friction re-entry.',
  },

  // ── SOON
  {
    id: 'c-006',
    household_id: 'h-012',
    household_name: 'The Reyes Family',
    kind: 'returning_welcome',
    urgency: 'soon',
    status: 'in_progress',
    assigned_to: 'Pastor Mark',
    opened_at: ago(8),
    days_open: 8,
    trigger_summary: `Maria + kids back the last 2 Sundays after a 4-month gap. Single mom, life got hard.`,
    channel: 'in_person',
    ai_drafted_message: `[Sunday greeting — keep it brief + warm]\n\nFind Maria after second service. Goal is to be SEEN without making her feel scrutinized:\n\n• "Maria — so glad to see you and the kids. Sofia mentioned Mateo has a new soccer thing?"\n• Don\'t mention the gap. Don\'t mention serving or small groups.\n• If she opens up about life: listen, ask one follow-up question, don\'t fix.\n• Close with: "We\'re glad you\'re here. No pressure to do anything else."`,
    pastoral_note: 'Patience here. She\'s not ready for "next steps." Just be glad she\'s back.',
    last_touch_at: ago(2),
  },
  {
    id: 'c-007',
    household_id: 'h-005',
    household_name: 'The Pham Family',
    kind: 'prayer_request',
    urgency: 'soon',
    status: 'open',
    assigned_to: 'Prayer Team',
    opened_at: ago(6),
    days_open: 6,
    trigger_summary: `Daniel\'s mom in California recently diagnosed — undergoing treatment. Family asking for prayer + practical wisdom on long-distance care.`,
    channel: 'email',
    ai_drafted_message: `Subject: Praying for your mom + your family\n\nDaniel + Mia,\n\nPrayer team got your note about Daniel\'s mom — we\'re praying daily through this stretch. Specifically: clarity on the treatment plan, peace for her, and patience for the long-distance dance you\'re doing as a family.\n\nA few things we can offer:\n\n• Continued prayer (every Tuesday + on demand if anything changes — just text the team)\n• If you need to fly out unexpectedly, we have a small benevolence pot for travel. Don\'t hesitate to ask.\n• When you\'re back from a trip and tired, the small group has dinners covered.\n\nLove you all.\n\n— Pastor Mark + the Prayer Team`,
    pastoral_note: 'Mia mentioned this in her small group last Wednesday. Coordinated with Jenny Holloway (prayer team).',
    last_touch_at: ago(3),
  },
  {
    id: 'c-008',
    household_id: 'h-006',
    household_name: 'The Téllez Family',
    kind: 'counseling_request',
    urgency: 'soon',
    status: 'open',
    assigned_to: 'Pastor Mark',
    opened_at: ago(11),
    days_open: 11,
    trigger_summary: `Ramón asked after Discover Cornerstone about referrals for marriage counseling — they want a Christian counselor with experience in cross-cultural marriages.`,
    channel: 'email',
    ai_drafted_message: `Subject: Counselor referrals for you and Sofia\n\nRamón,\n\nGreat to grab coffee Tuesday — appreciated your honesty.\n\nThree referrals (in order of fit, given what you described):\n\n1. Dr. Elena Marquez — bilingual, specializes in cross-cultural marriages, sliding scale. Office in Lake Mary. (407) 555-9023\n2. Restoration Counseling Group — Christian-rooted, multi-counselor practice. Their counselor Pablo has a similar background to yours. (407) 555-7811\n3. Dr. Jonathan Wei — solo practice, more academic style. Best for couples who want structured exercises between sessions. (407) 555-2440\n\nA few notes:\n• Insurance — Restoration takes most plans, the others are cash-pay. We have benevolence support if cost is a barrier, no questions asked.\n• Confidentiality — none of these counselors share with the church. This stays between you, Sofia, and them.\n• My door is also open if you ever just want to process out loud. No charge, no agenda.\n\nPraying for you both.\n\n— Pastor Mark`,
    pastoral_note: 'Ramón asked privately after Discover Cornerstone. Sofia doesn\'t know yet — Ramón wants to bring up the referral to her with the list already in hand.',
  },
]

export interface CareStats {
  open_cases: number
  urgent_cases: number
  in_progress: number
  awaiting_response: number
  resolved_30d: number
  /** AI-drafted messages waiting for pastor approval */
  drafts_pending: number
  /** Cases by source — surfaced from at-risk flags vs life events vs requests */
  from_flags: number
  from_life_events: number
  from_requests: number
}

export function careStats(): CareStats {
  const open = careCases.filter((c) => c.status !== 'resolved').length
  const urgent = careCases.filter((c) => c.urgency === 'urgent' && c.status !== 'resolved').length
  return {
    open_cases: open,
    urgent_cases: urgent,
    in_progress: careCases.filter((c) => c.status === 'in_progress').length,
    awaiting_response: careCases.filter((c) => c.status === 'awaiting_response').length,
    resolved_30d: 14,  // demo placeholder
    drafts_pending: careCases.filter((c) => c.status === 'open').length,
    from_flags: careCases.filter((c) => c.kind === 'at_risk_check_in').length,
    from_life_events: careCases.filter((c) =>
      c.kind === 'life_event_followup' || c.kind === 'meal_train' ||
      c.kind === 'grief_support' || c.kind === 'hospital_visit',
    ).length,
    from_requests: careCases.filter((c) =>
      c.kind === 'prayer_request' || c.kind === 'counseling_request',
    ).length,
  }
}
