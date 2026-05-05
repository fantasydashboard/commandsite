/**
 * CommandSite Social — content calendar, composer drafts, engagement
 * inbox, engaged-leads roll-up, and performance fixtures.
 *
 * The unique B2B-SaaS angle vs. Apex's listening tool: every engagement
 * is treated as a *lead signal*. The whole UX flows toward "Add to
 * Pipeline" for high-ICP-fit engagers, not just analytics for analytics'
 * sake.
 */

export type Platform = 'linkedin' | 'twitter' | 'youtube' | 'reddit'
export type PostStatus = 'draft' | 'queued' | 'posted' | 'paused'
export type PostFormat = 'short' | 'thread' | 'long' | 'video' | 'image' | 'carousel'

export interface Post {
  id: string
  platform: Platform
  status: PostStatus
  /** Local time the post is scheduled to go out (or did) */
  scheduled_at: string
  posted_at?: string
  body: string
  format: PostFormat
  hashtags?: string[]
  /** Performance — only when status === 'posted' */
  impressions?: number
  engagements?: number
  comments_count?: number
  link_clicks?: number
  /** Pipeline value attributed to this post (deals where customer
   *  engaged within 30d before becoming an opportunity), in cents */
  attributed_pipeline_cents?: number
  /** Did this post drive any signups/demos? */
  conversions?: number
}

export type EngagementClass =
  | 'lead_signal'
  | 'praise'
  | 'question'
  | 'critique'
  | 'spam'
  | 'irrelevant'

export type EngagementKind = 'comment' | 'reply' | 'dm' | 'mention' | 'react'

export interface Engagement {
  id: string
  platform: Platform
  kind: EngagementKind
  post_id?: string  // post they engaged with
  author_name: string
  author_title: string
  author_company: string
  author_industry: string
  author_followers: number
  classification: EngagementClass
  /** ICP fit, 0-100. High means "would buy." */
  icp_fit_score: number
  message: string
  ai_suggested_reply: string
  received_at: string
  in_pipeline: boolean
}

export interface EngagedLead {
  id: string
  name: string
  title: string
  company: string
  industry: string
  city?: string
  state?: string
  followers: number
  team_size?: number
  /** Number of engagements with our content in last 30 days */
  engagements_30d: number
  /** Posts they engaged with (post ids) */
  posts_engaged_with: string[]
  icp_fit_score: number
  in_pipeline: boolean
  /** Enrichment status — full enrichment costs $$, partial is free */
  enrichment: 'full' | 'partial' | 'pending'
  /** Last engagement timestamp */
  last_engaged_at: string
  /** "linkedin" / "reddit" / "twitter" — primary platform we see them on */
  primary_platform: Platform
}

function ago(hours: number, mins = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - hours, d.getMinutes() - mins, 0, 0)
  return d.toISOString()
}
/** Days from now at hour H, minute 0 — for the calendar grid. */
function dayAt(daysFromNow: number, hour = 9, mins = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hour, mins, 0, 0)
  return d.toISOString()
}

export const PLATFORM_META: Record<Platform, {
  label: string
  short: string
  color: string
  icon: string
  /** Optimal posting hours (local) per platform — used by the calendar hint */
  optimal_hours: number[]
}> = {
  linkedin: { label: 'LinkedIn',      short: 'LI', color: '#0A66C2', icon: 'in', optimal_hours: [8, 12, 17] },
  twitter:  { label: 'Twitter / X',   short: 'X',  color: '#0F1419', icon: '𝕏',  optimal_hours: [9, 13, 19] },
  youtube:  { label: 'YouTube Shorts',short: 'YT', color: '#FF0000', icon: '▶',  optimal_hours: [16, 20] },
  reddit:   { label: 'Reddit',        short: 'r/', color: '#FF4500', icon: 'r',  optimal_hours: [10, 14, 21] },
}

export const CLASS_META: Record<EngagementClass, { label: string; color: string; icon: string }> = {
  lead_signal: { label: 'Lead signal',  color: '#10B981',                 icon: '🎯' },
  question:    { label: 'Question',     color: 'rgb(var(--color-brand))', icon: '❓' },
  praise:      { label: 'Praise',       color: '#A855F7',                 icon: '🙌' },
  critique:    { label: 'Critique',     color: '#F59E0B',                 icon: '⚠' },
  spam:        { label: 'Spam',         color: '#475569',                 icon: '⛔' },
  irrelevant:  { label: 'Off-topic',    color: '#94A3B8',                 icon: '◯' },
}

// ── POSTS ────────────────────────────────────────────────────────────────
// Mix of past 7 days (posted, with stats) + next 7 days (queued + drafts).
export const posts: Post[] = [
  // PAST WEEK
  {
    id: 'p-001', platform: 'linkedin', status: 'posted',
    scheduled_at: dayAt(-6, 8), posted_at: dayAt(-6, 8),
    format: 'long',
    body: `One year ago I told a buddy who runs an HVAC shop that I was building software for him.\n\nHe laughed and said "y\'all already built me 4 of those, none of them work."\n\nThis week he renewed for the third time and added a 4th tech seat.\n\nWhat changed:\n• Stopped trying to be Jobber. Be the AI receptionist that feeds Jobber.\n• Stopped pretending owners want a "platform." They want fewer phone calls and more booked jobs.\n• Started measuring ROI in dollars recovered, not features shipped.\n\nThree principles. That's the whole product.`,
    impressions: 14_280, engagements: 487, comments_count: 73, link_clicks: 142,
    attributed_pipeline_cents: 1_198_000, conversions: 2,
    hashtags: ['#hvac', '#verticalsaas'],
  },
  {
    id: 'p-002', platform: 'twitter', status: 'posted',
    scheduled_at: dayAt(-6, 13), posted_at: dayAt(-6, 13),
    format: 'thread',
    body: `7 things I wish I'd known building vertical SaaS for home services 🧵\n\n1/ The owner you're selling to does not read email. They text. Build for that.\n\n2/ "AI receptionist" closes faster than "scheduling software." Lead with the painful job.\n\n3/ Your demo is too long. Cut it in half. Then half again.\n\n[continued]`,
    impressions: 8_240, engagements: 198, comments_count: 31, link_clicks: 67,
    attributed_pipeline_cents: 599_000, conversions: 1,
  },
  {
    id: 'p-003', platform: 'reddit', status: 'posted',
    scheduled_at: dayAt(-5, 14), posted_at: dayAt(-5, 14),
    format: 'long',
    body: `[r/smallbusiness] How we cut after-hours missed calls by 80% for an HVAC shop\n\nNot a sales post — sharing the actual playbook in case it's useful for anyone else running a service business.\n\nThe shop was missing ~12 calls/week after 6 PM. Of those, ~3 became emergencies the next morning that went to a competitor.\n\nWhat we did: 24/7 AI answering line that triages, dispatches when emergency, books appointments otherwise. Cost ~$150/mo all-in. Recovered ~$3,200/mo in revenue. Math checks out.\n\nHappy to share specifics if helpful.`,
    impressions: 4_120, engagements: 142, comments_count: 38, link_clicks: 24,
    attributed_pipeline_cents: 0, conversions: 0,
  },
  {
    id: 'p-004', platform: 'linkedin', status: 'posted',
    scheduled_at: dayAt(-4, 12), posted_at: dayAt(-4, 12),
    format: 'image',
    body: `Real screenshot from a customer's CommandSite dashboard this morning.\n\n247 calls handled by the AI receptionist last 30 days.\n81 booked.\n24 after-hours captures.\n\nThe owner used to take all of these on his cell. Now he takes none of them, and the booked rate is up 3×.\n\nThis is what shifting "the boring work" to software actually looks like.`,
    impressions: 22_140, engagements: 612, comments_count: 94, link_clicks: 218,
    attributed_pipeline_cents: 1_797_000, conversions: 3,
    hashtags: ['#smallbusiness', '#ai', '#hvac'],
  },
  {
    id: 'p-005', platform: 'youtube', status: 'posted',
    scheduled_at: dayAt(-3, 17), posted_at: dayAt(-3, 17),
    format: 'video',
    body: `Short: "How we built an AI receptionist for $0.10 a call" — 60s explainer with the architecture diagram + cost breakdown.`,
    impressions: 3_840, engagements: 89, comments_count: 12, link_clicks: 18,
    attributed_pipeline_cents: 0, conversions: 0,
  },
  {
    id: 'p-006', platform: 'twitter', status: 'posted',
    scheduled_at: dayAt(-2, 9), posted_at: dayAt(-2, 9),
    format: 'short',
    body: `Founders who've never sold to a contractor: stop sending decks.\n\nSend a 90-second Loom showing the product solving the painful job. They'll watch it. They will not open the deck.`,
    impressions: 6_180, engagements: 274, comments_count: 41, link_clicks: 8,
    attributed_pipeline_cents: 0, conversions: 0,
  },
  {
    id: 'p-007', platform: 'linkedin', status: 'posted',
    scheduled_at: dayAt(-1, 8), posted_at: dayAt(-1, 8),
    format: 'long',
    body: `Customer story: a Tampa plumbing company added 3 techs this quarter and didn't add a single admin hour.\n\nReason: the AI handles intake (calls + texts), the system auto-routes jobs to the new techs, and quote follow-ups send themselves.\n\nThe owner's line: "I forgot what answering the office line sounds like."\n\nThat's the whole pitch.`,
    impressions: 18_440, engagements: 521, comments_count: 81, link_clicks: 167,
    attributed_pipeline_cents: 1_200_000, conversions: 1,
  },

  // QUEUED — next 7 days
  {
    id: 'p-008', platform: 'linkedin', status: 'queued',
    scheduled_at: dayAt(0, 12),
    format: 'long',
    body: `[draft] The "vertical SaaS is dead" take is wrong, but it's wrong in an interesting way.\n\nHorizontal tools (Jobber, Stripe, HubSpot) are great when the customer already knows what they want. Vertical tools are great when the customer doesn't know what they need yet — and you can show them.\n\nThe wedge isn't features. It's the fact that you've sat in their truck.`,
  },
  {
    id: 'p-009', platform: 'twitter', status: 'queued',
    scheduled_at: dayAt(0, 19),
    format: 'short',
    body: `Best demo question I've ever been asked: "Will my techs actually open this on their phones, or is it another login they'll forget?"\n\nIf the answer isn't immediately YES, your wedge is wrong.`,
  },
  {
    id: 'p-010', platform: 'reddit', status: 'queued',
    scheduled_at: dayAt(1, 10),
    format: 'long',
    body: `[r/HVAC] Owners — what's the most annoying part of after-hours calls for you?\n\nNot trying to sell anything. Genuinely curious for a piece I'm writing. Specifically: is it the interruption, the missed revenue, or the customer experience that bothers you most?`,
  },
  {
    id: 'p-011', platform: 'linkedin', status: 'queued',
    scheduled_at: dayAt(2, 8),
    format: 'image',
    body: `[draft + screenshot] A breakdown of where the 247 calls came from this month for one of our HVAC customers — paid ads, SEO, referrals, repeat customers.\n\nReferrals + repeat = 67%. That's where the moat lives, not in Google Ads.`,
  },
  {
    id: 'p-012', platform: 'youtube', status: 'queued',
    scheduled_at: dayAt(2, 16),
    format: 'video',
    body: `Short: "The 90-second tour of CommandSite for HVAC" — quick walkthrough hitting Today / Calls / Reviews.`,
  },
  {
    id: 'p-013', platform: 'linkedin', status: 'queued',
    scheduled_at: dayAt(3, 12),
    format: 'long',
    body: `[draft] Pricing lesson: we tested $399 vs $499 for the Pro tier and the $499 closed FASTER.\n\nTheory: at $399, owners assumed it was a "tool." At $499 they assumed it was an "outcome." Different mental category, different decision speed.`,
  },
  {
    id: 'p-014', platform: 'twitter', status: 'queued',
    scheduled_at: dayAt(4, 13),
    format: 'thread',
    body: `[thread] How a 7-person plumbing shop is using AI in 2026 — not the "AI is changing everything" thread, the actual specifics 🧵`,
  },
  {
    id: 'p-015', platform: 'linkedin', status: 'queued',
    scheduled_at: dayAt(5, 8),
    format: 'long',
    body: `[draft] Hiring lesson: my best customer success person was a former HVAC dispatcher, not a CS pro. She speaks the customer's language, not the SaaS one.`,
  },

  // DRAFTS (no time set)
  {
    id: 'p-016', platform: 'linkedin', status: 'draft',
    scheduled_at: dayAt(7, 9),
    format: 'long',
    body: `[draft idea] The economics of "free trials" for blue-collar SaaS — they don't work. Owners don't have time to "evaluate." They want a yes-or-no in a 30-min call.`,
  },
  {
    id: 'p-017', platform: 'reddit', status: 'draft',
    scheduled_at: dayAt(8, 10),
    format: 'long',
    body: `[draft, r/Entrepreneur] AMA: building vertical SaaS solo — happy to share the unsexy parts.`,
  },
]

// ── ENGAGEMENTS (the inbox) ─────────────────────────────────────────────
export const engagements: Engagement[] = [
  {
    id: 'eng-001', platform: 'linkedin', kind: 'comment', post_id: 'p-004',
    author_name: 'Brett Whitaker', author_title: 'Owner', author_company: 'Cool Comfort HVAC',
    author_industry: 'HVAC', author_followers: 412,
    classification: 'lead_signal', icp_fit_score: 91,
    message: `247 calls is wild. We're at maybe 80/mo and our admin is already drowning. How long did the rollout take?`,
    ai_suggested_reply: `Brett — appreciate the read. Rollout was ~2 weeks once we had the Twilio number routed; the AI receptionist was talking calls within 48 hours of that. Most of the timeline was Marcus tuning the script.\n\nIf you want, I can send the actual setup checklist we used at Apex? It'll save you a couple weeks of back-and-forth.`,
    received_at: ago(0, 35), in_pipeline: false,
  },
  {
    id: 'eng-002', platform: 'linkedin', kind: 'comment', post_id: 'p-007',
    author_name: 'Whitney Park', author_title: 'Operations Manager', author_company: 'Bayside Plumbing Co',
    author_industry: 'Plumbing', author_followers: 893,
    classification: 'lead_signal', icp_fit_score: 87,
    message: `This is the second post of yours that's hit my feed this week. We're a 12-person shop in San Diego — would love to chat.`,
    ai_suggested_reply: `Whitney — second-time-engagement is the universe telling us to talk. Just sent you a DM with my Calendly. 12 people in San Diego is right in our sweet spot.`,
    received_at: ago(2), in_pipeline: true,
  },
  {
    id: 'eng-003', platform: 'twitter', kind: 'reply', post_id: 'p-006',
    author_name: 'Dani Rojas', author_title: 'GM', author_company: 'Suncoast Air Solutions',
    author_industry: 'HVAC', author_followers: 287,
    classification: 'lead_signal', icp_fit_score: 84,
    message: `Loom > deck, every time. Curious — do you record those yourself or use a service?`,
    ai_suggested_reply: `Dani — 100% myself. Loom's free tier is plenty. Tip: always start with the customer's name and company on screen — turns a generic Loom into a personalized one and triples reply rate.`,
    received_at: ago(4), in_pipeline: false,
  },
  {
    id: 'eng-004', platform: 'reddit', kind: 'comment', post_id: 'p-003',
    author_name: 'u/HVACOwnerVA', author_title: 'Owner (anonymous)', author_company: '[private]',
    author_industry: 'HVAC', author_followers: 0,
    classification: 'question', icp_fit_score: 62,
    message: `What do you do when the AI gets a question wrong and dispatches the wrong tech? Has that happened?`,
    ai_suggested_reply: `Great question. Yes, has happened — early on. Two safeguards we added:\n\n1) Every dispatched job ALSO sends a text confirmation to the on-call tech with the AI's notes. Tech can call the customer back if something looks off, before driving out.\n\n2) The AI has a low-confidence escape hatch — if it can't extract the address or confirm the issue, it offers to text the owner directly instead of booking.\n\nNet result: we've had zero bad dispatches in the last 60 days across ~2k calls.`,
    received_at: ago(5), in_pipeline: false,
  },
  {
    id: 'eng-005', platform: 'linkedin', kind: 'dm', post_id: 'p-001',
    author_name: 'Aaron Buchanan', author_title: 'Owner', author_company: 'HydroFlow Plumbing',
    author_industry: 'Plumbing', author_followers: 156,
    classification: 'lead_signal', icp_fit_score: 88,
    message: `Sofia at TidalWave just told me about your tool. We're 5 techs in Sarasota. Open to a chat?`,
    ai_suggested_reply: `Aaron — Sofia's the best, glad she sent you over. Yes, definitely open to chat. Sarasota plumbing + 5 techs is right in the wheelhouse.\n\nHere's my Calendly: {{link}} — pick anything next week. Or if you'd rather skip the call and just see the product, I can send a 4-min Loom of how Sofia uses it.`,
    received_at: ago(8), in_pipeline: false,
  },
  {
    id: 'eng-006', platform: 'linkedin', kind: 'comment', post_id: 'p-001',
    author_name: 'Theo Marshall', author_title: 'CEO', author_company: 'ServeRight (HVAC SaaS)',
    author_industry: 'SaaS', author_followers: 4_812,
    classification: 'praise', icp_fit_score: 12,
    message: `Beautifully framed, Josh. Vertical focus is the moat.`,
    ai_suggested_reply: `Thanks Theo — coming from someone running ServeRight that means a lot. Different verticals (you're plumbing, I'm HVAC-leaning) but we're chasing the same insight.`,
    received_at: ago(10), in_pipeline: false,
  },
  {
    id: 'eng-007', platform: 'twitter', kind: 'reply', post_id: 'p-002',
    author_name: 'Carmen Velasquez', author_title: 'Operations Director', author_company: 'BlueRidge Pest',
    author_industry: 'Pest control', author_followers: 78,
    classification: 'lead_signal', icp_fit_score: 79,
    message: `#3 hit hard. Our last vendor demo was 47 minutes. I had to pretend I had another meeting.`,
    ai_suggested_reply: `Carmen — 47 minutes is actively disrespectful. Mine is 22 max, including questions. If pest control is on your radar I'd love to show you the version we built for that vertical specifically. No deck, just a screenshare.`,
    received_at: ago(12), in_pipeline: false,
  },
  {
    id: 'eng-008', platform: 'linkedin', kind: 'comment', post_id: 'p-004',
    author_name: 'Garrett Nilsen', author_title: 'CMO', author_company: 'Podium',
    author_industry: 'SaaS', author_followers: 8_204,
    classification: 'critique', icp_fit_score: 8,
    message: `Cherry-picked stats. Where's the methodology? How is "AI handled" defined?`,
    ai_suggested_reply: `Garrett — fair pushback, here's the methodology: "AI handled" = call answered by the AI assistant without human transfer, transcript logged, outcome recorded (booked / dispatched / declined / spam). Numbers come straight from Twilio + the assistant logs, not curated.\n\nHappy to share the raw export with anyone curious.`,
    received_at: ago(14), in_pipeline: false,
  },
  {
    id: 'eng-009', platform: 'reddit', kind: 'comment', post_id: 'p-003',
    author_name: 'u/spamlord_2025', author_title: '', author_company: '',
    author_industry: '', author_followers: 0,
    classification: 'spam', icp_fit_score: 0,
    message: `Check out my course on AI agents! 100% free for the first 50 people 🚀`,
    ai_suggested_reply: `[Auto-flag for moderator]`,
    received_at: ago(16), in_pipeline: false,
  },
  {
    id: 'eng-010', platform: 'linkedin', kind: 'comment', post_id: 'p-007',
    author_name: 'Marisol Diaz', author_title: 'Owner', author_company: 'Coastal Electrical Services',
    author_industry: 'Electrical', author_followers: 312,
    classification: 'question', icp_fit_score: 76,
    message: `Does this work for electrical too or is it HVAC-specific?`,
    ai_suggested_reply: `Marisol — works for any home services trade. The AI scripts are templates we tune per vertical, but the underlying engine is the same. We have electrical customers running it (Spark Electric in Raleigh just signed last week).\n\nWant me to send the electrical-specific setup notes?`,
    received_at: ago(18), in_pipeline: true,
  },
  {
    id: 'eng-011', platform: 'twitter', kind: 'mention',
    author_name: 'Avery Pelton', author_title: 'Founder', author_company: 'BlueCollar.fyi (newsletter)',
    author_industry: 'Media', author_followers: 12_400,
    classification: 'praise', icp_fit_score: 35,
    message: `Quoted @CommandSite in this week's BlueCollar.fyi — the after-hours stat is too good not to share.`,
    ai_suggested_reply: `Avery — thank you, that's a huge boost. Subscribers will probably ask, so: happy to provide more concrete numbers / customer intros for any follow-up piece.`,
    received_at: ago(22), in_pipeline: false,
  },
  {
    id: 'eng-012', platform: 'linkedin', kind: 'comment', post_id: 'p-001',
    author_name: 'Liam Donnell', author_title: 'GM', author_company: 'GreenGuard Pest Control',
    author_industry: 'Pest control', author_followers: 198,
    classification: 'lead_signal', icp_fit_score: 81,
    message: `We were just comparing you and Birdeye last week — your pricing came up but the AI receptionist piece is what tipped us. Closing call Friday.`,
    ai_suggested_reply: `Liam — appreciate you sharing this publicly. Looking forward to Friday. I'll pull up the pest-control-specific configurations beforehand so we can talk through the actual setup, not just the value prop.`,
    received_at: ago(28), in_pipeline: true,
  },
]

// ── ENGAGED LEADS (people who've engaged 2+ times in 30d) ──────────────
export const engagedLeads: EngagedLead[] = [
  {
    id: 'lead-001',
    name: 'Brett Whitaker', title: 'Owner', company: 'Cool Comfort HVAC',
    industry: 'HVAC', city: 'Jacksonville', state: 'FL',
    followers: 412, team_size: 6, engagements_30d: 4,
    posts_engaged_with: ['p-001','p-004','p-007'],
    icp_fit_score: 91, in_pipeline: false, enrichment: 'full',
    last_engaged_at: ago(0, 35), primary_platform: 'linkedin',
  },
  {
    id: 'lead-002',
    name: 'Whitney Park', title: 'Operations Manager', company: 'Bayside Plumbing Co',
    industry: 'Plumbing', city: 'San Diego', state: 'CA',
    followers: 893, team_size: 12, engagements_30d: 6,
    posts_engaged_with: ['p-001','p-004','p-006','p-007'],
    icp_fit_score: 87, in_pipeline: true, enrichment: 'full',
    last_engaged_at: ago(2), primary_platform: 'linkedin',
  },
  {
    id: 'lead-003',
    name: 'Aaron Buchanan', title: 'Owner', company: 'HydroFlow Plumbing',
    industry: 'Plumbing', city: 'Sarasota', state: 'FL',
    followers: 156, team_size: 5, engagements_30d: 3,
    posts_engaged_with: ['p-001','p-007'],
    icp_fit_score: 88, in_pipeline: false, enrichment: 'full',
    last_engaged_at: ago(8), primary_platform: 'linkedin',
  },
  {
    id: 'lead-004',
    name: 'Dani Rojas', title: 'GM', company: 'Suncoast Air Solutions',
    industry: 'HVAC', city: 'St. Petersburg', state: 'FL',
    followers: 287, team_size: 9, engagements_30d: 5,
    posts_engaged_with: ['p-002','p-004','p-006','p-007'],
    icp_fit_score: 84, in_pipeline: false, enrichment: 'full',
    last_engaged_at: ago(4), primary_platform: 'twitter',
  },
  {
    id: 'lead-005',
    name: 'Liam Donnell', title: 'GM', company: 'GreenGuard Pest Control',
    industry: 'Pest control', city: 'Birmingham', state: 'AL',
    followers: 198, team_size: 9, engagements_30d: 3,
    posts_engaged_with: ['p-001','p-007'],
    icp_fit_score: 81, in_pipeline: true, enrichment: 'full',
    last_engaged_at: ago(28), primary_platform: 'linkedin',
  },
  {
    id: 'lead-006',
    name: 'Carmen Velasquez', title: 'Operations Director', company: 'BlueRidge Pest',
    industry: 'Pest control', city: 'Asheville', state: 'NC',
    followers: 78, team_size: 7, engagements_30d: 2,
    posts_engaged_with: ['p-002'],
    icp_fit_score: 79, in_pipeline: false, enrichment: 'partial',
    last_engaged_at: ago(12), primary_platform: 'twitter',
  },
  {
    id: 'lead-007',
    name: 'Marisol Diaz', title: 'Owner', company: 'Coastal Electrical Services',
    industry: 'Electrical', city: 'Wilmington', state: 'NC',
    followers: 312, team_size: 6, engagements_30d: 3,
    posts_engaged_with: ['p-001','p-007'],
    icp_fit_score: 76, in_pipeline: true, enrichment: 'full',
    last_engaged_at: ago(18), primary_platform: 'linkedin',
  },
  {
    id: 'lead-008',
    name: 'Hank Ofori', title: 'Owner', company: 'Ofori Heating Co',
    industry: 'HVAC', city: 'Chicago', state: 'IL',
    followers: 234, team_size: 8, engagements_30d: 2,
    posts_engaged_with: ['p-004','p-007'],
    icp_fit_score: 73, in_pipeline: false, enrichment: 'full',
    last_engaged_at: ago(40), primary_platform: 'linkedin',
  },
  {
    id: 'lead-009',
    name: 'Tasha Reinhold', title: 'Co-founder', company: 'Reinhold Roofing',
    industry: 'Roofing', city: 'Kansas City', state: 'MO',
    followers: 487, team_size: 11, engagements_30d: 2,
    posts_engaged_with: ['p-001','p-002'],
    icp_fit_score: 68, in_pipeline: false, enrichment: 'full',
    last_engaged_at: ago(48), primary_platform: 'linkedin',
  },
  {
    id: 'lead-010',
    name: 'u/HVACOwnerVA', title: 'Owner (anonymous)', company: '[private]',
    industry: 'HVAC',
    followers: 0, engagements_30d: 2,
    posts_engaged_with: ['p-003'],
    icp_fit_score: 62, in_pipeline: false, enrichment: 'pending',
    last_engaged_at: ago(5), primary_platform: 'reddit',
  },
]

export interface SocialStats {
  posts_30d: number
  impressions_30d: number
  engagements_30d: number
  attributed_pipeline_30d_cents: number
  conversions_30d: number
  /** Pending replies that need a human eye */
  inbox_to_address: number
  /** Engaged leads not yet in pipeline (the upsell target) */
  leads_to_review: number
}

export function socialStats(): SocialStats {
  const posted = posts.filter((p) => p.status === 'posted')
  const impressions = posted.reduce((s, p) => s + (p.impressions ?? 0), 0)
  const engagementSum = posted.reduce((s, p) => s + (p.engagements ?? 0), 0)
  const pipeline = posted.reduce((s, p) => s + (p.attributed_pipeline_cents ?? 0), 0)
  const conversions = posted.reduce((s, p) => s + (p.conversions ?? 0), 0)

  return {
    posts_30d: posted.length,
    impressions_30d: impressions,
    engagements_30d: engagementSum,
    attributed_pipeline_30d_cents: pipeline,
    conversions_30d: conversions,
    inbox_to_address: engagements.filter((e) =>
      e.classification === 'lead_signal' || e.classification === 'question' ||
      e.classification === 'critique' || e.classification === 'praise',
    ).length,
    leads_to_review: engagedLeads.filter((l) => !l.in_pipeline && l.icp_fit_score >= 70).length,
  }
}
