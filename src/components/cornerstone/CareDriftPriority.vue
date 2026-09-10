<script setup lang="ts">
/**
 * Focal Point - "Needs you this week." The pastor's action list ONLY, read from
 * the same carePipeline source of truth as the board below (so states never
 * contradict). Two things his hands touch: family drafts to approve, and
 * escalated cases to call. Serving and burnout are not here on purpose, they go
 * to the ministry leaders via the Monday digest.
 */
import { computed } from 'vue'
import { carePipeline, type CareCase } from '@/lib/clients/focal-point/carePipeline'
import { useCareActions } from '@/stores/careActions'
import { useCongregationLens } from '@/stores/congregationLens'
import { congregationOf } from '@/lib/clients/focal-point/congregationLive'
import { servingResumedByName } from '@/lib/clients/focal-point/servingLive'
import { familyCases } from '@/lib/clients/focal-point/familyPipeline'
import { careCaseFlag } from '@/lib/clients/focal-point/flags'

const care = useCareActions()
const lens = useCongregationLens()
const inScope = (c: CareCase) => lens.scope === 'all' || congregationOf(c.name) === lens.scope
// familyCases already excludes families who returned; only serving needs the
// resumed check here. Dismiss/snooze and this session's approvals also hide one.
const notReturned = (c: CareCase) => !(c.track === 'serving' && servingResumedByName(c.name))
const shown = (c: CareCase) =>
  !care.isHandled(c.id) && !care.isHidden(careCaseFlag(c).id) && inScope(c) && notReturned(c)

// Real family drift, split by severity: established and long-gone families are
// personal calls; the rest are drafted notes to approve. A cross-track promotion
// (a lapsed volunteer escalated to pastoral) rides along.
const approvals = computed(() => familyCases().filter((c) => c.stage === 'flagged' && shown(c)))
const calls = computed(() => {
  const realEscalated = familyCases().filter((c) => c.stage === 'escalated' && shown(c))
  const promoted = carePipeline.cases.filter(
    (c) => c.stage === 'escalated' && c.track !== 'burnout' && (c.promotedFrom || c.track !== 'family') && shown(c),
  )
  return [...realEscalated, ...promoted]
})
// EVERY note awaiting approval plus every escalated call. This used to count
// only the three drafts the queue happened to render, so the headline number was
// set by a display cap rather than by the work: it said 12 when 33 things were
// waiting. Now that the list is gone and the board holds the cards, the count
// has no reason to lie.
const actionCount = computed(() => approvals.value.length + calls.value.length)
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Needs you this week</span>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Live from Planning Center
      </span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">
      {{ actionCount }} {{ actionCount === 1 ? 'thing' : 'things' }} only you can do
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      Notes to approve and escalated calls to make, all on the board below. Approve straight from a
      card, or open one to read the note beside the check-in history behind it. Serving lapses route
      to the ministry leaders, and over-serving lives under Serving.
    </p>
  </section>

  <!-- The two lists that used to live here, "To approve" and "Escalated, to
       call", were the board's family lane with buttons attached: the same 12
       cards rendered twice on one screen. The board now carries the actions,
       and the drafted note opens in the detail drawer beside the check-in
       history that justifies it, which is more context than this queue ever
       had. What survives is the count, because "12 things need you" is the
       sentence worth reading before you scroll. -->
</template>
