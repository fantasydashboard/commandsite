// guestPipeline.ts (edge transform)
// Pure transform: PCO Starting Point workflow cards -> the Front Desk guest
// pipeline payload. Ported verbatim from scripts/gen-guest-pipeline.mjs so live
// output matches the baked snapshot. Stage comes from the current follow-up
// step; a guest whose first visit was within the last 7 days gets a drafted
// welcome (English or Portuguese).

export type GuestStage = 'new' | 'welcomed' | 'connecting' | 'belongs' | 'cooled'
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
export interface GuestCase {
  id: string; cardId: string; person_id: string; name: string; campus: GuestCampus; stage: GuestStage
  detail: string; owner: string; age: string; note?: string; draft?: string
}
export interface GuestKpis { recentGuests: number; firstTimers4w: number; stillVisitors: number; completedPct: number }

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

const STAGE_DETAIL: Record<GuestStage, string> = {
  new: 'first visit · signed in at Starting Point',
  welcomed: 'welcome sent · in the week-2 follow-up',
  connecting: 'week-3 follow-up · progressing',
  belongs: 'finished the welcome sequence',
  cooled: 'signed in weeks ago · no next step since',
}

const daysAgo = (today: string, d: string): number =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 864e5)
const first = (name: string): string => (name || 'Friend').split(' ')[0]

function stageOf(row: GuestCardRow, today: string): GuestStage {
  if (row.completed_date) return 'belongs'
  if (/week 3/i.test(row.step_name)) return 'connecting'
  if (/week 2/i.test(row.step_name)) return 'welcomed'
  return daysAgo(today, row.created_date) > 28 ? 'cooled' : 'new'
}
function draftOf(name: string, campus: GuestCampus): string {
  const f = first(name)
  if (campus === 'brazilian')
    return `${f}, foi uma alegria ter você conosco na Focal Point no domingo. Sabemos que encontrar uma igreja é diferente para cada pessoa, e seria uma honra caminhar ao seu lado nesta temporada. Se pudermos ajudar de alguma forma, é só responder aqui. Bênçãos, Pastor`
  return `${f}, we were so glad you joined us at Focal Point on Sunday. We know finding a church home looks different for every person, and we would be honored to walk alongside you this season. If we can help in any way, just reply here. Blessings, Pastor Mark`
}
function ownerOf(stage: GuestStage): string {
  if (stage === 'new') return 'Pastor Mark'
  if (stage === 'cooled') return 'Connections team'
  return 'Grace, auto'
}
function kpisFor(list: GuestCardRow[], today: string): GuestKpis {
  const recentGuests = list.length
  const firstTimers4w = list.filter((x) => daysAgo(today, x.created_date) <= 28).length
  const stillVisitors = list.filter((x) => !x.completed_date).length
  const completed = list.filter((x) => x.completed_date).length
  const completedPct = Math.round((completed / Math.max(1, recentGuests)) * 100)
  return { recentGuests, firstTimers4w, stillVisitors, completedPct }
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

export function buildGuestPipeline(rows: GuestCardRow[], today: string): GuestPipelinePayload {
  const cases: GuestCase[] = []
  const kpis = {} as Record<'all' | GuestCampus, GuestKpis>
  const monthly = {} as Record<'all' | GuestCampus, GuestMonthPoint[]>
  for (const campus of ['english', 'brazilian'] as GuestCampus[]) {
    const list = rows
      .filter((r) => r.campus === campus)
      .sort((a, b) => (a.created_date < b.created_date ? 1 : -1))
    for (const x of list) {
      const stage = stageOf(x, today)
      const days = daysAgo(today, x.created_date)
      const thisWeek = days <= 7
      cases.push({
        id: `gp-${x.card_id}`,
        cardId: x.card_id,
        person_id: x.person_id,
        name: x.name,
        campus,
        stage,
        detail: STAGE_DETAIL[stage],
        owner: ownerOf(stage),
        age: days < 7 ? 'this week' : `${Math.round(days / 7)}w ago`,
        ...(thisWeek ? { note: 'Grace drafted a welcome, awaiting your approval', draft: draftOf(x.name, campus) } : {}),
      })
    }
    kpis[campus] = kpisFor(list, today)
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
  }
  return { cases, kpis, monthly }
}
