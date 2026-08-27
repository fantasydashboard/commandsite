// computeFromCache.ts
import { assignmentsToByPerson, groupRowsToInputs } from '../pco-transforms/fromStaging.ts'
import { computeServing, computeBurnout, monthsAgo } from '../pco-transforms/serving.ts'
import { computeGroupDrift } from '../pco-transforms/groupDrift.ts'
import { checkinsToFamilies, computeFamilyDrift } from '../pco-transforms/familyDrift.ts'
import { buildGuestPipeline, DEFAULT_ACTIVE_DAYS, DEFAULT_SIGNATURE } from '../pco-transforms/guestPipeline.ts'
import { buildDuplicates, type ServingFlag } from '../pco-transforms/duplicates.ts'
import { buildRoster } from '../pco-transforms/roster.ts'
import { fetchRosterPlans } from './fetchRosterPlans.ts'
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

export async function computeGuestPipeline(db: Db, clientId: string, cfg: PcoConfig) {
  const cutoff = monthsAgo(today(), cfg.guests!.windowMonths)
  const rows = await readAll(
    (from, to) => db.from('pco_workflow_cards')
      .select('card_id,campus,name,created_date,completed_date,step_name,person_id').eq('client_id', clientId)
      .gte('created_date', cutoff)
      .order('card_id').range(from, to),
    'workflow cards')
  const cardRows = rows.map((r: any) => ({ ...r, person_id: r.person_id ?? '' }))
  // windowMonths is RETENTION (history for the monthly trend); activeDays is the
  // WORKLIST span the board and KPIs run on. Keeping them separate is what stops
  // a 24-month retention window from reporting 788 guests "in the pipeline".
  // Sign-off comes from the church's own settings: whoever's address sends the
  // note has to be the name at the bottom of it.
  const { data: settings } = await db.from('church_settings').select('messaging').eq('client_id', clientId).maybeSingle()
  const signature = (settings?.messaging?.signature ?? '').trim() || DEFAULT_SIGNATURE
  await writeOk(db, clientId, 'guestPipeline',
    buildGuestPipeline(cardRows, today(), cfg.guests!.activeDays ?? DEFAULT_ACTIVE_DAYS, signature))
}

export async function computeDuplicates(db: Db, clientId: string, cfg: PcoConfig) {
  const people = await readAll(
    (from, to) => db.from('pco_people')
      .select('person_id,first,last,name,emails,phones,membership,created').eq('client_id', clientId)
      .order('person_id').range(from, to),
    'people')
  const assignments = await readAll(
    (from, to) => db.from('pco_serving_assignments')
      .select('person_id,date').eq('client_id', clientId)
      .order('person_id').order('date').range(from, to),
    'serving dates')
  const datesByPerson = new Map<string, string[]>()
  const seenDatesByPerson = new Map<string, Set<string>>()
  for (const a of assignments) {
    let seen = seenDatesByPerson.get(a.person_id)
    if (!seen) { seen = new Set<string>(); seenDatesByPerson.set(a.person_id, seen) }
    if (seen.has(a.date)) continue
    seen.add(a.date)
    const arr = datesByPerson.get(a.person_id)
    if (arr) arr.push(a.date); else datesByPerson.set(a.person_id, [a.date])
  }
  // Live flag lists from the serving/burnout module payloads computed earlier this pass.
  const norm = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()
  const { data: mods } = await db.from('church_dashboard_data')
    .select('module_key,payload,status').eq('client_id', clientId).in('module_key', ['serving', 'burnout'])
  const servingFlags = new Map<string, ServingFlag>()
  const burnoutFlags = new Set<string>()
  for (const m of mods ?? []) {
    if (m.status !== 'ok') continue
    if (m.module_key === 'serving') for (const p of m.payload?.people ?? []) servingFlags.set(norm(p.name), { lastServed: p.lastServed ?? '' })
    if (m.module_key === 'burnout') for (const p of m.payload?.people ?? []) burnoutFlags.add(norm(p.name))
  }
  const cfg2 = cfg.duplicates ?? { keepTopClusters: 120, minNameLen: 3 }
  const peopleRows = people.map((p: any) => ({ person_id: p.person_id, first: p.first ?? '', last: p.last ?? '', name: p.name ?? '', emails: p.emails ?? [], phones: p.phones ?? [], membership: p.membership ?? 'none', created: p.created ?? '' }))
  await writeOk(db, clientId, 'duplicates', buildDuplicates(peopleRows, datesByPerson, servingFlags, burnoutFlags, cfg2))
}

/**
 * Sunday roster readiness. Fetches plans and computes in one pass rather than
 * staging: roster data is a snapshot with no historical value, so a staging
 * table would only ever be overwritten.
 *
 * Writes BOTH payloads the Serving page reads, so a partial success cannot leave
 * the gap card and the four-week grid describing different Sundays.
 *
 * Suggestions come from pco_serving_assignments, which is already synced, and
 * apply the same over-serving rule computeBurnout uses, so a name suggested here
 * can never be a name the burnout list is telling the church to protect.
 */
export async function computeRoster(db: Db, clientId: string, tenant: string, cfg: PcoConfig) {
  const { past, future } = await fetchRosterPlans(tenant, (cfg as { roster?: { serviceTypeMatch?: string } }).roster ?? {})

  // Read the FULL staged window, not just the load window. Two different
  // questions were conflated here: "are they over-serving" wants 90 days, but
  // "have they ever served this team" wants everything we have. Reading only 4
  // months made Safety Team's pool 10 instead of 15, silently shrinking who
  // Grace was willing to suggest and hiding anyone whose last shift on that team
  // was longer ago, which is exactly the "fresh capacity" case. buildRoster
  // filters to SEASON_DAYS internally for the load maths, so a wider read
  // changes eligibility only.
  const cutoff = monthsAgo(today(), cfg.serving?.lookbackMonths ?? 12)
  const serving = await readAll(
    (from, to) => db.from('pco_serving_assignments')
      .select('person_id,name,date,team,status').eq('client_id', clientId).gte('date', cutoff)
      .order('person_id').order('date').range(from, to),
    'serving assignments (roster)')

  const { roster, forward } = buildRoster({ past, future, serving, today: today() })
  await writeOk(db, clientId, 'roster', roster)
  await writeOk(db, clientId, 'rosterForward', forward)
}
