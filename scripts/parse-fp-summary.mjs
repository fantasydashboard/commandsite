// One-time parse of Focal Point's manual weekly summary CSV into aggregate
// series for the Insights tab. Reads from ~/Downloads (not committed); writes
// scratchpad/pco-raw/fp_summary.json for review. Numbers only, no PII.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const CSV = join(homedir(), 'Downloads', '2026 weekly summary.csv')
const OUT = join(process.cwd(), 'scratchpad', 'pco-raw', 'fp_summary.json')

function parseLine(line) {
  const out = []; let cur = ''; let q = false
  for (const c of line) {
    if (c === '"') q = !q
    else if (c === ',' && !q) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out
}
const num = (s) => { const n = Number(String(s).replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0 }
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = (mdy) => { const [m, d] = mdy.split('/').map(Number); return `${months[m - 1]} ${d}` }

const rows = (await readFile(CSV, 'utf8')).split('\n').map(parseLine)
const COL0 = 2, COLN = 28 // 1/4 .. 7/5 (27 weeks)
const cols = (r) => r.slice(COL0, COLN + 1)
const series = (idx) => cols(rows[idx]).map(num)
const dates = cols(rows[1]).map(label)

// weekend attendance (Grand Total) + adults/kids
const grandTotal = series(26)
const totalAdults = series(28)
const kidsIdx = [3, 7, 11, 15, 19, 23]
const totalKids = dates.map((_, i) => kidsIdx.reduce((s, r) => s + num(cols(rows[r])[i]), 0))

// per-service totals -> average size
const svc = [
  { name: 'Sat 5:30', idx: 5 },
  { name: 'Sun 9:00', idx: 9 },
  { name: 'Sun 10:30', idx: 13 },
  { name: 'Sun 12:00', idx: 17 },
  { name: 'Sun 6:00', idx: 21 },
]
const services = svc.map((s) => {
  const vals = series(s.idx).filter((v) => v > 0)
  return { name: s.name, avg: Math.round(vals.reduce((a, b) => a + b, 0) / (vals.length || 1)) }
})

// online / youtube
const subscribers = series(49)
const liveViews = series(45)

// youth
const youthTotal = series(58)

const nonZero = (labels, vals) => {
  const L = [], V = []
  vals.forEach((v, i) => { if (v > 0) { L.push(labels[i]); V.push(v) } })
  return { labels: L, counts: V }
}

const weekend = nonZero(dates, grandTotal)
const out = {
  weekendAttendance: weekend,
  adultsKids: {
    labels: weekend.labels,
    adults: totalAdults.slice(0, weekend.labels.length),
    kids: totalKids.slice(0, weekend.labels.length),
  },
  services,
  online: {
    subscribers: nonZero(dates, subscribers),
    liveViews: nonZero(dates, liveViews),
  },
  youth: nonZero(dates, youthTotal),
  kpis: {
    avgWeekend: Math.round(weekend.counts.reduce((a, b) => a + b, 0) / weekend.counts.length),
    peakWeekend: Math.max(...weekend.counts),
    youtubeSubscribers: subscribers.filter((v) => v > 0).slice(-1)[0],
  },
}
await writeFile(OUT, JSON.stringify(out, null, 2))
console.log('weekend weeks:', weekend.labels.length, '| avg', out.kpis.avgWeekend, '| peak', out.kpis.peakWeekend, '(Easter)')
console.log('services:', services.map((s) => `${s.name}:${s.avg}`).join('  '))
console.log('youtube subs (latest):', out.kpis.youtubeSubscribers, '| youth weeks:', out.youth.labels.length)
console.log('adults sample:', out.adultsKids.adults.slice(0, 6), '| kids sample:', out.adultsKids.kids.slice(0, 6))
