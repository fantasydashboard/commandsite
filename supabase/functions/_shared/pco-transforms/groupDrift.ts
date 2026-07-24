import type { GroupDriftCfg, GroupDriftPayload, GroupDrifter } from './types.ts'

export interface GroupInput {
  name: string
  events: { id: string; date: string }[]       // season-filtered, sorted desc by date
  attendanceByPid: Record<string, string[]>     // pid -> list of attended event dates (YYYY-MM-DD)
  members: { pid: string; name: string }[]
}

const DAY = 864e5
const normGroup = (n: string) => n.replace(/\s*-\s*/g, ' · ').replace(/'s|'s/g, '').slice(0, 38)

export function computeGroupDrift(groups: GroupInput[], cfg: GroupDriftCfg): GroupDriftPayload {
  let groupsWithData = 0
  const drifters: GroupDrifter[] = []
  for (const g of groups) {
    if (g.events.length < cfg.minEvents) continue
    groupsWithData++
    const lastInSeason = g.events[0].date
    const last3 = g.events.slice(0, 3).map((e) => e.date)
    for (const m of g.members) {
      const dates = g.attendanceByPid[m.pid] ?? []
      if (dates.length < cfg.minAttendance) continue
      if (last3.some((d) => dates.includes(d))) continue // attended one of the last 3, not drifting
      const lastAtt = [...dates].sort((a, b) => (a < b ? 1 : -1))[0]
      const weeks = Math.round((Date.parse(lastInSeason) - Date.parse(lastAtt)) / (7 * DAY))
      if (weeks < cfg.minGapWeeks) continue
      const toks = m.name.toLowerCase().split(/\s+/)
      if (toks.some((t) => t.length > 2 && g.name.toLowerCase().includes(t))) continue // leader-of-own-group
      drifters.push({ name: m.name, group: normGroup(g.name), attended: dates.length, weeksSince: weeks })
    }
  }
  drifters.sort((a, b) => b.attended - a.attended)
  return { flagged: drifters.length, groups: groupsWithData, people: drifters }
}
