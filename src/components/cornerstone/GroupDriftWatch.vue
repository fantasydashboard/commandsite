<script setup lang="ts">
/**
 * Focal Point - Group Drift Watch. Members who were regular in their growth group
 * this past season, then went quiet before the summer break. A quiet group member
 * is often the earliest sign someone is drifting from the church. Real, from the
 * Planning Center Groups attendance. Routes to each group leader for a personal
 * check-in before groups restart in the fall.
 */
import { computed, ref } from 'vue'
import { groupDriftData } from '@/lib/clients/church/careDataLoader'
import { exportCsv } from '@/lib/exportCsv'
import ExportButton from '@/components/cornerstone/ExportButton.vue'
import { useCareActions } from '@/stores/careActions'
import { useCongregationLens } from '@/stores/congregationLens'
import { congregationOf } from '@/lib/clients/focal-point/congregationLive'
import { groupFlag } from '@/lib/clients/focal-point/flags'
import DuplicateBadge from '@/components/cornerstone/DuplicateBadge.vue'

const care = useCareActions()
const lens = useCongregationLens()
const COLLAPSED = 12
const showAll = ref(false)
const inScope = (name: string) => lens.scope === 'all' || congregationOf(name) === lens.scope
// Working window, matching families and serving. Group drift was the biggest
// untriaged list on the page (120 people, "+110 more"), which is a directory
// rather than a worklist. Groups also break for summer, so a long gap here is
// often the calendar, not disengagement, which is another reason not to queue
// half the church for a leader to chase.
const WORKING_WEEKS = 26

const props = defineProps<{ clientName: string }>()
const g = computed(() => groupDriftData())
const active = computed(() =>
  g.value.people.filter(
    (p) => !care.isHidden(`group:${p.name}`) && inScope(p.name) && p.weeksSince <= WORKING_WEEKS,
  ),
)
const visible = computed(() => (showAll.value ? active.value : active.value.slice(0, COLLAPSED)))

function onExport() {
  exportCsv(
    active.value,
    [
      { header: 'Name', value: (p2) => p2.name },
      { header: 'Group', value: (p2) => p2.group },
      { header: 'Times attended this season', value: (p2) => p2.attended },
      { header: 'Weeks quiet', value: (p2) => p2.weeksSince },
    ],
    { client: props.clientName, dataset: 'group-drift', scope: lens.scope },
  )
}
</script>

<template>
  <section class="card">
    <div class="flex items-center justify-between">
      <span class="eyebrow">Group Drift Watch</span>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Live from Planning Center Groups
      </span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">{{ active.length }} people went quiet in their group</h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      Regular members who stopped attending during the season, missing their group's last meetings while it was still meeting, not just tapering off for summer. A quiet group member is often the earliest sign someone is slipping away, before the Sunday signal shows it.
    </p>
    <p class="mt-1 text-[11px] text-ink-muted">
      Across {{ g.groups }} groups. Summer, when groups do not meet, is not counted. These route to each group leader for a personal check-in before groups restart in the fall.
    </p>
  </section>

  <section class="card">
    <div class="mb-3 flex items-center justify-between">
      <span class="eyebrow">Flagged members</span>
      <div class="flex items-center gap-3">
        <span class="text-[11px] text-ink-muted">most-invested first</span>
        <ExportButton label="Download list" sensitive :count="active.length" @export="onExport" />
      </div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-divider text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th class="pb-2 font-medium">Person</th>
            <th class="pb-2 font-medium">Group</th>
            <th class="pb-2 font-medium">Attended</th>
            <th class="pb-2 text-right font-medium">Went quiet</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in visible" :key="p.name + p.group" class="cursor-pointer border-b border-divider/60 transition-colors hover:bg-surface-elevated/50" @click="care.openDetail(groupFlag(p))">
            <td class="py-2 font-medium text-ink">{{ p.name }} <DuplicateBadge :name="p.name" /></td>
            <td class="py-2 text-ink-muted">{{ p.group }}</td>
            <td class="py-2 tabular-nums text-ink-muted">{{ p.attended }}x this season</td>
            <td class="py-2 text-right">
              <span class="font-semibold" :class="p.weeksSince >= 14 ? 'text-danger' : 'text-warn'">{{ p.weeksSince }}w</span>
            </td>
          </tr>
          <tr v-if="!g.people.length">
            <td colspan="4" class="py-4 text-center text-ink-muted">List loads from the local Planning Center pull.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="mt-3 flex items-center justify-between">
      <button
        v-if="active.length > COLLAPSED"
        class="text-xs font-semibold text-brand hover:underline"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Show fewer' : `Show all ${active.length} flagged members` }}
      </button>
      <span class="text-[11px] text-ink-disabled">Click a row to see why, or to dismiss / snooze.</span>
    </div>
  </section>
</template>
