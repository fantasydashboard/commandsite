<script setup lang="ts">
/**
 * Apex Calls — sortable list of every call the AI receptionist took,
 * with click-to-listen transcript modal. The transcript is the highest-
 * impact demo moment so this page is built around making "Listen" easy
 * to find on every row.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import { calls, callStats } from '@/lib/clients/apex/calls'
import type { CallRecord, CallOutcome } from '@/lib/clients/apex/types'
import ApexCallTranscriptModal from '@/components/ApexCallTranscriptModal.vue'
import SourceIndicator from '@/components/SourceIndicator.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

type SortKey = 'time' | 'caller' | 'duration' | 'outcome'
const sortBy = ref<SortKey>('time')
const sortDir = ref<'asc' | 'desc'>('desc')
const filterOutcome = ref<CallOutcome | 'all'>('all')

const stats = computed(() => callStats())

const outcomes: { key: CallOutcome | 'all'; label: string; color: string }[] = [
  { key: 'all',        label: 'All',        color: 'rgb(var(--color-brand))' },
  { key: 'dispatched', label: 'Dispatched', color: '#EF4444' },
  { key: 'booked',     label: 'Booked',     color: 'rgb(var(--color-brand))' },
  { key: 'voicemail',  label: 'Voicemail',  color: '#94A3B8' },
  { key: 'opted_out',  label: 'Opted Out',  color: '#64748B' },
]

const outcomeOrder: CallOutcome[] = ['dispatched', 'booked', 'voicemail', 'opted_out']

const filtered = computed<CallRecord[]>(() => {
  let rows = calls
  if (filterOutcome.value !== 'all') {
    rows = rows.filter((c) => c.outcome === filterOutcome.value)
  }
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (sortBy.value === 'caller') return a.caller.localeCompare(b.caller) * dir
    if (sortBy.value === 'duration') return (a.duration - b.duration) * dir
    if (sortBy.value === 'outcome') {
      return (outcomeOrder.indexOf(a.outcome) - outcomeOrder.indexOf(b.outcome)) * dir
    }
    return (new Date(a.time).getTime() - new Date(b.time).getTime()) * dir
  })
})

function toggleSort(k: SortKey) {
  if (sortBy.value === k) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortBy.value = k; sortDir.value = k === 'caller' ? 'asc' : 'desc' }
}
function sortInd(k: SortKey): string {
  if (sortBy.value !== k) return ''
  return sortDir.value === 'asc' ? '↑' : '↓'
}

const detailCall = ref<CallRecord | null>(null)
function openCall(c: CallRecord) { detailCall.value = c }
function closeCall() { detailCall.value = null }

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}m ${sec.toString().padStart(2, '0')}s`
}

function outcomeMeta(o: CallOutcome) {
  switch (o) {
    case 'dispatched': return { label: 'Dispatched',  bg: '#EF4444' }
    case 'booked':     return { label: 'Booked',      bg: 'rgb(var(--color-brand))' }
    case 'voicemail':  return { label: 'Voicemail',   bg: '#94A3B8' }
    case 'opted_out':  return { label: 'Opted Out',   bg: '#64748B' }
  }
}
function leadDotColor(q: string): string {
  if (q === 'hot') return '#EF4444'
  if (q === 'warm') return '#F59E0B'
  return '#94A3B8'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Calls</h2>
        <p class="text-sm text-ink-muted">
          Every call the AI receptionist handled. Click any row to listen — the transcript is the proof CommandSite is doing real work.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <SourceIndicator source="Twilio" :synced-at="new Date(Date.now() - 4 * 60 * 1000).toISOString()" interval="live" />
        <div class="text-xs text-ink-muted">
          <span class="font-semibold text-ink">{{ stats.total }}</span> calls in last 30 days
        </div>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">AI-Handled</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.ai_handled }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Booked</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.booked }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">After-Hours</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.after_hours }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Emergency Dispatched</div>
        <div class="mt-1 text-2xl font-bold text-danger tabular-nums">{{ stats.emergency_dispatched }}</div>
      </div>
    </div>

    <!-- Outcome filter chips -->
    <div class="card">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="o in outcomes"
          :key="o.key"
          type="button"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-white"
          :style="filterOutcome === o.key
            ? { backgroundColor: o.color }
            : { backgroundColor: o.color + '22', color: o.color }"
          @click="filterOutcome = o.key"
        >
          {{ o.label }}
        </button>
      </div>
    </div>

    <!-- Calls table -->
    <section class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('caller')">
                Caller {{ sortInd('caller') }}
              </th>
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('time')">
                When {{ sortInd('time') }}
              </th>
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('duration')">
                Duration {{ sortInd('duration') }}
              </th>
              <th class="px-3 py-2 font-medium">Topic</th>
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('outcome')">
                Outcome {{ sortInd('outcome') }}
              </th>
              <th class="px-3 py-2 font-medium text-right">Listen</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in filtered"
              :key="c.id"
              class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 cursor-pointer transition-colors"
              @click="openCall(c)"
            >
              <td class="px-3 py-2.5">
                <div class="flex items-center gap-2">
                  <span
                    class="h-1.5 w-1.5 rounded-full flex-shrink-0"
                    :style="{ backgroundColor: leadDotColor(c.lead_quality) }"
                    :title="`${c.lead_quality} lead`"
                  ></span>
                  <div>
                    <div class="text-sm font-medium text-ink">{{ c.caller }}</div>
                    <div class="text-[11px] text-ink-muted">{{ c.phone }}</div>
                  </div>
                </div>
              </td>
              <td class="px-3 py-2.5 text-xs text-ink-muted">{{ fmtAgo(c.time) }}</td>
              <td class="px-3 py-2.5 text-xs text-ink tabular-nums">{{ fmtDuration(c.duration) }}</td>
              <td class="px-3 py-2.5 text-xs text-ink-muted">{{ c.job_type ?? '—' }}</td>
              <td class="px-3 py-2.5">
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  :style="{ backgroundColor: outcomeMeta(c.outcome).bg }"
                >{{ outcomeMeta(c.outcome).label }}</span>
              </td>
              <td class="px-3 py-2.5 text-right">
                <button
                  type="button"
                  class="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  :class="c.transcript
                    ? 'bg-brand/10 text-brand hover:bg-brand/20'
                    : 'bg-surface-elevated text-ink-disabled cursor-not-allowed'"
                  :disabled="!c.transcript"
                  @click.stop="c.transcript && openCall(c)"
                >
                  {{ c.transcript ? '▶ Listen' : '— No audio' }}
                </button>
              </td>
            </tr>
            <tr v-if="filtered.length === 0">
              <td colspan="6" class="px-3 py-6 text-center text-sm text-ink-muted italic">
                No calls match this filter.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ApexCallTranscriptModal
      :open="detailCall !== null"
      :call="detailCall"
      @close="closeCall"
    />
  </div>
</template>
