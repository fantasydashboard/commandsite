// Church-facing integrations catalog, curated to how Grace actually works.
// Planning Center is the only LIVE integration (rendered separately as the
// embedded connection); everything else is aspirational ("ask about adding").
// No fake "connected" states on a real client.
//
// `color` is the third-party BRAND color used only for that tool's logo tile.
// It is deliberately a raw hex (an external brand mark), NOT an app theme token.
export interface CatalogItem {
  key: string
  label: string
  category: string        // display group
  description: string
  note?: string           // e.g. sensitivity / roadmap note
  mono: string            // 1-2 char monogram for the logo tile
  color: string           // brand color (hex) for the logo tile
}

export const INTEGRATION_GROUPS: { key: string; label: string }[] = [
  { key: 'comms', label: 'How Grace reaches people' },
  { key: 'coordination', label: 'Staff coordination' },
  { key: 'social', label: 'Outbound presence' },
  { key: 'giving', label: 'Giving' },
  { key: 'other', label: 'More on the roadmap' },
]

export const CATALOG: CatalogItem[] = [
  { key: 'email', label: 'Email sending', category: 'comms', description: 'Send Grace\'s drafted welcome and care emails from your church address.', mono: 'Em', color: '#2563EB' },
  { key: 'sms', label: 'Text messaging', category: 'comms', description: 'Send opt-in texts to guests and volunteers.', mono: 'Tx', color: '#0EA5E9' },
  { key: 'slack', label: 'Slack', category: 'coordination', description: 'Grace posts the morning brief and escalations to a staff channel.', mono: 'Sl', color: '#4A154B' },
  { key: 'instagram', label: 'Instagram', category: 'social', description: 'Grace drafts Sunday and event posts.', mono: 'Ig', color: '#E4405F' },
  { key: 'facebook', label: 'Facebook', category: 'social', description: 'Long-form posts and sermon clips.', mono: 'Fb', color: '#1877F2' },
  { key: 'giving', label: 'Giving (Tithe.ly / Planning Center)', category: 'giving', description: 'Aggregate giving trends, handled carefully.', note: 'Sensitive. We turn this on deliberately, with your privacy rules.', mono: 'Gv', color: '#16A34A' },
  { key: 'propresenter', label: 'ProPresenter', category: 'other', description: 'Sunday slides and lyrics.', mono: 'Pp', color: '#6D28D9' },
  { key: 'youtube', label: 'YouTube', category: 'other', description: 'Sermon livestream and archive.', mono: 'Yt', color: '#FF0000' },
  { key: 'google_workspace', label: 'Google Workspace', category: 'other', description: 'Staff calendar and shared docs.', mono: 'GW', color: '#4285F4' },
]

export function askEmailHref(churchLabel: string, item: CatalogItem): string {
  const subject = encodeURIComponent(`Integration request: ${item.label} (${churchLabel})`)
  const bodyText = `Hi, we'd like to explore adding the ${item.label} integration for ${churchLabel}.`
  const body = encodeURIComponent(bodyText)
  return `mailto:josh@commandsite.io?subject=${subject}&body=${body}`
}
