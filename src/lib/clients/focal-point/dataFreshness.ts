// Focal Point - single source of truth for how current the data is.
// The pilot dashboard runs on manual snapshot pulls; every reconciliation and
// freshness label reads its "as of" date from HERE so the pieces can never drift
// apart (the bug that made a returned family still look flagged). When the data
// is re-pulled (scripts/refresh-all.mjs), bump DATA_AS_OF to the newest check-in
// date and everything downstream follows. In production this value comes from the
// scheduled refresh job's last run, not a constant.

// Newest check-in date covered by the current snapshot.
export const DATA_AS_OF = '2026-07-14'

// Most recent Sunday on or before DATA_AS_OF (the weekend the flags reflect).
export const REFERENCE_SUNDAY = (() => {
  const d = new Date(`${DATA_AS_OF}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()) // back up to Sunday
  return d.toISOString().slice(0, 10)
})()

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Human label, e.g. "Jul 14" for the freshness badge.
export function asOfLabel(): string {
  const [, m, d] = DATA_AS_OF.split('-').map(Number)
  return `${MON[m - 1]} ${d}`
}
