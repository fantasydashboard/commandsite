// fetchSchedule.ts
import { pcoAll, pcoAllPages, pcoUntil } from '../pco-paginate.ts'
import { monthsAgo } from './serving.ts'
import type { ByPerson, ServingCfg } from './types.ts'

// Pulls Services team-member assignments into a byPerson map, past bounded by
// lookbackMonths, plus all future plans. Dates sorted descending.
export async function fetchServingSchedule(tenant: string, cfg: ServingCfg, today: string): Promise<ByPerson> {
  const cutoff = monthsAgo(today, cfg.lookbackMonths)
  const serviceTypes = await pcoAll(tenant, '/services/v2/service_types?per_page=100')
  const plans: { id: string; date: string }[] = []
  for (const st of serviceTypes) {
    const past = await pcoUntil(tenant, `/services/v2/service_types/${st.id}/plans?filter=past&per_page=50&order=-sort_date`, (p: any) => {
      const d = (p.attributes?.sort_date ?? '').slice(0, 10)
      return !!d && d < cutoff
    })
    for (const p of past) plans.push({ id: p.id, date: (p.attributes?.sort_date ?? '').slice(0, 10) })
    const future = await pcoAll(tenant, `/services/v2/service_types/${st.id}/plans?filter=future&per_page=50&order=sort_date`)
    for (const p of future) plans.push({ id: p.id, date: (p.attributes?.sort_date ?? '').slice(0, 10) })
  }
  const byPerson: ByPerson = {}
  for (const plan of plans) {
    const pages = await pcoAllPages(tenant, `/services/v2/plans/${plan.id}/team_members?per_page=200&include=team`)
    for (const page of pages) {
      const teamName: Record<string, string> = {}
      for (const inc of page.included ?? []) if (inc.type === 'Team') teamName[inc.id] = inc.attributes?.name ?? ''
      for (const m of page.data ?? []) {
        const pid = m.relationships?.person?.data?.id
        const name = (m.attributes?.name ?? '').trim()
        if (!pid || !name) continue
        const team = teamName[m.relationships?.team?.data?.id] || 'Serving'
        const status = (m.attributes?.status ?? '').charAt(0).toUpperCase() // normalize to first letter: C/U/D
        ;(byPerson[pid] ??= { name, dates: [] }).dates.push({ date: plan.date, team, status })
      }
    }
  }
  for (const rec of Object.values(byPerson)) rec.dates.sort((a, b) => (a.date < b.date ? 1 : -1))
  return byPerson
}
