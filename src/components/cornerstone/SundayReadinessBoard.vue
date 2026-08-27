<script setup lang="ts">
/**
 * Focal Point - proactive scheduling health. Reads the next 4 Sundays from
 * Planning Center Services and flags problems before they bite, by reading BOTH
 * who is scheduled (with confirmation status) AND what is still needed, compared
 * to a baseline of what normally runs. The headline case: a team that runs every
 * Sunday but is missing from an upcoming plan entirely ("forgotten"), which a
 * needed-positions-only view can never catch. Then this Sunday's burnout-aware
 * fills. Fill-asks are drafted and approved before send.
 */
import { computed } from 'vue'
import { focalPointSchedule as sched, type TeamWeek } from '@/lib/clients/focal-point/rosterForward'
import { rosterData } from '@/lib/clients/church/careDataLoader'
import { exportCsv } from '@/lib/exportCsv'
import ExportButton from '@/components/cornerstone/ExportButton.vue'

type DisplayFlag = 'forgotten' | 'empty' | 'short' | 'unconfirmed' | 'ready'

// Functional minimums, below the scheduled ideal, configured per team in
// onboarding. Example: Vocals runs fine with 1 confirmed even though 2 is nicer,
// so it should not read "short" just for being below the ideal.
const MIN: Record<string, number> = { Vocals: 1 }

// The flag is derived from what is CONFIRMED against the real need. Declines are
// never surfaced: Planning Center's "still needed" already reflects anyone who
// declined and was not replaced, so a decline that got refilled is a non-event.
function flagOf(c: TeamWeek): DisplayFlag {
  if (c.sched === 0 && c.need === 0) return 'forgotten'
  const min = MIN[c.team]
  if (min != null && c.confirmed >= min) return 'ready'
  if (c.need > 0) return c.sched === 0 ? 'empty' : 'short'
  if (c.unconfirmed > 0) return 'unconfirmed'
  return 'ready'
}
// Say WHAT is short, not just how many. One role type -> "13 Ushers"; several ->
// name the first two and count the rest ("Acoustic Guitar, Drums", "Lobby, Sanctuary +2").
function plural(s: string, q: number) { return q > 1 && !/s$/i.test(s) ? s + 's' : s }
function shortText(c: TeamWeek): string {
  const ps = c.positions
  if (!ps.length) return `${c.need} needed`
  if (ps.length === 1) return `${ps[0].qty} ${plural(ps[0].pos, ps[0].qty)}`
  const extra = ps.length - 2
  return ps.slice(0, 2).map((p) => p.pos).join(', ') + (extra > 0 ? ` +${extra}` : '')
}
const FLAG: Record<DisplayFlag, { label: (c: TeamWeek) => string; cls: string }> = {
  forgotten: { label: () => 'not scheduled', cls: 'bg-danger/20 text-danger font-semibold' },
  empty: { label: (c) => shortText(c), cls: 'bg-danger/12 text-danger' },
  short: { label: (c) => shortText(c), cls: 'bg-warn/15 text-warn' },
  unconfirmed: { label: () => 'unconfirmed', cls: 'bg-brand/12 text-brand' },
  ready: { label: () => 'ready', cls: 'bg-success/12 text-success' },
}
function cell(team: string, week: (typeof sched.weeks)[number]) {
  return week.teams.find((t) => t.team === team)
}

/**
 * A Sunday whose plan has not been created in Planning Center yet.
 *
 * "Forgotten" means zero scheduled and zero needed, which is exactly what an
 * unbuilt plan looks like for EVERY team at once. The furthest week out is
 * therefore almost always a full column of red, which is not nine forgotten
 * teams, it is one plan nobody has made. Crying wolf there costs us the Media
 * Team finding, which is real and sits in the same column.
 *
 * So: if every expected team is "forgotten" for a week, the week is unbuilt.
 * A genuine forgotten team only counts when the rest of that Sunday exists.
 */
function weekNotBuilt(week: (typeof sched.weeks)[number]): boolean {
  return sched.expected.every((team) => {
    const c = cell(team, week)
    return !c || flagOf(c) === 'forgotten'
  })
}
const builtWeeks = computed(() => sched.weeks.filter((w) => !weekNotBuilt(w)))
const unbuiltWeeks = computed(() => sched.weeks.filter(weekNotBuilt))

// --- Grace's get-ahead: the exceptions worth acting on now ---
const forgotten = computed(() =>
  sched.expected
    .map((team) => ({ team, weeks: builtWeeks.value.filter((w) => { const c = cell(team, w); return c && flagOf(c) === 'forgotten' }).map((w) => w.label) }))
    .filter((x) => x.weeks.length),
)
const chronicEmpty = computed(() =>
  sched.expected
    .map((team) => ({ team, n: builtWeeks.value.filter((w) => { const c = cell(team, w); return c && flagOf(c) === 'empty' }).length }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n),
)
const thisSunday = sched.weeks[0]
const unconfirmedNow = computed(() => thisSunday.teams.filter((t) => flagOf(t) === 'unconfirmed'))

// --- this Sunday burnout-aware fills (from the roster file) ---

const props = defineProps<{ clientName?: string }>()
// Live row when present, baked (anonymised in git) otherwise.
const r = computed(() => rosterData())

// How stale the committed roster snapshot is, so the page can say so out loud
// rather than let a reader assume "this Sunday" means the coming one.
const snapshotAgeDays = computed(() => {
  const then = Date.parse(`${r.value.date}T00:00:00Z`)
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.round((Date.now() - then) / 864e5))
})

// Team-level gaps only, no suggested names, so this one is not PII-gated.
function onExport() {
  exportCsv(
    r.value.gaps,
    [
      { header: 'Team', value: (g) => g.team },
      { header: 'Spots short', value: (g) => g.short },
      { header: 'Roster date', value: () => r.value.date },
    ],
    { client: props.clientName ?? 'focal-point-church', dataset: 'roster-gaps' },
  )
}
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Scheduling health</span>
      <div class="flex items-center gap-3">
        <!-- NOT live. This board renders focalPointRoster / rosterForward, which
             are committed snapshots from a manual Planning Center pull, not the
             nightly sync. It previously said "Live from Planning Center Services"
             next to a three-week-old date, which is the worst combination: a
             stale number wearing a live badge. Forward roster gaps need PCO plan
             "needed positions" data, which the sync does not pull yet. -->
        <span class="inline-flex items-center gap-1.5 rounded-full bg-warn/12 px-2 py-0.5 text-[10px] font-semibold text-warn">
          <span class="h-1.5 w-1.5 rounded-full bg-warn"></span>
          Snapshot · {{ r.sundayLabel }}
        </span>
        <span v-if="snapshotAgeDays > 7" class="text-[11px] text-ink-muted">{{ snapshotAgeDays }} days old</span>
        <ExportButton label="Download gaps" :count="r.gaps.length" @export="onExport" />
      </div>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">The next 4 Sundays, flagged before they break</h3>

    <div class="mt-3 rounded-lg border border-brand/20 bg-surface-elevated/60 px-4 py-3">
      <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Grace's read, get ahead of these</span>
      <ul class="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink">
        <li v-for="f in forgotten" :key="f.team" class="flex gap-2">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"></span>
          <span><span class="font-semibold">{{ f.team }}</span> runs every Sunday but is not on the schedule for {{ f.weeks.join(', ') }}. Nobody set it up. This is the one a normal tool never catches. Fix it first.</span>
        </li>
        <li v-if="chronicEmpty.length" class="flex gap-2">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn"></span>
          <span><span class="font-semibold">{{ chronicEmpty.map((c) => c.team).join(', ') }}</span> are empty two or more weeks out. You fill these late every week. Start now while you have options.</span>
        </li>
        <li v-if="unconfirmedNow.length" class="flex gap-2">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"></span>
          <span>This Sunday, still waiting on a yes from <span class="font-semibold">{{ unconfirmedNow.map((t) => `${t.unconfirmed} on ${t.team}`).join(', ') }}</span>. A quick nudge now beats a scramble Saturday.</span>
        </li>
      </ul>
    </div>
  </section>

  <!-- forward heatmap -->
  <section class="card">
    <div class="mb-3 flex items-center justify-between">
      <span class="eyebrow">Every team, every Sunday ahead</span>
      <span class="text-[11px] text-ink-muted">reads scheduled + confirmed + still needed</span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr class="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th class="pb-2 pr-3 font-medium">Team</th>
            <th v-for="w in sched.weeks" :key="w.date" class="pb-2 px-2 font-medium">
              {{ w.label }}
              <span v-if="weekNotBuilt(w)" class="block text-[9px] font-normal normal-case text-ink-disabled">no plan yet</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="team in sched.expected" :key="team" class="border-t border-divider/60">
            <td class="py-2 pr-3 font-medium text-ink">{{ team }}</td>
            <td v-for="w in sched.weeks" :key="w.date" class="px-2 py-2">
              <!-- A week with no plan built yet is not nine forgotten teams. It
                   renders neutral so the genuine red cells elsewhere still mean
                   something. -->
              <span v-if="weekNotBuilt(w)" class="text-[10px] text-ink-disabled">&mdash;</span>
              <span
                v-else-if="cell(team, w)"
                class="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                :class="FLAG[flagOf(cell(team, w)!)].cls"
              >{{ FLAG[flagOf(cell(team, w)!)].label(cell(team, w)!) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-muted">
      <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded bg-danger/60"></span> not scheduled / empty</span>
      <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded bg-warn/60"></span> short</span>
      <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded bg-brand/60"></span> unconfirmed / declined</span>
      <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded bg-success/60"></span> ready</span>
      <span class="text-ink-disabled">"Not scheduled" means the team runs most Sundays but is absent from that plan.</span>
      <span v-if="unbuiltWeeks.length" class="text-ink-disabled">
        {{ unbuiltWeeks.map((w) => w.label).join(', ') }}
        {{ unbuiltWeeks.length === 1 ? 'has' : 'have' }} no plan in Planning Center yet, so
        {{ unbuiltWeeks.length === 1 ? 'it is' : 'they are' }} not flagged.
      </span>
    </div>
  </section>

  <!-- this Sunday: burnout-aware fills -->
</template>
