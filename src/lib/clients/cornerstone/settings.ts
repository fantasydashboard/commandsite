/**
 * Cornerstone — operational Settings.
 * Team, service times, integrations (ChMS / giving / comms), and a few
 * church-specific config knobs.
 */

export interface TeamMember {
  id: string
  name: string
  email: string
  role: 'senior_pastor' | 'associate_pastor' | 'worship_director' | 'kids_director' | 'admin' | 'finance' | 'volunteer_coordinator'
  active: boolean
  added_at: string
  /** What permission scope they have on the dashboard */
  permission_scope: 'full' | 'pastoral_care' | 'finance' | 'volunteers' | 'comms_only'
}

export interface ServiceTime {
  id: string
  day: string
  time: string
  service_type: 'main_worship' | 'kids_only' | 'youth_group' | 'mid_week' | 'prayer'
  location: string
  expected_attendance: number
  active: boolean
}

export interface IntegrationConnection {
  key: string
  label: string
  description: string
  connected: boolean
  status_note?: string
  category: 'chms' | 'giving' | 'comms' | 'social' | 'tech_av' | 'productivity' | 'ai'
}

export interface PrivacySetting {
  key: string
  label: string
  description: string
  enabled: boolean
}

function ago(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export const teamMembers: TeamMember[] = [
  { id: 'tm-001', name: 'Mark Reiner',    email: 'mark@cornerstonecc.com',    role: 'senior_pastor',        active: true, added_at: ago(2_840), permission_scope: 'full' },
  { id: 'tm-002', name: 'Jess Bowman',    email: 'jess@cornerstonecc.com',    role: 'worship_director',     active: true, added_at: ago(1_580), permission_scope: 'comms_only' },
  { id: 'tm-003', name: 'Linda Tan',      email: 'linda@cornerstonecc.com',   role: 'kids_director',        active: true, added_at: ago(2_120), permission_scope: 'volunteers' },
  { id: 'tm-004', name: 'David Reynolds', email: 'david@cornerstonecc.com',   role: 'associate_pastor',     active: true, added_at: ago(840),   permission_scope: 'pastoral_care' },
  { id: 'tm-005', name: 'Stephanie Park', email: 'stephanie@cornerstonecc.com', role: 'admin',              active: true, added_at: ago(1_240), permission_scope: 'full' },
  { id: 'tm-006', name: 'Hannah Reiner',  email: 'hannah@cornerstonecc.com',  role: 'finance',              active: true, added_at: ago(2_840), permission_scope: 'finance' },
  { id: 'tm-007', name: 'Carl Mendoza',   email: 'carl@cornerstonecc.com',    role: 'volunteer_coordinator',active: true, added_at: ago(412),   permission_scope: 'volunteers' },
]

export const serviceTimes: ServiceTime[] = [
  { id: 'st-001', day: 'Sunday',    time: '9:00 AM',  service_type: 'main_worship', location: 'Main sanctuary', expected_attendance: 180, active: true },
  { id: 'st-002', day: 'Sunday',    time: '11:00 AM', service_type: 'main_worship', location: 'Main sanctuary', expected_attendance: 232, active: true },
  { id: 'st-003', day: 'Wednesday', time: '6:30 PM',  service_type: 'youth_group',  location: 'Youth room',     expected_attendance: 38,  active: true },
  { id: 'st-004', day: 'Tuesday',   time: '7:00 AM',  service_type: 'prayer',       location: 'Prayer chapel',  expected_attendance: 12,  active: true },
]

export const integrations: IntegrationConnection[] = [
  // ChMS — the most important integration for a church
  { key: 'planning_center', label: 'Planning Center',  description: 'Church management — people, services, giving, groups',  connected: true,  status_note: 'Source of truth for households + service planning · syncs every 15 min', category: 'chms' },

  // Giving
  { key: 'tithely',         label: 'Tithe.ly',         description: 'Recurring + one-time giving · text-to-give',           connected: true,  status_note: '$1.8M general fund processed YTD · 62% recurring', category: 'giving' },
  { key: 'pushpay',         label: 'Pushpay',          description: 'Alternative giving platform — not currently used',      connected: false, status_note: 'Not connected (Tithe.ly is sufficient at our size)', category: 'giving' },

  // Comms
  { key: 'mailchimp',       label: 'Mailchimp',        description: 'Weekly bulletin email + segments by household',         connected: true,  status_note: '412 subscribers · 66% open rate', category: 'comms' },
  { key: 'twilio',          label: 'Twilio',           description: 'SMS broadcasts (urgent + opt-in only)',                  connected: true,  status_note: '287 opted-in · used sparingly for urgent comms', category: 'comms' },

  // Social
  { key: 'instagram',       label: 'Instagram',        description: 'Sunday-morning + community-event posts',                 connected: true,  status_note: '1,840 followers · auto-post Sunday 8:30 AM', category: 'social' },
  { key: 'facebook',        label: 'Facebook',         description: 'Long-form posts + sermon clips',                         connected: true,  status_note: '1,000 followers · still important for older members', category: 'social' },

  // Tech / AV
  { key: 'planning_center_services', label: 'PC Services',    description: 'Worship setlist + service order',                connected: true,  status_note: 'Synced from Planning Center · setlist editable here', category: 'tech_av' },
  { key: 'proPresenter',    label: 'ProPresenter',     description: 'Sunday slides + lyrics',                                 connected: false, status_note: 'Manual import — full integration on roadmap', category: 'tech_av' },
  { key: 'youtube',         label: 'YouTube',          description: 'Sermon livestream + archive',                            connected: true,  status_note: '1,200 subscribers · livestream auto-saved + clipped', category: 'tech_av' },

  // Productivity
  { key: 'google_workspace',label: 'Google Workspace', description: 'Staff email + calendar + shared docs',                   connected: true,  status_note: 'cornerstonecc.com domain · 7 staff seats', category: 'productivity' },
  { key: 'slack',           label: 'Slack',            description: 'Staff + volunteer team coordination',                    connected: true,  status_note: 'Free tier · used for #staff + #worship + #kids-ministry', category: 'productivity' },

  // AI
  { key: 'anthropic',       label: 'Anthropic Claude', description: 'AI for drafted emails / replies / posts in church voice', connected: true,  status_note: 'Sonnet · ~$18/mo at current usage', category: 'ai' },
]

export const privacySettings: PrivacySetting[] = [
  {
    key: 'giving_visible_to_pastors_only',
    label: 'Giving data restricted to senior pastor + finance',
    description: 'Other staff see aggregate trends only — never per-household amounts. Recommended.',
    enabled: true,
  },
  {
    key: 'pastoral_notes_staff_only',
    label: 'Pastoral notes visible to staff only',
    description: 'Notes on People + Care + Visitors records hidden from volunteers.',
    enabled: true,
  },
  {
    key: 'small_group_leaders_see_own_only',
    label: 'Small-group leaders see attendance for their group only',
    description: 'Prayer requests + attendance scoped to leader\'s own group.',
    enabled: true,
  },
  {
    key: 'volunteer_schedule_visible_to_all',
    label: 'Volunteer schedule visible to all staff + volunteers',
    description: 'Anyone can see who\'s serving what role — coordination over privacy here.',
    enabled: true,
  },
  {
    key: 'first_time_visitor_alerts_silent',
    label: 'First-time visitors stay silent until they confirm a 2nd visit',
    description: 'Don\'t auto-text first-timers — wait until the 24h email is acknowledged.',
    enabled: false,
  },
]

export interface SettingsStats {
  team_active: number
  services_active: number
  integrations_connected: number
  integrations_total: number
  privacy_enabled: number
  privacy_total: number
}

export function settingsStats(): SettingsStats {
  return {
    team_active: teamMembers.filter((m) => m.active).length,
    services_active: serviceTimes.filter((s) => s.active).length,
    integrations_connected: integrations.filter((i) => i.connected).length,
    integrations_total: integrations.length,
    privacy_enabled: privacySettings.filter((p) => p.enabled).length,
    privacy_total: privacySettings.length,
  }
}

export const ROLE_LABEL: Record<TeamMember['role'], string> = {
  senior_pastor:           'Senior Pastor',
  associate_pastor:        'Associate Pastor',
  worship_director:        'Worship Director',
  kids_director:           'Kids Director',
  admin:                   'Admin',
  finance:                 'Finance',
  volunteer_coordinator:   'Volunteer Coordinator',
}

export const PERMISSION_LABEL: Record<TeamMember['permission_scope'], string> = {
  full:           'Full access',
  pastoral_care:  'Pastoral care',
  finance:        'Finance',
  volunteers:     'Volunteers',
  comms_only:     'Comms only',
}

export const SERVICE_TYPE_LABEL: Record<ServiceTime['service_type'], string> = {
  main_worship: 'Main worship',
  kids_only:    'Kids only',
  youth_group:  'Youth group',
  mid_week:     'Mid-week',
  prayer:       'Prayer',
}

export const INTEGRATION_CATEGORY_LABEL: Record<IntegrationConnection['category'], string> = {
  chms:          'Church management (ChMS)',
  giving:        'Giving platforms',
  comms:         'Communications',
  social:        'Social channels',
  tech_av:       'Tech / AV',
  productivity:  'Productivity',
  ai:            'AI',
}
