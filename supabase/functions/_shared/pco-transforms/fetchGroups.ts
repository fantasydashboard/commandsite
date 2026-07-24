// fetchGroups.ts
import { pcoAll, pcoAllPages } from '../pco-paginate.ts'
import type { GroupDriftCfg } from './types.ts'
import type { GroupInput } from './groupDrift.ts'

export async function fetchGroupInputs(tenant: string, cfg: GroupDriftCfg): Promise<GroupInput[]> {
  const start = Date.parse(cfg.seasonStart), end = Date.parse(cfg.seasonEnd)
  const types = (await pcoAll(tenant, '/groups/v2/group_types?per_page=25'))
    .filter((t) => new RegExp(cfg.groupTypeMatch, 'i').test(t.attributes?.name ?? ''))
  const out: GroupInput[] = []
  for (const t of types) {
    const groups = (await pcoAll(tenant, `/groups/v2/group_types/${t.id}/groups?per_page=100`))
      .filter((g) => !g.attributes?.archived_at)
    for (const g of groups) {
      const events = (await pcoAll(tenant, `/groups/v2/groups/${g.id}/events?per_page=100&order=-starts_at`))
        .map((e) => ({ id: e.id, date: (e.attributes?.starts_at ?? '').slice(0, 10), t: Date.parse(e.attributes?.starts_at ?? '') }))
        .filter((e) => e.t >= start && e.t <= end)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((e) => ({ id: e.id, date: e.date }))
      if (events.length < cfg.minEvents) continue
      const attendanceByPid: Record<string, string[]> = {}
      for (const e of events) {
        const att = await pcoAll(tenant, `/groups/v2/events/${e.id}/attendances?per_page=200`)
        for (const x of att) {
          if (!x.attributes?.attended) continue
          const pid = x.relationships?.person?.data?.id
          if (pid) (attendanceByPid[pid] ??= []).push(e.date)
        }
      }
      const memberPages = await pcoAllPages(tenant, `/groups/v2/groups/${g.id}/memberships?per_page=100&include=person`)
      const nm: Record<string, string> = {}
      for (const page of memberPages) for (const inc of page.included ?? []) if (inc.type === 'Person') nm[inc.id] = `${inc.attributes?.first_name ?? ''} ${inc.attributes?.last_name ?? ''}`.trim()
      const members: { pid: string; name: string }[] = []
      for (const page of memberPages) for (const m of (page.data ?? [])) { const pid = m.relationships?.person?.data?.id; if (pid) members.push({ pid, name: nm[pid] || 'Member' }) }
      out.push({ name: g.attributes?.name ?? 'Group', events, attendanceByPid, members })
    }
  }
  return out
}
