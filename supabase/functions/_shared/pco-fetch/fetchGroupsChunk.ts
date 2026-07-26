// fetchGroupsChunk.ts
import { pcoAll, pcoGet } from '../pco-paginate.ts'
import type { GroupsCursor } from './cursor.ts'

// deno-lint-ignore no-explicit-any
type Db = any
interface GroupDriftCfg { seasonStart: string; seasonEnd: string; groupTypeMatch: string; eventsPerGroup: number }

export async function fetchGroupsChunk(
  db: Db, clientId: string, tenant: string, cfg: GroupDriftCfg, cursor: GroupsCursor, isOver: () => boolean,
): Promise<{ cursor: GroupsCursor; done: boolean }> {
  let { groups, gIndex } = cursor
  const start = Date.parse(cfg.seasonStart), end = Date.parse(cfg.seasonEnd)

  if (!groups || groups.length === 0) {
    const types = (await pcoAll(tenant, '/groups/v2/group_types?per_page=25'))
      .filter((t: any) => new RegExp(cfg.groupTypeMatch, 'i').test(t.attributes?.name ?? ''))
    groups = []
    for (const t of types) {
      const gs = (await pcoAll(tenant, `/groups/v2/group_types/${t.id}/groups?per_page=100`))
        .filter((g: any) => !g.attributes?.archived_at)
      for (const g of gs) groups.push({ id: g.id, name: g.attributes?.name ?? 'Group' })
    }
    gIndex = 0
  }

  while (gIndex < groups.length) {
    if (isOver()) return { cursor: { groups, gIndex }, done: false }
    const g = groups[gIndex]
    // Most recent eventsPerGroup events within the season.
    const events = (await pcoAll(tenant, `/groups/v2/groups/${g.id}/events?per_page=100&order=-starts_at`))
      .map((e: any) => ({ id: e.id, date: (e.attributes?.starts_at ?? '').slice(0, 10), t: Date.parse(e.attributes?.starts_at ?? '') }))
      .filter((e: any) => e.t >= start && e.t <= end)
      .slice(0, cfg.eventsPerGroup)
    const attRows: any[] = []
    for (const e of events) {
      const att = await pcoAll(tenant, `/groups/v2/events/${e.id}/attendances?per_page=200`)
      for (const x of att) {
        if (!x.attributes?.attended) continue
        const pid = x.relationships?.person?.data?.id
        if (pid) attRows.push({ client_id: clientId, group_id: g.id, group_name: g.name, event_id: e.id, event_date: e.date, person_id: pid, name: '' })
      }
    }
    const mj = await pcoGet(tenant, `/groups/v2/groups/${g.id}/memberships?per_page=100&include=person`)
    const nm: Record<string, string> = {}
    for (const inc of mj.included ?? []) if (inc.type === 'Person') nm[inc.id] = `${inc.attributes?.first_name ?? ''} ${inc.attributes?.last_name ?? ''}`.trim()
    const memRows = (mj.data ?? []).map((m: any) => ({ client_id: clientId, group_id: g.id, group_name: g.name, person_id: m.relationships?.person?.data?.id, name: nm[m.relationships?.person?.data?.id] || 'Member' })).filter((m: any) => m.person_id)
    // Fill attendance names from membership where known.
    for (const r of attRows) r.name = nm[r.person_id] || 'Member'
    // Dedupe on conflict key before upserting; a person could plausibly appear
    // twice in a membership response, or attend-marked twice for the same event.
    const dedupedAtt = [...new Map(attRows.map((r: any) => [`${r.group_id}|${r.event_id}|${r.person_id}`, r])).values()]
    const dedupedMem = [...new Map(memRows.map((r: any) => [`${r.group_id}|${r.person_id}`, r])).values()]
    if (dedupedAtt.length) { const { error } = await db.from('pco_group_attendance').upsert(dedupedAtt, { onConflict: 'client_id,group_id,event_id,person_id' }); if (error) throw new Error(`att upsert: ${error.message}`) }
    if (dedupedMem.length) { const { error } = await db.from('pco_group_members').upsert(dedupedMem, { onConflict: 'client_id,group_id,person_id' }); if (error) throw new Error(`mem upsert: ${error.message}`) }
    gIndex++
  }
  return { cursor: { groups, gIndex }, done: true }
}
