// Josh Personal · Apple Health webhook receiver (Phase 0)
// ---------------------------------------------------------------------------
// Receives JSON pushed by the Health Auto Export iOS app
// (https://www.healthexportapp.com/automation), validates a shared
// secret, parses metrics + workouts, and upserts to personal_metrics
// and personal_workouts.
//
// Health Auto Export payload shape (relevant subset):
//   {
//     "data": {
//       "metrics": [
//         {
//           "name": "step_count",
//           "units": "count",
//           "data": [
//             { "qty": 8247, "date": "2026-05-09 00:00:00 -0400", "source": "iPhone" }
//           ]
//         },
//         {
//           "name": "heart_rate_variability",
//           "units": "ms",
//           "data": [
//             { "Min": 35, "Max": 92, "Avg": 58, "date": "...", "source": "Apple Watch" }
//           ]
//         },
//         {
//           "name": "sleep_analysis",
//           "data": [
//             { "asleep": 7.4, "inBed": 8.1, "deep": 1.2, "rem": 1.6, "core": 4.0,
//               "awake": 0.7, "sleepStart": "...", "sleepEnd": "...", "source": "Apple Watch" }
//           ]
//         }
//       ],
//       "workouts": [
//         {
//           "name": "Strength Training", "start": "...", "end": "...",
//           "duration": 2700, "activeEnergyBurned": { "qty": 312, "units": "kcal" }, ...
//         }
//       ]
//     }
//   }
//
// Multi-value records (HRV min/max/avg, sleep stages) get split into
// individual personal_metrics rows with derived metric_type names so
// downstream queries stay simple SQL aggregates.
//
// Auth:    X-Webhook-Secret header must match HEALTH_AUTO_EXPORT_SECRET env.
// Body:    Health Auto Export JSON (above)
// Returns: { metrics_inserted, workouts_inserted, errors }
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HEALTH_AUTO_EXPORT_SECRET

// deno-lint-ignore no-explicit-any
declare const Deno: any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Health Auto Export payload types (loose — the app version may
// add fields, so we treat extras as raw_payload).
// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>

interface HAEPayload {
  data?: {
    metrics?: HAEMetric[]
    workouts?: HAEWorkout[]
  }
}

interface HAEMetric {
  name: string
  units?: string
  data: AnyRecord[]
}

interface HAEWorkout {
  name?: string
  start?: string
  end?: string
  duration?: number
  // deno-lint-ignore no-explicit-any
  [key: string]: any
}

// ── Metric extraction
//
// For simple metrics (step_count, body_mass, etc.) the data record
// has { qty, date, source }. We map qty → value.
//
// For composite metrics (heart_rate_variability with Min/Max/Avg,
// sleep_analysis with asleep/deep/rem/core/awake/inBed) we split
// into multiple rows with derived metric_type names. This keeps
// downstream SQL simple — "select avg(value) where metric_type =
// 'heart_rate_variability_avg'" instead of plucking nested JSON.

interface ExtractedRow {
  metric_type: string
  value: number
  unit: string | null
  recorded_at: string
  source: string | null
  raw_payload: AnyRecord
}

const HRV_FIELDS = ['Min', 'Max', 'Avg', 'min', 'max', 'avg']
const SLEEP_FIELDS = ['asleep', 'inBed', 'deep', 'rem', 'core', 'awake']
const HEART_RATE_FIELDS = ['Min', 'Max', 'Avg', 'min', 'max', 'avg']
const BLOOD_PRESSURE_FIELDS = ['systolic', 'diastolic']

function extractRowsFromMetric(metric: HAEMetric): ExtractedRow[] {
  const rows: ExtractedRow[] = []
  const metricName = metric.name
  const unit = metric.units ?? null

  for (const point of metric.data) {
    const recordedAt = parseDate(point.date ?? point.start ?? point.sleepStart)
    if (!recordedAt) continue
    const source = (point.source as string) ?? null

    // Composite: heart rate variability (Min/Max/Avg)
    if (metricName === 'heart_rate_variability' || metricName === 'heart_rate') {
      let any = false
      for (const f of (metricName === 'heart_rate' ? HEART_RATE_FIELDS : HRV_FIELDS)) {
        const v = point[f]
        if (typeof v === 'number') {
          any = true
          rows.push({
            metric_type: `${metricName}_${f.toLowerCase()}`,
            value: v,
            unit,
            recorded_at: recordedAt,
            source,
            raw_payload: point,
          })
        }
      }
      if (any) continue
      // fall through if no Min/Max/Avg found, treat as simple qty
    }

    // Composite: sleep stages
    if (metricName === 'sleep_analysis') {
      let any = false
      for (const f of SLEEP_FIELDS) {
        const v = point[f]
        if (typeof v === 'number') {
          any = true
          // HAE bug/format change: `asleep` and `inBed` are sometimes
          // reported as 0 and the real total lives in `totalSleep`.
          // Prefer totalSleep for sleep_asleep when present + non-zero;
          // fall back to summing stages if neither is usable.
          let value = v
          if (f === 'asleep' && v === 0 && typeof point.totalSleep === 'number' && point.totalSleep > 0) {
            value = point.totalSleep
          }
          if (f === 'inBed' && v === 0 && typeof point.totalSleep === 'number' && point.totalSleep > 0) {
            // Without an inBed value, totalSleep is the next-best proxy
            // for "time in bed" (slight underestimate by ~10-20 min).
            value = point.totalSleep
          }
          rows.push({
            metric_type: `sleep_${f.toLowerCase()}`,
            value,
            unit: 'h',
            recorded_at: recordedAt,
            source,
            raw_payload: point,
          })
        }
      }
      if (any) continue
    }

    // Composite: blood pressure
    if (metricName === 'blood_pressure') {
      let any = false
      for (const f of BLOOD_PRESSURE_FIELDS) {
        const v = point[f]
        if (typeof v === 'number') {
          any = true
          rows.push({
            metric_type: `blood_pressure_${f}`,
            value: v,
            unit: unit ?? 'mmHg',
            recorded_at: recordedAt,
            source,
            raw_payload: point,
          })
        }
      }
      if (any) continue
    }

    // Simple: { qty, date, source }
    const qty = point.qty
    if (typeof qty === 'number') {
      rows.push({
        metric_type: metricName,
        value: qty,
        unit,
        recorded_at: recordedAt,
        source,
        raw_payload: point,
      })
      continue
    }

    // Otherwise: try to find ANY numeric leaf and store as primary
    const firstNumeric = Object.entries(point).find(
      ([k, v]) => typeof v === 'number' && k !== 'date',
    )
    if (firstNumeric) {
      rows.push({
        metric_type: metricName,
        value: firstNumeric[1] as number,
        unit,
        recorded_at: recordedAt,
        source,
        raw_payload: point,
      })
    }
  }

  return rows
}

function parseDate(s: unknown): string | null {
  if (typeof s !== 'string') return null
  // Health Auto Export emits dates like "2026-05-09 00:00:00 -0400"
  // which JS Date can parse if we replace the space with T (or just
  // pass directly — Date is forgiving).
  const d = new Date(s.replace(' ', 'T'))
  if (isNaN(d.getTime())) {
    // Try without the timezone-style replacement
    const d2 = new Date(s)
    if (isNaN(d2.getTime())) return null
    return d2.toISOString()
  }
  return d.toISOString()
}

interface ExtractedWorkout {
  workout_type: string
  started_at: string
  ended_at: string
  duration_seconds: number | null
  active_energy_kcal: number | null
  distance_mi: number | null
  avg_heart_rate: number | null
  max_heart_rate: number | null
  source: string | null
  raw_payload: AnyRecord
}

function extractWorkout(w: HAEWorkout): ExtractedWorkout | null {
  const started = parseDate(w.start)
  const ended = parseDate(w.end)
  if (!started || !ended) return null

  const type = (w.name ?? 'unknown').toLowerCase().replace(/\s+/g, '_')

  // Health Auto Export wraps numeric fields in { qty, units }
  function num(field: string): number | null {
    const v = w[field]
    if (typeof v === 'number') return v
    if (v && typeof v === 'object' && typeof v.qty === 'number') return v.qty
    return null
  }

  return {
    workout_type: type,
    started_at: started,
    ended_at: ended,
    duration_seconds: typeof w.duration === 'number' ? Math.round(w.duration) : null,
    active_energy_kcal: num('activeEnergyBurned') ?? num('activeEnergy'),
    distance_mi: num('totalDistance') ?? num('distance'),
    avg_heart_rate: num('avgHeartRate') ?? num('averageHeartRate'),
    max_heart_rate: num('maxHeartRate'),
    source: (w.source as string) ?? null,
    raw_payload: w as AnyRecord,
  }
}

// Hard upper limit for a single POST body. Edge Functions have ~150MB
// memory; JSON.parse on a 5MB string can balloon to 50MB+ during parse,
// and we still need headroom for extracted-row arrays. 5MB is the
// proven-safe ceiling. Health Auto Export's "Batch Requests" toggle
// keeps payloads well under this when enabled.
const MAX_BODY_BYTES = 5 * 1024 * 1024  // 5MB

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ── Auth: shared secret in header
  const secret = req.headers.get('X-Webhook-Secret') ?? req.headers.get('x-webhook-secret') ?? ''
  const expected = Deno.env.get('HEALTH_AUTO_EXPORT_SECRET') ?? ''
  if (!expected) return json({ error: 'Server missing HEALTH_AUTO_EXPORT_SECRET' }, 500)
  if (secret !== expected) {
    // Diagnostic: dump everything about what we received so we can
    // figure out why HAE's secret isn't matching ours. Safe to log
    // here because the secret can be rotated trivially after debug.
    const headerSnapshot: Record<string, string> = {}
    for (const [k, v] of req.headers.entries()) {
      // Mask Authorization / cookies; show everything else verbatim.
      if (/authoriz|cookie/i.test(k)) {
        headerSnapshot[k] = `<masked, len=${v.length}>`
      } else {
        headerSnapshot[k] = v
      }
    }
    // Try to log to DB for debugging (best-effort).
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const dbg = createClient(supabaseUrl, serviceRoleKey)
      await dbg.from('personal_health_webhook_log').insert({
        status: 'error',
        metrics_count: 0,
        workouts_count: 0,
        errors: [{
          stage: 'auth',
          message: 'invalid webhook secret',
          received_secret_len: secret.length,
          received_secret_first4: secret.slice(0, 4),
          received_secret_last4: secret.slice(-4),
          expected_secret_len: expected.length,
          expected_secret_first4: expected.slice(0, 4),
          expected_secret_last4: expected.slice(-4),
          all_headers: headerSnapshot,
        }],
      })
    } catch { /* swallow — debug logging shouldn't break auth response */ }

    return json({
      error: 'Invalid webhook secret',
      hint: 'Check personal_health_webhook_log for diagnostic entry',
    }, 401)
  }

  // ── Pre-flight size check from Content-Length (cheap; no body read).
  // If the sender lies about Content-Length we'll still catch it after
  // the body arrives, but most clients honor it.
  const contentLengthHeader = req.headers.get('content-length')
  const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0
  if (contentLength > MAX_BODY_BYTES) {
    return json({
      error: `Payload ${(contentLength / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_BODY_BYTES / 1024 / 1024}MB limit. In Health Auto Export, enable "Batch Requests" under Export Settings, or shrink the date range.`,
      hint: 'enable_batch_requests',
    }, 413)
  }

  // ── Supabase client (service role bypasses RLS)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured' }, 500)
  const admin = createClient(supabaseUrl, serviceRoleKey)

  // ── Receipt-first logging: insert a 'received' row before we touch
  // the body. If the function OOMs on parse, we still see the receipt
  // in the log table, which is dramatically easier to debug than
  // 502s with no DB trace at all.
  const { data: logRow, error: logErr } = await admin
    .from('personal_health_webhook_log')
    .insert({
      status: 'received',
      metrics_count: 0,
      workouts_count: 0,
      raw_size_bytes: contentLength || null,
    })
    .select('id')
    .single()
  const logId = logRow?.id ?? null
  if (logErr) {
    // Logging failed — keep going, but the receipt-trace is gone for this request.
    console.error('Failed to write receipt log:', logErr.message)
  }

  // Helper: update the log row with the final outcome.
  async function finishLog(
    status: 'ok' | 'partial' | 'error',
    counts: { metrics: number; workouts: number },
    errors: { stage: string; metric?: string; message: string }[] | null,
    sizeBytes: number,
  ) {
    if (!logId) return
    await admin.from('personal_health_webhook_log')
      .update({
        status,
        metrics_count: counts.metrics,
        workouts_count: counts.workouts,
        errors,
        raw_size_bytes: sizeBytes,
      })
      .eq('id', logId)
  }

  // ── Read body. If Content-Length lied, this is where we catch it.
  let rawText: string
  try {
    rawText = await req.text()
  } catch (err) {
    await finishLog('error', { metrics: 0, workouts: 0 }, [
      { stage: 'read_body', message: err instanceof Error ? err.message : String(err) },
    ], 0)
    return json({ error: 'Failed to read body' }, 400)
  }
  const sizeBytes = rawText.length
  if (sizeBytes > MAX_BODY_BYTES) {
    await finishLog('error', { metrics: 0, workouts: 0 }, [
      { stage: 'size_check', message: `Body ${sizeBytes} bytes exceeds ${MAX_BODY_BYTES} limit` },
    ], sizeBytes)
    return json({
      error: `Payload ${(sizeBytes / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_BODY_BYTES / 1024 / 1024}MB limit. Enable Batch Requests in Health Auto Export.`,
      hint: 'enable_batch_requests',
    }, 413)
  }

  let payload: HAEPayload
  try {
    payload = JSON.parse(rawText) as HAEPayload
  } catch (err) {
    await finishLog('error', { metrics: 0, workouts: 0 }, [
      { stage: 'parse', message: err instanceof Error ? err.message : String(err) },
    ], sizeBytes)
    return json({ error: 'Invalid JSON' }, 400)
  }

  const errors: { stage: string; metric?: string; message: string }[] = []

  // ── Extract metric rows
  const metricRows: ExtractedRow[] = []
  for (const metric of payload.data?.metrics ?? []) {
    try {
      const extracted = extractRowsFromMetric(metric)
      metricRows.push(...extracted)
    } catch (err) {
      errors.push({
        stage: 'extract_metric',
        metric: metric.name,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Extract workout rows
  const workoutRows: ExtractedWorkout[] = []
  for (const w of payload.data?.workouts ?? []) {
    const ex = extractWorkout(w)
    if (ex) workoutRows.push(ex)
  }

  // ── Upsert metrics in chunks (Postgres has a parameter limit;
  //     500/chunk gives us safe margin even with wide rows).
  let metricsInserted = 0
  const CHUNK = 500
  for (let i = 0; i < metricRows.length; i += CHUNK) {
    const chunk = metricRows.slice(i, i + CHUNK)
    const { error } = await admin
      .from('personal_metrics')
      // ON CONFLICT DO NOTHING on the unique (metric_type, recorded_at,
      // source) index — re-sends are no-ops.
      .upsert(chunk, {
        onConflict: 'metric_type,recorded_at,source',
        ignoreDuplicates: true,
      })
    if (error) {
      errors.push({ stage: 'insert_metrics', message: error.message })
    } else {
      metricsInserted += chunk.length
    }
  }

  // ── Upsert workouts
  let workoutsInserted = 0
  for (let i = 0; i < workoutRows.length; i += CHUNK) {
    const chunk = workoutRows.slice(i, i + CHUNK)
    const { error } = await admin
      .from('personal_workouts')
      .upsert(chunk, {
        onConflict: 'workout_type,started_at,source',
        ignoreDuplicates: true,
      })
    if (error) {
      errors.push({ stage: 'insert_workouts', message: error.message })
    } else {
      workoutsInserted += chunk.length
    }
  }

  // ── Update the receipt log with final outcome (single row per request)
  await finishLog(
    errors.length === 0 ? 'ok' : (metricsInserted + workoutsInserted > 0 ? 'partial' : 'error'),
    { metrics: metricsInserted, workouts: workoutsInserted },
    errors.length > 0 ? errors : null,
    sizeBytes,
  )

  return json({
    metrics_inserted: metricsInserted,
    workouts_inserted: workoutsInserted,
    errors: errors.length > 0 ? errors : undefined,
  })
})
