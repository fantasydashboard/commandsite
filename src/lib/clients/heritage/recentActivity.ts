/**
 * Heritage Bath & Kitchen Co. — recent activity feed for the Overview tab.
 *
 * Mirrors Apex's pattern: a chronological feed of Ada's events colored by
 * role + kind. Operator can see the rhythm of the week at a glance.
 */
import type { RecentActivityEvent } from './types'

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString()
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString()
}

// Activity feed reads as WINS not server logs. Each event names the human
// outcome (caught, rescued, booked, drafted) and where relevant the dollar
// value or the would-have-lost framing. This is the difference between
// "admin software" and "cheat code that did your job."
export const recentActivity: RecentActivityEvent[] = [
  {
    id: 'a-001',
    at: minutesAgo(18),
    text: 'Rescued the Rodriguez Estate quote ($54K master bath) before it went cold. Day-7 nudge drafted in your voice, awaiting your approval.',
    kind: 'quote',
    role: 'quote_followup',
  },
  {
    id: 'a-002',
    at: minutesAgo(42),
    text: 'Caught a 9:14am call from Patricia Mendoza (kitchen full reno). Booked her for Tue 2pm. Without Ada this would have hit voicemail.',
    kind: 'call',
    role: 'front_desk',
  },
  {
    id: 'a-003',
    at: hoursAgo(2),
    text: 'Marcus & Tia Bell just posted a 5★ review. Drafted a referral ask in your voice ($500 off for both sides). Your green light needed.',
    kind: 'reactivation',
    role: 'referral_engine',
  },
  {
    id: 'a-004',
    at: hoursAgo(3),
    text: 'New 5★ from Marcus B. on Google: "Marc and team made our kitchen the heart of the home." Already replied in your voice.',
    kind: 'review',
    role: 'review_engine',
  },
  {
    id: 'a-005',
    at: hoursAgo(5),
    text: 'James & Rebecca Liu (accessible bath, $33K) hadn\'t replied in 7 days. Sent the day-7 check-in in your voice while you were at the Westshore site visit.',
    kind: 'quote',
    role: 'quote_followup',
  },
  {
    id: 'a-006',
    at: hoursAgo(7),
    text: 'Caught a 6:43pm Local Services Ads lead from Tampa about a bath remodel timeline. Booked her for Thu 10am while you were at dinner.',
    kind: 'call',
    role: 'front_desk',
  },
  {
    id: 'a-007',
    at: hoursAgo(20),
    text: 'Sent David Hernandez (day 14, $24K guest bath) the escalation nudge while you were on the Stephanie Voss measure visit. Tone tuned to "soft urgency", highest-converting at this stage.',
    kind: 'quote',
    role: 'quote_followup',
  },
  {
    id: 'a-008',
    at: hoursAgo(22),
    text: 'Sent the spring kitchen trends newsletter to 842 past customers while you were finishing up the Bell kitchen punchlist. 38% open rate so far (industry: 18%). 2 inbound replies already.',
    kind: 'reactivation',
    role: 'email_marketing',
  },
  {
    id: 'a-009',
    at: hoursAgo(27),
    text: 'Pat Rosenbaum (referred by Joel & Marie Underwood) booked a consultation. Estimated job: $45K. Cost to acquire: $0.',
    kind: 'reactivation',
    role: 'referral_engine',
  },
  {
    id: 'a-010',
    at: hoursAgo(36),
    text: 'Heather Cole (bath remodel 18 months ago) replied to the kitchen reactivation: "yeah, we\'ve been thinking about it." Drafted follow-up ready.',
    kind: 'reactivation',
    role: 'reactivation',
  },
  {
    id: 'a-011',
    at: hoursAgo(48),
    text: 'Weekly performance report ready. $112K revenue won. 4 jobs closed at 28% close rate (industry avg: 20-25%). Trending up.',
    kind: 'dispatch',
    role: 'performance_reporting',
  },
  {
    id: 'a-012',
    at: hoursAgo(50),
    text: 'Marcus & Tia Bell signed. Kitchen full renovation $59K. Onboarding packet (welcome email + measure-day calendar invite + design questionnaire) auto-sent.',
    kind: 'quote',
    role: 'deal_won_handoff',
  },
]
