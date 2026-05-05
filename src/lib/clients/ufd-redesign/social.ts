/**
 * UFD Redesign — Social fixtures.
 * Reddit-first by design. Twitter/X secondary, TikTok / YouTube Shorts
 * for video cards. Listening (Reddit mentions inbox) is treated as a
 * lead-signal surface — the same pattern that worked in CommandSite,
 * but the audience is fantasy managers rather than home-services owners.
 */

export type Platform = 'reddit' | 'twitter' | 'youtube' | 'tiktok'
export type PostStatus = 'draft' | 'queued' | 'posted' | 'paused'
export type PostFormat = 'short' | 'thread' | 'long' | 'video' | 'image'

export interface Post {
  id: string
  platform: Platform
  /** Reddit only — which subreddit */
  subreddit?: string
  status: PostStatus
  scheduled_at: string
  posted_at?: string
  title?: string
  body: string
  format: PostFormat
  /** Performance — when posted */
  impressions?: number
  upvotes?: number
  comments?: number
  /** Trial signups attributed within 7d of post going live */
  trial_signups?: number
}

export type ListeningClass = 'lead_signal' | 'question' | 'praise' | 'complaint' | 'spam' | 'off_topic'

export interface Mention {
  id: string
  platform: Platform
  subreddit?: string
  thread_title: string
  thread_url: string
  author: string
  snippet: string
  classification: ListeningClass
  /** AI confidence 0-1 */
  confidence: number
  ai_suggested_reply: string
  /** Has the user signed up for UFD already? */
  is_existing_user: boolean
  received_at: string
}

function ago(hours: number, mins = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, d.getMinutes() - mins, 0, 0)
  return d.toISOString()
}
function dayAt(daysFromNow: number, hour = 10, mins = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hour, mins, 0, 0)
  return d.toISOString()
}

export const PLATFORM_META: Record<Platform, { label: string; short: string; color: string; icon: string }> = {
  reddit:  { label: 'Reddit',         short: 'r/', color: '#FF4500', icon: 'r' },
  twitter: { label: 'Twitter / X',    short: 'X',  color: '#0F1419', icon: '𝕏' },
  youtube: { label: 'YouTube Shorts', short: 'YT', color: '#FF0000', icon: '▶' },
  tiktok:  { label: 'TikTok',         short: 'TT', color: '#000000', icon: '♪' },
}

export const CLASS_META: Record<ListeningClass, { label: string; color: string; icon: string }> = {
  lead_signal: { label: 'Lead signal', color: '#10B981',                  icon: '🎯' },
  question:    { label: 'Question',    color: 'rgb(var(--color-brand))',  icon: '❓' },
  praise:      { label: 'Praise',      color: '#A855F7',                  icon: '🙌' },
  complaint:   { label: 'Complaint',   color: '#F59E0B',                  icon: '⚠' },
  spam:        { label: 'Spam',        color: '#475569',                  icon: '⛔' },
  off_topic:   { label: 'Off-topic',   color: '#94A3B8',                  icon: '◯' },
}

// ── POSTS — past week + next week ──────────────────────────────────────
export const posts: Post[] = [
  // PAST
  {
    id: 'p-001', platform: 'reddit', subreddit: 'r/fantasyfootball',
    status: 'posted', scheduled_at: dayAt(-6, 10), posted_at: dayAt(-6, 10),
    format: 'long',
    title: 'I built a tool that auto-generates Power Rankings cards for your league chat',
    body: `Hey everyone — built UFD because I got tired of manually formatting power rankings every Tuesday in the league chat. Now it pulls from ESPN/Yahoo/Sleeper and spits out a card you can share to iMessage / Discord in one tap.\n\nFree 7-day trial, no credit card. Built by a solo dev who plays in 4 leagues. AMA.`,
    impressions: 18_400, upvotes: 287, comments: 42, trial_signups: 38,
  },
  {
    id: 'p-002', platform: 'twitter', status: 'posted',
    scheduled_at: dayAt(-5, 13), posted_at: dayAt(-5, 13),
    format: 'short',
    body: `Most-used UFD card type in 2025: Power Rankings.\nMost-shared: Season Awards.\n\nThe pattern: people make what they need weekly, but they share what makes them feel clever.\n\n(Building this is a constant lesson in human behavior.)`,
    impressions: 6_240, upvotes: 184, comments: 22, trial_signups: 4,
  },
  {
    id: 'p-003', platform: 'reddit', subreddit: 'r/Sleeperapp',
    status: 'posted', scheduled_at: dayAt(-4, 14), posted_at: dayAt(-4, 14),
    format: 'long',
    title: 'Best way to pull Sleeper data into shareable graphics?',
    body: `Saw a few posts asking about this. I built UFD specifically for Sleeper users — the Sleeper API is the cleanest of the three (way better than ESPN's). Trade Analyzer + Weekly Recap pulls work without auth headaches.\n\n7-day free trial if anyone wants to try it. Mostly built it for myself + my dynasty league.`,
    impressions: 4_120, upvotes: 142, comments: 28, trial_signups: 14,
  },
  {
    id: 'p-004', platform: 'youtube', status: 'posted',
    scheduled_at: dayAt(-3, 17), posted_at: dayAt(-3, 17),
    format: 'video',
    title: '60-second Power Rankings card walkthrough',
    body: `Short showing the full flow: connect ESPN → 4 seconds later, Power Rankings card auto-generated → tap "Share to group chat" → send to league.`,
    impressions: 2_840, upvotes: 89, comments: 11, trial_signups: 3,
  },
  {
    id: 'p-005', platform: 'reddit', subreddit: 'r/DynastyFF',
    status: 'posted', scheduled_at: dayAt(-2, 11), posted_at: dayAt(-2, 11),
    format: 'long',
    title: 'Dynasty rookie tier list card — built one for our league last night',
    body: `Made one of these for our 12-team SF dynasty using UFD's draft kit. Colored by tier, includes ADP + my own ranking + the league's pre-set draft order. Took ~5 min total. Posting because someone asked yesterday how I formatted it.`,
    impressions: 3_180, upvotes: 168, comments: 31, trial_signups: 9,
  },
  {
    id: 'p-006', platform: 'twitter', status: 'posted',
    scheduled_at: dayAt(-1, 9), posted_at: dayAt(-1, 9),
    format: 'short',
    body: `Hot take from running UFD for a year:\n\nFantasy SaaS retention is bimodal. In-season cohorts retain ~80% at month 3. Off-season cohorts retain ~30%. Same product.\n\nRetention isn't a feature — it's a season.`,
    impressions: 8_240, upvotes: 421, comments: 38, trial_signups: 7,
  },

  // QUEUED — next week
  {
    id: 'p-007', platform: 'reddit', subreddit: 'r/fantasyfootball',
    status: 'queued', scheduled_at: dayAt(0, 14),
    format: 'long',
    title: 'Built an auto-Season-Awards generator for your league',
    body: `[draft] Most leagues do "Most Improved" and "Worst Manager" awards by hand at the end of the season. UFD generates one in 30 seconds — pulls from your final standings + season-long stats. Free during your trial. r/fantasyfootball folks, would love beta feedback.`,
  },
  {
    id: 'p-008', platform: 'twitter', status: 'queued',
    scheduled_at: dayAt(0, 19),
    format: 'thread',
    body: `[draft thread] 5 lessons from a year of building B2C SaaS for fantasy football managers 🧵\n\n1/ Seasonality is real and it\'s not a bug — it\'s the operating reality. Plan for it.\n\n2/ Cards > Charts. Visuals that fit a phone screen + scream "screenshot me" win every time.`,
  },
  {
    id: 'p-009', platform: 'reddit', subreddit: 'r/fantasyfootball',
    status: 'queued', scheduled_at: dayAt(2, 10),
    format: 'long',
    title: 'NFL draft prep is starting — what\'s your league\'s ritual?',
    body: `[draft, community-discussion not promo] Curious what other leagues do for draft prep. Pre-draft mock? Live chat in the league? Cheat sheets? Asking partly because UFD\'s draft kit is the next thing I want to improve and I want to know what people actually use.`,
  },
  {
    id: 'p-010', platform: 'youtube', status: 'queued',
    scheduled_at: dayAt(3, 16),
    format: 'video',
    title: 'What it takes to ship a fantasy SaaS solo (5min)',
    body: `[script outline] Behind-the-scenes: stack, AI tools used, what works, what doesn\'t. Followups go to the trial signup link in description.`,
  },
  {
    id: 'p-011', platform: 'reddit', subreddit: 'r/Sleeperapp',
    status: 'queued', scheduled_at: dayAt(4, 11),
    format: 'long',
    title: 'Trade Analyzer for Sleeper — beta is open',
    body: `[draft] Sleeper users specifically — Trade Analyzer is the most-asked-for card in our roadmap. Beta is open this week. Pulls from your current Sleeper league\'s scoring + roster makeup. Drops a card you can share back to the league chat.`,
  },

  // DRAFTS
  {
    id: 'p-012', platform: 'twitter', status: 'draft',
    scheduled_at: dayAt(7, 9),
    format: 'short',
    body: `[draft] Marketing for fantasy football = build something that gets shared in group chats. Distribution is downstream of having something worth screenshotting.`,
  },
]

// ── REDDIT MENTIONS (the listening inbox) ──────────────────────────────
export const mentions: Mention[] = [
  {
    id: 'm-001', platform: 'reddit', subreddit: 'r/fantasyfootball',
    thread_title: '[Help] Best tool for league power rankings?',
    thread_url: 'https://reddit.com/r/fantasyfootball/comments/xyz1',
    author: 'u/dynasty_devotee',
    snippet: `My commish has been doing power rankings by hand for 8 years and is finally retiring from it. Looking for a tool that auto-generates them without me needing to do CSV exports. Bonus if it has Sleeper support since 3/12 of us are on Sleeper now.`,
    classification: 'lead_signal', confidence: 0.94,
    ai_suggested_reply: `This is exactly what UFD was built for. Pulls from Sleeper directly (no exports needed), generates a Power Rankings card every Tuesday + Friday, and sends it back to your group chat in one tap. Free 7-day trial — let me know if you hit any snags wiring up Sleeper, happy to help directly. ufd.app`,
    is_existing_user: false, received_at: ago(0, 28),
  },
  {
    id: 'm-002', platform: 'reddit', subreddit: 'r/DynastyFF',
    thread_title: 'Anyone using UFD for dynasty?',
    thread_url: 'https://reddit.com/r/DynastyFF/comments/xyz2',
    author: 'u/long_term_lance',
    snippet: `Saw it mentioned in a Sleeper thread last week. Tried the free trial — power rankings card is solid. Wondering if it handles dynasty-specific stuff like contracts + rookie picks for my SF league?`,
    classification: 'question', confidence: 0.88,
    ai_suggested_reply: `Glad you tried it. Quick honest answer: dynasty contracts + rookie picks aren\'t fully built out yet — currently treats them as "additional metadata" you can layer on the card. Full dynasty mode (cap hits, rookie pick valuations, traded picks) is on the roadmap for August. If you want to be on the early-access list reply with your email or DM me.`,
    is_existing_user: true, received_at: ago(2),
  },
  {
    id: 'm-003', platform: 'reddit', subreddit: 'r/fantasyfootball',
    thread_title: 'Goodbye to my favorite tool, Yahoo Pulse',
    thread_url: 'https://reddit.com/r/fantasyfootball/comments/xyz3',
    author: 'u/yahoo_lifer',
    snippet: `RIP Yahoo Pulse, killed in their app refresh. Anyone know an alternative for getting weekly summary content for my Yahoo league?`,
    classification: 'lead_signal', confidence: 0.91,
    ai_suggested_reply: `Tough loss — Pulse was good. UFD does Yahoo specifically and includes the weekly recap card you might be missing. Pulls from Yahoo via OAuth, no manual setup. Free 7-day trial. Worth a look. ufd.app`,
    is_existing_user: false, received_at: ago(4),
  },
  {
    id: 'm-004', platform: 'reddit', subreddit: 'r/fantasyfootball',
    thread_title: 'UFD review after a season — is it worth $79/yr?',
    thread_url: 'https://reddit.com/r/fantasyfootball/comments/xyz4',
    author: 'u/mwhitaker_ff',
    snippet: `I\'ve been a Pro subscriber for ~12 months. Power Rankings card every week genuinely transformed our league chat — guys who used to be lurkers are now arguing in detail. Worth the $79 easily for me.`,
    classification: 'praise', confidence: 0.96,
    ai_suggested_reply: `Mason — appreciate this more than you know. Mind if I quote this in next week\'s newsletter (with a free month of credit on me as a thank-you)?`,
    is_existing_user: true, received_at: ago(6),
  },
  {
    id: 'm-005', platform: 'reddit', subreddit: 'r/fantasyfootball',
    thread_title: 'UFD trade analyzer is overrated',
    thread_url: 'https://reddit.com/r/fantasyfootball/comments/xyz5',
    author: 'u/sharp_stat_guy',
    snippet: `Tried the trade analyzer card. The "verdict" feels like it\'s based on rest-of-season projections only — doesn\'t account for league tendencies (e.g., my league is shallow at TE so a TE trade is worth more than the card says). Would love a "league context" weighting.`,
    classification: 'complaint', confidence: 0.83,
    ai_suggested_reply: `Honest critique — you\'re right. Currently weights everything by rest-of-season projections and ignores league-specific scarcity. League-context weighting is on the roadmap for Q3. In the meantime, you can edit the verdict text before sharing. DM me your league setup if you want to be in the beta when it ships.`,
    is_existing_user: true, received_at: ago(10),
  },
  {
    id: 'm-006', platform: 'reddit', subreddit: 'r/Sleeperapp',
    thread_title: 'Anyone built a tool that pulls Sleeper data?',
    thread_url: 'https://reddit.com/r/Sleeperapp/comments/xyz6',
    author: 'u/builder_tinkering',
    snippet: `I\'m a dev curious about what people are building on top of Sleeper\'s API. Bonus if there\'s a hosted product I can compare to my own scratch project.`,
    classification: 'question', confidence: 0.74,
    ai_suggested_reply: `Hey — solo dev here, built UFD on Sleeper\'s API as one of the data sources. Quick takeaway: their public endpoints are great, no auth headaches like ESPN. The Power Rankings + Trade Analyzer are the most-pulled. If you want the API rate limits we\'ve hit + any tips, happy to share. Otherwise the hosted product is at ufd.app for comparison.`,
    is_existing_user: false, received_at: ago(14),
  },
  {
    id: 'm-007', platform: 'twitter', thread_title: 'Tweet — fantasy football twitter',
    thread_url: 'https://x.com/sashap/status/abc1',
    author: '@sashap_dynasty',
    snippet: `The UFD season awards card I made for my league had everyone DMing me asking how I made it. The tool sells itself if you\'re willing to make one card and share it.`,
    classification: 'praise', confidence: 0.92,
    ai_suggested_reply: `Sasha — this is the dream. Quoted you (with attribution) in the latest blog post if that\'s OK. Coffee\'s on me if you\'re in Phoenix.`,
    is_existing_user: true, received_at: ago(18),
  },
  {
    id: 'm-008', platform: 'reddit', subreddit: 'r/fantasyfootball',
    thread_title: 'Spam / drop-shipping post about ESPN data',
    thread_url: 'https://reddit.com/r/fantasyfootball/comments/xyz7',
    author: 'u/promoter_2025',
    snippet: `Sign up for my free course on building fantasy football tools! Limited slots! 🚀`,
    classification: 'spam', confidence: 0.99,
    ai_suggested_reply: `[Auto-flag for moderator]`,
    is_existing_user: false, received_at: ago(22),
  },
]

export interface SocialStats {
  posts_30d: number
  impressions_30d: number
  upvotes_30d: number
  trial_signups_attributed: number
  inbox_to_address: number
  active_subreddits: number
}

export function socialStats(): SocialStats {
  const posted = posts.filter((p) => p.status === 'posted')
  const subs = new Set(posted.filter((p) => p.subreddit).map((p) => p.subreddit!))
  return {
    posts_30d: posted.length,
    impressions_30d: posted.reduce((s, p) => s + (p.impressions ?? 0), 0),
    upvotes_30d: posted.reduce((s, p) => s + (p.upvotes ?? 0), 0),
    trial_signups_attributed: posted.reduce((s, p) => s + (p.trial_signups ?? 0), 0),
    inbox_to_address: mentions.filter((m) =>
      m.classification === 'lead_signal' || m.classification === 'question' ||
      m.classification === 'complaint' || m.classification === 'praise',
    ).length,
    active_subreddits: subs.size,
  }
}
