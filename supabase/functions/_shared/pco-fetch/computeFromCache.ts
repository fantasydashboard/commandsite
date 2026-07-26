// computeFromCache.ts
import { assignmentsToByPerson, groupRowsToInputs } from '../pco-transforms/fromStaging.ts'
import { computeServing, computeBurnout, monthsAgo } from '../pco-transforms/serving.ts'
import { computeGroupDrift } from '../pco-transforms/groupDrift.ts'
import type { PcoConfig } from '../pco-transforms/types.ts'

// deno-lint-ignore no-explicit-any
type Db = any
const today = () => new Date().toISOString().slice(0, 10)

async function writeOk(db: Db, clientId: string, moduleKey: string, payload: unknown) {
  const now = new Date().toISOString()
  const { error } = await db.from('church_dashboard_data').upsert(
    { client_id: clientId, module_key: moduleKey, payload, status: 'ok', error: null, computed_at: now, source_freshness: today(), synced_attempt_at: now },
    { onConflict: 'client_id,module_key' })
  if (error) throw new Error(`write ${moduleKey}: ${error.message}`)
}

export async function computeServingBurnout(db: Db, clientId: string, cfg: PcoConfig) {
  const cutoff = monthsAgo(today(), cfg.serving.lookbackMonths)
  const { data, error } = await db.from('pco_serving_assignments')
    .select('person_id,name,date,team,status').eq('client_id', clientId).gte('date', cutoff)
  if (error) throw new Error(`read assignments: ${error.message}`)
  const staff = new Set(Array.isArray(cfg.staffNames) ? cfg.staffNames : [])
  const byPerson = assignmentsToByPerson(data ?? [])
  await writeOk(db, clientId, 'serving', computeServing(byPerson, staff, cfg.serving, today()))
  await writeOk(db, clientId, 'burnout', computeBurnout(byPerson, staff, cfg.burnout, today()))
}

export async function computeGroups(db: Db, clientId: string, cfg: PcoConfig) {
  const { data: att, error: e1 } = await db.from('pco_group_attendance')
    .select('group_id,group_name,event_id,event_date,person_id,name').eq('client_id', clientId)
  if (e1) throw new Error(`read attendance: ${e1.message}`)
  const { data: mem, error: e2 } = await db.from('pco_group_members')
    .select('group_id,group_name,person_id,name').eq('client_id', clientId)
  if (e2) throw new Error(`read members: ${e2.message}`)
  const inputs = groupRowsToInputs(att ?? [], mem ?? [])
  await writeOk(db, clientId, 'groupDrift', computeGroupDrift(inputs, cfg.groupDrift))
}
