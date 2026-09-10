<script setup lang="ts">
/**
 * Focal Point - unified Care Pipeline board. Three tracks (family drift, stopped
 * serving, burnout) as swim lanes, five stages as columns. Cards are real people
 * at believable stages. The two cross-track handoffs are the point: a burnout
 * flag confirmed by a serving lapse ("Grace called it"), and a lapsed volunteer
 * who stopped attending promoted into the pastoral track. Auto-advancing engine
 * is the week-one build; this is the process on real data.
 */
import { computed } from 'vue'
import { carePipeline, TRACKS, STAGES, type Track, type CareCase } from '@/lib/clients/focal-point/carePipeline'

// Only the stages this board can actually put a card in.
//
// It rendered all five. "Reaching out" and "Watching" were empty in every track
// because nothing advances a card into them: the auto-advancing engine is
// unbuilt, which the footnote admitted two lines under a claim that Grace
// "advances stages automatically".
//
// I first cut it to three, keeping Resolved, and that was still wrong. The
// transform only emits a family once it has missed 3+ Sundays, and
// returnedFamilies() calls someone returned at fewer than 3, so the live payload
// can never contain one. Resolved was structurally empty too, and one dead
// column out of three is worse than three out of five.
//
// A family that comes back simply leaves the board, which is what the directory
// strip already says and is better behaviour than a column nobody can reach.
// Making Resolved real needs week-over-week snapshot diffing, because "who came
// back" is not derivable from the current snapshot alone, and we keep only the
// latest payload per module.
const LIVE_STAGE_KEYS = ['flagged', 'escalated']
const VISIBLE_STAGES = STAGES.filter((s) => LIVE_STAGE_KEYS.includes(s.key))
import { useCareActions } from '@/stores/careActions'
import { useCongregationLens } from '@/stores/congregationLens'
import { congregationOf } from '@/lib/clients/focal-point/congregationLive'
import { returnedFamilies } from '@/lib/clients/focal-point/driftLive'
import { servingResumers } from '@/lib/clients/focal-point/servingLive'
import { servingData } from '@/lib/clients/church/careDataLoader'
import { familyCases, servingCases, groupCases } from '@/lib/clients/focal-point/familyPipeline'
import { careCaseFlag } from '@/lib/clients/focal-point/flags'

const care = useCareActions()
const lens = useCongregationLens()
const nameInScope = (name: string) => lens.scope === 'all' || congregationOf(name) === lens.scope
const inScope = (c: CareCase) =>
  nameInScope(c.name)
  && !care.isHandled(c.id)
  && !(c.track === 'serving' && servingResumers().some((r) => r.name === c.name))

// Acting straight from the card, so the board IS the work rather than a
// read-only copy of a queue sitting above it. Approving without reading the
// note would be worse than the duplication was, so the note stays in the
// drawer: "Review note" opens it beside the check-in history that justifies it.
function markHandled(c: CareCase) { care.markHandled(c.id) }

// Cap how many flagged family cards show in a single board cell; the rest live in
// the directory below. Keeps the board a glance, not a wall.
const FLAGGED_CAP = 8

const ACCENT: Record<Track, { bar: string; chip: string }> = {
  family: { bar: 'bg-warn', chip: 'bg-warn/15 text-warn' },
  serving: { bar: 'bg-accent', chip: 'bg-accent/15 text-accent' },
  burnout: { bar: 'bg-danger', chip: 'bg-danger/12 text-danger' },
  groups: { bar: 'bg-brand', chip: 'bg-brand/12 text-brand' },
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${MON[m - 1]} ${d}`
}

// The Resolved column is driven by the SAME live reconciliation as the "Came
// back" card, so the board and the card can never show different people:
// families who returned to Sunday + volunteers who served again, scoped by the
// lens. Burnout and groups have no activity-based return signal yet (burnout is
// season-long; groups do not meet in summer), so their resolved cells stay empty.
function resolvedFor(track: Track): CareCase[] {
  if (track === 'family') {
    return returnedFamilies()
      .filter((f) => nameInScope(f.family))
      .map((f) => ({
        id: `resolved-fam-${f.family}`,
        track: 'family',
        stage: 'resolved',
        name: `The ${f.family} family`,
        avatar: '',
        detail: 'kids checked back in at Kids Point',
        owner: 'Grace, auto',
        age: `returned ${fmtDate(f.lastSeen)}`,
        outcome: 'Reconnected',
      }))
  }
  if (track === 'serving') {
    return servingResumers()
      .filter((r) => nameInScope(r.name))
      .map((r) => ({
        id: `resolved-srv-${r.name}`,
        track: 'serving',
        stage: 'resolved',
        name: r.name,
        avatar: '',
        detail: `serving again in ${r.area}`,
        owner: `${r.area} lead`,
        age: `returned ${fmtDate(r.resumedOn)}`,
        outcome: 'Back serving',
      }))
  }
  return []
}

// Cross-track promotions (e.g. a lapsed volunteer escalated into the pastoral
// track) are the one hand-authored overlay kept on the family lane; everything
// else in the family lane is the real drift data.
const promotedFamily = (stage: string) =>
  carePipeline.cases.filter(
    (c) => c.track === 'family' && !!c.promotedFrom && c.stage === stage && !care.isHidden(careCaseFlag(c).id) && inScope(c),
  )

// Every lane is driven by its real directory, so the board can never disagree
// with the lists below. Only families have an escalation rule (established +
// long-gone) and drafted notes; serving and groups sit entirely in "flagged"
// (they route to leaders, and no case-state engine exists yet to advance them).
// Anyone hand-promoted across tracks (e.g. serving -> pastoral) shows only in the
// lane they were promoted INTO, not their origin lane, so they never double-appear.
const promotedNames = new Set(carePipeline.cases.filter((c) => c.promotedFrom).map((c) => c.name))
function realCases(track: Track): CareCase[] {
  if (track === 'family') return familyCases()
  if (track === 'serving') return servingCases().filter((c) => !promotedNames.has(c.name))
  if (track === 'groups') return groupCases().filter((c) => !promotedNames.has(c.name))
  return []
}
// All three tracks follow the lens: families/groups by service attended, serving
// by the campus of the teams a person serves.
// Read the LIVE serving payload, not the baked focal-point/serving.ts.
//
// That file is skip-worktree and its committed copy has zero people, so this
// Map was empty in production. servingCampus.get(name) came back undefined for
// everyone, laneInScope returned false for every serving case, and the Stopped
// serving lane rendered completely blank on the English or Brazilian lens while
// its own tab said 12. Only the 'all' lens hid it, because that path returns
// early before the lookup.
//
// Fifth instance of this class after roster, congregation, activity and
// priority. A component reaching straight into a focal-point/*.ts file is the
// tell; the live getters exist for exactly this reason.
const servingCampus = computed(
  () => new Map(servingData().people.map((p) => [p.name, p.campus])),
)
const laneInScope = (track: Track, name: string) => {
  if (track !== 'serving') return nameInScope(name)
  if (lens.scope === 'all') return true
  const c = servingCampus.value.get(name)
  return c === 'both' || c === lens.scope
}
function flaggedInScope(track: Track): CareCase[] {
  return realCases(track).filter(
    (c) => c.stage === 'flagged' && laneInScope(track, c.name) && !care.isHidden(careCaseFlag(c).id),
  )
}

function casesFor(track: Track, stage: string): CareCase[] {
  // 'resolved' is not a rendered column: see LIVE_STAGE_KEYS. Kept so the
  // function stays honest if week-over-week diffing lands and revives it.
  if (stage === 'resolved') return resolvedFor(track)
  const promoted = track === 'family' ? promotedFamily(stage) : []
  const real = realCases(track).filter((c) => c.stage === stage && laneInScope(track, c.name) && !care.isHidden(careCaseFlag(c).id))
  const cards = [...promoted, ...real]
  return stage === 'flagged' ? cards.slice(0, FLAGGED_CAP) : cards
}
// How many flagged cards are hidden by the cap (shown as a "+N more" note).
function moreFlagged(track: Track): number {
  const total = flaggedInScope(track).length
  const promoted = track === 'family' ? promotedFamily('flagged').length : 0
  const shown = Math.max(0, FLAGGED_CAP - promoted)
  return Math.max(0, total - shown)
}
function initials(name: string): string {
  const clean = name.replace(/^The\s+/i, '').replace(/\s+family$/i, '')
  return clean.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Care pipeline</span>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Live signals from Planning Center
      </span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">Where every drifting, lapsed, and over-serving person is right now</h3>

    <!-- one lifecycle, caught earlier = cheaper -->
    <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
      <span class="rounded bg-surface-elevated px-2 py-0.5 font-medium text-ink-muted">Over-serving</span>
      <span class="text-ink-disabled">→</span>
      <span class="rounded bg-accent/15 px-2 py-0.5 font-medium text-accent">Stopped serving</span>
      <span class="text-ink-disabled">→</span>
      <span class="rounded bg-warn/15 px-2 py-0.5 font-medium text-warn">Drifting</span>
      <span class="text-ink-disabled">→</span>
      <span class="rounded bg-surface-elevated px-2 py-0.5 font-medium text-ink-muted">Gone</span>
      <span class="ml-1 text-ink-muted">One lifecycle. Over-serving starts under Serving; when someone burns out and stops, they cross to here.</span>
    </div>
  </section>

  <section class="card">
    <div class="overflow-x-auto">
      <div class="min-w-[920px]">
        <!-- stage header row -->
        <div class="grid grid-cols-[132px_repeat(2,minmax(0,1fr))] gap-2 border-b border-divider pb-2">
          <div></div>
          <div v-for="s in VISIBLE_STAGES" :key="s.key" class="px-1 text-[10px] font-semibold uppercase tracking-wide" :class="s.key === 'resolved' ? 'text-success' : s.key === 'escalated' ? 'text-danger' : 'text-ink-muted'">
            {{ s.label }}
          </div>
        </div>

        <!-- one row per track -->
        <div v-for="t in TRACKS" :key="t.key" class="grid grid-cols-[132px_repeat(2,minmax(0,1fr))] gap-2 border-b border-divider/60 py-2">
          <!-- lane label -->
          <div class="flex gap-2">
            <span class="w-1 shrink-0 rounded-full" :class="ACCENT[t.key].bar"></span>
            <div class="min-w-0">
              <div class="text-[12px] font-semibold text-ink">{{ t.label }}</div>
              <div class="text-[10px] font-medium" :class="ACCENT[t.key].chip.split(' ')[1]">{{ t.move }}</div>
              <div class="mt-0.5 text-[10px] leading-snug text-ink-disabled">{{ t.blurb }}</div>
            </div>
          </div>

          <!-- one cell per stage -->
          <div v-for="s in VISIBLE_STAGES" :key="s.key" class="space-y-2 rounded-lg p-1" :class="s.key === 'resolved' ? 'bg-success/[0.04]' : s.key === 'escalated' ? 'bg-danger/[0.03]' : ''">
            <article
              v-for="c in casesFor(t.key, s.key)"
              :key="c.id"
              class="cursor-pointer rounded-lg border bg-surface-raised p-2 transition-colors hover:border-brand/40"
              :class="c.promotedFrom ? 'border-brand ring-1 ring-brand/40' : 'border-divider'"
              @click="care.openDetail(careCaseFlag(c))"
            >
              <!-- promotion ribbon -->
              <div v-if="c.promotedFrom" class="mb-1.5 -mx-2 -mt-2 rounded-t-lg bg-brand/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-brand">
                Two signals at once
              </div>

              <div class="flex items-center gap-2">
                <img v-if="c.avatar" :src="c.avatar" :alt="c.name" class="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-divider" loading="lazy" />
                <div v-else class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">{{ initials(c.name) }}</div>
                <div class="min-w-0">
                  <div class="truncate text-[12px] font-semibold leading-tight text-ink">{{ c.name }}</div>
                  <div class="truncate text-[10px] text-ink-muted">{{ c.detail }}</div>
                </div>
              </div>

              <!-- Actions only on the pastor's own lane. Serving and Groups
                   route to ministry and group leaders, which the lane labels
                   say, so buttons there would imply the wrong owner. -->
              <div v-if="t.key === 'family'" class="mt-2 flex flex-wrap items-center gap-1.5" @click.stop>
                <template v-if="c.draft">
                  <button
                    class="rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-ink-inverse hover:bg-brand-hover"
                    @click="markHandled(c)"
                  >Approve</button>
                  <button
                    class="rounded-md border border-divider px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:text-ink"
                    @click="care.openDetail(careCaseFlag(c))"
                  >Review note</button>
                </template>
                <button
                  v-else-if="s.key === 'escalated'"
                  class="rounded-md border border-divider px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-surface-elevated"
                  @click="markHandled(c)"
                >Mark called</button>
              </div>

              <!-- signal badges -->
              <div v-if="c.predicted || c.channel || c.outcome" class="mt-1.5 flex flex-wrap gap-1">
                <span v-if="c.predicted" class="rounded bg-danger/12 px-1.5 py-0.5 text-[9px] font-semibold text-danger">Grace called it</span>
                <span v-if="c.channel" class="rounded bg-brand/12 px-1.5 py-0.5 text-[9px] font-semibold text-brand">{{ c.channel }}</span>
                <span v-if="c.outcome" class="rounded bg-success/15 px-1.5 py-0.5 text-[9px] font-semibold text-success">{{ c.outcome }}</span>
              </div>

              <p v-if="c.note" class="mt-1.5 text-[10px] leading-snug text-ink-muted">{{ c.note }}</p>

              <div class="mt-1.5 flex items-center justify-between gap-1 text-[10px] text-ink-disabled">
                <span class="truncate">{{ c.owner }}</span>
                <span class="shrink-0">{{ c.age }}</span>
              </div>
            </article>
            <div v-if="s.key === 'flagged' && moreFlagged(t.key)" class="px-1 py-1 text-[10px] text-ink-disabled">
              +{{ moreFlagged(t.key) }} more in the directory below
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- legend + honesty -->
    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-muted">
      <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-brand"></span> flagged by two signals at once</span>
      <span class="inline-flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-danger"></span> Grace predicted the drop</span>
      <span class="text-ink-disabled">Grace flags and drafts. Moving a card is yours, at the approval and escalation gates.</span>
    </div>
    <p class="mt-2 text-[11px] text-ink-disabled">
      The process on your real people. A family drops off this board entirely once their kids check back in, so there is no "resolved" pile to work through. Reaching out and Watching arrive with the auto-advancing engine (stage tracking, escalation timers); until then a card sits in Flagged until you act on it.
    </p>
  </section>
</template>
