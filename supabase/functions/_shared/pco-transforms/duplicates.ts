// duplicates.ts (edge transform)
// Pure transform: active PCO People roster -> likely-duplicate clusters, enriched
// with per-profile serving activity and a reconcile verdict for anyone on a live
// care flag. Ported from scripts/pull-duplicates.mjs (clustering) and
// scripts/gen-duplicates.mjs (enrichment + reconcile). Planning Center owns the
// merge; this only surfaces the risk.

export interface DupProfile { id: string; created: string; membership: string; hasContact: boolean; checkins: number; lastServed: string }
export interface DupReconcile { verdict: 'confirmed' | 'review'; flag: string; activeProfiles: number; mergeTargets: string[]; note: string }
export interface DupInfo { name: string; count: number; confidence: 'high' | 'medium'; sharedEmail: boolean; sharedPhone: boolean; profiles: DupProfile[]; reconcile: DupReconcile | null }
export interface DupStats { clusters: number; highConfidence: number; extraProfiles: number; scanned: number }
export interface DuplicatesPayload { groups: Record<string, DupInfo>; stats: DupStats }

export interface PeopleRow { person_id: string; first: string; last: string; name: string; emails: string[]; phones: string[]; membership: string; created: string }
export interface ServingFlag { lastServed: string }
export interface DupCfg { keepTopClusters: number; minNameLen: number }

const norm = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()
const normFL = (first: string, last: string) => `${first} ${last}`.toLowerCase().replace(/\s+/g, ' ').trim()
const daysBetween = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

function reconcile(
  key: string, profiles: DupProfile[],
  servingFlags: Map<string, ServingFlag>, burnoutFlags: Set<string>, datesByPerson: Map<string, string[]>,
): DupReconcile | null {
  const s = servingFlags.get(key)
  const b = burnoutFlags.has(key)
  if (!s && !b) return null
  const active = profiles.filter((p) => p.checkins > 0)
  const empty = profiles.filter((p) => p.checkins === 0).map((p) => p.id)
  const lasts = active.map((p) => p.lastServed).filter(Boolean).sort()
  const combinedLast = lasts[lasts.length - 1] || ''
  if (s) {
    const gap = combinedLast && s.lastServed ? daysBetween(combinedLast, s.lastServed) : 0
    if (gap > 14) {
      return { verdict: 'review', flag: 'Stopped serving', activeProfiles: active.length, mergeTargets: empty,
        note: `Another profile served on ${combinedLast}, more recent than the ${s.lastServed} this flag used. Combined, they may still be active. Verify before reaching out, then merge.` }
    }
    return { verdict: 'confirmed', flag: 'Stopped serving', activeProfiles: active.length, mergeTargets: empty,
      note: active.length <= 1
        ? `All serving activity sits on one profile; the duplicate has no check-ins. This flag is real. Merge to keep the record clean.`
        : `Combined across profiles, the most recent serving is still ${combinedLast}. This flag holds. Merge to keep the record clean.` }
  }
  const rawCount = active.reduce((n, p) => n + p.checkins, 0)
  const uniqueDates = new Set<string>()
  for (const p of profiles) for (const d of datesByPerson.get(p.id) || []) uniqueDates.add(d)
  const overlap = rawCount - uniqueDates.size
  if (rawCount > 0 && overlap / rawCount > 0.25) {
    return { verdict: 'review', flag: 'Burnout risk', activeProfiles: active.length, mergeTargets: empty,
      note: `${overlap} of ${rawCount} check-ins are the same date on two profiles. Their real serving load is lower than this flag shows. Merge, then the load re-checks.` }
  }
  return { verdict: 'confirmed', flag: 'Burnout risk', activeProfiles: active.length, mergeTargets: empty,
    note: `The extra profiles add no double-counted check-ins; the serving load is real. Merge to keep the record clean.` }
}

export function buildDuplicates(
  people: PeopleRow[], datesByPerson: Map<string, string[]>,
  servingFlags: Map<string, ServingFlag>, burnoutFlags: Set<string>, cfg: DupCfg,
): DuplicatesPayload {
  const byName = new Map<string, PeopleRow[]>()
  for (const p of people) {
    const k = normFL(p.first, p.last)
    if (k.length < cfg.minNameLen) continue
    const arr = byName.get(k)
    if (arr) arr.push(p); else byName.set(k, [p])
  }

  interface RawGroup { key: string; name: string; count: number; confidence: 'high' | 'medium'; sharedEmail: boolean; sharedPhone: boolean; members: PeopleRow[] }
  const raw: RawGroup[] = []
  for (const [k, members] of byName) {
    if (members.length < 2) continue
    const emailsAll = members.flatMap((m) => m.emails)
    const phonesAll = members.flatMap((m) => m.phones)
    const sharedEmail = new Set(emailsAll).size !== emailsAll.length
    const sharedPhone = new Set(phonesAll).size !== phonesAll.length
    const confidence = sharedEmail || sharedPhone ? 'high' : 'medium'
    const name = members[0].name || k
    raw.push({ key: norm(name), name, count: members.length, confidence, sharedEmail, sharedPhone, members })
  }
  raw.sort((a, b) => (a.confidence === b.confidence ? b.count - a.count : a.confidence === 'high' ? -1 : 1))

  const stats: DupStats = {
    clusters: raw.length,
    highConfidence: raw.filter((g) => g.confidence === 'high').length,
    extraProfiles: raw.reduce((s, g) => s + (g.count - 1), 0),
    scanned: people.length,
  }

  const groups: Record<string, DupInfo> = {}
  for (const g of raw.slice(0, cfg.keepTopClusters)) {
    const profiles: DupProfile[] = g.members
      .map((m) => {
        const dates = (datesByPerson.get(m.person_id) || []).slice().sort()
        return {
          id: m.person_id, created: m.created, membership: m.membership,
          hasContact: Boolean(m.emails.length || m.phones.length),
          checkins: dates.length, lastServed: dates[dates.length - 1] || '',
        }
      })
      .sort((a, b) => b.checkins - a.checkins)
    groups[g.key] = {
      name: g.name, count: g.count, confidence: g.confidence,
      sharedEmail: g.sharedEmail, sharedPhone: g.sharedPhone, profiles,
      reconcile: reconcile(g.key, profiles, servingFlags, burnoutFlags, datesByPerson),
    }
  }
  return { groups, stats }
}
