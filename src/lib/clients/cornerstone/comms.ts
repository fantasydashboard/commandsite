/**
 * Cornerstone — Communications.
 * Multi-channel: weekly bulletin email + Instagram + Facebook + SMS
 * broadcasts. Single-page module with internal subviews. AI drafts
 * everything in the church\'s voice; pastor approves before send.
 */

export type Channel = 'bulletin' | 'instagram' | 'facebook' | 'sms'
export type PostStatus = 'draft' | 'scheduled' | 'sent' | 'paused'
export type PostKind =
  | 'weekly_bulletin'
  | 'sunday_morning'
  | 'announcement'
  | 'sermon_clip'
  | 'community_event'
  | 'urgent_text'
  | 'volunteer_recruit'
  | 'serve_invite'
  | 'celebration'

export interface Post {
  id: string
  channel: Channel
  kind: PostKind
  status: PostStatus
  scheduled_at: string
  posted_at?: string
  /** Headline / subject / first line — what the user sees first */
  title: string
  body: string
  /** Optional image / cover thumbnail label (we render placeholder visuals) */
  image_label?: string
  /** Performance, only set if posted */
  reach?: number
  engagements?: number
  click_throughs?: number
  /** Audience size — for SMS/email this is recipient count */
  audience?: number
}

export interface BrandVoice {
  tone: string[]
  do_say: string[]
  dont_say: string[]
  signature_phrases: string[]
  prompt_guide: string
}

function ago(hours: number): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}
function dayAt(daysFromNow: number, hour = 9, mins = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hour, mins, 0, 0)
  return d.toISOString()
}

export const CHANNEL_META: Record<Channel, { label: string; color: string; icon: string }> = {
  bulletin:  { label: 'Bulletin email', color: 'rgb(var(--color-brand))', icon: '✉' },
  instagram: { label: 'Instagram',      color: '#E1306C',                  icon: 'IG' },
  facebook:  { label: 'Facebook',       color: '#1877F2',                  icon: 'FB' },
  sms:       { label: 'SMS broadcast',  color: '#10B981',                  icon: '💬' },
}

export const KIND_LABEL: Record<PostKind, string> = {
  weekly_bulletin:   'Weekly bulletin',
  sunday_morning:    'Sunday morning',
  announcement:      'Announcement',
  sermon_clip:       'Sermon clip',
  community_event:   'Community event',
  urgent_text:       'Urgent text',
  volunteer_recruit: 'Volunteer recruit',
  serve_invite:      'Serve invite',
  celebration:       'Celebration',
}

export const posts: Post[] = [
  // ── DRAFTS / QUEUED — this week
  {
    id: 'cm-001',
    channel: 'bulletin', kind: 'weekly_bulletin', status: 'scheduled',
    scheduled_at: dayAt(2, 6),  // Friday morning send
    title: `This Sunday: Week 3 of "Honest Prayers"`,
    body: `Hey Cornerstone family,\n\nA few things for the week:\n\n📖 SUNDAY · "When the Honest Prayer is 'Why?'" — wrestling with Psalm 13 + Habakkuk 1. Week 3 of our Honest Prayers series.\n\n🍽 NEWCOMERS LUNCH · Last Sunday of the month right after 11 AM service. Free lunch, no strings, just a chance to meet a few of us in a smaller setting. Reply YES if you\'re coming.\n\n💒 GRIEF + JOY · The Foster family lost James\'s father this week — funeral Friday. The Ellisons welcomed a baby boy Tuesday. Carrying both with our prayers.\n\n🛠 SPRING SERVICE DAY · Saturday May 17 with Habitat for Humanity. Sign-up in the lobby Sunday or reply to RSVP.\n\nSee you Sunday,\n— Pastor Mark`,
    audience: 412,
  },
  {
    id: 'cm-002',
    channel: 'instagram', kind: 'sunday_morning', status: 'scheduled',
    scheduled_at: dayAt(3, 8, 30),  // Sunday 8:30 AM auto-post
    title: `See you at 9 or 11 today`,
    body: `Doors open at 8:30. Coffee\'s already on. Today: Week 3 of "Honest Prayers" — the one about asking "why."\n\n9 AM + 11 AM, both services identical.`,
    image_label: 'Sermon series cover · "Honest Prayers"',
  },
  {
    id: 'cm-003',
    channel: 'facebook', kind: 'community_event', status: 'scheduled',
    scheduled_at: dayAt(0, 14),
    title: `Spring Service Day — May 17`,
    body: `Cornerstone family — we\'re partnering with Habitat for Humanity on Saturday, May 17 to help build a home for a single mom in Pine Hills. 8 AM to 2 PM, lunch provided, bring closed-toe shoes.\n\nSign up at the link below or in the lobby Sunday. Bring a friend.`,
    image_label: 'Habitat build photo from last year',
  },
  {
    id: 'cm-004',
    channel: 'sms', kind: 'urgent_text', status: 'draft',
    scheduled_at: dayAt(1, 8),
    title: `Funeral details — Friday`,
    body: `Cornerstone family — Friday at 10 AM at Woodlawn we\'re gathering to remember James Foster\'s dad. James + Amanda would love your presence. Carpool from Cornerstone parking lot at 9:15 if helpful. Reply ❤️ if you\'re coming.`,
    audience: 87,  // sent to those who said they wanted urgent comms
  },
  {
    id: 'cm-005',
    channel: 'instagram', kind: 'celebration', status: 'draft',
    scheduled_at: dayAt(1, 17),
    title: `Welcome, baby Ellison 👶`,
    body: `Big congrats to Wes + Tara Ellison on welcoming their baby boy this week. The whole Cornerstone family is rejoicing with you. (Meals are covered — Jess Bowman is captaining the train.)`,
    image_label: 'Generic baby announcement template — pre-cleared with the Ellisons',
  },
  {
    id: 'cm-006',
    channel: 'bulletin', kind: 'volunteer_recruit', status: 'draft',
    scheduled_at: dayAt(4, 6),  // Following Friday
    title: `We could use you in nursery`,
    body: `Cornerstone parents,\n\nNursery is the most-asked-about + lowest-staffed serve role at Cornerstone right now. We\'re short 2 volunteers most weeks.\n\nTwo asks:\n\n1. If you have a few hours a month + love babies (0-2), reply to this email + we\'ll plug you in. Once-a-month commitment is fine.\n\n2. If you\'re a parent who has used nursery this year and benefited from it, consider a once-a-month rotation as a way to give back. The other parents will thank you.\n\nIt\'s 60 minutes. We provide the snacks. Background check is on us.\n\n— Pastor Mark`,
    audience: 412,
  },

  // ── POSTED — this week (with performance)
  {
    id: 'cm-007',
    channel: 'bulletin', kind: 'weekly_bulletin', status: 'sent',
    scheduled_at: ago(168), posted_at: ago(168),
    title: `This Sunday: Week 2 of "Honest Prayers"`,
    body: `[last week\'s bulletin — "When the Honest Prayer is 'Help' (Psalm 22)"]`,
    audience: 408, reach: 408, engagements: 271, click_throughs: 84,
  },
  {
    id: 'cm-008',
    channel: 'instagram', kind: 'sunday_morning', status: 'sent',
    scheduled_at: ago(120), posted_at: ago(120),
    title: `Week 2 of Honest Prayers`,
    body: `When the honest prayer is "help" — wrestling with Psalm 22 today. 9 AM + 11 AM.`,
    image_label: 'Sermon series cover',
    reach: 1_240, engagements: 187, click_throughs: 14,
  },
  {
    id: 'cm-009',
    channel: 'facebook', kind: 'sermon_clip', status: 'sent',
    scheduled_at: ago(72), posted_at: ago(72),
    title: `2-min clip — "Even Jesus prayed 'why'"`,
    body: `Quick clip from this past Sunday\'s message — when even Jesus prayed "Why have you forsaken me?" we\'re given permission to ask the same questions.`,
    image_label: 'Sermon clip thumbnail with sermon title overlay',
    reach: 2_180, engagements: 142, click_throughs: 38,
  },
  {
    id: 'cm-010',
    channel: 'sms', kind: 'serve_invite', status: 'sent',
    scheduled_at: ago(96), posted_at: ago(96),
    title: `Last-minute nursery help?`,
    body: `Hey {{first_name}} — nursery is short 2 volunteers Sunday at 9. You\'ve helped before in a pinch — any chance you could swing it? Just 60 min.`,
    audience: 8, reach: 8, engagements: 5, click_throughs: 0,
  },
]

export const brandVoice: BrandVoice = {
  tone: [
    'Warm and pastoral, not corporate',
    'Speaks like a person, not a marketing team',
    'Honest about hard things (death, doubt, loss), joyful about good things',
    'Confident in faith but never preachy in announcements',
  ],
  do_say: [
    'Cornerstone family',
    'Carrying you in our prayers',
    'No pressure',
    'Genuinely',
    'Reply if you\'re coming',
    'See you Sunday',
  ],
  dont_say: [
    '"Hey {{first_name}}!" with manufactured cheer',
    'Synergy / leverage / robust (corporate-speak)',
    '"Don\'t miss" / "blessed beyond measure" / "doing life together" (overused church-speak)',
    'CTAs that sound like sales',
    'Generic stock phrases',
  ],
  signature_phrases: [
    '— Pastor Mark',
    'See you Sunday',
    'No pressure',
    'Carrying you in our prayers',
  ],
  prompt_guide: `You are Pastor Mark, the lead pastor at Cornerstone Community Church (a mid-size non-denominational church). Write all communications in first person, with warmth and pastoral care.

Voice: warm and pastoral, never corporate. Talk like a person, not a marketing team. Be honest about hard things (death, doubt, loss) and joyful about good things (birth, wins, breakthroughs). Be confident in faith but never preachy in announcements.

Avoid: corporate-speak ("synergy," "leverage," "robust"), manufactured cheer ("Hey {{first_name}}!" with exclamation), and overused church-speak ("don\'t miss," "doing life together," "blessed beyond measure"). Use plain English.

Always end pastor-signed messages with "— Pastor Mark." Pair invitations with a way to opt out gracefully ("no pressure if it\'s not the season"). When acknowledging life events, name them — births and deaths both deserve honest words, not generic platitudes.

Match the channel: bulletin emails are longer and personal; Instagram is short and visual; Facebook is mid-length and shareable; SMS is brief, warm, and respects that you\'re interrupting someone\'s day.`,
}

export interface CommsStats {
  scheduled_count: number
  draft_count: number
  sent_30d: number
  bulletin_subscribers: number
  bulletin_open_rate: number
  social_followers_combined: number
  sms_audience: number
  drafts_pending_approval: number
}

export function commsStats(): CommsStats {
  return {
    scheduled_count: posts.filter((p) => p.status === 'scheduled').length,
    draft_count: posts.filter((p) => p.status === 'draft').length,
    sent_30d: posts.filter((p) => p.status === 'sent').length,
    bulletin_subscribers: 412,
    bulletin_open_rate: 0.66,
    social_followers_combined: 2_840,
    sms_audience: 287,
    drafts_pending_approval: posts.filter((p) => p.status === 'draft').length,
  }
}
