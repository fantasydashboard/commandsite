// One-time backfill: pull every existing user from an external Supabase
// project's auth.users and push them through the CommandSite ingest
// function. Idempotent — re-running is safe (duplicate emails skipped).
//
// Usage:
//   UFD_SUPABASE_URL=https://xxx.supabase.co \
//   UFD_SERVICE_ROLE_KEY=eyJ... \
//   CS_INGEST_KEY=cs_live_... \
//   node scripts/backfill-ingest.mjs
//
// Requires Node 18+ (for global fetch). Uses the external project's
// service role key to read auth.users — keep that key off the client.

import { createClient } from '@supabase/supabase-js'

const SOURCE_URL = process.env.UFD_SUPABASE_URL
const SOURCE_KEY = process.env.UFD_SERVICE_ROLE_KEY
const INGEST_URL =
  process.env.CS_INGEST_URL ||
  'https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/ingest-contact'
const INGEST_KEY = process.env.CS_INGEST_KEY

if (!SOURCE_URL || !SOURCE_KEY || !INGEST_KEY) {
  console.error(
    'Missing env vars. Required: UFD_SUPABASE_URL, UFD_SERVICE_ROLE_KEY, CS_INGEST_KEY',
  )
  process.exit(1)
}

const source = createClient(SOURCE_URL, SOURCE_KEY, {
  auth: { persistSession: false },
})

const PAGE_SIZE = 1000
let page = 1
let imported = 0
let duplicate = 0
let failed = 0
const failures = []

console.log('Fetching users from source project...\n')

while (true) {
  const { data, error } = await source.auth.admin.listUsers({
    page,
    perPage: PAGE_SIZE,
  })
  if (error) {
    console.error('Fetch error:', error.message)
    process.exit(1)
  }

  const users = data?.users ?? []
  if (users.length === 0) break
  console.log(`Page ${page}: ${users.length} users`)

  for (const u of users) {
    const meta = u.user_metadata ?? {}
    const fullName = meta.full_name ?? meta.name ?? null
    const parts = fullName ? fullName.trim().split(/\s+/) : []

    const payload = {
      email: u.email ?? null,
      phone: u.phone ?? null,
      first_name: meta.first_name ?? parts[0] ?? null,
      last_name: meta.last_name ?? (parts.length > 1 ? parts.slice(1).join(' ') : null),
      company: meta.company ?? null,
      title: meta.title ?? null,
      source: 'backfill_existing',
    }

    if (!payload.email && !payload.phone) {
      failed++
      failures.push({ email: u.email, reason: 'no email or phone' })
      continue
    }

    try {
      const res = await fetch(INGEST_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${INGEST_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const result = await res.json().catch(() => ({}))

      if (res.status === 201) {
        imported++
      } else if (result.duplicate === true) {
        duplicate++
      } else {
        failed++
        failures.push({ email: u.email, status: res.status, result })
      }
    } catch (err) {
      failed++
      failures.push({ email: u.email, reason: err.message })
    }

    // Gentle throttle — ~10 req/s. Raise/lower if you like.
    await new Promise((r) => setTimeout(r, 100))
  }

  if (users.length < PAGE_SIZE) break
  page++
}

console.log('\nDone.')
console.log(`  Imported:         ${imported}`)
console.log(`  Already existed:  ${duplicate}`)
console.log(`  Failed:           ${failed}`)

if (failures.length > 0) {
  console.log('\nFirst few failures:')
  console.log(failures.slice(0, 10))
}
