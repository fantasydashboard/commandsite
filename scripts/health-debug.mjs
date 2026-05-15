// Quick diagnostic for the Health Auto Export pipeline.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/health-debug.mjs
//
// Reports:
//   1. Last 20 webhook receipts (status + counts + size)
//   2. Last 14 days of weight rows
//   3. Last 14 days of sleep_asleep rows
//   4. Day-by-day gap report for weight + sleep over last 14 days

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL || 'https://hrdcjautrdkdpmwxuaar.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  console.error('Need SUPABASE_SERVICE_ROLE_KEY env var')
  process.exit(1)
}

const sb = createClient(URL, KEY)

// 1. Recent webhook receipts
console.log('\n=== RECENT WEBHOOK RECEIPTS (last 20) ===')
const { data: receipts, error: rErr } = await sb
  .from('personal_health_webhook_log')
  .select('id, created_at, status, metrics_count, workouts_count, raw_size_bytes, errors')
  .order('created_at', { ascending: false })
  .limit(20)
if (rErr) {
  console.error('webhook_log query failed:', rErr.message)
} else if (!receipts || receipts.length === 0) {
  console.log('  NO RECEIPTS — webhook has never fired or table missing.')
} else {
  for (const r of receipts) {
    const errSummary = r.errors ? ` errors=${JSON.stringify(r.errors).slice(0, 200)}` : ''
    const sizeKb = r.raw_size_bytes ? `${(r.raw_size_bytes / 1024).toFixed(1)}KB` : '?'
    console.log(`  ${r.created_at}  ${r.status.padEnd(8)} metrics=${r.metrics_count} workouts=${r.workouts_count} size=${sizeKb}${errSummary}`)
  }
}

// 2. Last 14 days of weight
console.log('\n=== WEIGHT (weight_body_mass) — last 14 days ===')
const since = new Date(); since.setDate(since.getDate() - 14)
const { data: wt, error: wErr } = await sb
  .from('personal_metrics')
  .select('value, recorded_at, source')
  .eq('metric_type', 'weight_body_mass')
  .gte('recorded_at', since.toISOString())
  .order('recorded_at', { ascending: false })
if (wErr) console.error('weight query failed:', wErr.message)
else if (!wt || wt.length === 0) console.log('  NO weight rows in last 14 days.')
else for (const r of wt) console.log(`  ${r.recorded_at}  ${r.value} lbs  src=${r.source ?? '-'}`)

// 3. Last 14 days of sleep
console.log('\n=== SLEEP (sleep_asleep) — last 14 days ===')
const { data: sl, error: sErr } = await sb
  .from('personal_metrics')
  .select('value, recorded_at, source')
  .eq('metric_type', 'sleep_asleep')
  .gte('recorded_at', since.toISOString())
  .order('recorded_at', { ascending: false })
if (sErr) console.error('sleep query failed:', sErr.message)
else if (!sl || sl.length === 0) console.log('  NO sleep_asleep rows in last 14 days.')
else for (const r of sl) console.log(`  ${r.recorded_at}  ${r.value} h  src=${r.source ?? '-'}`)

// 4. Day-by-day gap report
console.log('\n=== DAILY GAP REPORT (last 14 days, local) ===')
function localKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const wtByDay = new Map(), slByDay = new Map()
for (const r of wt ?? []) wtByDay.set(r.recorded_at.slice(0, 10), Number(r.value))
for (const r of sl ?? []) slByDay.set(r.recorded_at.slice(0, 10), Number(r.value))
for (let i = 13; i >= 0; i--) {
  const d = new Date(); d.setDate(d.getDate() - i)
  const k = localKey(d)
  const w = wtByDay.get(k) ?? '—'
  const s = slByDay.get(k) ?? '—'
  console.log(`  ${k}  weight=${w}  sleep=${s}`)
}

// 5. Distinct metric types seen in last 14 days (to spot Health Sync's naming if different)
console.log('\n=== DISTINCT METRIC TYPES (last 14 days) ===')
const { data: types, error: tErr } = await sb
  .from('personal_metrics')
  .select('metric_type')
  .gte('recorded_at', since.toISOString())
  .limit(5000)
if (tErr) console.error('types query failed:', tErr.message)
else {
  const counts = new Map()
  for (const r of types ?? []) counts.set(r.metric_type, (counts.get(r.metric_type) ?? 0) + 1)
  for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(40)} ${v}`)
  }
}
