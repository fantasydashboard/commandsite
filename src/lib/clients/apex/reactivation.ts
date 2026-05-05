/**
 * Reactivation pipeline — dormant customers the system has identified
 * as ripe for outreach (no service in 9-18 months, prior LTV justifies
 * the touch). Each row carries an estimated value so the owner can
 * eyeball the dollar size of the recovery opportunity.
 */
import type { ReactivationRecord } from './types'

function ago(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export const reactivations: ReactivationRecord[] = [
  // Won-back
  {
    id: 'rx-001',
    customer: 'Greg Hammond',
    phone: '(407) 555-0204',
    last_service_date: ago(335),
    last_service: 'AC tune-up + filter swap',
    contact_attempts: 2,
    status: 'won_back',
    estimated_value_cents: 22_000,
  },
  {
    id: 'rx-002',
    customer: 'Marcus Henley',
    phone: '(407) 555-0688',
    last_service_date: ago(298),
    last_service: 'Capacitor replacement',
    contact_attempts: 3,
    status: 'won_back',
    estimated_value_cents: 18_500,
  },

  // Booked (replied yes, awaiting visit)
  {
    id: 'rx-003',
    customer: 'Olivia Tran',
    phone: '(407) 555-0517',
    last_service_date: ago(412),
    last_service: 'Annual maintenance plan (lapsed)',
    contact_attempts: 1,
    status: 'booked',
    estimated_value_cents: 27_500,
  },
  {
    id: 'rx-004',
    customer: 'Brian Whitfield',
    phone: '(407) 555-0223',
    last_service_date: ago(367),
    last_service: 'New furnace install',
    contact_attempts: 2,
    status: 'booked',
    estimated_value_cents: 32_000,
  },

  // Engaged (replied with questions)
  {
    id: 'rx-005',
    customer: 'Diana Esposito',
    phone: '(407) 555-0931',
    last_service_date: ago(389),
    last_service: 'Coil cleaning',
    contact_attempts: 2,
    status: 'engaged',
    estimated_value_cents: 21_000,
  },
  {
    id: 'rx-006',
    customer: 'Frank Delgado',
    phone: '(407) 555-0455',
    last_service_date: ago(318),
    last_service: 'Thermostat install',
    contact_attempts: 1,
    status: 'engaged',
    estimated_value_cents: 28_900,
  },

  // Contacted (waiting on reply)
  {
    id: 'rx-007',
    customer: 'Linda Acosta',
    phone: '(407) 555-0148',
    last_service_date: ago(275),
    last_service: 'Refrigerant top-up',
    contact_attempts: 1,
    status: 'contacted',
    estimated_value_cents: 19_500,
  },
  {
    id: 'rx-008',
    customer: 'Walter Kim',
    phone: '(407) 555-0712',
    last_service_date: ago(401),
    last_service: 'Duct sealing',
    contact_attempts: 2,
    status: 'contacted',
    estimated_value_cents: 38_000,
  },
  {
    id: 'rx-009',
    customer: 'Marisol Reyes',
    phone: '(407) 555-0866',
    last_service_date: ago(362),
    last_service: 'Annual tune-up',
    contact_attempts: 1,
    status: 'contacted',
    estimated_value_cents: 22_500,
  },
  {
    id: 'rx-010',
    customer: 'Kevin Bonilla',
    phone: '(407) 555-0339',
    last_service_date: ago(340),
    last_service: 'Mini-split install',
    contact_attempts: 1,
    status: 'contacted',
    estimated_value_cents: 41_000,
  },

  // Identified (queue — not yet contacted, awaiting owner approval)
  {
    id: 'rx-011',
    customer: 'Jacqueline Powers',
    phone: '(407) 555-0578',
    last_service_date: ago(294),
    last_service: 'Heat pump quote (not booked)',
    contact_attempts: 0,
    status: 'identified',
    estimated_value_cents: 145_000,
  },
  {
    id: 'rx-012',
    customer: 'Earl Wojcik',
    phone: '(407) 555-0609',
    last_service_date: ago(311),
    last_service: 'Compressor replacement',
    contact_attempts: 0,
    status: 'identified',
    estimated_value_cents: 28_500,
  },
  {
    id: 'rx-013',
    customer: 'Sophia Carrasco',
    phone: '(407) 555-0184',
    last_service_date: ago(326),
    last_service: 'Annual tune-up',
    contact_attempts: 0,
    status: 'identified',
    estimated_value_cents: 21_000,
  },
  {
    id: 'rx-014',
    customer: 'Trevor Maddox',
    phone: '(407) 555-0747',
    last_service_date: ago(372),
    last_service: 'Smart thermostat install',
    contact_attempts: 0,
    status: 'identified',
    estimated_value_cents: 19_500,
  },
  {
    id: 'rx-015',
    customer: 'Bianca Yost',
    phone: '(407) 555-0492',
    last_service_date: ago(355),
    last_service: 'Duct cleaning',
    contact_attempts: 0,
    status: 'identified',
    estimated_value_cents: 26_500,
  },
  {
    id: 'rx-016',
    customer: 'Roman Pavlov',
    phone: '(407) 555-0871',
    last_service_date: ago(283),
    last_service: 'Capacitor replacement',
    contact_attempts: 0,
    status: 'identified',
    estimated_value_cents: 18_000,
  },
]

export interface ReactivationStats {
  identified: number
  contacted: number
  engaged: number
  booked: number
  won_back: number
  pipeline_value_cents: number
  recovered_value_cents: number
}

export function reactivationStats(): ReactivationStats {
  const stats: ReactivationStats = {
    identified: 0,
    contacted: 0,
    engaged: 0,
    booked: 0,
    won_back: 0,
    pipeline_value_cents: 0,
    recovered_value_cents: 0,
  }
  for (const r of reactivations) {
    stats[r.status]++
    if (r.status === 'won_back') stats.recovered_value_cents += r.estimated_value_cents
    else stats.pipeline_value_cents += r.estimated_value_cents
  }
  return stats
}

export const REACTIVATION_OUTREACH_TEMPLATE = `Hi {{first_name}}, it's Apex Heating & Air. We noticed it's been about a year since your last visit ({{last_service}}). With the season changing, want us to swing by for a quick check-up? First-time-back customers get $25 off any service. Reply YES to book or STOP to opt out.`
