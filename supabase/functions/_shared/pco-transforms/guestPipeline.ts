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
}
export interface GuestCase {
  id: string; name: string; campus: GuestCampus; stage: GuestStage
  detail: string; owner: string; age: string; note?: string; draft?: string
}
export interface GuestKpis { recentGuests: number; firstTimers4w: number; stillVisitors: number; completedPct: number }
export interface GuestPipelinePayload { cases: GuestCase[]; kpis: Record<'all' | GuestCampus, GuestKpis> }

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

export function buildGuestPipeline(rows: GuestCardRow[], today: string): GuestPipelinePayload {
  const cases: GuestCase[] = []
  const kpis = {} as Record<'all' | GuestCampus, GuestKpis>
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
  }
  const allRecent = kpis.english.recentGuests + kpis.brazilian.recentGuests
  kpis.all = {
    recentGuests: allRecent,
    firstTimers4w: kpis.english.firstTimers4w + kpis.brazilian.firstTimers4w,
    stillVisitors: kpis.english.stillVisitors + kpis.brazilian.stillVisitors,
    completedPct: Math.round((kpis.english.completedPct * kpis.english.recentGuests + kpis.brazilian.completedPct * kpis.brazilian.recentGuests) / Math.max(1, allRecent)),
  }
  return { cases, kpis }
}
