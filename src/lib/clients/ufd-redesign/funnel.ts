/**
 * UFD Redesign — funnel data. Two funnels matter for B2C lifecycle:
 *
 *   1. Activation — what users do in the first 7 days (signup →
 *      connected league → made card → shared card)
 *   2. Conversion — trial → paid → renewed
 *
 * The activation steps are the leading indicator; the conversion
 * funnel is the lagging indicator. Both should be on the same page so
 * Josh can see "if I move activation up by 5pts, conversion follows."
 */

export interface FunnelStep {
  stage: string
  description: string
  count: number
  pct_of_top: number
  /** % continuing from previous step. Computed in module — null on top step */
  continue_rate?: number | null
}

/** Activation funnel — first 7 days. Cohort = signups in last 30 days. */
export function activationFunnel(): FunnelStep[] {
  const top = 287  // 30-day signup volume
  const steps = [
    { stage: 'Signed up',          description: 'Created an account',                                       count: 287 },
    { stage: 'Connected league',   description: 'Linked at least one ESPN / Yahoo / Sleeper league',         count: 218 },
    { stage: 'Viewed first card',  description: 'Loaded any generated card (Power Rankings, Recap, etc.)',   count: 198 },
    { stage: 'Made a card',        description: 'Customized + saved at least 1 card',                        count: 162 },
    { stage: 'Shared a card',      description: 'Hit the Share button (the viral moment)',                   count: 84  },
    { stage: 'Day 7 retained',     description: 'Logged in on day 7 of trial',                               count: 142 },
  ]
  return steps.map((s) => ({ ...s, pct_of_top: s.count / top }))
}

/** Conversion funnel — trial → paid → renewed. Cohort = signups 60+ days ago. */
export function conversionFunnel(): FunnelStep[] {
  const top = 218  // 60-day signup cohort
  const steps = [
    { stage: 'Trial started',     description: 'Signed up + entered 7-day free trial',     count: 218 },
    { stage: 'Trial completed',   description: 'Reached day 7 of trial without cancelling', count: 124 },
    { stage: 'Paid (first month)',description: 'Converted to paid subscription',            count: 71  },
    { stage: 'Paid month 2',      description: 'Renewed for a second cycle',                count: 58  },
    { stage: 'Paid month 3',      description: 'Renewed for a third cycle',                 count: 51  },
    { stage: 'Annual upgrade',    description: 'Upgraded from monthly to annual',            count: 19  },
  ]
  return steps.map((s) => ({ ...s, pct_of_top: s.count / top }))
}

/** Per-platform breakdown of activation rates — shows whether one
 * fantasy platform is materially easier to onboard than others. */
export interface PlatformConv {
  platform: 'ESPN' | 'Yahoo' | 'Sleeper'
  signups: number
  connected_pct: number
  trial_to_paid_pct: number
  color: string
}

export const platformBreakdown: PlatformConv[] = [
  { platform: 'ESPN',    signups: 134, connected_pct: 0.78, trial_to_paid_pct: 0.36, color: '#D00' },
  { platform: 'Yahoo',   signups: 89,  connected_pct: 0.71, trial_to_paid_pct: 0.31, color: '#6E04A0' },
  { platform: 'Sleeper', signups: 64,  connected_pct: 0.84, trial_to_paid_pct: 0.42, color: '#1B9CFC' },
]

/** Drop-off insights — patterns the team should act on. */
export interface DropOff {
  stage_from: string
  stage_to: string
  drop_pct: number
  insight: string
  recommendation: string
}

export const dropoffInsights: DropOff[] = [
  {
    stage_from: 'Made a card',
    stage_to: 'Shared a card',
    drop_pct: 0.48,
    insight: '48% of users who make a card never share one. Cards are the viral mechanism — every non-share is a missed referral.',
    recommendation: 'Day-3 email: "You made 3 cards — your league won\'t know unless you share." With one-click share buttons inline.',
  },
  {
    stage_from: 'Trial completed',
    stage_to: 'Paid (first month)',
    drop_pct: 0.43,
    insight: 'The biggest conversion drop. Users finish trial but don\'t pay — usually because they didn\'t share a card yet, so they never felt the social proof loop.',
    recommendation: 'Test a "1 month free if you share 3 cards" offer at day 6. Worked in beta — converted 14% of would-be lapsers.',
  },
  {
    stage_from: 'Connected league',
    stage_to: 'Viewed first card',
    drop_pct: 0.09,
    insight: 'Healthy step — most connected users see their first card. Drop-off is mostly mobile-only users where the card render is slow.',
    recommendation: 'Optimize first-card render time on mobile (currently 3.2s avg). Goal &lt; 1.5s.',
  },
]
