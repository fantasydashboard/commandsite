<script setup lang="ts">
/**
 * Today, for one person.
 *
 * ── What was wrong ────────────────────────────────────────────────────────
 * Today never looked at who was logged in. `viewAs` defaulted to 'all' and only
 * changed when someone clicked the switcher, so every user landed on the
 * leadership rollup: church-wide approvals, the Monday rollup, the duplicates
 * card. A Serving-only staffer saw pastoral items, which contradicts the page
 * permissions and contradicts what staff were told when they were invited.
 *
 * The existing PersonalTodayView was not the answer either: it filters baked
 * fixtures (focalPointApproval, the hand-authored carePipeline cases) by
 * hardcoded role guesses in staff.ts, whose own comment calls them "a STARTING
 * ASSUMPTION". Routing people there would have shown them demo content.
 *
 * ── What this does instead ────────────────────────────────────────────────
 * Sections come from the user's REAL page assignment (allowed_tabs, set in
 * Settings > Team), and their contents come from the SAME live getters the pages
 * themselves read. So Today is a genuine aggregation of that person's work
 * rather than a second, drifting copy of it. If a number here disagrees with the
 * page, that is a bug in one shared source rather than two sources disagreeing.
 *
 * Deliberately counts and top items only. Today's job is "is there anything for
 * me, and how much", then hand off. Re-implementing approve/send here would give
 * every queue two code paths to keep honest.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { guestPipelineData, rosterData } from '@/lib/clients/church/careDataLoader'
import { familyCases } from '@/lib/clients/focal-point/familyPipeline'
import { carePipeline, type CareCase } from '@/lib/clients/focal-point/carePipeline'
import { congregationOf } from '@/lib/clients/focal-point/congregationLive'
import { servingResumedByName } from '@/lib/clients/focal-point/servingLive'
import { useCongregationLens } from '@/stores/congregationLens'
import { useCareActions } from '@/stores/careActions'
import { careCaseFlag } from '@/lib/clients/focal-point/flags'
import DataFreshnessBadge from './DataFreshnessBadge.vue'

const props = defineProps<{ slug: string; tabs: string[]; name?: string | null }>()

const router = useRouter()
const care = useCareActions()
const lens = useCongregationLens()

function go(tab: string) {
  router.push({ name: 'dashboard.tab', params: { slug: props.slug, tab } })
}

const has = (tab: string) => props.tabs.includes(tab)

// Guest welcomes waiting on approval. Same two conditions the Front Desk queue
// applies: a card is actionable only when it carries a draft, and the
// congregation lens scopes it. No cap here, unlike the page, which shows the
// first 8: Today's job is to report the true size of the pile.
const guests = computed(() =>
  has('front-desk-guests')
    ? guestPipelineData().cases.filter(
        (c) => (c as { draft?: string }).draft && (lens.scope === 'all' || c.campus === lens.scope),
      )
    : [],
)

// Family drift, split the way Care & Drift splits it: notes to approve, and
// escalated households that want a call instead. `shown` is CareDriftPriority's
// predicate, reproduced so a dismissed or snoozed person cannot reappear on
// Today after a colleague cleared them, and so the lens agrees across pages.
const inScope = (c: CareCase) => lens.scope === 'all' || congregationOf(c.name) === lens.scope
const notReturned = (c: CareCase) => !(c.track === 'serving' && servingResumedByName(c.name))
const shown = (c: CareCase) => !care.isHidden(careCaseFlag(c).id) && inScope(c) && notReturned(c)

const careDrafts = computed(() =>
  has('care-drift') ? familyCases().filter((c) => c.stage === 'flagged' && shown(c)) : [],
)
const careCalls = computed(() => {
  if (!has('care-drift')) return []
  const escalated = familyCases().filter((c) => c.stage === 'escalated' && shown(c))
  // Cross-track promotions ride along on the page, so they ride along here.
  const promoted = carePipeline.cases.filter(
    (c) => c.stage === 'escalated' && c.track !== 'burnout' && (c.promotedFrom || c.track !== 'family') && shown(c),
  )
  return [...escalated, ...promoted]
})

// Serving gaps that can actually be filled now. A team with nobody left to ask
// is a different conversation (recruiting, not asking), so it does not inflate a
// number that is supposed to reach zero this week.
const fills = computed(() =>
  has('sundays-comms') ? rosterData().gaps.filter((g) => g.suggest.length) : [],
)

interface Item { key: string; tab: string; label: string; count: number; sub: string; names: string[]; cta: string }

const items = computed<Item[]>(() => {
  const out: Item[] = []
  if (guests.value.length) {
    out.push({
      key: 'guests', tab: 'front-desk-guests',
      label: guests.value.length === 1 ? 'welcome to approve' : 'welcomes to approve',
      count: guests.value.length,
      sub: "This week's first-time guests. Approve to send.",
      names: guests.value.slice(0, 3).map((c) => c.name),
      cta: 'Open Front Desk',
    })
  }
  if (careDrafts.value.length) {
    out.push({
      key: 'care', tab: 'care-drift',
      label: careDrafts.value.length === 1 ? 'note to approve' : 'notes to approve',
      count: careDrafts.value.length,
      sub: 'Families whose kids have stopped checking in.',
      names: careDrafts.value.slice(0, 3).map((c) => c.name),
      cta: 'Open Care & Drift',
    })
  }
  if (careCalls.value.length) {
    out.push({
      key: 'calls', tab: 'care-drift',
      label: careCalls.value.length === 1 ? 'call to make' : 'calls to make',
      count: careCalls.value.length,
      sub: 'Long-standing families, gone a while. Worth your voice, not a note.',
      names: careCalls.value.slice(0, 3).map((c) => c.name),
      cta: 'Open Care & Drift',
    })
  }
  if (fills.value.length) {
    out.push({
      key: 'serving', tab: 'sundays-comms',
      label: fills.value.length === 1 ? 'team to fill' : 'teams to fill',
      count: fills.value.length,
      sub: 'This Sunday, with someone to ask for each.',
      names: fills.value.slice(0, 3).map((g) => g.team),
      cta: 'Open Serving',
    })
  }
  return out
})

const total = computed(() => items.value.reduce((a, i) => a + i.count, 0))
const firstName = computed(() => (props.name ?? '').trim().split(' ')[0])

// Someone invited before their pages were ticked has an empty Today for a
// completely different reason than someone who is caught up. Telling them
// "you're clear" would be a lie they cannot diagnose, and the likeliest outcome
// is that they never log in again.
const noPages = computed(() => items.value.length === 0 && !props.tabs.some((t) => t !== 'today'))

// Insights and Giving are reading surfaces: they have no queue, so they can
// never put anything on Today. Whoever is over them would otherwise see "you're
// clear" forever and reasonably conclude the tool is broken for them, so name
// their pages and send them there instead.
const QUEUE_TABS = ['front-desk-guests', 'care-drift', 'sundays-comms']
const readOnly = computed(
  () => !noPages.value && !props.tabs.some((t) => QUEUE_TABS.includes(t)),
)
const readOnlyTab = computed(() => props.tabs.find((t) => t !== 'today') ?? 'insights')
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <span class="eyebrow">Today</span>
        <h3 class="mt-1 text-lg font-bold text-ink">
          <template v-if="noPages">
            No pages assigned yet<template v-if="firstName">, {{ firstName }}</template>
          </template>
          <template v-else-if="readOnly">
            Nothing to approve<template v-if="firstName">, {{ firstName }}</template>
          </template>
          <template v-else-if="total">
            {{ total }} {{ total === 1 ? 'thing needs' : 'things need' }} you<template v-if="firstName">, {{ firstName }}</template>
          </template>
          <template v-else>
            You're clear<template v-if="firstName">, {{ firstName }}</template>
          </template>
        </h3>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <!-- A scoped staffer never sees the leadership rollup, which is where
             the freshness badge used to live exclusively. They had no way to
             tell whether an empty list meant "nothing to do" or "nothing has
             synced". -->
        <DataFreshnessBadge resource="drift" />
        <span class="text-[11px] text-ink-muted">Just your pages</span>
      </div>
    </div>

    <p v-if="noPages" class="mt-1 max-w-2xl text-sm text-ink-muted">
      Your account is set up, but nobody has been given a page to look after yet. Tell Josh which
      area is yours and it will show up here.
    </p>

    <div v-else-if="readOnly" class="mt-1 max-w-2xl">
      <p class="text-sm text-ink-muted">
        Your pages are reporting, not a queue, so nothing lands here for you to approve. Head
        straight to them.
      </p>
      <button
        type="button"
        class="mt-3 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-hover"
        @click="go(readOnlyTab)"
      >Open my pages</button>
    </div>

    <p v-else-if="!total" class="mt-1 max-w-2xl text-sm text-ink-muted">
      Nothing waiting on you right now. Grace is still watching in the background and this fills
      back up as people visit, drift, or a Sunday gets close.
    </p>

    <ul v-else class="mt-4 divide-y divide-divider border-t border-divider">
      <li v-for="i in items" :key="i.key" class="flex flex-wrap items-center gap-4 py-3">
        <span class="w-10 shrink-0 text-2xl font-bold tabular-nums text-brand">{{ i.count }}</span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-ink">{{ i.label }}</div>
          <div class="text-[11px] text-ink-muted">{{ i.sub }}</div>
          <div v-if="i.names.length" class="mt-0.5 truncate text-[11px] text-ink-disabled">
            {{ i.names.join(' · ') }}<template v-if="i.count > i.names.length"> · +{{ i.count - i.names.length }} more</template>
          </div>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-hover"
          @click="go(i.tab)"
        >{{ i.cta }}</button>
      </li>
    </ul>

    <p v-if="!noPages" class="mt-3 text-[11px] leading-relaxed text-ink-disabled">
      This only shows the pages you're assigned. Everything here is the same live data as the
      page it links to, so the numbers can never drift apart.
    </p>
  </section>
</template>
