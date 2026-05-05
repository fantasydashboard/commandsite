/**
 * UFD Redesign — Cards & Shares fixtures.
 * The viral product surface. Cards ARE the product; analytics is the
 * engine; share-to-signup is the growth loop.
 */

export type CardType =
  | 'power_rankings'
  | 'trade_analyzer'
  | 'weekly_recap'
  | 'season_preview'
  | 'draft_kit'
  | 'sleeper_picks'
  | 'matchup_preview'
  | 'season_awards'

export type ShareChannel = 'twitter' | 'discord' | 'imessage' | 'group_chat' | 'reddit' | 'copy_link' | 'email'

export interface Card {
  id: string
  type: CardType
  title: string
  /** One-line punchline shown on the card itself */
  topline: string
  created_by_user_id: string
  created_by_name: string
  created_at: string
  /** Total share events for this card */
  shares: number
  /** External (non-logged-in) page views of this card's share page */
  external_views: number
  /** Trial signups attributed to viewing this card within 7d */
  signups_attributed: number
  /** % of external viewers who clicked the "Make your own" CTA */
  cta_click_rate: number
  /** Trending status — "rising fast" / "steady" / "fading" */
  status?: 'rising' | 'steady' | 'fading'
}

export interface CardTypePerf {
  type: CardType
  label: string
  emoji: string
  description: string
  cards_made_30d: number
  cards_shared_30d: number
  share_rate: number
  avg_views_per_share: number
  signups_attributed: number
  /** Color for chips and accents */
  color: string
}

export interface ChannelBreakdown {
  channel: ShareChannel
  label: string
  shares_30d: number
  signups_attributed: number
  /** Avg external views per share landing in this channel */
  avg_views: number
  color: string
  icon: string
}

export interface InsightItem {
  finding: string
  recommendation: string
  tone: 'good' | 'warn' | 'opportunity'
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  power_rankings:  'Power Rankings',
  trade_analyzer:  'Trade Analyzer',
  weekly_recap:    'Weekly Recap',
  season_preview:  'Season Preview',
  draft_kit:       'Draft Kit',
  sleeper_picks:   'Sleeper Picks',
  matchup_preview: 'Matchup Preview',
  season_awards:   'Season Awards',
}

export const cardTypePerf: CardTypePerf[] = [
  {
    type: 'power_rankings', label: 'Power Rankings', emoji: '🏆',
    description: 'Weekly team rankings with snarky one-liners — most-shared by far',
    cards_made_30d: 412, cards_shared_30d: 218, share_rate: 0.53,
    avg_views_per_share: 6.4, signups_attributed: 27,
    color: 'rgb(var(--color-brand))',
  },
  {
    type: 'weekly_recap', label: 'Weekly Recap', emoji: '📊',
    description: 'Sunday-night roast — winners, losers, biggest blowouts',
    cards_made_30d: 287, cards_shared_30d: 142, share_rate: 0.49,
    avg_views_per_share: 5.8, signups_attributed: 18,
    color: 'rgb(var(--color-accent))',
  },
  {
    type: 'trade_analyzer', label: 'Trade Analyzer', emoji: '🔁',
    description: 'Trade-grade card sent to league chat for the "objective" verdict',
    cards_made_30d: 184, cards_shared_30d: 98, share_rate: 0.53,
    avg_views_per_share: 4.1, signups_attributed: 12,
    color: '#10B981',
  },
  {
    type: 'matchup_preview', label: 'Matchup Preview', emoji: '⚔',
    description: 'Head-to-head trash talk fuel before each week\'s games',
    cards_made_30d: 142, cards_shared_30d: 51, share_rate: 0.36,
    avg_views_per_share: 3.7, signups_attributed: 6,
    color: '#F59E0B',
  },
  {
    type: 'season_awards', label: 'Season Awards', emoji: '🥇',
    description: 'End-of-season superlatives — Worst GM, Biggest Bust, etc.',
    cards_made_30d: 78, cards_shared_30d: 64, share_rate: 0.82,
    avg_views_per_share: 8.9, signups_attributed: 14,
    color: '#A855F7',
  },
  {
    type: 'draft_kit', label: 'Draft Kit', emoji: '📋',
    description: 'Pre-draft cheat sheet (seasonal — peaks Aug)',
    cards_made_30d: 24, cards_shared_30d: 8, share_rate: 0.33,
    avg_views_per_share: 2.4, signups_attributed: 1,
    color: '#94A3B8',
  },
  {
    type: 'sleeper_picks', label: 'Sleeper Picks', emoji: '💤',
    description: 'Underrated player picks — niche audience',
    cards_made_30d: 41, cards_shared_30d: 11, share_rate: 0.27,
    avg_views_per_share: 2.8, signups_attributed: 2,
    color: '#64748B',
  },
  {
    type: 'season_preview', label: 'Season Preview', emoji: '🏈',
    description: 'August preview — heavy seasonal cycle',
    cards_made_30d: 18, cards_shared_30d: 4, share_rate: 0.22,
    avg_views_per_share: 1.9, signups_attributed: 0,
    color: '#475569',
  },
]

export const channels: ChannelBreakdown[] = [
  { channel: 'group_chat', label: 'Group chat (iMessage/SMS)', shares_30d: 184, signups_attributed: 24, avg_views: 7.2, color: '#22C55E', icon: '💬' },
  { channel: 'discord',    label: 'Discord',                   shares_30d: 142, signups_attributed: 18, avg_views: 8.1, color: '#5865F2', icon: '🎮' },
  { channel: 'twitter',    label: 'Twitter / X',               shares_30d: 96,  signups_attributed: 22, avg_views: 12.4,color: '#0F1419', icon: '𝕏' },
  { channel: 'imessage',   label: 'Direct iMessage',           shares_30d: 78,  signups_attributed: 6,  avg_views: 2.1, color: '#0EA5E9', icon: '💌' },
  { channel: 'reddit',     label: 'Reddit',                    shares_30d: 41,  signups_attributed: 9,  avg_views: 14.8,color: '#FF4500', icon: 'r/' },
  { channel: 'copy_link',  label: 'Copy link (unknown destination)', shares_30d: 38,  signups_attributed: 1,  avg_views: 1.2, color: '#94A3B8', icon: '🔗' },
  { channel: 'email',      label: 'Email',                     shares_30d: 17,  signups_attributed: 0,  avg_views: 1.8, color: '#A855F7', icon: '✉' },
]

export const topCards: Card[] = [
  {
    id: 'cd-001', type: 'power_rankings',
    title: 'Week 18 Power Rankings — The Goat League',
    topline: '#1 Mason\'s Maulers (12-2) · #10 Devin\'s Disasters (3-11) · "The schedule loss in Week 12 was a war crime"',
    created_by_user_id: 'u-001', created_by_name: 'Mason Whitaker',
    created_at: ago(2),
    shares: 18, external_views: 14_280, signups_attributed: 11,
    cta_click_rate: 0.18, status: 'rising',
  },
  {
    id: 'cd-002', type: 'weekly_recap',
    title: 'Week 17 Recap — The Last Dance',
    topline: 'Trophy: Sasha P. (147 pts) · Loser: Kennedy P. (62 pts) · Trade of the year: Aubrey + her dignity for Devin\'s 4th-round pick',
    created_by_user_id: 'u-002', created_by_name: 'Jess Bowman',
    created_at: ago(4),
    shares: 14, external_views: 9_840, signups_attributed: 8,
    cta_click_rate: 0.21, status: 'rising',
  },
  {
    id: 'cd-003', type: 'season_awards',
    title: 'The Goat League — 2025 Season Awards',
    topline: 'Most Improved: Ramón T. · Worst Manager: Jordan M. · Biggest Bust: Drafting CMC 1st overall (sorry, Cam)',
    created_by_user_id: 'u-001', created_by_name: 'Mason Whitaker',
    created_at: ago(8),
    shares: 22, external_views: 18_400, signups_attributed: 14,
    cta_click_rate: 0.24, status: 'steady',
  },
  {
    id: 'cd-004', type: 'trade_analyzer',
    title: 'Trade Verdict — Tyrell trades CMC + Pickett for Bijan + Allen',
    topline: 'Verdict: SLIGHT EDGE TYRELL (51/49) · Notes: Trading away QB1 means matchup-dependent ceiling',
    created_by_user_id: 'u-014', created_by_name: 'Tyrell Brooks',
    created_at: ago(12),
    shares: 9, external_views: 4_120, signups_attributed: 4,
    cta_click_rate: 0.15, status: 'steady',
  },
  {
    id: 'cd-005', type: 'matchup_preview',
    title: 'Matchup Preview — Brooks Bandits vs Castillo Comets',
    topline: 'Spread: Bandits −12.4 · Key matchup: Allen vs Cardinals D · Hot take: "Aubrey hasn\'t set a starting lineup since Week 3"',
    created_by_user_id: 'u-014', created_by_name: 'Tyrell Brooks',
    created_at: ago(14),
    shares: 6, external_views: 1_840, signups_attributed: 2,
    cta_click_rate: 0.11, status: 'fading',
  },
  {
    id: 'cd-006', type: 'power_rankings',
    title: 'Week 17 Power Rankings — Sleeper Stunners',
    topline: 'Top tier: 4 teams clustered within 3 points · Wild card race: 6 teams alive · Cellar dweller: Marcus, embarrassingly',
    created_by_user_id: 'u-013', created_by_name: 'Sasha Pellegrino',
    created_at: ago(11),
    shares: 5, external_views: 2_980, signups_attributed: 3,
    cta_click_rate: 0.14, status: 'steady',
  },
  {
    id: 'cd-007', type: 'weekly_recap',
    title: 'Week 16 Recap — Survive and Advance',
    topline: 'Highest score: Devin\'s Disasters 168 pts · Lowest: Tasha\'s Tigers 41 pts (had 3 byes she didn\'t check)',
    created_by_user_id: 'u-003', created_by_name: 'Devin Patel',
    created_at: ago(18),
    shares: 4, external_views: 1_240, signups_attributed: 1,
    cta_click_rate: 0.09, status: 'fading',
  },
  {
    id: 'cd-008', type: 'season_awards',
    title: 'My Yahoo Friends League — End of Season Awards',
    topline: 'Champ: Ramón Téllez · Sleeper: Riley Boucher (waiver pickup hit) · "Most Petty Trade Veto" award TBD',
    created_by_user_id: 'u-005', created_by_name: 'Ramón Téllez',
    created_at: ago(22),
    shares: 7, external_views: 3_410, signups_attributed: 2,
    cta_click_rate: 0.16, status: 'steady',
  },
]

export interface ShareFunnelStep {
  stage: string
  description: string
  count: number
  pct_of_top: number
}

export function shareFunnel(): ShareFunnelStep[] {
  const top = 1186  // total cards made 30d (sum across types)
  const steps = [
    { stage: 'Card made',                description: 'User customized + saved a card',                       count: 1186 },
    { stage: 'Card shared',              description: 'User hit the Share button (any channel)',              count: 596 },
    { stage: 'External page view',       description: 'Someone outside UFD opened the share link',            count: 4_212 },
    { stage: 'CTA click',                description: 'External viewer clicked "Make your own"',                count: 487 },
    { stage: 'Trial signup',             description: 'External viewer started a 7-day free trial',             count: 80 },
  ]
  return steps.map((s) => ({ ...s, pct_of_top: s.count / top }))
}

export const insights: InsightItem[] = [
  {
    finding: 'Season Awards cards have an 82% share rate — by far your highest-converting card type. They\'re also seasonal (peak January).',
    recommendation: 'Add a "Season Awards" prompt nudge in early December. Email + in-app banner: "End of season — drop your league\'s awards card."',
    tone: 'opportunity',
  },
  {
    finding: 'Reddit shares get 14.8× external views — way above average — but only 9 attributed signups across 41 shares (22%).',
    recommendation: 'Reddit cards land on a generic share page. Build a Reddit-specific landing page with the "Make your own" CTA above-the-fold + screenshot demo.',
    tone: 'opportunity',
  },
  {
    finding: 'Group chat (iMessage / SMS) shares drive 24 attributed signups — your #1 channel for converting attention to revenue.',
    recommendation: 'Make sharing-to-group-chat the default option in the share modal. Currently buried under Twitter/Reddit in the UI.',
    tone: 'good',
  },
  {
    finding: 'CTA click-through varies 9–24% across cards. Top cards have the league name in the title (personal context); bottom cards are generic.',
    recommendation: 'When generating a card, default the title to include the user\'s league name (e.g., "Week 12 Power Rankings — The Goat League").',
    tone: 'opportunity',
  },
  {
    finding: 'Email shares (17 in 30d) drove 0 signups. Email sharing is essentially dead weight.',
    recommendation: 'Remove email from the primary share button. Keep as an "Other" submenu option for completeness.',
    tone: 'warn',
  },
]

export interface CardStats {
  cards_made_30d: number
  cards_shared_30d: number
  share_rate: number
  external_views_30d: number
  signups_attributed_30d: number
  share_to_signup_rate: number
  /** Estimated $ value of viral signups (signups × LTV) */
  viral_revenue_attributed_cents: number
}

export function cardStats(): CardStats {
  const made = cardTypePerf.reduce((s, c) => s + c.cards_made_30d, 0)
  const shared = cardTypePerf.reduce((s, c) => s + c.cards_shared_30d, 0)
  const views = channels.reduce((s, c) => s + c.shares_30d * c.avg_views, 0)
  const signups = channels.reduce((s, c) => s + c.signups_attributed, 0)
  const ltv_cents = 18_500
  return {
    cards_made_30d: made,
    cards_shared_30d: shared,
    share_rate: made > 0 ? shared / made : 0,
    external_views_30d: Math.round(views),
    signups_attributed_30d: signups,
    share_to_signup_rate: shared > 0 ? signups / shared : 0,
    viral_revenue_attributed_cents: signups * ltv_cents,
  }
}
