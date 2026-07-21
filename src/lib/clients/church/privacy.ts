// Church privacy / role-gating config. Canonical list of toggles (keys are the
// contract the dashboard enforces against), persisted per church in
// public.church_settings. UI-level gating: a toggle here hides a data category
// for the wrong scope. Real "can't get it" hardness comes with the server-data
// phase; for now this controls what the app SHOWS.
import { supabase } from '@/lib/supabase'

export interface PrivacyToggle {
  key: string
  label: string
  description: string
  default: boolean
}

export const CHURCH_PRIVACY: PrivacyToggle[] = [
  { key: 'giving_restricted', label: 'Giving data restricted to senior pastor + finance', description: 'Other staff see aggregate trends only, never per-household amounts. Recommended.', default: true },
  { key: 'pastoral_notes_staff_only', label: 'Pastoral notes visible to staff only', description: 'Notes on People, Care, and Visitor records hidden from volunteers.', default: true },
  { key: 'small_group_attendance_own_only', label: 'Small-group leaders see attendance for their group only', description: 'Prayer requests and attendance scoped to the leader\'s own group.', default: true },
  { key: 'volunteer_schedule_visible_all', label: 'Volunteer schedule visible to all staff + volunteers', description: 'Anyone can see who is serving what role, coordination over privacy here.', default: true },
  { key: 'first_time_visitors_silent', label: 'First-time visitors stay silent until they confirm a 2nd visit', description: 'Do not auto-text first-timers, wait until the 24h email is acknowledged. Read by Grace\'s outreach, not a visibility rule.', default: false },
]

export type PrivacyConfig = Record<string, boolean>

export function defaultPrivacy(): PrivacyConfig {
  return Object.fromEntries(CHURCH_PRIVACY.map((t) => [t.key, t.default]))
}

// pco_connections isn't the only table missing from generated types; church_settings
// is new too. Cast narrowly (matches the codebase's Supabase generic tolerance).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export async function getPrivacy(clientId: string): Promise<PrivacyConfig> {
  const base = defaultPrivacy()
  const { data, error } = await sb
    .from('church_settings')
    .select('privacy')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error || !data?.privacy) return base
  return { ...base, ...(data.privacy as PrivacyConfig) }
}

export async function savePrivacy(clientId: string, config: PrivacyConfig): Promise<void> {
  const { error } = await sb
    .from('church_settings')
    .upsert({ client_id: clientId, privacy: config }, { onConflict: 'client_id' })
  if (error) throw new Error(error.message)
}
