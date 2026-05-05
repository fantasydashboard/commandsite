/**
 * Schedule fixture for Apex — today's dispatch + week ahead.
 * Times are computed relative to "now" so the schedule always looks
 * fresh on demo. Statuses (scheduled / en_route / on_site / complete)
 * progress through the day so the early jobs are done, the current
 * window has someone on-site, and afternoon is still scheduled.
 */

export type JobStatus = 'scheduled' | 'en_route' | 'on_site' | 'complete' | 'cancelled'

export interface ScheduledJob {
  id: string
  customer: string
  phone: string
  address: string
  zip: string
  job_type: string
  /** ISO timestamp for scheduled start */
  start: string
  est_duration_min: number
  est_value_cents: number
  status: JobStatus
  assigned_tech_id: string | null
  /** Optional dispatcher note shown on the job card */
  note?: string
  /** Tag — "maintenance plan", "warranty", "after-hours", "financing" */
  tag?: string
}

// Helpers — produce ISO timestamps relative to now.
function todayAt(hour: number, min = 0): string {
  const d = new Date()
  d.setHours(hour, min, 0, 0)
  return d.toISOString()
}
function inDays(days: number, hour: number, min = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, min, 0, 0)
  return d.toISOString()
}

// What's "now" in our demo — used to pick the right statuses for today's
// jobs so the timeline reads as live (early = complete, mid = on_site,
// later = scheduled). Returns "fake now" of 1:30 PM local for visual
// consistency on demos run mid-morning or late evening.
function demoNowHour(): number {
  const realHour = new Date().getHours()
  // If real time is in business hours (8-17), use it; else freeze at 13.
  return realHour >= 8 && realHour <= 17 ? realHour : 13
}

function statusForStart(startHour: number, durationMin: number): JobStatus {
  const now = demoNowHour()
  const endHour = startHour + Math.ceil(durationMin / 60)
  if (endHour <= now) return 'complete'
  if (startHour <= now && endHour > now) return 'on_site'
  if (startHour - now === 1) return 'en_route'
  return 'scheduled'
}

// ── TODAY'S DISPATCH ────────────────────────────────────────────────────
export const todayJobs: ScheduledJob[] = [
  {
    id: 'j-001',
    customer: 'Patricia Andrews',
    phone: '(407) 555-0145',
    address: '2814 Linwood Ave',
    zip: '32803',
    job_type: 'Annual maintenance plan visit',
    start: todayAt(8, 0),
    est_duration_min: 60,
    est_value_cents: 28_000,
    status: statusForStart(8, 60),
    assigned_tech_id: 't-001',
    tag: 'maintenance plan',
  },
  {
    id: 'j-002',
    customer: 'Hector Vega',
    phone: '(407) 555-0815',
    address: '917 Pinellas Trail',
    zip: '32812',
    job_type: 'Air handler inspection + filter swap',
    start: todayAt(9, 30),
    est_duration_min: 45,
    est_value_cents: 19_500,
    status: statusForStart(9, 45),
    assigned_tech_id: 't-002',
  },
  {
    id: 'j-003',
    customer: 'Karen Holloway',
    phone: '(407) 555-0091',
    address: '4422 Edgewater Dr',
    zip: '32804',
    job_type: 'Water heater replacement',
    start: todayAt(10, 0),
    est_duration_min: 180,
    est_value_cents: 184_000,
    status: statusForStart(10, 180),
    assigned_tech_id: 't-001',
    note: 'Garage access — door code 4422. Existing tank: 50-gal gas.',
    tag: 'financing',
  },
  {
    id: 'j-004',
    customer: 'Jennifer Martinez',
    phone: '(407) 555-0114',
    address: '1847 Maguire Rd',
    zip: '34761',
    job_type: 'Maintenance plan onboarding visit',
    start: todayAt(11, 0),
    est_duration_min: 60,
    est_value_cents: 0,
    status: statusForStart(11, 60),
    assigned_tech_id: 't-002',
    note: 'Just signed up for the Comfort Club — first visit included.',
    tag: 'maintenance plan',
  },
  {
    id: 'j-005',
    customer: 'Robert Chen',
    phone: '(407) 555-0237',
    address: '6618 Magnolia Park Cir',
    zip: '32825',
    job_type: 'In-home assessment for new HVAC',
    start: todayAt(13, 0),
    est_duration_min: 90,
    est_value_cents: 0,
    status: statusForStart(13, 90),
    assigned_tech_id: 't-001',
    note: 'Robert is comparison-shopping. Bring the financing brochure.',
    tag: 'quote',
  },
  {
    id: 'j-006',
    customer: 'Lisa Bennett',
    phone: '(407) 555-0341',
    address: '3309 Ridgewood Ln',
    zip: '32835',
    job_type: 'Capacitor replacement (warranty)',
    start: todayAt(14, 0),
    est_duration_min: 30,
    est_value_cents: 0,
    status: statusForStart(14, 30),
    assigned_tech_id: 't-003',
    tag: 'warranty',
  },
  {
    id: 'j-007',
    customer: 'Amanda Foster',
    phone: '(407) 555-0466',
    address: '7102 Sand Lake Hills Dr',
    zip: '32819',
    job_type: 'Whole-home duct cleaning',
    start: todayAt(15, 0),
    est_duration_min: 120,
    est_value_cents: 65_000,
    status: statusForStart(15, 120),
    assigned_tech_id: 't-002',
  },
  {
    id: 'j-008',
    customer: 'Sandra Whitmore',
    phone: '(407) 555-0509',
    address: '108 Ivanhoe Dr',
    zip: '32804',
    job_type: 'Smart thermostat install',
    start: todayAt(16, 30),
    est_duration_min: 45,
    est_value_cents: 32_500,
    status: 'scheduled',
    assigned_tech_id: 't-003',
  },
  {
    id: 'j-009',
    customer: 'Greg Hammond',
    phone: '(407) 555-0204',
    address: '2247 Forrest Park Dr',
    zip: '32803',
    job_type: 'Contactor replacement',
    start: todayAt(17, 30),
    est_duration_min: 45,
    est_value_cents: 22_000,
    status: 'scheduled',
    assigned_tech_id: 't-004',
    note: 'Reactivation booking — last seen 11 mo ago.',
  },
]

// ── WEEK AHEAD (excluding today) ────────────────────────────────────────
export const upcomingJobs: ScheduledJob[] = [
  // Tomorrow
  {
    id: 'j-101',
    customer: 'Michael Reyes',
    phone: '(407) 555-0651',
    address: '5511 Curry Ford Rd',
    zip: '32812',
    job_type: 'Furnace install (Day 1 of 2)',
    start: inDays(1, 8, 0),
    est_duration_min: 480,
    est_value_cents: 1_400_000,
    status: 'scheduled',
    assigned_tech_id: 't-001',
    note: 'Heritage 95% efficient gas. Crew of 2.',
    tag: 'install',
  },
  {
    id: 'j-102',
    customer: 'Yvonne Castillo',
    phone: '(407) 555-0277',
    address: '1422 Conway Gardens Rd',
    zip: '32812',
    job_type: '4-ton heat pump install',
    start: inDays(1, 9, 0),
    est_duration_min: 360,
    est_value_cents: 1_200_000,
    status: 'scheduled',
    assigned_tech_id: 't-002',
    tag: 'install',
  },
  {
    id: 'j-103',
    customer: 'James Sullivan',
    phone: '(407) 555-0928',
    address: '8847 Boggy Creek Rd',
    zip: '32824',
    job_type: 'Mini-split install (zone 2)',
    start: inDays(1, 13, 0),
    est_duration_min: 240,
    est_value_cents: 850_000,
    status: 'scheduled',
    assigned_tech_id: 't-003',
    tag: 'install',
  },
  // Day +2
  {
    id: 'j-104',
    customer: 'Michael Reyes',
    phone: '(407) 555-0651',
    address: '5511 Curry Ford Rd',
    zip: '32812',
    job_type: 'Furnace install (Day 2 of 2)',
    start: inDays(2, 8, 0),
    est_duration_min: 360,
    est_value_cents: 0,
    status: 'scheduled',
    assigned_tech_id: 't-001',
    note: 'Final connections + commissioning + customer walkthrough.',
    tag: 'install',
  },
  {
    id: 'j-105',
    customer: 'Olivia Tran',
    phone: '(407) 555-0517',
    address: '772 Lake Howell Rd',
    zip: '32792',
    job_type: 'Maintenance plan resume visit',
    start: inDays(2, 10, 0),
    est_duration_min: 60,
    est_value_cents: 27_500,
    status: 'scheduled',
    assigned_tech_id: 't-004',
    tag: 'maintenance plan',
  },
  {
    id: 'j-106',
    customer: 'Brian Whitfield',
    phone: '(407) 555-0223',
    address: '209 Brookhaven Dr',
    zip: '32803',
    job_type: 'Reactivation visit + tune-up',
    start: inDays(2, 14, 0),
    est_duration_min: 90,
    est_value_cents: 32_000,
    status: 'scheduled',
    assigned_tech_id: 't-003',
  },
  // Day +3
  {
    id: 'j-107',
    customer: 'Frank Delgado',
    phone: '(407) 555-0455',
    address: '4002 Pershing Ave',
    zip: '32812',
    job_type: 'Smart thermostat upgrade',
    start: inDays(3, 9, 0),
    est_duration_min: 60,
    est_value_cents: 28_900,
    status: 'scheduled',
    assigned_tech_id: 't-002',
  },
  {
    id: 'j-108',
    customer: 'Diana Esposito',
    phone: '(407) 555-0931',
    address: '6188 Vineland Rd',
    zip: '32819',
    job_type: 'Coil cleaning + refrigerant top-up',
    start: inDays(3, 11, 0),
    est_duration_min: 120,
    est_value_cents: 21_000,
    status: 'scheduled',
    assigned_tech_id: 't-001',
  },
  // Day +4
  {
    id: 'j-109',
    customer: 'Walter Kim',
    phone: '(407) 555-0712',
    address: '1517 Bumby Ave',
    zip: '32803',
    job_type: 'Whole-home duct sealing',
    start: inDays(4, 8, 30),
    est_duration_min: 240,
    est_value_cents: 380_000,
    status: 'scheduled',
    assigned_tech_id: 't-001',
    tag: 'install',
  },
  {
    id: 'j-110',
    customer: 'Marisol Reyes',
    phone: '(407) 555-0866',
    address: '923 Hamlin Ln',
    zip: '32835',
    job_type: 'Reactivation tune-up',
    start: inDays(4, 13, 0),
    est_duration_min: 60,
    est_value_cents: 22_500,
    status: 'scheduled',
    assigned_tech_id: 't-004',
  },
]

export interface ScheduleStats {
  today_total: number
  today_complete: number
  today_in_progress: number
  today_remaining: number
  today_revenue_cents: number
  week_jobs: number
  week_revenue_cents: number
}

export function scheduleStats(): ScheduleStats {
  const today_complete = todayJobs.filter((j) => j.status === 'complete').length
  const today_in_progress = todayJobs.filter((j) => j.status === 'on_site' || j.status === 'en_route').length
  const today_remaining = todayJobs.filter((j) => j.status === 'scheduled').length
  const today_revenue_cents = todayJobs.reduce((s, j) => s + j.est_value_cents, 0)
  const week_revenue_cents = upcomingJobs.reduce((s, j) => s + j.est_value_cents, 0) + today_revenue_cents

  return {
    today_total: todayJobs.length,
    today_complete,
    today_in_progress,
    today_remaining,
    today_revenue_cents,
    week_jobs: todayJobs.length + upcomingJobs.length,
    week_revenue_cents,
  }
}

// Tech meta — labels mirrored from settings.ts so the schedule can show
// names without importing the full settings file.
export const techMeta: Record<string, { name: string; color: string }> = {
  't-001': { name: 'Marcus Reyes',    color: '#0EA5E9' },  // sky-500
  't-002': { name: 'Diego Hernandez', color: '#10B981' },  // emerald-500
  't-003': { name: 'Brandon Thomas',  color: '#F59E0B' },  // amber-500
  't-004': { name: 'Aaron Whitfield', color: '#A855F7' },  // purple-500
}
