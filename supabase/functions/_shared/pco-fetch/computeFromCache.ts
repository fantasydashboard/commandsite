// computeFromCache.ts
import { assignmentsToByPerson, groupRowsToInputs } from '../pco-transforms/fromStaging.ts'
import { computeServing, computeBurnout, monthsAgo } from '../pco-transforms/serving.ts'
import { computeGroupDrift } from '../pco-transforms/groupDrift.ts'
import { checkinsToFamilies, computeFamilyDrift } from '../pco-transforms/familyDrift.ts'
import type { PcoConfig } from '../pco-transforms/types.ts'

// deno-lint-ignore no-explicit-any
type Db = any
const today = () => new Date().toISOString().slice(0, 10)

const PAGE = 1000
// Reads all rows for a filtered select, paging past PostgREST's default 1000-row
// cap. `build` receives the from/to range and returns the query for that page.
// deno-lint-ignore no-explicit-any
async function readAll(build: (from: number, to: number) => any, label: string): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(`read ${label}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

async function writeOk(db: Db, clientId: string, moduleKey: string, payload: unknown) {
  const now = new Date().toISOString()
  const { error } = await db.from('church_dashboard_data').upsert(
    { client_id: clientId, module_key: moduleKey, payload, status: 'ok', error: null, computed_at: now, source_freshness: today(), synced_attempt_at: now },
    { onConflict: 'client_id,module_key' })
  if (error) throw new Error(`write ${moduleKey}: ${error.message}`)
}

export async function computeServingBurnout(db: Db, clientId: string, cfg: PcoConfig) {
  const cutoff = monthsAgo(today(), cfg.serving.lookbackMonths)
  const data = await readAll(
    (from, to) => db.from('pco_serving_assignments')
      .select('person_id,name,date,team,status').eq('client_id', clientId).gte('date', cutoff)
      .order('person_id').order('date').order('team').range(from, to),
    'assignments')
  const staff = new Set(Array.isArray(cfg.staffNames) ? cfg.staffNames : [])
  const byPerson = assignmentsToByPerson(data)
  await writeOk(db, clientId, 'serving', computeServing(byPerson, staff, cfg.serving, today()))
  await writeOk(db, clientId, 'burnout', computeBurnout(byPerson, staff, cfg.burnout, today()))
}

export async function computeGroups(db: Db, clientId: string, cfg: PcoConfig) {
  const att = await readAll(
    (from, to) => db.from('pco_group_attendance')
      .select('group_id,group_name,event_id,event_date,person_id,name').eq('client_id', clientId)
      .order('group_id').order('event_id').order('person_id').range(from, to),
    'attendance')
  const mem = await readAll(
    (from, to) => db.from('pco_group_members')
      .select('group_id,group_name,person_id,name').eq('client_id', clientId)
      .order('group_id').order('person_id').range(from, to),
    'members')
  const inputs = groupRowsToInputs(att, mem)
  await writeOk(db, clientId, 'groupDrift', computeGroupDrift(inputs, cfg.groupDrift))
}

export async function computeDrift(db: Db, clientId: string, cfg: PcoConfig) {
  const rows = await readAll(
    (from, to) => db.from('pco_kids_checkins')
      .select('person_id,first,last,checkin_date,kind').eq('client_id', clientId)
      .order('person_id').order('checkin_date').range(from, to),
    'kids checkins')
  const families = checkinsToFamilies(rows)
  await writeOk(db, clientId, 'drift', computeFamilyDrift(families, cfg.drift!, today()))
}
