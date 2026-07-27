// fetchScheduleChunk.ts
import { pcoAll, pcoUntil, pcoAllPages } from '../pco-paginate.ts'
import { monthsAgo } from '../pco-transforms/serving.ts'
import type { ScheduleCursor } from './cursor.ts'

// deno-lint-ignore no-explicit-any
type Db = any
interface ServingCfg { lookbackMonths: number }

// Advances the schedule backfill by one time-budgeted chunk. Resumes from the
// cursor: iterate service types, and within each, its plans; for each plan upsert
// team-member assignments. Stops when isOver() is true, persisting progress in
// the returned cursor. done=true when all service types are exhausted.
//
// cutoffOverride is optional: when provided it is used as the past-plans cutoff
// date instead of computing one from cfg.lookbackMonths. Task 8's incremental
// sync path passes the last successful sync date here so re-runs only walk
// plans since then, rather than re-walking the full lookback window.
export async function fetchScheduleChunk(
  db: Db,
  clientId: string,
  tenant: string,
  cfg: ServingCfg,
  cursor: ScheduleCursor,
  isOver: () => boolean,
  cutoffOverride?: string,
): Promise<{ cursor: ScheduleCursor; done: boolean; lastDate: string | null }> {
  const cutoff = cutoffOverride ?? monthsAgo(new Date().toISOString().slice(0, 10), cfg.lookbackMonths)
  let { serviceTypeIds, stIndex, planIds, planIndex } = cursor
  let lastDate: string | null = null

  if (!serviceTypeIds || serviceTypeIds.length === 0) {
    const sts = await pcoAll(tenant, '/services/v2/service_types?per_page=100')
    serviceTypeIds = sts.map((s: any) => s.id)
    stIndex = 0; planIds = []; planIndex = 0
  }

  while (stIndex < serviceTypeIds.length) {
    if (!planIds || planIndex >= planIds.length) {
      const stId = serviceTypeIds[stIndex]
      const past = await pcoUntil(tenant, `/services/v2/service_types/${stId}/plans?filter=past&per_page=50&order=-sort_date`,
        (p: any) => { const d = (p.attributes?.sort_date ?? '').slice(0, 10); return !!d && d < cutoff })
      const future = await pcoAll(tenant, `/services/v2/service_types/${stId}/plans?filter=future&per_page=50&order=sort_date`)
      planIds = [...past, ...future].map((p: any) => ({ id: p.id, date: (p.attributes?.sort_date ?? '').slice(0, 10) }))
      planIndex = 0
      if (planIds.length === 0) { stIndex++; continue }
    }
    while (planIndex < planIds.length) {
      if (isOver()) return { cursor: { serviceTypeIds, stIndex, planIds, planIndex }, done: false, lastDate }
      const plan = planIds[planIndex]
      const pages = await pcoAllPages(tenant, `/services/v2/plans/${plan.id}/team_members?per_page=200&include=team`)
      const rows: any[] = []
      for (const page of pages) {
        const teamName: Record<string, string> = {}
        for (const inc of page.included ?? []) if (inc.type === 'Team') teamName[inc.id] = inc.attributes?.name ?? ''
        for (const m of page.data ?? []) {
          const pid = m.relationships?.person?.data?.id
          const name = (m.attributes?.name ?? '').trim()
          if (!pid || !name) continue
          const team = teamName[m.relationships?.team?.data?.id] || 'Serving'
          const status = (m.attributes?.status ?? '').charAt(0).toUpperCase()
          rows.push({ client_id: clientId, person_id: pid, name, date: plan.date, team, status })
        }
      }
      if (rows.length) {
        const deduped = [...new Map(rows.map((r: any) => [`${r.person_id}|${r.date}|${r.team}`, r])).values()]
        const { error } = await db.from('pco_serving_assignments').upsert(deduped, { onConflict: 'client_id,person_id,date,team' })
        if (error) throw new Error(`upsert assignments failed: ${error.message}`)
        lastDate = deduped.reduce((mx: string, r: any) => (r.date > mx ? r.date : mx), lastDate ?? '')
      }
      planIndex++
    }
    stIndex++; planIds = []; planIndex = 0
  }
  return { cursor: { serviceTypeIds, stIndex, planIds: [], planIndex: 0 }, done: true, lastDate }
}
