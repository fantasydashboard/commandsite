/**
 * Persona registry — maps each demo client slug to its AI assistant
 * (name, role-label, suggested questions + canned answers). Powers
 * the floating Ask-{Name} button in the dashboard layout.
 *
 * For now this duplicates the per-Today-module data. A future
 * refactor could have each Today module also pull from this same
 * source to avoid drift.
 */

export interface SuggestedQuestion {
  q: string
  a: string
}

export interface Persona {
  /** Display name (Ada, Grace, etc.) */
  name: string
  /** Short subtitle ("your AI employee" / "your AI ministry assistant") */
  subtitle: string
  /** First message Ada/Grace says when chat opens */
  greeting: string
  /** Suggested questions for the chat */
  questions: SuggestedQuestion[]
}

export const personas: Record<string, Persona> = {
  // ── Apex Heating & Air (HVAC owner — Brett) ───────────────────────────
  'apex-heating-and-air': {
    name: 'Ada',
    subtitle: 'your AI employee',
    greeting: "Hi Brett — I'm Ada. Ask me anything about the shop.",
    questions: [
      {
        q: 'What did you handle while I was on the truck?',
        a: "Today so far: caught 12 calls, booked 4 service appts (incl. one no-cooling emergency I escalated to Marcus), sent 3 quote follow-ups (one already replied — Rodriguez wants to schedule), and texted yesterday's customers for reviews (got 2 five-stars back already). Two things flagged for your eyes — see Front Desk & Quotes.",
      },
      {
        q: "How's revenue this week vs last?",
        a: "$48,920 booked this week vs $43,210 last week — up 13%. Service calls drove most of the lift (storms last week + I caught 8 weekend calls that would've gone to voicemail). Quote close rate is 87% on the ones I followed up. Full breakdown's on Insights.",
      },
      {
        q: 'Which customers should I be worried about?',
        a: "Three to flag: The Hendersons (recurring AC tune-up overdue 6 weeks, normally schedule Mar — sent a reminder, no response), Coronado Property Mgmt (3 service calls in 60 days, last tech notes mentioned 'system at end of life' — possible replace job), and Mike Patel (paid late twice, last invoice 31 days out). Details on Customer Care.",
      },
      {
        q: 'Which quotes are stale?',
        a: "Six quotes past 7 days with no movement. The big one: Riverpoint Condos — $14,800 commercial RTU replace, sent 11 days ago, opened twice. I drafted a soft check-in for your review. Five smaller residential quotes ($800-$2,400 range) are at day 5-7, scheduled to send Day-7 nudges automatically tomorrow morning. See Front Desk & Quotes.",
      },
      {
        q: 'What did the reviews say last week?',
        a: "11 new reviews — avg 4.8 stars. Standout: Maria Chen (5★) called out Tony by name for explaining her thermostat options without pressure. One 3-star from Jim Castellanos (technician was late + didn't call) — I drafted an apology reply for your review before it goes live. See Reputation & Marketing.",
      },
      {
        q: "Who hasn't called us in over a year?",
        a: "47 dormant customers (last service > 365 days). I've already contacted 24 with personalized re-engagement messages this month — 5 booked jobs back ($6,840 in recovered revenue). 23 still on the do list. Want me to send the next batch this week or hold off? See Customer Care.",
      },
    ],
  },

  // ── Cornerstone Community Church (Pastor Mark) ────────────────────────
  'cornerstone-church': {
    name: 'Grace',
    subtitle: 'your AI ministry assistant',
    greeting: "Hi Pastor Mark — I'm here. Ask me anything about what's happening at Cornerstone this week.",
    questions: [
      {
        q: 'Who visited for the first time this week?',
        a: "Three first-time visitors Sunday — Riley Boucher (came alone, mentioned work has been lonely), Kennedy Park (second visit, filled out the connect card), and the Maddux Family (4th visit + Newcomers Lunch — daughter loves the kids program). I sent Riley a welcome text Sunday afternoon (she opened it in 11 minutes) and drafted day-3 follow-ups for Kennedy and the Madduxes. Want to review?",
      },
      {
        q: "Who haven't we connected with in a while?",
        a: "Three families I'd surface: The Sullivans (4 weeks no kids attendance, gift cancelled, Casey stepped off hospitality — pastoral check-in overdue), the Whitakers (2 flags red, kids missed 3 of last 4 Sundays), and the Reyes Family (just back after a 4-month gap — be warm but no pressure). I've drafted soft check-ins for the first two; the Sullivan situation might need a personal call instead of a text — your call.",
      },
      {
        q: "How's giving this month?",
        a: "$28,420 so far this month, on pace for ~$36k by month-end. Down ~5% vs same week last month, but two big Building Fund gifts are scheduled to clear next week. Five households flagged on stopped giving — two of them (Sullivans, Whitakers) are also at-risk on the People page, so I'd prioritize those over the rest.",
      },
      {
        q: 'Who needs care this week?',
        a: "Two urgent: James Foster's father passed Sunday (funeral Friday at 10 AM — meal train already coordinated through their small group), and the Sullivan family pastoral check-in is overdue. Eight other open cases, six in 'awaiting response.' I closed 14 cases over the last 30 days. Full breakdown's on the Care pulse card.",
      },
      {
        q: 'What did you handle while I was off?',
        a: "Eight things this week — sent Riley her welcome SMS (opened 11m later), mailed 4 birthday cards (auto-printed Mon, posted Tue), sent the Hawthorne Family their card-update reminder (their giving cycle was about to break), drafted the Ellison birth congrats note (sent for your review), texted the Reyes Family 'we missed you' (no response yet), escalated the Sullivan drift alert to you, sent the Sunday newsletter (847 recipients, 38% open, 12% click), and pinged Planning Center about the Sunday 9 AM nursery gap.",
      },
      {
        q: "Who's serving Sunday?",
        a: "Most slots filled — the Worship Team is solid (Jess leading, Marcus on bass, Holloway on backing vocals), Kids Ministry is healthy across all four age groups. Two gaps: Nursery (9 AM) is short 2 (Linda Tan + Aanya Patel both off — I suggested Mia Pham + Amanda Foster as fills based on past last-minute responses), and Parking Team (11 AM) is short 1. Planning Center has the asks queued.",
      },
    ],
  },

  // ── CommandSite-as-a-business (Josh's own dashboard) ──────────────────
  'commandsite': {
    name: 'Ada',
    subtitle: 'your AI employee · running on the same system you sell',
    greeting: "Hey Josh — Ada here. Ask me anything about CommandSite.",
    questions: [
      {
        q: 'What did you handle while I was building?',
        a: "Today: classified 4 cold-email replies (1 positive from Brett at Cool Comfort — drafted Calendly intro for your review, 2 OOFs auto-handled, 1 objection from Maria @ Sunshine Plumbing flagged). Drafted Day-7 nudges for 3 stale quotes. Posted Reddit comment on the r/HVAC scheduling thread you'd been watching. Daily AM brief is queued for 7:30 tomorrow.",
      },
      {
        q: "What's in my pipeline that needs attention?",
        a: "Three deals to surface: Cool Comfort (Brett, demo done 4d ago — proposal not sent, your move), Sunshine Plumbing (Maria, just replied positive — drafted Calendly intro), and BlueRidge Roofing (Wesley, day-9 in 'objection' stage — drafted a reframe for your review). Two more sit in early stages, no action needed yet. See Pipeline.",
      },
      {
        q: 'Who replied to outreach this week?',
        a: "14 replies total. 4 positive (queued in Outreach), 3 objections (winnable — drafts ready), 2 'send more info' (auto-handled, sent your one-pager), 4 OOFs (auto-archived), 1 unsubscribe (suppressed). Reply rate is 11.2% on this batch — above my 7% baseline. Your subject lines are landing.",
      },
      {
        q: 'What should I post on social this week?',
        a: "Three drafts ready for your review: a Reddit comment on r/HVAC about quote follow-up frustrations (you mentioned wanting to be active there), a LinkedIn post on the 'tools that don't talk to each other' theme (resonates with the Apollo data we pulled), and an X thread on Ada Lovelace's birthday next week (perfect angle to introduce her brand). Each is 60-90 sec to review + ship.",
      },
      {
        q: 'Which leads should I prioritize this week?',
        a: "From this week's Apollo pull, 12 leads scored ≥80% ICP. Top 3 by fit: Travis Reeves (Pinnacle Heating, Austin TX — 8 techs, $2.4M revenue, recently added a tech), Maria Castillo (Sunshine Plumbing, Orlando FL — 12 techs, GM-led decision-making), and Derrick Powell (Coastal HVAC, Tampa FL — 6 techs, growth mode). All ready for personalized email-1.",
      },
      {
        q: "How are we doing this month?",
        a: "Pre-revenue still. Smartlead warming hits day 14 in 7 days, then we ramp. Pipeline shows 6 active conversations + 2 demos booked (Brett next Tue, Maria Thu). If both close at Starter ($1,499 first month + $499/mo), that's $5,996 to start. Cash will go: $40 Smartlead + $7 Workspace + your time.",
      },
    ],
  },
}

/** Lookup by slug — returns null if no persona configured for that demo. */
export function personaForSlug(slug: string): Persona | null {
  return personas[slug] ?? null
}
