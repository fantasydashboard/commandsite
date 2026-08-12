// Turns scratchpad/pco-raw/serve_candidates.json into
// src/lib/clients/focal-point/serveCandidates.ts.
//
// Writes two variants, same as the roster: real names to disk (the file is
// skip-worktree) and an anonymised copy for the commit, so congregant names
// never reach git or production.
//
// Tier 1 is emitted in full because it is the actionable list and it is small.
// Tiers 2 and 3 are capped: 568 group members with no attendance signal is a
// directory, not a worklist, and shipping all of them would repeat the mistake
// the guest and care windows just fixed. Totals are always exact.
//
// Usage: node scripts/pull-serve-candidates.mjs && node scripts/gen-serve-candidates.mjs

import { readFile, writeFile } from 'node:fs/promises'

const src = JSON.parse(await readFile('scratchpad/pco-raw/serve_candidates.json', 'utf8'))
const all = src.candidates ?? []
const tier = (t) => all.filter((c) => c.tier === t)

const CAP_LOWER = 60
const t1 = tier(1)
const t2 = tier(2).slice(0, CAP_LOWER)
const t3 = tier(3).slice(0, CAP_LOWER)

const row = (c, anon, i) => {
  const name = anon ? `Candidate ${i + 1}` : c.name
  const groups = anon ? c.groups.map((_, k) => `Group ${k + 1}`) : c.groups
  return `    { name: ${JSON.stringify(name)}, tier: ${c.tier}, sundays: ${c.sundays}, groups: ${JSON.stringify(groups)} },`
}

function body(anon) {
  let i = 0
  const rows = [...t1, ...t2, ...t3].map((c) => row(c, anon, i++))
  return `// Focal Point Church - who to ask to serve.
//
// Ranked by the two signals that predict a yes, from Planning Center:
//   tier 1  in a Growth Group AND dropping kids off
//   tier 2  in a Growth Group
//   tier 3  dropping kids off
// Within a tier, more Sundays present ranks higher. "sundays" counts distinct
// Sundays they physically dropped a child off in the window, which is a
// recorded appearance; group membership alone is not, so tier 2 has no
// attendance signal and is ordered by group involvement instead.
//
// Everyone here is EXCLUDED from serving already, and the same over-serving
// rule the burnout signal uses is applied, so a name suggested here can never
// be a name the church is being told to protect.
//
// Names are real congregants, so this follows the skip-worktree pattern: the
// committed copy is anonymised, the on-disk copy is real.
// Generated ${src.generated} from a ${src.windowDays}-day window. Regenerate with
// scripts/pull-serve-candidates.mjs then scripts/gen-serve-candidates.mjs.
export interface ServeCandidate {
  name: string
  /** 1 = group + kids drop-off, 2 = group only, 3 = kids drop-off only */
  tier: 1 | 2 | 3
  /** Distinct Sundays they dropped a child off in the window. */
  sundays: number
  groups: string[]
}

export const serveCandidates: {
  generated: string
  windowDays: number
  /** Exact totals, even where the list below is capped. */
  totals: { tier1: number; tier2: number; tier3: number; all: number }
  people: ServeCandidate[]
} = {
  generated: '${src.generated}',
  windowDays: ${src.windowDays},
  totals: { tier1: ${tier(1).length}, tier2: ${tier(2).length}, tier3: ${tier(3).length}, all: ${all.length} },
  people: [
${rows.join('\n')}
  ],
}
`
}

await writeFile('src/lib/clients/focal-point/serveCandidates.ts', body(false))
await writeFile('scratchpad/serveCandidates.committed.ts', body(true))
// JSON twin of the REAL payload, for the database upload (see gen-roster-live).
await writeFile('scratchpad/serveCandidates.payload.json', JSON.stringify({
  generated: src.generated,
  windowDays: src.windowDays,
  totals: { tier1: tier(1).length, tier2: tier(2).length, tier3: tier(3).length, all: all.length },
  people: [...t1, ...t2, ...t3].map((c) => ({ name: c.name, tier: c.tier, sundays: c.sundays, groups: c.groups })),
}, null, 2))
console.log(`serveCandidates.ts  tier1 ${tier(1).length} (all), tier2 ${tier(2).length} (capped ${t2.length}), tier3 ${tier(3).length} (capped ${t3.length})`)
console.log('committed (anonymised) variant -> scratchpad/serveCandidates.committed.ts')
