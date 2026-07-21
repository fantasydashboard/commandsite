// Church-facing integrations catalog, curated to how Grace actually works.
// Planning Center is the only LIVE integration; everything else is aspirational
// ("ask about adding"). No fake "connected" states on a real client.
export interface CatalogItem {
  key: string
  label: string
  category: string        // display group
  description: string
  live?: boolean          // true only for Planning Center (state comes from OAuth)
  note?: string           // e.g. sensitivity / roadmap note
}

export const INTEGRATION_GROUPS: { key: string; label: string }[] = [
  { key: 'chms', label: 'Source of truth' },
  { key: 'comms', label: 'How Grace reaches people' },
  { key: 'coordination', label: 'Staff coordination' },
  { key: 'social', label: 'Outbound presence' },
  { key: 'giving', label: 'Giving' },
  { key: 'other', label: 'More on the roadmap' },
]

export const CATALOG: CatalogItem[] = [
  { key: 'planning_center', label: 'Planning Center', category: 'chms', description: 'People, Check-Ins, Services, Groups. The church\'s source of truth.', live: true },
  { key: 'email', label: 'Email sending', category: 'comms', description: 'Send Grace\'s drafted welcome and care emails from your church address.' },
  { key: 'sms', label: 'Text messaging', category: 'comms', description: 'Send opt-in texts to guests and volunteers.' },
  { key: 'slack', label: 'Slack', category: 'coordination', description: 'Grace posts the morning brief and escalations to a staff channel.' },
  { key: 'instagram', label: 'Instagram', category: 'social', description: 'Grace drafts Sunday and event posts.' },
  { key: 'facebook', label: 'Facebook', category: 'social', description: 'Long-form posts and sermon clips.' },
  { key: 'giving', label: 'Giving (Tithe.ly / Planning Center)', category: 'giving', description: 'Aggregate giving trends, handled carefully.', note: 'Sensitive. We turn this on deliberately, with your privacy rules.' },
  { key: 'propresenter', label: 'ProPresenter', category: 'other', description: 'Sunday slides and lyrics.' },
  { key: 'youtube', label: 'YouTube', category: 'other', description: 'Sermon livestream and archive.' },
  { key: 'google_workspace', label: 'Google Workspace', category: 'other', description: 'Staff calendar and shared docs.' },
]

export function askEmailHref(churchLabel: string, item: CatalogItem): string {
  const subject = encodeURIComponent(`Integration request: ${item.label} (${churchLabel})`)
  const bodyText = `Hi, we'd like to explore adding the ${item.label} integration for ${churchLabel}.`
  const body = encodeURIComponent(bodyText)
  return `mailto:josh@commandsite.io?subject=${subject}&body=${body}`
}
