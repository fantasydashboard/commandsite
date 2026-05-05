/**
 * CommandSite Reputation — B2B reviews (G2 / Capterra / ProductHunt /
 * Reddit), in-product NPS responses, public mentions, testimonial
 * candidates. Drives social proof loop.
 */

export type ReviewSource = 'g2' | 'capterra' | 'producthunt' | 'reddit' | 'softwareadvice'

export interface B2BReview {
  id: string
  source: ReviewSource
  reviewer_name: string
  reviewer_title: string
  reviewer_company: string
  reviewer_industry: string
  rating: 1 | 2 | 3 | 4 | 5
  title: string
  pros: string
  cons: string
  /** Owner reply, if posted */
  response?: { text: string; sent_at: string } | null
  /** AI-suggested response when unanswered */
  ai_response_draft?: string
  received_at: string
  /** Verified purchase status (G2/Capterra) */
  verified: boolean
}

export interface NpsResponse {
  id: string
  customer_company: string
  respondent_name: string
  respondent_title: string
  score: number  // 0-10
  comment?: string
  responded_at: string
  /** Pulled from in-product survey (post-onboarding day 30 + quarterly) */
  trigger: 'onboarding_30d' | 'quarterly'
  /** True if they've explicitly opted in to be a public reference */
  reference_optin?: boolean
}

export interface Mention {
  id: string
  source: 'twitter' | 'linkedin' | 'reddit' | 'newsletter' | 'podcast' | 'blog'
  author: string
  author_handle?: string
  url: string
  excerpt: string
  /** Estimated reach (followers / subscribers / impressions) */
  reach: number
  sentiment: 'positive' | 'neutral' | 'negative'
  received_at: string
}

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const SOURCE_META: Record<ReviewSource, { label: string; color: string }> = {
  g2:            { label: 'G2',           color: '#FF492C' },
  capterra:      { label: 'Capterra',     color: '#FF9D28' },
  producthunt:   { label: 'Product Hunt', color: '#DA552F' },
  reddit:        { label: 'Reddit',       color: '#FF4500' },
  softwareadvice:{ label: 'SoftwareAdvice', color: '#0EA5E9' },
}

export const reviews: B2BReview[] = [
  {
    id: 'b2b-001', source: 'g2',
    reviewer_name: 'Marcus R.', reviewer_title: 'Owner', reviewer_company: 'HVAC company in Florida',
    reviewer_industry: 'Construction', rating: 5,
    title: 'Replaced our front desk for $499/mo',
    pros: `The AI receptionist is the real deal. We used to lose 8-12 calls a week to voicemail and another 5+ to spam. Now those numbers are zero. Recovered roughly $3k/mo in revenue we used to leave on the table.`,
    cons: `The dashboard had a learning curve for my office manager — took her a week to find everything. Once she did, no complaints. Could use a mobile-friendly view of the call inbox.`,
    response: {
      text: `Marcus — appreciate the candid review. The mobile call-inbox view is in active development, you'll see it next month. Thanks for being one of the original beta customers.`,
      sent_at: ago(0, 4),
    },
    received_at: ago(2),
    verified: true,
  },
  {
    id: 'b2b-002', source: 'g2',
    reviewer_name: 'Sofia M.', reviewer_title: 'Operations Director', reviewer_company: 'Plumbing company in Tampa',
    reviewer_industry: 'Construction', rating: 5,
    title: 'Best decision we made in 2025',
    pros: `Multi-tech routing, automatic quote follow-ups, review collection — all the back-office stuff that used to eat hours of admin time is just done. The dormant-customer reactivation alone has paid for the whole subscription.`,
    cons: `Honestly, my only ask is multi-location support. We're growing into a second city and the current setup makes it harder than it should be. They've told me it's coming.`,
    response: null,
    ai_response_draft: `Sofia — thank you. Multi-location is locked in for the Q3 release; you're at the top of the early-access list. Can\'t wait to see TidalWave in two cities.`,
    received_at: ago(4),
    verified: true,
  },
  {
    id: 'b2b-003', source: 'capterra',
    reviewer_name: 'Yasmin O.', reviewer_title: 'Owner', reviewer_company: 'Cleaning company in Nashville',
    reviewer_industry: 'Consumer Services', rating: 5,
    title: 'The only home-services SaaS that actually gets it',
    pros: `Most software for our industry is built by people who have never been in a service truck. CommandSite is different — every feature feels like it was built by someone who watched an owner answer the office line at 8 PM and got mad about it.`,
    cons: `Pricing structure (per-tier) was confusing at signup. Easy enough once a CSM walked me through it but could be clearer on the website.`,
    response: {
      text: `Yasmin — this is the kindest critique. I'll work on the pricing page this month. Thanks for taking the time.`,
      sent_at: ago(7),
    },
    received_at: ago(8),
    verified: true,
  },
  {
    id: 'b2b-004', source: 'capterra',
    reviewer_name: 'Owen M.', reviewer_title: 'Co-founder', reviewer_company: 'Roofing company in Denver',
    reviewer_industry: 'Construction', rating: 4,
    title: 'Solid, but a few rough edges',
    pros: `Reliable AI receptionist, the review automation is genuinely magical. Saved my admin probably 6 hours/week.`,
    cons: `Reactivation campaign templates feel generic out of the box — we had to rewrite them all. The integrations list is shorter than competitors. Wish there was a Jobber sync at the moment.`,
    response: null,
    ai_response_draft: `Owen — fair feedback. The Jobber integration is actually shipping next month (we're in the partner certification phase). Reactivation templates are overdue for a refresh — bumping that up the queue. Appreciate the detail.`,
    received_at: ago(11),
    verified: true,
  },
  {
    id: 'b2b-005', source: 'producthunt',
    reviewer_name: 'Theo Marshall', reviewer_title: 'CEO', reviewer_company: 'ServeRight (HVAC SaaS)',
    reviewer_industry: 'SaaS', rating: 5,
    title: 'Vertical SaaS done right',
    pros: `Full disclosure — I run a competing tool in plumbing. CommandSite is the gold standard for the HVAC vertical. The AI receptionist UX is best-in-class. Anyone in this space should pay attention.`,
    cons: `Nothing to add — different vertical, different focus, same level of craft.`,
    response: {
      text: `Theo — that means a ton coming from someone running ServeRight. Different verticals but same playbook. Rooting for you.`,
      sent_at: ago(14),
    },
    received_at: ago(14),
    verified: false,
  },
  {
    id: 'b2b-006', source: 'g2',
    reviewer_name: 'Riley T.', reviewer_title: 'Owner', reviewer_company: 'HVAC company in SLC',
    reviewer_industry: 'Construction', rating: 2,
    title: 'Wasn\'t the right fit for our shop',
    pros: `Fast onboarding, clear UI, support team was responsive when we had questions.`,
    cons: `Honestly, we already had Jobber doing scheduling and a part-time receptionist on the phones. Layering CommandSite on top didn't make sense for us. The pitch doesn't always land if you already have those bases covered.`,
    response: null,
    ai_response_draft: `Riley — fair, and thanks for being honest about it. CommandSite isn't always additive when there's already a part-time receptionist + Jobber working well; we typically win when there's no receptionist at all. Hope the door's still open if your setup ever changes.`,
    received_at: ago(18),
    verified: true,
  },
  {
    id: 'b2b-007', source: 'reddit',
    reviewer_name: 'u/HVAC_Owner_VA', reviewer_title: 'Owner (anonymous)', reviewer_company: '[private]',
    reviewer_industry: 'HVAC', rating: 4,
    title: 'r/HVAC thread: \"Anyone tried CommandSite?\"',
    pros: `Tried for 30 days. The AI is shockingly good, especially after-hours. Booked 4 emergencies in week one that would have gone to voicemail. Pricing is on the higher end but it pays for itself if you're missing calls.`,
    cons: `Setup took longer than I'd like (full week to get Twilio + Stripe + email all wired). The dashboard has a lot of menus — maybe more than a 5-person shop needs.`,
    response: null,
    ai_response_draft: `Just saw this — really appreciate you sharing the experience. Setup time is the #1 thing we're working on; the goal is "live by EOD" rather than "live by EOW." DMing you the streamlined onboarding flow we're testing.`,
    received_at: ago(21),
    verified: false,
  },
  {
    id: 'b2b-008', source: 'g2',
    reviewer_name: 'Wes H.', reviewer_title: 'Founder', reviewer_company: 'Landscaping company in Austin',
    reviewer_industry: 'Construction', rating: 5,
    title: 'Brand new, already changed how we work',
    pros: `Day 8 of using it and the AI receptionist has already booked 6 maintenance jobs we would have missed. Onboarding was supportive — Josh actually got on a call with us himself which is wild for SaaS.`,
    cons: `Too early to have real cons. Will update in 30 days.`,
    response: null,
    ai_response_draft: `Wes — appreciate you taking time to write this so early. Will follow up in 30 days to hear how it's going. Glad GreenLeaf is off to a fast start.`,
    received_at: ago(2),
    verified: true,
  },
]

export const npsResponses: NpsResponse[] = [
  {
    id: 'nps-001', customer_company: 'TidalWave Plumbing',
    respondent_name: 'Sofia Marquez', respondent_title: 'Operations Director',
    score: 10,
    comment: `I would recommend this to every plumbing shop I know. Honestly the only reason I haven't is selfish — I want the competitive advantage.`,
    responded_at: ago(3), trigger: 'quarterly', reference_optin: true,
  },
  {
    id: 'nps-002', customer_company: 'Apex Heating & Air',
    respondent_name: 'Marcus Reyes', respondent_title: 'Owner',
    score: 10,
    comment: `Day-one customer, still here, still paying. That should tell you everything.`,
    responded_at: ago(8), trigger: 'quarterly', reference_optin: true,
  },
  {
    id: 'nps-003', customer_company: 'Polished Cleaning Co',
    respondent_name: 'Yasmin Okafor', respondent_title: 'Owner',
    score: 9,
    comment: `Great product. The team behind it is the real differentiator — they actually listen.`,
    responded_at: ago(14), trigger: 'quarterly', reference_optin: true,
  },
  {
    id: 'nps-004', customer_company: 'ClearStream Pool Service',
    respondent_name: 'Emma Castellanos', respondent_title: 'Owner',
    score: 9,
    comment: `Saved me from hiring a part-time office person. Honestly thought it would take longer to feel that effect.`,
    responded_at: ago(7), trigger: 'quarterly', reference_optin: true,
  },
  {
    id: 'nps-005', customer_company: 'Premier Plumbing Solutions',
    respondent_name: 'Jorge Salinas', respondent_title: 'GM',
    score: 9,
    comment: `30 days in. Smooth onboarding. AI receptionist is the killer feature.`,
    responded_at: ago(2), trigger: 'onboarding_30d',
  },
  {
    id: 'nps-006', customer_company: 'Stonecrest Roofing',
    respondent_name: 'Owen Maddox', respondent_title: 'Co-founder',
    score: 8,
    comment: `Solid 8 — would be a 9 once Jobber sync ships.`,
    responded_at: ago(11), trigger: 'quarterly',
  },
  {
    id: 'nps-007', customer_company: 'GreenLeaf Landscaping',
    respondent_name: 'Wes Holloway', respondent_title: 'Founder',
    score: 9,
    comment: `Just signed but the white-glove onboarding sold me. Will revisit in 30 days.`,
    responded_at: ago(1), trigger: 'onboarding_30d',
  },
  {
    id: 'nps-008', customer_company: 'BrightVolt Electric',
    respondent_name: 'Derrick Pham', respondent_title: 'GM',
    score: 6,
    comment: `Not bad, but the AI receptionist sounds too scripted compared to the demo. Open ticket on this.`,
    responded_at: ago(9), trigger: 'quarterly',
  },
  {
    id: 'nps-009', customer_company: 'HomeShield Pest',
    respondent_name: 'Andre Bautista', respondent_title: 'Owner',
    score: 7,
    comment: `Trial day 4. Like what I see so far.`,
    responded_at: ago(2), trigger: 'onboarding_30d',
  },
  {
    id: 'nps-010', customer_company: 'Summit Heating Pro',
    respondent_name: 'Riley Thackeray', respondent_title: 'Owner',
    score: 4,
    comment: `Wasn't right for us — Jobber + an admin already covered the bases.`,
    responded_at: ago(28), trigger: 'quarterly',
  },
]

export const mentions: Mention[] = [
  {
    id: 'm-001', source: 'newsletter',
    author: 'Avery Pelton',
    url: 'https://bluecollar.fyi/issue-47',
    excerpt: `"...and CommandSite's after-hours capture stat — 80% of voicemails recovered — is too good not to share. Worth a look if you run service ops."`,
    reach: 12_400, sentiment: 'positive', received_at: ago(0, 22),
  },
  {
    id: 'm-002', source: 'linkedin',
    author: 'Theo Marshall', author_handle: 'theomarshall',
    url: 'https://linkedin.com/posts/theomarshall_post-id',
    excerpt: `"@CommandSite is what \"vertical SaaS done right\" looks like. The AI receptionist UX in particular is best-in-class."`,
    reach: 4_812, sentiment: 'positive', received_at: ago(0, 10),
  },
  {
    id: 'm-003', source: 'reddit',
    author: 'u/HVACOwner_NJ',
    url: 'https://reddit.com/r/HVAC/comments/xyz',
    excerpt: `"Looked at CommandSite vs Podium vs Birdeye. CommandSite is the only one with an actual AI receptionist (not a chatbot). Higher price tag but the only one solving the actual problem."`,
    reach: 287, sentiment: 'positive', received_at: ago(1),
  },
  {
    id: 'm-004', source: 'twitter',
    author: 'Dani Rojas', author_handle: 'danihvac',
    url: 'https://x.com/danihvac/status/...',
    excerpt: `"Watching @CommandSite's owner reply personally to every comment is wild. That's the playbook for 0-to-1 vertical SaaS."`,
    reach: 287, sentiment: 'positive', received_at: ago(2),
  },
  {
    id: 'm-005', source: 'podcast',
    author: 'BlueCollar Builders Podcast',
    url: 'https://bluecollarbuilders.com/episode-118',
    excerpt: `"Episode 118 features CommandSite — Josh walks through how to think about AI receptionists as a wedge into the home services market."`,
    reach: 8_500, sentiment: 'positive', received_at: ago(8),
  },
  {
    id: 'm-006', source: 'reddit',
    author: 'u/skeptical_owner',
    url: 'https://reddit.com/r/smallbusiness/comments/abc',
    excerpt: `"Tried CommandSite for 30 days. AI receptionist is great, dashboard has too many tabs for a 5-person shop. Mileage may vary."`,
    reach: 142, sentiment: 'neutral', received_at: ago(11),
  },
  {
    id: 'm-007', source: 'blog',
    author: 'BetterFieldOps.com',
    url: 'https://betterfieldops.com/commandsite-review',
    excerpt: `"7/10 — strong AI receptionist, weaker on multi-location. Best fit for single-location shops scaling from 5 to 15 techs."`,
    reach: 3_400, sentiment: 'neutral', received_at: ago(18),
  },
  {
    id: 'm-008', source: 'twitter',
    author: 'Garrett Nilsen', author_handle: 'garrettnilsen',
    url: 'https://x.com/garrettnilsen/status/...',
    excerpt: `"Saw a pitch deck claiming CommandSite \"replaces\" Podium. Curious what the actual feature parity is — review automation isn't a moat."`,
    reach: 8_204, sentiment: 'negative', received_at: ago(14),
  },
]

export interface ReputationStats {
  total_reviews: number
  avg_rating: number
  unanswered_reviews: number
  nps_score: number  // -100 to 100
  promoters: number
  passives: number
  detractors: number
  reference_candidates: number
  mentions_30d: number
  total_reach_30d: number
}

export function reputationStats(): ReputationStats {
  const total_reviews = reviews.length
  const avg_rating = reviews.reduce((s, r) => s + r.rating, 0) / total_reviews
  const unanswered = reviews.filter((r) => !r.response).length

  const promoters = npsResponses.filter((r) => r.score >= 9).length
  const passives = npsResponses.filter((r) => r.score === 7 || r.score === 8).length
  const detractors = npsResponses.filter((r) => r.score <= 6).length
  const nps_score = npsResponses.length > 0
    ? Math.round(((promoters - detractors) / npsResponses.length) * 100)
    : 0

  const reference_candidates = npsResponses.filter((r) => r.reference_optin && r.score >= 9).length

  const total_reach_30d = mentions.reduce((s, m) => s + m.reach, 0)

  return {
    total_reviews, avg_rating, unanswered_reviews: unanswered,
    nps_score, promoters, passives, detractors, reference_candidates,
    mentions_30d: mentions.length, total_reach_30d,
  }
}
