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

export const recentActivity: RecentActivityEvent[] = [
  {
    id: 'a-001',
    at: minutesAgo(18),
    text: 'Quote follow-up sent · Rodriguez Estate ($54K master bath, day 7)',
    kind: 'quote',
    role: 'quote_followup',
  },
  {
    id: 'a-002',
    at: minutesAgo(42),
    text: 'New consultation request · Patricia Mendoza (kitchen full reno) — booked Tue 2pm',
    kind: 'call',
    role: 'front_desk',
  },
  {
    id: 'a-003',
    at: hoursAgo(2),
    text: 'Referral ask drafted for Marcus & Tia Bell — awaiting your approval',
    kind: 'reactivation',
    role: 'referral_engine',
  },
  {
    id: 'a-004',
    at: hoursAgo(3),
    text: 'New 5★ review on Google · "Marc and team made our kitchen the heart of the home" — Marcus B.',
    kind: 'review',
    role: 'review_engine',
  },
  {
    id: 'a-005',
    at: hoursAgo(5),
    text: 'Quote follow-up sent · James & Rebecca Liu (accessible bath, day 7)',
    kind: 'quote',
    role: 'quote_followup',
  },
  {
    id: 'a-006',
    at: hoursAgo(7),
    text: 'LSA lead in · Tampa homeowner asking about bath remodel timeline — booked Thu 10am',
    kind: 'call',
    role: 'front_desk',
  },
  {
    id: 'a-007',
    at: hoursAgo(20),
    text: 'Quote follow-up sent · David Hernandez (day 14, escalation cadence)',
    kind: 'quote',
    role: 'quote_followup',
  },
  {
    id: 'a-008',
    at: hoursAgo(22),
    text: 'Spring kitchen trends newsletter sent to 842 recipients · 38% open rate so far',
    kind: 'reactivation',
    role: 'email_marketing',
  },
  {
    id: 'a-009',
    at: hoursAgo(27),
    text: 'Pat Rosenbaum (referred by Joel & Marie Underwood) booked an in-home consultation',
    kind: 'reactivation',
    role: 'referral_engine',
  },
  {
    id: 'a-010',
    at: hoursAgo(36),
    text: 'Reactivation message · Heather Cole (bath remodel 18 months ago) — replied interested in kitchen',
    kind: 'reactivation',
    role: 'reactivation',
  },
  {
    id: 'a-011',
    at: hoursAgo(48),
    text: 'Weekly performance report ready · $112K revenue · 4 jobs closed · 28% close rate',
    kind: 'dispatch',
    role: 'performance_reporting',
  },
  {
    id: 'a-012',
    at: hoursAgo(50),
    text: 'Quote closed · Marcus & Tia Bell — kitchen full renovation $59K · onboarding packet sent',
    kind: 'quote',
    role: 'deal_won_handoff',
  },
]
