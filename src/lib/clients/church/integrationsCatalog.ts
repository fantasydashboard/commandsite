// Church-facing integrations catalog, curated to how Grace actually works.
// Planning Center is the only LIVE integration (rendered separately as the
// embedded connection); everything else is aspirational ("ask about adding").
// No fake "connected" states on a real client.
//
// `logo` (when present) is a brand SVG in /public/logos (from the open Simple
// Icons set, brand-colored). `mono` + `color` are the fallback tile when there
// is no logo. `color` is a raw third-party BRAND hex used only for that tile,
// NOT an app theme token.
export interface CatalogItem {
  key: string
  label: string
  category: string        // display group
  description: string
  note?: string           // e.g. sensitivity / roadmap note
  mono: string            // 1-2 char monogram fallback for the logo tile
  color: string           // brand color (hex) for the mono
  logo?: string           // /logos/<logo>.svg when a real brand mark exists
}

export const INTEGRATION_GROUPS: { key: string; label: string }[] = [
  { key: 'comms', label: 'How Grace reaches people' },
  { key: 'coordination', label: 'Staff coordination' },
  { key: 'social', label: 'Outbound presence' },
  { key: 'giving', label: 'Giving' },
  { key: 'other', label: 'More on the roadmap' },
]

export const CATALOG: CatalogItem[] = [
  { key: 'email', label: 'Email sending', category: 'comms', description: 'Send Grace\'s drafted welcome and care emails from your church address.', mono: 'Em', color: '#2563EB', logo: 'mailchimp' },
  { key: 'sms', label: 'Text messaging', category: 'comms', description: 'Send opt-in texts to guests and volunteers.', mono: 'Tx', color: '#F22F46' },
  { key: 'slack', label: 'Slack', category: 'coordination', description: 'Grace posts the morning brief and escalations to a staff channel.', mono: 'Sl', color: '#4A154B', logo: 'slack' },
  { key: 'instagram', label: 'Instagram', category: 'social', description: 'Grace drafts Sunday and event posts.', mono: 'Ig', color: '#E4405F', logo: 'instagram' },
  { key: 'facebook', label: 'Facebook', category: 'social', description: 'Long-form posts and sermon clips.', mono: 'Fb', color: '#1877F2', logo: 'facebook' },
  { key: 'giving', label: 'Giving (Tithe.ly / Planning Center)', category: 'giving', description: 'Aggregate giving trends, handled carefully.', note: 'Sensitive. We turn this on deliberately, with your privacy rules.', mono: 'Gv', color: '#16A34A' },
  { key: 'propresenter', label: 'ProPresenter', category: 'other', description: 'Sunday slides and lyrics.', mono: 'Pp', color: '#6D28D9' },
  { key: 'youtube', label: 'YouTube', category: 'other', description: 'Sermon livestream and archive.', mono: 'Yt', color: '#FF0000', logo: 'youtube' },
  { key: 'google_workspace', label: 'Google Workspace', category: 'other', description: 'Staff calendar and shared docs.', mono: 'GW', color: '#4285F4', logo: 'google' },
]

export function askEmailHref(churchLabel: string, item: CatalogItem): string {
  const subject = encodeURIComponent(`Integration request: ${item.label} (${churchLabel})`)
  const bodyText = `Hi, we'd like to explore adding the ${item.label} integration for ${churchLabel}.`
  const body = encodeURIComponent(bodyText)
  return `mailto:josh@commandsite.io?subject=${subject}&body=${body}`
}
