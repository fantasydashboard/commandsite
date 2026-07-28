<script setup lang="ts">
/**
 * Focal Point - Settings: Possible duplicates review list.
 * The full set of likely-duplicate profiles Grace found in Planning Center, with
 * the ones that currently affect a care/drift flag surfaced first (those should
 * be reviewed before acting, since a split check-in history can make a flag a
 * false alarm). Planning Center owns the merge; each profile deep-links there.
 */
import { computed, ref } from 'vue'
import { type DupInfo } from '@/lib/clients/focal-point/duplicates'
import { allDuplicateRows, duplicateStats } from '@/lib/clients/focal-point/duplicateReview'

const rows = computed(() => allDuplicateRows())
const stats = computed(() => duplicateStats())
const needsReview = computed(() => rows.value.filter((r) => r.flags.length))
const falseAlarms = computed(() => needsReview.value.filter((r) => r.reconcile?.verdict === 'review'))

type Filter = 'all' | 'high' | 'review'
const filter = ref<Filter>('all')
const visible = computed(() => {
  if (filter.value === 'review') return rows.value.filter((r) => r.flags.length)
  if (filter.value === 'high') return rows.value.filter((r) => r.confidence === 'high')
  return rows.value
})

// The list can be 100+ rows. Show a preview and let the user expand, so the
// review list does not push the rest of Settings far off-screen. Collapse resets
// when the filter changes so a filtered view starts from the top.
const PREVIEW = 12
const showAll = ref(false)
const shown = computed(() => (showAll.value ? visible.value : visible.value.slice(0, PREVIEW)))

const open = ref<string | null>(null)
function toggle(name: string) {
  open.value = open.value === name ? null : name
}
const pcoUrl = (id: string) => `https://people.planningcenteronline.com/people/${id}`

function sharedText(d: DupInfo): string {
  const parts: string[] = []
  if (d.sharedEmail) parts.push('email')
  if (d.sharedPhone) parts.push('phone')
  return parts.length ? `shares ${parts.join(' + ')}` : 'same name only'
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(iso: string): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-').map(Number)
  return `${MON[m - 1]} ${d}`
}
</script>

<template>
  <section class="card">
    <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Possible Duplicates</span>
      <a
        href="https://people.planningcenteronline.com/people"
        target="_blank"
        rel="noopener"
        class="text-xs font-semibold text-brand hover:underline"
      >Open Planning Center People</a>
    </div>
    <p class="max-w-2xl text-sm text-ink-muted">
      Profiles that look like the same person across your Planning Center records. Grace uses these to avoid a false alarm (someone checked in under two profiles can look like they stopped). Planning Center owns the merge, this is your review list.
    </p>

    <!-- stat strip -->
    <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-md border border-divider p-3">
        <div class="text-2xl font-bold tabular-nums text-ink">{{ stats.clusters }}</div>
        <div class="text-[11px] text-ink-muted">possible duplicates</div>
      </div>
      <div class="rounded-md border border-divider p-3">
        <div class="text-2xl font-bold tabular-nums text-ink">{{ stats.highConfidence }}</div>
        <div class="text-[11px] text-ink-muted">high confidence</div>
      </div>
      <div class="rounded-md border border-divider p-3">
        <div class="text-2xl font-bold tabular-nums text-ink">{{ stats.extraProfiles }}</div>
        <div class="text-[11px] text-ink-muted">extra profiles to merge</div>
      </div>
      <div class="rounded-md border p-3" :class="needsReview.length ? 'border-warn/40 bg-warn/5' : 'border-divider'">
        <div class="text-2xl font-bold tabular-nums" :class="needsReview.length ? 'text-warn' : 'text-ink'">{{ needsReview.length }}</div>
        <div class="text-[11px]" :class="needsReview.length ? 'text-warn' : 'text-ink-muted'">affecting a care flag</div>
      </div>
    </div>

    <!-- review-first callout -->
    <div v-if="needsReview.length" class="mt-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-3">
      <div class="flex items-center gap-1.5">
        <svg viewBox="0 0 16 16" class="h-3.5 w-3.5 text-warn" fill="currentColor"><path d="M8 1.5 15 14H1z" /></svg>
        <span class="text-[12px] font-semibold text-warn">On a care list right now</span>
      </div>
      <p class="mt-1 text-[12px] leading-relaxed text-ink">
        {{ needsReview.length }} people on a care or drift list also have duplicate profiles. Grace reconciled each one, combining their check-ins across profiles.
        <template v-if="falseAlarms.length">{{ falseAlarms.length }} may be a false alarm and should be checked before anyone reaches out.</template>
        <template v-else>All {{ needsReview.length }} flags held after reconciling, the activity was all on one profile, so merging is cleanup that keeps future flags accurate.</template>
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <span
          v-for="r in needsReview"
          :key="r.name"
          class="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]"
          :class="r.reconcile?.verdict === 'review' ? 'border-warn/40 bg-warn/5' : 'border-divider bg-surface-raised'"
        >
          <span class="font-semibold text-ink">{{ r.name }}</span>
          <span class="text-ink-muted">{{ r.flags.join(', ') }}</span>
          <span
            class="rounded px-1 py-0.5 text-[9px] font-semibold uppercase"
            :class="r.reconcile?.verdict === 'review' ? 'bg-warn/20 text-warn' : 'bg-surface-elevated text-ink-muted'"
          >{{ r.reconcile?.verdict === 'review' ? 'check' : 'confirmed' }}</span>
        </span>
      </div>
    </div>

    <!-- filters -->
    <div class="mt-4 flex items-center gap-1.5 text-xs">
      <button
        v-for="f in (['all','high','review'] as const)"
        :key="f"
        class="rounded-md px-2.5 py-1 font-medium transition-colors"
        :class="filter === f ? 'bg-brand text-white' : 'border border-divider text-ink-muted hover:text-ink'"
        @click="filter = f; showAll = false"
      >
        {{ f === 'all' ? `All ${rows.length}` : f === 'high' ? 'High confidence' : `Needs review ${needsReview.length}` }}
      </button>
    </div>

    <!-- list -->
    <div class="mt-3 overflow-hidden rounded-md border border-divider">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-divider bg-surface-elevated/40 text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th class="px-3 py-2 font-medium">Person</th>
            <th class="px-3 py-2 font-medium">Profiles</th>
            <th class="px-3 py-2 font-medium">Match</th>
            <th class="px-3 py-2 font-medium">Confidence</th>
            <th class="px-3 py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in shown" :key="r.name">
            <tr
              class="cursor-pointer border-b border-divider/60 transition-colors hover:bg-surface-elevated/40"
              :class="open === r.name ? 'bg-surface-elevated/40' : ''"
              @click="toggle(r.name)"
            >
              <td class="px-3 py-2 font-medium text-ink">
                <span class="inline-flex items-center gap-1.5">
                  <svg viewBox="0 0 20 20" class="h-3 w-3 text-ink-disabled transition-transform" :class="open === r.name ? 'rotate-90' : ''" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 5l6 5-6 5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  {{ r.name }}
                </span>
              </td>
              <td class="px-3 py-2 tabular-nums text-ink-muted">{{ r.count }}</td>
              <td class="px-3 py-2 text-[12px] text-ink-muted">{{ sharedText(r) }}</td>
              <td class="px-3 py-2">
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  :class="r.confidence === 'high' ? 'bg-warn/15 text-warn' : 'bg-surface-elevated text-ink-muted'"
                >{{ r.confidence === 'high' ? 'High' : 'Medium' }}</span>
              </td>
              <td class="px-3 py-2 text-right">
                <span
                  v-if="r.reconcile?.verdict === 'review'"
                  class="inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn"
                >
                  <svg viewBox="0 0 16 16" class="h-2.5 w-2.5" fill="currentColor"><path d="M8 1.5 15 14H1z" /></svg>
                  Check flag
                </span>
                <span
                  v-else-if="r.flags.length"
                  class="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand"
                >On a care list</span>
                <span v-else class="text-[11px] text-ink-disabled">Cleanup</span>
              </td>
            </tr>
            <tr v-if="open === r.name" :key="r.name + '-detail'" class="border-b border-divider/60 bg-surface-elevated/20">
              <td colspan="5" class="px-3 py-3">
                <!-- reconciliation verdict: Grace combined the profiles and re-checked the flag -->
                <div
                  v-if="r.reconcile"
                  class="mb-2 rounded-md border px-2.5 py-2 text-[12px] leading-relaxed"
                  :class="r.reconcile.verdict === 'review' ? 'border-warn/40 bg-warn/5 text-ink' : 'border-divider bg-surface-elevated/40 text-ink'"
                >
                  <span class="font-semibold" :class="r.reconcile.verdict === 'review' ? 'text-warn' : 'text-ink'">
                    {{ r.reconcile.verdict === 'review' ? 'Possible false alarm on ' + r.reconcile.flag : r.reconcile.flag + ' confirmed' }}:
                  </span>
                  {{ r.reconcile.note }}
                </div>
                <div class="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{{ r.count }} profiles in Planning Center</div>
                <ul class="mt-1.5 space-y-1">
                  <li
                    v-for="p in r.profiles"
                    :key="p.id"
                    class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]"
                  >
                    <a :href="pcoUrl(p.id)" target="_blank" rel="noopener" class="font-medium text-brand hover:underline">Profile {{ p.id }}</a>
                    <span v-if="p.checkins > 0" class="font-medium text-ink">{{ p.checkins }} check-ins, last {{ fmtDate(p.lastServed) }}</span>
                    <span v-else class="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-ink-disabled">no activity, merge target</span>
                    <span class="text-ink-muted">created {{ p.created }}</span>
                    <span v-if="p.membership !== 'none'" class="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">{{ p.membership }}</span>
                  </li>
                </ul>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <div v-if="visible.length > PREVIEW" class="mt-2 flex justify-center">
      <button
        type="button"
        class="rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-brand hover:border-brand"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Show fewer' : `Show all ${visible.length}` }}
      </button>
    </div>
    <p class="mt-2 text-[11px] text-ink-disabled">
      Click a row to see the individual profiles and open them in Planning Center. Grace does not merge anything, it only surfaces the likely matches.
    </p>
  </section>
</template>
