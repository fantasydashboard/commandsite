// guestPipeline.ts (edge transform)
// Pure transform: PCO Starting Point workflow cards -> the Front Desk guest
// pipeline payload. Ported verbatim from scripts/gen-guest-pipeline.mjs so live
// output matches the baked snapshot. Stage comes from the current follow-up
// step; a guest whose first visit was within the last 7 days gets a drafted
// welcome (English or Portuguese).

// Named after the church's OWN Starting Point steps rather than invented funnel
// language. See src/lib/clients/church/guestStages.ts for the full reasoning.
export type GuestStage = 'signed_in' | 'called' | 'week2' | 'week3' | 'finished'
export type GuestCampus = 'english' | 'brazilian'

// One card as mirrored into pco_workflow_cards.
export interface GuestCardRow {
  card_id: string
  campus: string
  name: string
  created_date: string
  completed_date: string | null
  step_name: string
  person_id: string
}
/**
 * Something the person did in the church that Planning Center DID record, even
 * though an adult's return to a service is never recorded. A child checked in,
 * a group joined, a serving shift confirmed. Christina ran a list and found 9
 * people sitting on week 2 for months who were plainly active; none of them
 * had stopped by the Starting Point table again, so the workflow never moved.
 */
export type ActivityKind = 'kids' | 'group' | 'serving'
export interface GuestActivity { kind: ActivityKind; date: string; detail: string }
/**
 * Triage bucket, from days since the first visit and the church's own history.
 * Of the 87 people who finished Starting Point since Jan 2025: 70% within four
 * weeks, 85% within six, 94% within 90 days, nobody after six months.
 *   working   inside six weeks: this is the live worklist
 *   decision  past six weeks: reach out once, or clear
 *   clear     past 90 days: nobody has finished from here
 */
export type GuestBucket = 'working' | 'decision' | 'clear'
export const FLAG_DAYS = 42
export const CLEAR_DAYS = 90
/** Three weeks with no return: Grace stops messaging and hands the name over. */
export const NUDGE_DAYS = 21
/** The Thursday come-back window. Cards move to week 2 on Tuesday morning, so a
 *  note on day 4 (Thursday after a Sunday visit) goes only to people who did
 *  not come back; by day 10 the next Sunday has passed and the moment is gone. */
export const COMEBACK_FROM_DAYS = 4
export const COMEBACK_TO_DAYS = 10
/** Activity this recent counts as "active now" even if it predates the card:
 *  someone can attend for a season before ever signing in at the table. */
export const ACTIVE_WITHIN_DAYS = 56

export interface GuestCase {
  id: string; cardId: string; person_id: string; name: string; campus: GuestCampus; stage: GuestStage
  detail: string; owner: string; age: string; note?: string; draft?: string
  daysWaiting: number; bucket: GuestBucket; active?: GuestActivity
}
export interface GuestKpis {
  recentGuests: number; firstTimers4w: number; stillVisitors: number; completedPct: number
  /** Unfinished cards by triage bucket, and how many of them are already active. */
  working: number; decision: number; clear: number; alreadyActive: number
}

/**
 * One month of FLOW. Deliberately separate from GuestKpis, which is a snapshot
 * of a cohort.
 *
 * These two series must NEVER be divided into each other. A card completed in
 * July was almost never created in July: those people first visited months
 * earlier. "39 first visits, 5 completions" in the same month is not a 13%
 * conversion rate, it is two unrelated populations that happen to share a
 * calendar label, which makes the false reading easier to fall into than the
 * step-over-step one, not harder.
 */
export interface GuestMonthPoint {
  month: string          // 'YYYY-MM'
  firstVisits: number    // cards CREATED in this month
  completedSP: number    // cards COMPLETED in this month, created whenever
  partial: boolean       // the in-progress current month
}
export interface GuestPipelinePayload {
  cases: GuestCase[]
  kpis: Record<'all' | GuestCampus, GuestKpis>
  monthly: Record<'all' | GuestCampus, GuestMonthPoint[]>
}

/**
 * What the card is actually doing, in the church's own terms.
 *
 * The old copy said "welcome sent" for the week-2 stage. Their week-2 step is a
 * physical bag handed to someone who came back, and the step before it is a
 * phone call with a coffee mug. Neither is an email, and Grace had sent nothing
 * at all (test mode). So the board narrated an action that did not happen, and
 * credited it to the wrong party.
 *
 * The English workflow names its gifts; the Brazilian one does not (its steps
 * are just "Week 2" / "Week 3"). Until we know whether the Brazilian ministry
 * runs the same mug-and-bag sequence, only English claims the gifts.
 */
function detailOf(stage: GuestStage, campus: GuestCampus): string {
  const gift = campus === 'english'
  switch (stage) {
    case 'signed_in': return 'signed in at Starting Point, no step yet'
    case 'called': return gift ? 'welcome call step, coffee mug' : 'welcome call step'
    case 'week2': return gift ? 'week-2 step, the bag' : 'week-2 step'
    case 'week3': return gift ? 'week-3 step, the gift card' : 'week-3 step'
    case 'finished': return 'completed all three Starting Point steps'
  }
}

const daysAgo = (today: string, d: string): number =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 864e5)
const first = (name: string): string => (name || 'Friend').split(' ')[0]

function stageOf(row: GuestCardRow): GuestStage {
  if (row.completed_date) return 'finished'
  if (/week 3/i.test(row.step_name)) return 'week3'
  if (/week 2/i.test(row.step_name)) return 'week2'
  // The call step had no branch at all before, so every card sitting on it fell
  // through to "new" and the first human touch in their process was invisible.
  if (/phone call/i.test(row.step_name)) return 'called'
  return 'signed_in'
}
/** Who the note is signed by. Hardcoded to one pastor's name until now, which
 *  breaks the moment a church sends from anyone else's address: the guest gets
 *  mail from the Connections team signed by the pastor. Sender and signature are
 *  one decision, so this comes from church_settings.messaging.signature. */
export const DEFAULT_SIGNATURE = 'Pastor Mark'

/**
 * The Thursday come-back note. NOT a welcome: the church already texts every
 * guest on Monday at 2pm with a video from the pastor, so a second welcome from
 * Grace would be the fourth automated touch in a week. One reason to come back,
 * approved by a person, then nothing. Only English names the gift; the
 * Brazilian steps are unnamed and may not run the same sequence.
 */
function comebackDraftOf(name: string, campus: GuestCampus, signature: string): string {
  const f = first(name)
  if (campus === 'brazilian')
    return `${f}, foi muito bom ter você conosco no domingo. Neste domingo adoraríamos ver você de novo. Se algo da sua primeira visita deixou alguma dúvida, é só responder aqui que eu mesmo respondo. ${signature}`
  return `${f}, it was good to have you with us on Sunday. This Sunday we would love to see you again, and there is a small gift waiting with your name on it at Starting Point. If anything from your first visit left you with a question, reply here and I will answer it myself. ${signature}`
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDate = (iso: string): string => { const [, m, d] = iso.split('-').map(Number); return m && d ? `${MON[m - 1]} ${d}` : iso }
/** Active if the activity is on or after the first visit, or recent enough to
 *  mean "attending now" regardless. Group membership carries no date and is
 *  taken at face value: a first-time guest is not in a Growth Group. */
export function isActiveNow(a: GuestActivity | undefined, created: string, today: string): boolean {
  if (!a) return false
  if (a.kind === 'group') return true
  return a.date >= created || daysAgo(today, a.date) <= ACTIVE_WITHIN_DAYS
}
export function bucketOf(days: number): GuestBucket {
  return days >= CLEAR_DAYS ? 'clear' : days > FLAG_DAYS ? 'decision' : 'working'
}
/**
 * Who moved this card. Every stage here is derived from a Planning Center step,
 * which a person at the church advanced, so all of them are the church's.
 *
 * This used to return 'Grace, auto' for three of the five stages, which put
 * Grace's name on 88 cards' worth of work the Starting Point team did
 * themselves, while Grace had sent nothing (test mode). Third instance of this
 * failure after the Today queue and the Care & Drift approve button. Grace only
 * claims what Grace did: the drafted welcome, which the card's `note` carries.
 */
function ownerOf(_stage: GuestStage): string {
  return 'Starting Point team'
}
function kpisFor(list: GuestCardRow[], today: string, cases: GuestCase[]): GuestKpis {
  const recentGuests = list.length
  const firstTimers4w = list.filter((x) => daysAgo(today, x.created_date) <= 28).length
  const stillVisitors = list.filter((x) => !x.completed_date).length
  const completed = list.filter((x) => x.completed_date).length
  const completedPct = Math.round((completed / Math.max(1, recentGuests)) * 100)
  const open = cases.filter((c) => c.stage !== 'finished')
  return {
    recentGuests, firstTimers4w, stillVisitors, completedPct,
    working: open.filter((c) => c.bucket === 'working' && !c.active).length,
    decision: open.filter((c) => c.bucket === 'decision' && !c.active).length,
    clear: open.filter((c) => c.bucket === 'clear' && !c.active).length,
    alreadyActive: open.filter((c) => c.active).length,
  }
}

const monthOf = (d: string): string => d.slice(0, 7)

/** Inclusive 'YYYY-MM' range, so the series has no gaps. A sparkline that skips
 *  empty months draws a flat line through a month where nothing happened, which
 *  reads as steady when it was actually silent. */
function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

function monthlyFor(list: GuestCardRow[], today: string): GuestMonthPoint[] {
  if (!list.length) return []
  const created = list.map((r) => monthOf(r.created_date))
  const completed = list.filter((r) => r.completed_date).map((r) => monthOf(r.completed_date as string))
  const thisMonth = monthOf(today)
  // Start at the earliest month we have evidence for; end at the current month
  // even when it is still empty, so "nothing yet this month" is visible.
  const earliest = [...created, ...completed].sort()[0]
  const months = monthRange(earliest, thisMonth > earliest ? thisMonth : earliest)
  return months.map((month) => ({
    month,
    firstVisits: created.filter((c) => c === month).length,
    completedSP: completed.filter((c) => c === month).length,
    // The current month is only part-elapsed. Flagged rather than dropped: the
    // UI dims it, because an unmarked short bar reads as a collapse in volume.
    partial: month === thisMonth,
  }))
}

/** How far back the WORKLIST reaches. Distinct from pco_config.guests.
 *  windowMonths, which is retention: how far back cards are KEPT so the monthly
 *  trend has history. Conflating the two turned "in the pipeline" into a
 *  two-year archive of 788 people the moment retention went from 5 to 24 months.
 *  Guests older than this age out of the front door; Care & Drift is the back
 *  door and picks up long-term disengagement. */
export const DEFAULT_ACTIVE_DAYS = 90

export function buildGuestPipeline(
  rows: GuestCardRow[],
  today: string,
  activeDays: number = DEFAULT_ACTIVE_DAYS,
  signature: string = DEFAULT_SIGNATURE,
  /** person_id -> the most recent recorded activity, from the staged tables. */
  activity: Record<string, GuestActivity> = {},
): GuestPipelinePayload {
  const cases: GuestCase[] = []
  const kpis = {} as Record<'all' | GuestCampus, GuestKpis>
  const monthly = {} as Record<'all' | GuestCampus, GuestMonthPoint[]>
  // Worklist rows only. `monthly` deliberately reads the FULL set below.
  const active = rows.filter((r) => daysAgo(today, r.created_date) <= activeDays)
  for (const campus of ['english', 'brazilian'] as GuestCampus[]) {
    const list = active
      .filter((r) => r.campus === campus)
      .sort((a, b) => (a.created_date < b.created_date ? 1 : -1))
    const campusCases: GuestCase[] = []
    for (const x of list) {
      const stage = stageOf(x)
      const days = daysAgo(today, x.created_date)
      const weeks = Math.round(days / 7)
      const open = stage !== 'finished'
      const act = activity[x.person_id]
      const active = open && isActiveNow(act, x.created_date, today) ? act : undefined
      // Who still needs a reason to come back: nobody has marked them returned
      // (week 3 or finished means they did), nobody has seen them active, and
      // it is between the Thursday after their visit and the following Sunday.
      const comeback = open && !active && stage !== 'week3' && days >= COMEBACK_FROM_DAYS && days <= COMEBACK_TO_DAYS
      // One note per card, chosen by what the card most needs a person to do.
      let note: string | undefined
      if (active) note = `Already active: ${active.detail}. Clear the card.`
      else if (comeback) note = 'Grace drafted a Thursday come-back note, awaiting your approval'
      else if (open && days >= CLEAR_DAYS) note = `${weeks} weeks with no return. Nobody has finished Starting Point after 90 days; clear the card.`
      else if (open && days > FLAG_DAYS) note = `${weeks} weeks with no return. Reach out once or clear; 85% of the people who finish are done by six weeks.`
      else if (open && days >= NUDGE_DAYS) note = 'Three weeks with no return. Grace stops here; a personal reach-out or a clear is yours.'
      campusCases.push({
        id: `gp-${x.card_id}`,
        cardId: x.card_id,
        person_id: x.person_id,
        name: x.name,
        campus,
        stage,
        // The pending draft wins over the step wording: it is the one statement
        // we know is true about what has and has not gone out.
        detail: comeback ? 'first visit, come-back note drafted, not sent yet' : detailOf(stage, campus),
        owner: ownerOf(stage),
        age: days < 7 ? 'this week' : `${weeks}w ago`,
        daysWaiting: days,
        bucket: bucketOf(days),
        ...(active ? { active } : {}),
        ...(note ? { note } : {}),
        ...(comeback ? { draft: comebackDraftOf(x.name, campus, signature) } : {}),
      })
    }
    cases.push(...campusCases)
    kpis[campus] = kpisFor(list, today, campusCases)
    monthly[campus] = monthlyFor(list, today)
  }
  // 'all' is computed off the full row set rather than by merging the two campus
  // series, so a month present in one campus and absent in the other still lines
  // up instead of shifting the series.
  monthly.all = monthlyFor(rows, today)
  const allRecent = kpis.english.recentGuests + kpis.brazilian.recentGuests
  kpis.all = {
    recentGuests: allRecent,
    firstTimers4w: kpis.english.firstTimers4w + kpis.brazilian.firstTimers4w,
    stillVisitors: kpis.english.stillVisitors + kpis.brazilian.stillVisitors,
    completedPct: Math.round((kpis.english.completedPct * kpis.english.recentGuests + kpis.brazilian.completedPct * kpis.brazilian.recentGuests) / Math.max(1, allRecent)),
    working: kpis.english.working + kpis.brazilian.working,
    decision: kpis.english.decision + kpis.brazilian.decision,
    clear: kpis.english.clear + kpis.brazilian.clear,
    alreadyActive: kpis.english.alreadyActive + kpis.brazilian.alreadyActive,
  }
  return { cases, kpis, monthly }
}
