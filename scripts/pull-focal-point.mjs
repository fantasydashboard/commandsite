// Focal Point Church: Planning Center pull + inspection.
// ---------------------------------------------------------------------------
// Node (not a browser) so it calls the PCO API directly. No proxy needed:
// the pco-proxy Edge Function only exists because browsers cannot call PCO
// cross-origin. PCO uses HTTP Basic auth where username = application id and
// password = secret, both from the Personal Access Token (app_id:secret).
//
// Run:  node scripts/pull-focal-point.mjs
// Token is read from .env.local (PCO_PAT=app_id:secret), which is gitignored.
//
// This first pass is an INSPECTION run: it confirms the token works, which
// PCO organization it belongs to, which products it can reach (scope), and
// saves a small raw sample of each resource to scratchpad/pco-raw/ so the
// mapping step can be written against the real shapes. It does not write to
// src/ and does not pull full datasets yet.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW_DIR = join(ROOT, 'scratchpad', 'pco-raw')
const PCO_BASE = 'https://api.planningcenteronline.com'

// ── Load the token from .env.local (or the environment as a fallback).
async function loadToken() {
  if (process.env.PCO_PAT) return process.env.PCO_PAT.trim()
  let text = ''
  try {
    text = await readFile(join(ROOT, '.env.local'), 'utf8')
  } catch {
    fail('.env.local not found. Create it with PCO_PAT=app_id:secret')
  }
  const line = text.split('\n').find((l) => l.trim().startsWith('PCO_PAT='))
  if (!line) fail('.env.local has no PCO_PAT= line')
  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  if (!value || value.includes('REPLACE_')) {
    fail('PCO_PAT is still the placeholder. Paste your real app_id:secret into .env.local')
  }
  if (!value.includes(':')) {
    fail('PCO_PAT must be in "app_id:secret" format (two values joined by a colon)')
  }
  return value
}

function fail(msg) {
  console.error(`\n  ERROR: ${msg}\n`)
  process.exit(1)
}

function makeClient(token) {
  const basic = Buffer.from(token).toString('base64')
  return async function pco(path) {
    const url = `${PCO_BASE}${path.startsWith('/') ? path : '/' + path}`
    let res
    try {
      res = await fetch(url, {
        headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
      })
    } catch (err) {
      return { ok: false, status: 0, statusText: 'fetch failed', error: String(err), parsed: null }
    }
    const body = await res.text()
    let parsed = null
    try { parsed = JSON.parse(body) } catch { /* not JSON */ }
    return { ok: res.ok, status: res.status, statusText: res.statusText, body, parsed }
  }
}

// ── The probes. Each confirms one product's scope and reveals its shape.
// per_page kept tiny: this is inspection, not the full pull.
const PROBES = [
  { key: 'me',            product: 'People',    path: '/people/v2/me' },
  { key: 'people',        product: 'People',    path: '/people/v2/people?per_page=3' },
  { key: 'forms',         product: 'People',    path: '/people/v2/forms?per_page=25' },
  { key: 'workflows',     product: 'People',    path: '/people/v2/workflows?per_page=50' },
  { key: 'lists',         product: 'People',    path: '/people/v2/lists?per_page=50' },
  { key: 'check_ins',     product: 'Check-Ins', path: '/check-ins/v2/check_ins?per_page=3&order=-created_at' },
  { key: 'checkin_events',product: 'Check-Ins', path: '/check-ins/v2/events?per_page=100' },
  { key: 'groups',        product: 'Groups',    path: '/groups/v2/groups?per_page=5' },
  { key: 'giving_funds',  product: 'Giving',    path: '/giving/v2/funds?per_page=10' },
  { key: 'service_types', product: 'Services',  path: '/services/v2/service_types?per_page=10' },
]

function countOf(parsed) {
  return parsed?.meta?.total_count ?? (Array.isArray(parsed?.data) ? parsed.data.length : null)
}

async function main() {
  const token = await loadToken()
  const appId = token.split(':')[0]
  console.log(`\n  Planning Center inspection`)
  console.log(`  App ID: ${appId}`)
  console.log(`  Base:   ${PCO_BASE}\n`)

  await mkdir(RAW_DIR, { recursive: true })
  const pco = makeClient(token)
  const summary = []

  for (const probe of PROBES) {
    const r = await pco(probe.path)
    const count = r.parsed ? countOf(r.parsed) : null
    let note = ''
    if (probe.key === 'me' && r.parsed?.data?.attributes) {
      const a = r.parsed.data.attributes
      note = `${a.name ?? ''} (${a.status ?? '?'})`
    }
    if (r.status === 401) note = 'token invalid / not authenticated'
    if (r.status === 403) note = 'no permission for this product'
    summary.push({ product: probe.product, key: probe.key, status: r.status, count, note })
    await writeFile(join(RAW_DIR, `${probe.key}.json`), r.body ?? JSON.stringify(r), 'utf8')
    console.log(`  ${r.ok ? 'OK ' : '!! '} ${String(r.status).padEnd(3)} ${probe.product.padEnd(10)} ${probe.key.padEnd(15)} ${count != null ? 'count=' + count : ''} ${note}`)
  }

  console.log(`\n  Scope report:`)
  const byProduct = {}
  for (const s of summary) {
    if (!byProduct[s.product]) byProduct[s.product] = { ok: 0, denied: 0 }
    if (s.status >= 200 && s.status < 300) byProduct[s.product].ok++
    else byProduct[s.product].denied++
  }
  for (const [product, r] of Object.entries(byProduct)) {
    const verdict = r.denied === 0 ? 'reachable' : (r.ok === 0 ? 'BLOCKED' : 'partial')
    console.log(`    ${product.padEnd(10)} ${verdict}`)
  }
  console.log(`\n  Raw samples written to scratchpad/pco-raw/ (gitignored).`)
  console.log(`  Next: map these shapes into src/lib/clients/focal-point/*.ts\n`)
}

main()
