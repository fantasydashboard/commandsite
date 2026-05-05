/**
 * Dummy review records for Apex Heating & Air.
 * Realistic mix of 5-star praise, a few 4-stars with notes, and 2 low
 * ratings the AI has drafted thoughtful responses to. Sources spread
 * across Google / Facebook / Yelp / Nextdoor to mirror the real intake.
 */
import type { ReviewRecord } from './types'

function ago(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours, 0, 0, 0)
  return d.toISOString()
}

export const reviews: ReviewRecord[] = [
  {
    id: 'r-001',
    customer: 'Tom Bradley',
    rating: 5,
    source: 'google',
    text: 'Same-day fix on a 95° afternoon when nobody else could come out. Marcus diagnosed it in five minutes, had the part on his truck, and was out the door under an hour. Fair price too. Calling these guys first from now on.',
    received_at: ago(0, 4),
    job_type: 'AC repair',
    response: null,
    ai_response_draft: `Thanks so much, Tom — that means a lot. Marcus mentioned how miserable it was outside, glad we could get you cooled down quickly. We always try to keep the most common parts on the truck for exactly this reason. Welcome to the Apex family!`,
  },
  {
    id: 'r-002',
    customer: 'Lisa Bennett',
    rating: 5,
    source: 'facebook',
    text: 'Marcus was incredible. Showed up exactly when promised, explained everything in plain English, and didn\'t try to upsell me on anything I didn\'t need. Honest company.',
    received_at: ago(0, 8),
    job_type: 'Capacitor replacement',
    response: {
      text: 'Lisa, thank you! Marcus is one of our best — we\'ll make sure he sees this. Honesty is non-negotiable here, glad it came through.',
      sent_at: ago(0, 6),
    },
  },
  {
    id: 'r-003',
    customer: 'Jennifer Martinez',
    rating: 5,
    source: 'google',
    text: '2 AM AC failure with two kids in the house. Called Apex, the AI receptionist was friendly and got Marcus dispatched in under an hour. He fixed a blown capacitor and we were sleeping cool by 4 AM. Signed up for the maintenance plan on the spot.',
    received_at: ago(1, 2),
    job_type: 'After-hours capacitor',
    response: {
      text: 'Jennifer — this is exactly why we run the after-hours line. So glad we could get the kids back to sleep. See you for your spring maintenance visit!',
      sent_at: ago(0, 22),
    },
  },
  {
    id: 'r-004',
    customer: 'Sandra Whitmore',
    rating: 4,
    source: 'google',
    text: 'Great work once the tech got here. Took about a week to get scheduled though, which was longer than I hoped. Would still recommend.',
    received_at: ago(2),
    job_type: 'Thermostat install',
    response: null,
    ai_response_draft: `Thanks for the honest feedback, Sandra — and sorry about the scheduling wait. We\'ve added two more techs to the roster since then and our average lead time is back under 48 hours. Glad the install went well, and we appreciate you sticking with us.`,
  },
  {
    id: 'r-005',
    customer: 'Karen Holloway',
    rating: 5,
    source: 'nextdoor',
    text: 'My water heater started leaking on a Sunday and Apex had someone here within 90 minutes. Replaced the whole unit by Monday afternoon. Pro work, fair price.',
    received_at: ago(3),
    job_type: 'Water heater replacement',
    response: {
      text: 'Karen — appreciate you taking the time to share with the neighborhood. Sundays are no problem for us, that\'s what the on-call rotation is for!',
      sent_at: ago(2),
    },
  },
  {
    id: 'r-006',
    customer: 'Robert Chen',
    rating: 5,
    source: 'google',
    text: 'In-home assessment was thorough and the quote was clear. No pressure, no hidden fees. Comparing with one other company before we decide but Apex is the front-runner.',
    received_at: ago(3, 6),
    job_type: 'New HVAC quote',
    response: null,
    ai_response_draft: `Robert — really appreciate the kind words. Take your time with the comparison, no pressure from our end. If anything in the quote needs more detail, just shoot us a note. Whichever way you go, hope you get the right system for the long run.`,
  },
  {
    id: 'r-007',
    customer: 'Daniel Park',
    rating: 2,
    source: 'yelp',
    text: 'Got a quote that felt high. Tech was nice but I went with another company that came in $2,000 lower for the same equipment. Probably just not the right fit for us.',
    received_at: ago(4),
    job_type: 'Mini-split quote',
    response: null,
    ai_response_draft: `Daniel — thanks for the candid feedback. We don\'t always come in lowest because we include a 10-year parts-and-labor warranty and white-glove install (drop cloths, haul-away, post-install commissioning) that many competitors charge extra for. Hope the install with the other company goes smoothly — and if you ever need service down the road, the door\'s open.`,
  },
  {
    id: 'r-008',
    customer: 'Patricia Andrews',
    rating: 5,
    source: 'google',
    text: 'Annual maintenance was painless. Tech showed photos of everything, explained what was wearing, and didn\'t recommend anything I didn\'t need. Wish all home services were like this.',
    received_at: ago(5),
    job_type: 'Annual tune-up',
    response: {
      text: 'Thanks Patricia — those photo write-ups are something we started a year ago and we\'re proud of them. Glad it landed.',
      sent_at: ago(4),
    },
  },
  {
    id: 'r-009',
    customer: 'Michael Reyes',
    rating: 5,
    source: 'facebook',
    text: 'Furnace died at 6 AM in January. Apex had a tech here by 9, replacement quoted by noon, full install done by Wednesday. Communication was constant the whole way. 10/10.',
    received_at: ago(6),
    job_type: 'Emergency furnace replacement',
    response: {
      text: 'Michael — those January mornings are no joke. Thank you for trusting us with the full replacement, and welcome to the Apex family.',
      sent_at: ago(5),
    },
  },
  {
    id: 'r-010',
    customer: 'Hector Vega',
    rating: 4,
    source: 'google',
    text: 'Service was great and the price was reasonable. The tech ran a little late which threw off my afternoon, but he called ahead to let me know.',
    received_at: ago(7),
    job_type: 'Air handler service',
    response: null,
    ai_response_draft: `Hector — thanks for the 4 stars and the honest note about timing. We\'re working on tighter routing this year so techs hit their windows more reliably. Appreciate you sharing!`,
  },
  {
    id: 'r-011',
    customer: 'Amanda Foster',
    rating: 5,
    source: 'google',
    text: 'Booked my duct cleaning over text in about 30 seconds. Tech showed up on time, was respectful of the house, and the air honestly smells different now.',
    received_at: ago(8),
    job_type: 'Duct cleaning',
    response: {
      text: 'Amanda — thank you! The text booking is one of our favorite features too. Enjoy the cleaner air.',
      sent_at: ago(7),
    },
  },
  {
    id: 'r-012',
    customer: 'Greg Hammond',
    rating: 5,
    source: 'nextdoor',
    text: 'Hadn\'t used Apex in over a year and got a friendly check-in email about my old unit. Turned out the contactor was about to fail. Saved me an after-hours emergency call. Smart business.',
    received_at: ago(10),
    job_type: 'Contactor replacement',
    response: null,
    ai_response_draft: `Greg — exactly what those reminders are for, glad it caught the contactor in time. Welcome back, and we\'ll see you for the spring tune-up.`,
  },
  {
    id: 'r-013',
    customer: 'James Sullivan',
    rating: 5,
    source: 'google',
    text: 'Mini-split install in two zones, perfect work. Quote matched final invoice to the dollar. Will definitely use again.',
    received_at: ago(12),
    job_type: 'Mini-split install',
    response: {
      text: 'James — thank you, and we love hearing the quote-matched-invoice part. That\'s how it should always be.',
      sent_at: ago(11),
    },
  },
  {
    id: 'r-014',
    customer: 'Anthony Russo',
    rating: 1,
    source: 'google',
    text: 'After-hours dispatch took 3 hours not the 90 minutes promised. Compressor failed completely overnight while we waited. Eventually replaced but the wait was unacceptable.',
    received_at: ago(14),
    job_type: 'Emergency compressor',
    response: null,
    ai_response_draft: `Anthony — you\'re right, three hours is unacceptable and we owe you a real apology. Marcus was on a call across town that ran longer than expected. We\'ve since added a second on-call tech for nights so this can\'t happen again. I\'d like to refund your dispatch fee and personally make sure your next service is on us. I\'ll have the owner reach out today. — Apex`,
  },
  {
    id: 'r-015',
    customer: 'Yvonne Castillo',
    rating: 5,
    source: 'facebook',
    text: 'New 4-ton heat pump quote came back same day, install scheduled within the week. Crew was clean, quiet, and finished early. Couldn\'t ask for more.',
    received_at: ago(18),
    job_type: 'New heat pump',
    response: {
      text: 'Yvonne — thank you! Quick turn-around quotes are something we work hard at, glad it came through.',
      sent_at: ago(17),
    },
  },
]

export interface ReviewStats {
  total: number
  avg_rating: number
  unanswered: number
  this_week: number
  by_source: Record<ReviewRecord['source'], number>
  by_rating: Record<1 | 2 | 3 | 4 | 5, number>
}

export function reviewStats(): ReviewStats {
  const total = reviews.length
  const avg_rating = reviews.reduce((s, r) => s + r.rating, 0) / total
  const unanswered = reviews.filter((r) => !r.response).length
  const week_ago = Date.now() - 7 * 24 * 60 * 60 * 1000
  const this_week = reviews.filter((r) => new Date(r.received_at).getTime() >= week_ago).length

  const by_source: ReviewStats['by_source'] = { google: 0, facebook: 0, yelp: 0, nextdoor: 0 }
  const by_rating: ReviewStats['by_rating'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of reviews) {
    by_source[r.source]++
    by_rating[r.rating]++
  }

  return { total, avg_rating, unanswered, this_week, by_source, by_rating }
}
