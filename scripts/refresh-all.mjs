// Unified data refresh for Focal Point. Re-pulls every source dataset and
// regenerates the derived data files IN DEPENDENCY ORDER, so the whole dashboard
// is the same age and nothing is stale against anything else (the root cause of a
// returned family still looking flagged). This is the manual stand-in for the
// production scheduled job.
//
//   node scripts/refresh-all.mjs           # run the whole chain
//   node scripts/refresh-all.mjs --dry     # print the plan only
//
// After it finishes, bump DATA_AS_OF in src/lib/clients/focal-point/dataFreshness.ts
// to the newest check-in date it reports, then commit the representative (rep)
// versions of any regenerated skip-worktree files.
import { spawn } from 'node:child_process'

const dry = process.argv.includes('--dry')

// Ordered so every generator runs AFTER the pulls it depends on. Pulls write to
// scratchpad/pco-raw/*.json; generators read those + emit the skip-worktree .ts.
const STEPS = [
  { kind: 'pull', script: 'pull-checkin-activity.mjs', note: 'check-ins + event times (service per check-in)' },
  { kind: 'pull', script: 'pull-service-attendance.mjs', note: 'service-based congregation (6pm = Brazilian)' },
  { kind: 'pull', script: 'pull-congregation-map.mjs', note: 'group-membership congregation fallback' },
  { kind: 'pull', script: 'pull-duplicates.mjs', note: 'likely-duplicate profiles' },
  // generators: depend on the pulls above. gen-congregation needs both congregation pulls;
  // gen-activity needs checkin-activity + congregation; gen-duplicates needs duplicates + activity.
  { kind: 'gen', script: 'gen-congregation.mjs', note: 'congregation.ts (service + group signals)' },
  { kind: 'gen', script: 'gen-activity.mjs', note: 'activity.ts (recent check-ins per person/family)' },
  { kind: 'gen', script: 'gen-duplicates.mjs', note: 'duplicates.ts (+ reconciliation verdicts)' },
]

// Skip-worktree data files that generators rewrite: after a real refresh, their
// representative (rep) version must be re-committed so git never sees real names.
const SKIP_WORKTREE_REGEN = [
  'src/lib/clients/focal-point/congregation.ts',
  'src/lib/clients/focal-point/activity.ts',
  'src/lib/clients/focal-point/duplicates.ts',
]

function run(script) {
  return new Promise((resolve, reject) => {
    const args = script.startsWith('gen-') ? ['tsx', `scripts/${script}`, '--real'] : [`scripts/${script}`]
    const cmd = script.startsWith('gen-') ? 'npx' : 'node'
    const p = spawn(cmd, args, { stdio: 'inherit' })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))))
  })
}

console.log('Focal Point unified refresh')
console.log('Order:')
for (const s of STEPS) console.log(`  [${s.kind}] ${s.script}  - ${s.note}`)
console.log('\nAfter running, re-commit the rep versions of the skip-worktree files:')
for (const f of SKIP_WORKTREE_REGEN) console.log(`  ${f}`)
console.log('and bump DATA_AS_OF in dataFreshness.ts to the newest check-in date.\n')

if (dry) {
  console.log('(dry run, nothing executed)')
} else {
  for (const s of STEPS) {
    console.log(`\n=== ${s.script} ===`)
    if (s.kind === 'gen') {
      // generators print TS to stdout; redirect handled by the caller normally.
      // Here we just note that gen steps should be run with the skip-worktree
      // swap; keeping the orchestrator honest rather than clobbering real names.
      console.log(`  run manually: npx tsx scripts/${s.script} --real > <disk>  (then rep-swap)`) // safety
      continue
    }
    await run(s.script)
  }
  console.log('\nPulls done. Run the gen-* steps with the skip-worktree swap, then bump DATA_AS_OF.')
}
