/**
 * Apex Heating & Air — settings shape + initial values for the
 * Settings module. Swap to a real backend later by replacing this
 * file with calls to the same shapes.
 */

export interface BusinessHours {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
  open: boolean
  start: string  // "08:00"
  end: string    // "18:00"
}

export interface Tech {
  id: string
  name: string
  role: 'lead' | 'tech' | 'apprentice'
  phone: string
  on_call: boolean
  active: boolean
  jobs_this_month: number
  avg_rating: number
}

export interface AIReceptionistConfig {
  greeting: string
  after_hours_fee_cents: number
  voicemail_script: string
  spam_handling: 'auto_reject' | 'route_to_voicemail' | 'transfer_to_human'
  transfer_threshold: 'never' | 'hot_leads_only' | 'all_calls'
}

export interface Integration {
  key: string
  label: string
  description: string
  connected: boolean
  status_note?: string
}

export const businessHours: BusinessHours[] = [
  { day: 'Mon', open: true,  start: '07:00', end: '19:00' },
  { day: 'Tue', open: true,  start: '07:00', end: '19:00' },
  { day: 'Wed', open: true,  start: '07:00', end: '19:00' },
  { day: 'Thu', open: true,  start: '07:00', end: '19:00' },
  { day: 'Fri', open: true,  start: '07:00', end: '19:00' },
  { day: 'Sat', open: true,  start: '08:00', end: '16:00' },
  { day: 'Sun', open: false, start: '00:00', end: '00:00' },
]

export const techs: Tech[] = [
  { id: 't-001', name: 'Marcus Reyes',     role: 'lead',       phone: '(407) 555-0411', on_call: true,  active: true, jobs_this_month: 47, avg_rating: 4.9 },
  { id: 't-002', name: 'Diego Hernandez',  role: 'tech',       phone: '(407) 555-0412', on_call: false, active: true, jobs_this_month: 38, avg_rating: 4.8 },
  { id: 't-003', name: 'Brandon Thomas',   role: 'tech',       phone: '(407) 555-0413', on_call: true,  active: true, jobs_this_month: 32, avg_rating: 4.7 },
  { id: 't-004', name: 'Aaron Whitfield',  role: 'apprentice', phone: '(407) 555-0414', on_call: false, active: true, jobs_this_month: 18, avg_rating: 4.6 },
]

export const aiReceptionist: AIReceptionistConfig = {
  greeting: 'Thanks for calling Apex Heating & Air, this is the AI receptionist. I can help you book service, get a quote, or dispatch a tech tonight. What\'s going on?',
  after_hours_fee_cents: 17_900,
  voicemail_script: 'Sorry I missed you — please leave your name, number, and a quick description of the issue and we\'ll text you back within 30 minutes during business hours.',
  spam_handling: 'auto_reject',
  transfer_threshold: 'hot_leads_only',
}

export const integrations: Integration[] = [
  { key: 'twilio',   label: 'Twilio',         description: 'Voice + SMS provider',         connected: true,  status_note: '+1 (407) 555-0100 · 312 mins this month' },
  { key: 'stripe',   label: 'Stripe',         description: 'Card payments + financing',    connected: true,  status_note: 'Apex HVAC LLC · $18,473 processed this month' },
  { key: 'google',   label: 'Google Business', description: 'Reviews + Maps presence',      connected: true,  status_note: '4.9★ from 87 reviews' },
  { key: 'facebook', label: 'Facebook Pages',  description: 'Reviews + lead messages',      connected: true },
  { key: 'yelp',     label: 'Yelp Business',   description: 'Review monitoring + replies',  connected: true,  status_note: 'Read-only · replies require Yelp upgrade' },
  { key: 'nextdoor', label: 'Nextdoor',        description: 'Neighborhood reviews',         connected: false, status_note: 'Not connected' },
  { key: 'qbo',      label: 'QuickBooks',      description: 'Auto-sync invoices + payments', connected: false, status_note: 'Connect to push completed jobs as invoices' },
  { key: 'jobber',   label: 'Jobber',          description: 'Field-service scheduling',     connected: false, status_note: 'Optional · CommandSite scheduling works standalone' },
]

export const serviceAreaZips = [
  '32801', '32803', '32804', '32805', '32806', '32807', '32808', '32809',
  '32810', '32812', '32814', '32817', '32818', '32819', '32820', '32821',
  '32824', '32825', '32826', '32827', '32828', '32829', '32832', '32833',
  '32835', '32836', '32837', '32839',
  '34734', '34741', '34743', '34744', '34746', '34747', '34758', '34761',
  '34786', '34787',
]
