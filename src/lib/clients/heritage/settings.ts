/**
 * Heritage Bath & Kitchen Co. — settings fixture data.
 *
 * Business hours, team roster, Ada config, integrations, service area.
 * The Settings module reads from this.
 */

export const businessInfo = {
  name: 'Heritage Bath & Kitchen Co.',
  ownerName: 'Marc Hatcher',
  founded: 2014,
  serviceCity: 'Tampa',
  serviceState: 'FL',
  serviceArea: ['Tampa', 'St. Petersburg', 'Clearwater', 'Brandon', 'Riverview', 'Lutz'],
  website: 'heritagebathandkitchen.com',
  email: 'marc@heritagebathandkitchen.com',
  phone: '(813) 555-0100',
  licenses: ['FL CGC #1532987 (Certified General Contractor)', 'NARI Certified Remodeler — Marc Hatcher'],
}

export const businessHours = {
  monday:    { open: '08:00', close: '17:00' },
  tuesday:   { open: '08:00', close: '17:00' },
  wednesday: { open: '08:00', close: '17:00' },
  thursday:  { open: '08:00', close: '17:00' },
  friday:    { open: '08:00', close: '15:00' },
  saturday:  { open: '09:00', close: '13:00', note: 'Consultations only, by appointment' },
  sunday:    { open: null, close: null },
  afterHoursCoverage: 'Ada catches every inquiry 24/7. After-hours leads land in the queue first thing Monday.',
}

export interface TeamMember {
  name: string
  role: string
  startedYear: number
  skills: string[]
}

export const team: TeamMember[] = [
  {
    name: 'Marc Hatcher',
    role: 'Owner / Lead Designer',
    startedYear: 2014,
    skills: ['Design consultation', 'Estimating', 'Project oversight', 'Client relationships'],
  },
  {
    name: 'Diego Salinas',
    role: 'Lead Craftsman',
    startedYear: 2017,
    skills: ['Cabinet installation', 'Tile + stone', 'Plumbing rough-in', 'Site supervision'],
  },
  {
    name: 'Carmen Royce',
    role: 'Project Coordinator',
    startedYear: 2019,
    skills: ['Schedule coordination', 'Vendor management', 'Permit pulls', 'Client comms'],
  },
]

export const integrations = [
  { name: 'Google Local Services Ads', status: 'connected', note: 'Email forwarding set up — leads flow into Front Desk in real time' },
  { name: 'Google Business Profile', status: 'connected', note: 'Reviews + photos sync nightly' },
  { name: 'Houzz Pro', status: 'connected', note: 'Lead inbox forwarded to Ada' },
  { name: 'QuickBooks Online', status: 'connected', note: 'Quote totals + closed-deal revenue sync' },
  { name: 'Twilio (SMS)', status: 'connected', note: 'Outbound texts send via Heritage main number' },
  { name: 'Buildertrend', status: 'pending', note: 'On the roadmap — Q3' },
]
