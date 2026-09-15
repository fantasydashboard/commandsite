// fetchGroupsChunk.ts
import { pcoAll, pcoAllPages } from '../pco-paginate.ts'
import type { GroupsCursor } from './cursor.ts'

// deno-lint-ignore no-explicit-any
type Db = any
interface GroupDriftCfg { seasonStart: string; seasonEnd?: string; groupTypeMatch: string; eventsPerGroup?: number }

export async function fetchGroupsChunk(
  db: Db, clientId: string, tenant: string, cfg: GroupDriftCfg, cursor: GroupsCursor, isOver: () => boolean,
): Promise<{ cursor: GroupsCursor; done: boolean }> {
  let { groups, gIndex } = cursor
  // An absent seasonEnd means the season is still running, so it ends TODAY.
  //
  // It was pinned to 2026-05-31 and stayed there after groups came back, so
  // every one of the 101 meetings since the restart was discarded before the
  // transform ever saw them. Two things followed. Someone who returned last
  // Tuesday stayed on the drift list, because the only evidence they were back
  // sat outside the window. And "quiet 7w" counted from the group's last SPRING
  // meeting rather than from today, so it read as seven weeks ago when it meant
  // mid-April.
  //
  // With a rolling end the existing logic does the right thing unchanged: the
  // "attended one of the last 3 meetings" test now looks at the last three
  // ACTUAL meetings, so returners drop off by themselves, and the week count is
  // finally weeks ago. Regularity still comes from the long tail of the window,
  // which is what makes two weeks of fall data enough to act on.
  const start = Date.parse(cfg.seasonStart)
  const end = cfg.seasonEnd ? Date.parse(cfg.seasonEnd) : Date.now()

  // Rebuild when the list is empty OR when it predates `type` being carried.
  // The cursor persists between runs, so a stored list of {id, name} would be
  // reused forever and every membership row would keep writing an empty type,
  // which is exactly what happened: the Insights group breakdown collapsed to a
  // single untyped bucket and stayed there through repeated refreshes. Rebuild
  // costs one listing pass and is idempotent, and self-heals any church whose
  // cursor predates this without needing a migration.
  if (!groups || groups.length === 0 || groups.some((g) => g.type === undefined)) {
    const types = (await pcoAll(tenant, '/groups/v2/group_types?per_page=25'))
      .filter((t: any) => new RegExp(cfg.groupTypeMatch, 'i').test(t.attributes?.name ?? ''))
    groups = []
    for (const t of types) {
      const gs = (await pcoAll(tenant, `/groups/v2/group_types/${t.id}/groups?per_page=100`))
        .filter((g: any) => !g.attributes?.archived_at)
      // The type travels with the group. Insights breaks Growth Groups down
      // by Planning Center's own types, which the members table could not
      // reconstruct from the group name alone.
      for (const g of gs) groups.push({ id: g.id, name: g.attributes?.name ?? 'Group', type: t.attributes?.name ?? '' })
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
      .slice(0, cfg.eventsPerGroup ?? 12)
    const attRows: any[] = []
    for (const e of events) {
      const att = await pcoAll(tenant, `/groups/v2/events/${e.id}/attendances?per_page=200`)
      for (const x of att) {
        if (!x.attributes?.attended) continue
        const pid = x.relationships?.person?.data?.id
        if (pid) attRows.push({ client_id: clientId, group_id: g.id, group_name: g.name, event_id: e.id, event_date: e.date, person_id: pid, name: '' })
      }
    }
    const memberPages = await pcoAllPages(tenant, `/groups/v2/groups/${g.id}/memberships?per_page=100&include=person`)
    const nm: Record<string, string> = {}
    for (const page of memberPages) for (const inc of page.included ?? []) if (inc.type === 'Person') nm[inc.id] = `${inc.attributes?.first_name ?? ''} ${inc.attributes?.last_name ?? ''}`.trim()
    const memRowsRaw: any[] = []
    for (const page of memberPages) for (const m of (page.data ?? [])) {
      const pid = m.relationships?.person?.data?.id
      if (pid) memRowsRaw.push({
        client_id: clientId, group_id: g.id, group_name: g.name, person_id: pid, name: nm[pid] || 'Member',
        group_type: g.type ?? '',
        // 'leader' or 'member'. The group-leader count came from a People list
        // last refreshed in Aug 2024 because this was not stored.
        role: m.attributes?.role ?? '',
      })
    }
    // Fill attendance names from membership where known.
    for (const r of attRows) r.name = nm[r.person_id] || 'Member'
    // Dedupe on conflict key before upserting; a person could plausibly appear
    // twice across paginated membership responses, or attend-marked twice for the same event.
    const dedupedAtt = [...new Map(attRows.map((r: any) => [`${r.group_id}|${r.event_id}|${r.person_id}`, r])).values()]
    const dedupedMem = [...new Map(memRowsRaw.map((r: any) => [`${r.group_id}|${r.person_id}`, r])).values()]
    if (dedupedAtt.length) { const { error } = await db.from('pco_group_attendance').upsert(dedupedAtt, { onConflict: 'client_id,group_id,event_id,person_id' }); if (error) throw new Error(`att upsert: ${error.message}`) }
    if (dedupedMem.length) { const { error } = await db.from('pco_group_members').upsert(dedupedMem, { onConflict: 'client_id,group_id,person_id' }); if (error) throw new Error(`mem upsert: ${error.message}`) }
    // Remove anyone who has LEFT this group. Upsert alone only ever adds and
    // updates, so a member who left kept their row forever: staging drifted to
    // 1,010 people in a group against 925 actually in one, and Insights
    // reported the inflated figure as live. Attendance is deliberately NOT
    // pruned this way, because a meeting someone attended stays true after
    // they leave.
    {
      const keep = dedupedMem.map((r: any) => `"${r.person_id}"`).join(',')
      const q = db.from('pco_group_members').delete().eq('client_id', clientId).eq('group_id', g.id)
      const { error } = keep ? await q.not('person_id', 'in', `(${keep})`) : await q
      if (error) throw new Error(`mem prune: ${error.message}`)
    }
    gIndex++
  }

  // Groups that no longer exist in Planning Center at all.
  //
  // The per-group prune above can only reach a group it fetches, so a group
  // that was DELETED is never visited and its membership rows sit in staging
  // forever. Live this was 3 phantom groups: Planning Center returned 58 and
  // the page reported 61, with the people who were only in those three
  // inflating "people in a group" from 925 to 1,010.
  //
  // The id list comes from every group type, not just the ones this sync
  // fetches details for, so groups the type filter skips (prayer, and anything
  // else a church runs) are recognised as real and left alone. Deciding which
  // types COUNT is a product question; knowing which ids EXIST is not.
  try {
    const liveIds = new Set<string>()
    for (const t of await pcoAll(tenant, '/groups/v2/group_types?per_page=100')) {
      for (const g of await pcoAll(tenant, `/groups/v2/group_types/${(t as any).id}/groups?per_page=100`)) {
        liveIds.add((g as any).id)
      }
    }
    if (liveIds.size) {
      const keep = [...liveIds].map((id) => `"${id}"`).join(',')
      for (const table of ['pco_group_members', 'pco_group_attendance']) {
        const { error } = await db.from(table).delete()
          .eq('client_id', clientId).not('group_id', 'in', `(${keep})`)
        if (error) throw new Error(`${table} phantom prune: ${error.message}`)
      }
    }
  } catch (e) {
    // A failure here leaves stale rows, which is the status quo, so it must not
    // sink an otherwise good pass.
    console.error(`groups phantom prune: ${e instanceof Error ? e.message : String(e)}`)
  }

  return { cursor: { groups, gIndex }, done: true }
}
