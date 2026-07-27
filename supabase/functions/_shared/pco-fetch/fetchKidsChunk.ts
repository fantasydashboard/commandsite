import { pcoAll, pcoUntilPages } from '../pco-paginate.ts'
import { monthsAgo } from '../pco-transforms/serving.ts'
import type { KidsCursor } from './cursor.ts'

// deno-lint-ignore no-explicit-any
type Db = any
interface KidsCfg { kidsEventMatch: string; windowMonths: number }

// Resume by event: discover kids check-in events (by name match) on the first
// chunk, then pull each event's check-ins bounded to the window, upserting into
// pco_kids_checkins. isOver() is checked before each event.
export async function fetchKidsCheckinsChunk(
  db: Db, clientId: string, tenant: string, cfg: KidsCfg, cursor: KidsCursor, isOver: () => boolean, cutoffOverride?: string,
): Promise<{ cursor: KidsCursor; done: boolean }> {
  const cutoff = cutoffOverride ?? monthsAgo(new Date().toISOString().slice(0, 10), cfg.windowMonths)
  let { events, eIndex } = cursor
  if (!events || events.length === 0) {
    const all = await pcoAll(tenant, '/check-ins/v2/events?per_page=100')
    events = all.filter((e: any) => new RegExp(cfg.kidsEventMatch, 'i').test(e.attributes?.name ?? '')).map((e: any) => e.id)
    eIndex = 0
  }
  while (eIndex < events.length) {
    if (isOver()) return { cursor: { events, eIndex }, done: false }
    const eventId = events[eIndex]
    // pages preserve `included` (person records carry the names); stop at cutoff.
    const pages = await pcoUntilPages(tenant, `/check-ins/v2/events/${eventId}/check_ins?include=person&per_page=100&order=-created_at`,
      (c: any) => (c.attributes?.created_at ?? '').slice(0, 10) < cutoff)
    const rows: any[] = []
    for (const page of pages) {
      const persons: Record<string, any> = {}
      for (const inc of page.included ?? []) if (inc.type === 'Person') persons[inc.id] = inc.attributes
      for (const c of page.data ?? []) {
        const created = (c.attributes?.created_at ?? '')
        const date = created.slice(0, 10)
        if (!date || date < cutoff) continue
        const pid = c.relationships?.person?.data?.id
        const p = persons[pid] ?? {}
        const last = (p.last_name ?? '').trim()
        if (!pid || !last) continue
        rows.push({ client_id: clientId, person_id: pid, first: (p.first_name ?? '').trim(), last, checkin_date: date, kind: c.attributes?.kind ?? '' })
      }
    }
    // Dedupe by PK (client_id,person_id,checkin_date) before upsert.
    const deduped = [...new Map(rows.map((r: any) => [`${r.person_id}|${r.checkin_date}`, r])).values()]
    if (deduped.length) {
      const { error } = await db.from('pco_kids_checkins').upsert(deduped, { onConflict: 'client_id,person_id,checkin_date' })
      if (error) throw new Error(`kids upsert: ${error.message}`)
    }
    eIndex++
  }
  return { cursor: { events, eIndex }, done: true }
}
