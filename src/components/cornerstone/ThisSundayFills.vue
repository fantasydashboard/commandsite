<script setup lang="ts">
/**
 * Focal Point - "This Sunday, Grace's fills" (Serving).
 *
 * Split out of SundayReadinessBoard so it can sit at the TOP of the page.
 *
 * It used to be the third section inside that component, which put the only
 * clickable thing on Serving below four KPI tiles and a nine-row grid. The page
 * read as a report. For a page with one accountable owner it needs to read as a
 * to-do list: the first thing they see should be the thing they can finish, and
 * it should carry a count so "am I done" is answerable at a glance. That is what
 * "6 waiting on you" does on Front Desk and "9 things only you can do" does on
 * Care & Drift; Serving had no equivalent.
 *
 * Context still comes first, but as ONE line rather than a grid. "Draft the ask"
 * is meaningless without knowing which Sunday and how short, and meaningless
 * buried under everything that explains it.
 */
import { computed, ref } from 'vue'
import type { RosterGap } from '@/lib/clients/focal-point/roster'
import { rosterData, signatureFor } from '@/lib/clients/church/careDataLoader'

const r = computed(() => rosterData())

// Teams that draw from a qualified pool rather than anyone willing.
const SKILL_TEAMS = new Set(['Band', 'Vocals', 'Translation Team'])

const asked = ref<Set<string>>(new Set())
function ask(team: string) { asked.value = new Set(asked.value).add(team) }
function firstName(n: string) { return n.split(' ')[0] }
function askDraft(g: RosterGap): string {
  const who = g.suggest.map(firstName).join(' and ')
  return `Hey ${who}, we are a little short on the ${g.team} for this Sunday and you have both been great in this spot before. Any chance you could jump in? Totally fine if not. Thank you, ${signatureFor()} (via Grace)`
}

// The completable unit. Teams with a suggestion are the ones the owner can
// actually act on now; teams with an empty pool are a different conversation and
// are counted separately so the "done" number stays honest.
const actionable = computed(() => r.value.gaps.filter((g) => g.suggest.length && !asked.value.has(g.team)))
const stuck = computed(() => r.value.gaps.filter((g) => !g.suggest.length))
const doneCount = computed(() => asked.value.size)
</script>

<template>
  <section class="card border-2 border-brand/40 bg-brand/[0.03]">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Needs you this Sunday</span>
      <span class="text-[11px] text-ink-muted">burnout-aware · {{ r.sundayLabel }}</span>
    </div>

    <h3 class="mt-1 text-lg font-bold text-ink">
      <template v-if="actionable.length">
        {{ actionable.length }} {{ actionable.length === 1 ? 'team' : 'teams' }} you can fill right now
      </template>
      <template v-else-if="doneCount">All {{ doneCount }} asks drafted</template>
      <template v-else>Nothing to fill this Sunday</template>
    </h3>

    <!-- One line of context, not a grid. Enough to make the buttons mean
         something without burying them. -->
    <p class="mt-1 text-sm text-ink-muted">
      {{ r.sundayLabel.replace('Sun ', '') }} is <strong class="text-ink">{{ r.totalShort }} spots short</strong>
      across {{ r.teamsShort }} teams.
      <template v-if="stuck.length">
        {{ stuck.length }} of those have nobody left with capacity, so they need a different conversation.
      </template>
    </p>

    <div class="mt-4 divide-y divide-divider border-t border-divider">
      <div v-for="g in r.gaps" :key="g.team" class="py-3 last:pb-0">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-ink">{{ g.team }}</span>
              <span class="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">{{ g.short }} short</span>
              <span v-if="SKILL_TEAMS.has(g.team)" class="rounded bg-brand/12 px-1.5 py-0.5 text-[10px] font-semibold text-brand">needs skills, qualified pool only</span>
            </div>
            <div v-if="g.suggest.length" class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span class="text-[11px] font-medium text-ink-muted">Ask:</span>
              <span v-for="n in g.suggest" :key="n" class="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">{{ n }}</span>
            </div>
            <!-- pool 0 with people on the team is NOT "no volunteer pool": it
                 means everyone who has served this team is already over-serving,
                 which is a structural problem, not an admin one. -->
            <p v-else-if="g.pool === 0 && g.skip" class="mt-1.5 text-[11px] font-medium text-danger">
              Nobody left to ask. Everyone who serves {{ g.team }} is already at high load.
            </p>
            <p v-else class="mt-1.5 text-[11px] text-ink-muted">No volunteer pool on file, this one is staff-run. Handle in-house.</p>
            <p v-if="g.skip" class="mt-1 text-[11px] text-ink-muted">
              <span class="font-medium text-danger">Not {{ g.skip.name }}</span> &middot; {{ g.skip.reason }}
            </p>
            <p v-if="g.fresh" class="mt-0.5 text-[11px] text-ink-muted">
              <span class="font-medium text-brand">Fresh capacity:</span> {{ g.fresh }}
            </p>
          </div>
          <div v-if="g.suggest.length" class="shrink-0">
            <button v-if="!asked.has(g.team)" class="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-hover" @click="ask(g.team)">Draft the ask</button>
            <span v-else class="inline-flex items-center rounded-md bg-success/12 px-2.5 py-1 text-xs font-semibold text-success">Ask drafted</span>
          </div>
        </div>
        <p v-if="asked.has(g.team)" class="mt-2 rounded-lg border border-divider bg-surface-elevated/40 px-3 py-2 text-[12px] italic leading-relaxed text-ink">"{{ askDraft(g) }}"</p>
      </div>
    </div>

    <p class="mt-3 text-[11px] text-ink-disabled">
      Grace drafts each ask; you approve before it sends. Nobody at burnout risk gets asked, and
      skill teams draw only from qualified people.
    </p>
  </section>
</template>
