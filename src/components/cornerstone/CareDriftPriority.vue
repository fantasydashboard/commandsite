<script setup lang="ts">
/**
 * Focal Point - "Needs you this week." The pastor's action list ONLY, read from
 * the same carePipeline source of truth as the board below (so states never
 * contradict). Two things his hands touch: family drafts to approve, and
 * escalated cases to call. Serving and burnout are not here on purpose, they go
 * to the ministry leaders via the Monday digest.
 */
import { computed, ref } from 'vue'
import { carePipeline, type CareCase, type Track } from '@/lib/clients/focal-point/carePipeline'
import { useCareActions } from '@/stores/careActions'
import { useCongregationLens } from '@/stores/congregationLens'
import { congregationOf } from '@/lib/clients/focal-point/congregation'
import { servingResumedByName } from '@/lib/clients/focal-point/servingLive'
import { familyCases } from '@/lib/clients/focal-point/familyPipeline'
import { careCaseFlag } from '@/lib/clients/focal-point/flags'

const care = useCareActions()
const lens = useCongregationLens()
const inScope = (c: CareCase) => lens.scope === 'all' || congregationOf(c.name) === lens.scope
// familyCases already excludes families who returned; only serving needs the
// resumed check here. Dismiss/snooze + resolved-this-session also hide a card.
const notReturned = (c: CareCase) => !(c.track === 'serving' && servingResumedByName(c.name))
const resolved = ref<Set<string>>(new Set())
const shown = (c: CareCase) =>
  !resolved.value.has(c.id) && !care.isHidden(careCaseFlag(c).id) && inScope(c) && notReturned(c)

// The pastor's list is the REAL family drift data, split by severity: established
// + long-gone families are personal calls; the rest are drafted notes to approve.
// A cross-track promotion (a lapsed volunteer escalated to pastoral) rides along.
const APPROVE_CAP = 3
const approvalsAll = computed(() => familyCases().filter((c) => c.stage === 'flagged' && shown(c)))
const approvals = computed(() => approvalsAll.value.slice(0, APPROVE_CAP))
const moreApprovals = computed(() => approvalsAll.value.length - approvals.value.length)
const calls = computed(() => {
  const realEscalated = familyCases().filter((c) => c.stage === 'escalated' && shown(c))
  const promoted = carePipeline.cases.filter(
    (c) => c.stage === 'escalated' && c.track !== 'burnout' && (c.promotedFrom || c.track !== 'family') && shown(c),
  )
  return [...realEscalated, ...promoted]
})
// The header counts the immediate queue shown here (top drafts + the calls), not
// every drafted note; the "+N more" line and the board carry the rest.
const actionCount = computed(() => approvals.value.length + calls.value.length)

// NOTE: this only marks the card handled locally. It deliberately does NOT
// claim to send. Family drift cases are derived from kids' check-in names, so
// DriftFamily has no person_id and no email address: there is literally nobody
// to send to until parent contacts are linked. The button therefore reads
// "Approve note", not "Approve & send" (Front Desk, which has a person_id, does
// really send). A button that says it sent when nothing was sent is the exact
// failure we fixed on the guest queue.
function done(id: string) {
  resolved.value = new Set(resolved.value).add(id)
}
function initials(name: string): string {
  const clean = name.replace(/^The\s+/i, '').replace(/\s+family$/i, '')
  return clean.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
const TRACK_LABEL: Record<Track, string> = { family: 'Family drifting', serving: 'Stopped serving', burnout: 'Burnout risk', groups: 'Group drift' }
const TRACK_CLS: Record<Track, string> = { family: 'bg-warn/15 text-warn', serving: 'bg-accent/15 text-accent', burnout: 'bg-danger/12 text-danger', groups: 'bg-brand/12 text-brand' }

function avatarBlock(c: CareCase) { return c.avatar }
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
      Just your actions: notes to approve and escalated calls to make. Everyone drifting or lapsed is tracked on the board below. Serving lapses route to the ministry leaders. Over-serving lives under Serving now.
    </p>
  </section>

  <!-- To approve -->
  <div v-if="approvals.length" class="space-y-3">
    <div class="flex items-center gap-3 px-1">
      <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">To approve</span>
      <span class="h-px flex-1 bg-divider"></span>
    </div>
    <article v-for="c in approvals" :key="c.id" class="card flex flex-col gap-3 sm:flex-row sm:items-start">
      <img v-if="avatarBlock(c)" :src="c.avatar" :alt="c.name" class="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-divider" loading="lazy" />
      <div v-else class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">{{ initials(c.name) }}</div>

      <div class="min-w-0 flex-1 cursor-pointer" @click="care.openDetail(careCaseFlag(c))">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" :class="TRACK_CLS[c.track]">{{ TRACK_LABEL[c.track] }}</span>
          <span class="text-sm font-semibold text-ink">{{ c.name }}</span>
        </div>
        <p class="mt-0.5 text-[12px] text-ink-muted">{{ c.detail }}</p>
        <p v-if="c.draft" class="mt-2 rounded-lg border border-divider bg-surface-elevated/40 px-3 py-2 text-[13px] italic leading-relaxed text-ink">
          "{{ c.draft }}"
        </p>
      </div>

      <div class="flex shrink-0 flex-row gap-2 sm:w-28 sm:flex-col">
        <button class="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-hover" @click="done(c.id)">Approve note</button>
        <button class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink">Edit</button>
        <button class="px-3 py-1 text-xs text-ink-muted hover:text-ink">Skip</button>
      </div>
    </article>
    <p v-if="moreApprovals" class="px-1 text-[11px] text-ink-muted">
      Grace drafted {{ moreApprovals }} more {{ moreApprovals === 1 ? 'note' : 'notes' }} for the other flagged families. Review them on the board and directory below.
    </p>
  </div>

  <!-- To call -->
  <div v-if="calls.length" class="space-y-3">
    <div class="flex items-center gap-3 px-1">
      <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-danger">Escalated, to call</span>
      <span class="h-px flex-1 bg-divider"></span>
    </div>
    <article v-for="c in calls" :key="c.id" class="card flex flex-col gap-3 sm:flex-row sm:items-center">
      <img v-if="avatarBlock(c)" :src="c.avatar" :alt="c.name" class="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-divider" loading="lazy" />
      <div v-else class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">{{ initials(c.name) }}</div>

      <div class="min-w-0 flex-1 cursor-pointer" @click="care.openDetail(careCaseFlag(c))">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" :class="TRACK_CLS[c.track]">{{ TRACK_LABEL[c.track] }}</span>
          <span class="text-sm font-semibold text-ink">{{ c.name }}</span>
          <span v-if="c.promotedFrom" class="rounded bg-brand/12 px-1.5 py-0.5 text-[10px] font-semibold text-brand">Two signals at once</span>
        </div>
        <p class="mt-0.5 text-[12px] text-ink-muted">{{ c.detail }}</p>
        <p v-if="c.note" class="mt-1 text-[12px] leading-snug text-ink">{{ c.note }}</p>
      </div>

      <div class="flex shrink-0 flex-col items-stretch gap-1.5 sm:w-32">
        <span v-if="c.channel" class="rounded-md bg-brand/10 px-2 py-1 text-center text-[10px] font-semibold text-brand">{{ c.channel }}</span>
        <button class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink" @click="done(c.id)">Mark called</button>
      </div>
    </article>
  </div>

  <p v-if="!actionCount" class="card text-center text-sm text-ink-muted">All caught up. Nice work.</p>
</template>
