// fetchHouseholdsChunk.ts
// Pulls Planning Center households and flattens them to person_id -> household,
// so family drift can group by household instead of by surname string.
//
// Focal Point has ~4,400 households at 100 per page, so a full pass is ~44
// requests. Cheap enough to re-run whole rather than maintain a cursor over
// changes, but it still resumes by page offset because the sync runs under a
// time budget and a cold start should not have to begin again.
import { pcoGet } from '../pco-paginate.ts'
import type { HouseholdsCursor } from './cursor.ts'

// deno-lint-ignore no-explicit-any
type Db = any

export async function fetchHouseholdsChunk(
  db: Db,
  clientId: string,
  tenant: string,
  cursor: HouseholdsCursor,
  isOver: () => boolean,
): Promise<{ cursor: HouseholdsCursor; done: boolean }> {
  const PER = 100
  let offset = cursor?.offset ?? 0

  for (;;) {
    if (isOver()) return { cursor: { offset }, done: false }

    const page = await pcoGet(
      tenant,
      `/people/v2/households?include=people&per_page=${PER}&offset=${offset}`,
    )
    const households = page.data ?? []
    if (!households.length) return { cursor: { offset: 0 }, done: true }

    const rows: Record<string, unknown>[] = []
    for (const h of households) {
      const householdId = h.id
      const householdName = (h.attributes?.name ?? '').trim()
      if (!householdId || !householdName) continue
      const members = (h.relationships?.people?.data ?? []) as { id: string }[]
      for (const m of members) {
        if (!m?.id) continue
        rows.push({
          client_id: clientId,
          person_id: m.id,
          household_id: householdId,
          household_name: householdName,
        })
      }
    }

    // Every membership is recorded. Choosing between them is the transform's
    // job, not the fetcher's: a person's households can land on different API
    // pages, and each page upserts as it goes, so any choice made here is
    // decided by page order rather than by anything meaningful.
    const deduped = [...new Map(
      rows.map((r) => [`${r.person_id}|${r.household_id}`, r]),
    ).values()]
    if (deduped.length) {
      const { error } = await db
        .from('pco_households')
        .upsert(deduped, { onConflict: 'client_id,person_id,household_id' })
      if (error) throw new Error(`households upsert: ${error.message}`)
    }

    offset += PER
    // Short page means we reached the end. Reset the cursor so the next run is
    // a fresh full pass, which is how this resource stays current: households
    // change slowly and there is no changed-since filter worth maintaining.
    if (households.length < PER) return { cursor: { offset: 0 }, done: true }
    // Courtesy pause, matching pcoAllPages. Forty-four requests in a tight loop
    // is a good way to collect 429s and spend longer than pausing would have.
    await new Promise((r) => setTimeout(r, 100))
  }
}
