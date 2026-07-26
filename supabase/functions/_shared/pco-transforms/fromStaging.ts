import type { ByPerson } from './types.ts'
import type { GroupInput } from './groupDrift.ts'

export interface AssignmentRow { person_id: string; name: string; date: string; team: string; status: string }
export interface AttendanceRow { group_id: string; group_name: string; event_id: string; event_date: string; person_id: string; name: string }
export interface MemberRow { group_id: string; group_name: string; person_id: string; name: string }

export function assignmentsToByPerson(rows: AssignmentRow[]): ByPerson {
  const bp: ByPerson = {}
  for (const r of rows) {
    ;(bp[r.person_id] ??= { name: r.name, dates: [] }).dates.push({ date: r.date, team: r.team, status: r.status })
  }
  for (const rec of Object.values(bp)) rec.dates.sort((a, b) => (a.date < b.date ? 1 : -1))
  return bp
}

export function groupRowsToInputs(attendance: AttendanceRow[], members: MemberRow[]): GroupInput[] {
  const groups = new Map<string, { name: string; events: Map<string, string>; attendanceByPid: Record<string, string[]> }>()
  for (const r of attendance) {
    const g = groups.get(r.group_id) ?? { name: r.group_name, events: new Map(), attendanceByPid: {} as Record<string, string[]> }
    g.events.set(r.event_id, r.event_date)
    ;(g.attendanceByPid[r.person_id] ??= []).push(r.event_date)
    groups.set(r.group_id, g)
  }
  const membersByGroup = new Map<string, { pid: string; name: string }[]>()
  const nameByGroup = new Map<string, string>()
  for (const m of members) {
    ;(membersByGroup.get(m.group_id) ?? membersByGroup.set(m.group_id, []).get(m.group_id)!).push({ pid: m.person_id, name: m.name })
    nameByGroup.set(m.group_id, m.group_name)
  }
  const out: GroupInput[] = []
  for (const [gid, g] of groups) {
    const events = [...g.events.entries()].map(([id, date]) => ({ id, date })).sort((a, b) => (a.date < b.date ? 1 : -1))
    out.push({ name: g.name || nameByGroup.get(gid) || 'Group', events, attendanceByPid: g.attendanceByPid, members: membersByGroup.get(gid) ?? [] })
  }
  return out
}
