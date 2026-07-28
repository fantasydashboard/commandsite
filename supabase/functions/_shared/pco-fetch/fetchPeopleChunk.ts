import { pcoGet } from '../pco-paginate.ts'
import type { PeopleCursor } from './cursor.ts'

// deno-lint-ignore no-explicit-any
type Db = any
const PER_PAGE = 100

export async function fetchPeopleChunk(
  db: Db, clientId: string, tenant: string, cursor: PeopleCursor, isOver: () => boolean,
): Promise<{ cursor: PeopleCursor; done: boolean }> {
  let offset = cursor?.offset ?? 0
  if (offset === 0) {
    const { error } = await db.from('pco_people').delete().eq('client_id', clientId)
    if (error) throw new Error(`people clear: ${error.message}`)
  }
  while (true) {
    if (isOver()) return { cursor: { offset }, done: false }
    const j = await pcoGet(tenant, `/people/v2/people?per_page=${PER_PAGE}&where[status]=active&include=emails,phone_numbers&offset=${offset}`)
    const emailById: Record<string, string> = {}
    const phoneById: Record<string, string> = {}
    for (const inc of j.included ?? []) {
      if (inc.type === 'Email') emailById[inc.id] = (inc.attributes?.address ?? '').toLowerCase().trim()
      if (inc.type === 'PhoneNumber') phoneById[inc.id] = (inc.attributes?.number ?? '').replace(/\D/g, '').slice(-10)
    }
    const rows = (j.data ?? []).map((p: any) => {
      const a = p.attributes ?? {}
      const emails = (p.relationships?.emails?.data ?? []).map((e: any) => emailById[e.id]).filter(Boolean)
      const phones = (p.relationships?.phone_numbers?.data ?? []).map((e: any) => phoneById[e.id]).filter(Boolean)
      return {
        client_id: clientId, person_id: p.id,
        first: a.first_name ?? '', last: a.last_name ?? '', name: (a.name ?? '').trim(),
        emails, phones, membership: a.membership ?? 'none', created: (a.created_at ?? '').slice(0, 10) || null,
      }
    })
    if (rows.length) {
      const { error } = await db.from('pco_people').upsert(rows, { onConflict: 'client_id,person_id' })
      if (error) throw new Error(`people upsert: ${error.message}`)
    }
    const next = j.meta?.next?.offset
    if (next === undefined || next === null || (j.data ?? []).length === 0) return { cursor: { offset }, done: true }
    offset = next
  }
}
