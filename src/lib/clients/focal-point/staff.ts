// Focal Point Church - staff "views" for the per-user Today page.
// Each dashboard user sees only what they own; a super-user (leadership) sees
// everything and can preview any view. Ownership is derived from the data that
// already carries it: the `owner` on a care case and the `role` on an approval
// draft. These role assignments are a STARTING ASSUMPTION; the real per-user
// setup comes from Christina's staff list (open onboarding ask).
//
// Staff first names/titles only (already public in the product), never
// congregant PII.

export interface StaffView {
  id: string
  name: string // display name shown in the switcher + header
  role: string // job title
  initials: string
  blurb: string // what this person owns, one line
  isSuper?: boolean // leadership: sees everything, can preview any view
  viaDigest?: boolean // ministry leaders act from the Monday email, not a login
  ownsCase?: (owner: string) => boolean // which care-case owners route to them
  approvalRoles?: string[] // which approval-draft roles are theirs
  showDuplicates?: boolean // the data-cleanup card
  showSchedule?: boolean // Sunday scheduling gaps
}

export const focalPointStaff: StaffView[] = [
  {
    id: 'all',
    name: 'Everyone',
    role: 'Leadership view',
    initials: 'FP',
    blurb: 'The whole church at a glance. Preview any staff view from here.',
    isSuper: true,
  },
  {
    id: 'mark',
    name: 'Pastor Mark',
    role: 'Senior Pastor',
    initials: 'PM',
    blurb: 'The notes only your voice should send, and the calls only you can make.',
    ownsCase: (o) => o === 'Pastor Mark',
    approvalRoles: ['drift_detection', 'care_triage', 'reengagement'],
  },
  {
    id: 'christina',
    name: 'Christina',
    role: 'Office Manager',
    initials: 'CS',
    blurb: 'Guest welcomes, weekly comms, Sunday scheduling gaps, and data cleanup.',
    ownsCase: (o) => o === 'Care team' || o === 'Connections team',
    approvalRoles: ['guest_followup', 'communications', 'volunteer_coord'],
    showDuplicates: true,
    showSchedule: true,
  },
  {
    id: 'leaders',
    name: 'Ministry leaders',
    role: 'Team + group leaders',
    initials: 'ML',
    blurb: "Each leader's own team: serving lapses and burnout, delivered as the Monday email.",
    viaDigest: true,
    ownsCase: (o) => o.toLowerCase().includes('lead'),
  },
]

export function staffById(id: string): StaffView {
  return focalPointStaff.find((s) => s.id === id) ?? focalPointStaff[0]
}
