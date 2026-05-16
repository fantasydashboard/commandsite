<script setup lang="ts">
/**
 * Josh Personal — Bloodwork tab.
 *
 * Reads real panels from personal_bloodwork_panels (Phase 4 manual
 * entry). Active concerns derived from latest panel via the marker
 * registry's range thresholds. Mock data falls through ONLY when no
 * real panel exists yet so a brand-new user sees what the surface
 * looks like.
 */
import { ref, computed } from 'vue'
import type { Client } from '@/types/database'
import AssistantMark from '@/components/AssistantMark.vue'
import JoshPersonalBloodworkEntryModal from '@/components/JoshPersonalBloodworkEntryModal.vue'
import JoshPersonalSageChatPanel from '@/components/JoshPersonalSageChatPanel.vue'
import JoshPersonalBloodworkUploadModal from '@/components/JoshPersonalBloodworkUploadModal.vue'
import {
  useBloodwork,
  MARKERS,
  markerStatus,
  type DerivedConcern,
} from '@/lib/clients/josh-personal/bloodworkApi'
// Fall-back mock for "haven't entered any panels yet" state
import {
  bloodwork as mockBloodwork,
  activeConcerns as mockActiveConcerns,
  buildSparklinePath,
} from '@/lib/clients/josh-personal/health'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const { panels, latestPanel, hasAnyPanel, activeConcerns: realConcerns, loading } = useBloodwork()

const entryOpen = ref(false)
const uploadOpen = ref(false)

// Active concerns: real if we have a panel, mock otherwise
const concerns = computed<DerivedConcern[] | typeof mockActiveConcerns>(() => {
  if (hasAnyPanel.value) return realConcerns.value
  return mockActiveConcerns
})

// Markers for the table — real if available, mock otherwise
const showingReal = computed(() => hasAnyPanel.value)
const drawnAtLabel = computed(() => {
  if (!latestPanel.value) return mockBloodwork.drawnAt
  // Format YYYY-MM-DD → "Apr 12, 2026"
  const d = new Date(latestPanel.value.drawn_at + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
})
const drawnByLabel = computed(() => latestPanel.value?.drawn_by ?? mockBloodwork.drawnBy)

// Build a row per marker that the latest panel has values for, sorted
// by status (concerning first), then alphabetic.
type RowDisplay = {
  name: string
  unit: string
  range: string
  status: 'good' | 'warn' | 'danger'
  history: number[]
  trendNote: string
  latest: number
}
type RegistryRow = RowDisplay & { isRegistry: true }
type AdditionalRow = {
  name: string
  unit: string
  history: number[]
  trendNote: string
  latest: number
  isRegistry: false
  key: string
}
type AnyRow = RegistryRow | AdditionalRow

function humanizeKey(key: string): string {
  return key
    .replace(/_(mg|ng|pg|miu|ug|u|g)_(dl|ml|l)$/, '')
    .replace(/_pct$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function unitFromKey(key: string): string {
  const matches = key.match(/_(mg|ng|pg|miu|ug|u|g)_(dl|ml|l)$/)
  if (matches) return `${matches[1]}/${matches[2]}`.replace('miu/l', 'mIU/L').replace('ug/dl', 'µg/dL')
  if (key.endsWith('_pct')) return '%'
  return ''
}

const realMarkerRows = computed<AnyRow[]>(() => {
  if (!latestPanel.value) return []
  const rows: AnyRow[] = []
  const registryKeys = new Set(MARKERS.map((m) => m.key))

  // Pass 1: registry markers (full status / range / sparkline)
  for (const def of MARKERS) {
    const v = latestPanel.value.markers[def.key]
    if (typeof v !== 'number') continue
    const status = markerStatus(def, v)
    if (status === 'unknown') continue

    const history: number[] = []
    for (const p of panels.value.slice().reverse()) {
      const pv = p.markers[def.key]
      if (typeof pv === 'number') history.push(pv)
    }

    rows.push({
      name: def.label,
      unit: def.unit,
      range: def.rangeNote,
      status,
      history,
      trendNote: history.length > 1 ? `${history.length} panels on file` : 'first panel',
      latest: v,
      isRegistry: true,
    })
  }

  // Pass 2: additional markers (anything in markers JSONB not in registry)
  // — extracted from PDFs, displayed verbatim, no in-range coloring
  for (const [key, value] of Object.entries(latestPanel.value.markers)) {
    if (registryKeys.has(key)) continue
    if (typeof value !== 'number') continue

    const history: number[] = []
    for (const p of panels.value.slice().reverse()) {
      const pv = p.markers[key]
      if (typeof pv === 'number') history.push(pv)
    }

    rows.push({
      name: humanizeKey(key),
      unit: unitFromKey(key),
      history,
      trendNote: history.length > 1 ? `${history.length} panels` : 'first panel',
      latest: value,
      isRegistry: false,
      key,
    })
  }

  // Sort: concerns first (registry only), then registry good, then additional
  return rows.sort((a, b) => {
    const aGroup = a.isRegistry
      ? (a.status === 'danger' ? 0 : a.status === 'warn' ? 1 : 2)
      : 3
    const bGroup = b.isRegistry
      ? (b.status === 'danger' ? 0 : b.status === 'warn' ? 1 : 2)
      : 3
    if (aGroup !== bGroup) return aGroup - bGroup
    return a.name.localeCompare(b.name)
  })
})

function statusClass(status: 'good' | 'warn' | 'danger'): string {
  if (status === 'good')   return 'bg-success/15 text-success'
  if (status === 'warn')   return 'bg-warn/15 text-warn'
  return 'bg-danger/15 text-danger'
}
function statusIcon(status: 'good' | 'warn' | 'danger'): string {
  if (status === 'good')   return '✓'
  if (status === 'warn')   return '⚠'
  return '✕'
}

// ── Ask Sage floating chat ──────────────────────────────────────────
const chatOpen = ref(false)
const chatSeedPrompt = ref<string | null>(null)
function onChatClose() {
  chatOpen.value = false
  chatSeedPrompt.value = null
}
function onChatDataChanged(payload: { tools: string[] }) { void payload }
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-xl font-semibold text-ink">Bloodwork</h2>
        <p class="text-xs text-ink-muted mt-0.5">
          Lab panels + active concerns. Concerns become hard constraints in your weekly meal plan.
        </p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          class="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
          @click="uploadOpen = true"
        >
          <AssistantMark class="h-3.5 w-3.5 text-white" />
          Upload PDF
        </button>
        <button
          type="button"
          class="rounded-md bg-surface-raised border border-divider text-ink px-3 py-1.5 text-sm font-semibold hover:border-brand"
          @click="entryOpen = true"
        >
          + Type manually
        </button>
      </div>
    </div>

    <!-- ── Empty state when no panels ──────────────────────────────── -->
    <section
      v-if="!loading && !hasAnyPanel"
      class="rounded-card border-2 border-brand bg-brand/5 p-6"
    >
      <div class="flex items-start gap-4">
        <AssistantMark class="h-8 w-8 text-brand mt-0.5 shrink-0" />
        <div class="flex-1">
          <h3 class="text-lg font-bold text-ink mb-1">Add your first panel</h3>
          <p class="text-sm text-ink-muted mb-3">
            Type in your most recent labs from Quest, LabCorp, or wherever you got drawn. Sage uses these to set guardrails on your meal plan — for example, an elevated LDL automatically tightens your saturated-fat ceiling.
          </p>
          <p class="text-xs text-ink-muted mb-4">
            The form below shows mock data from someone who has labs entered, so you can see what the surface looks like. Click <strong class="text-ink">+ Add panel</strong> to enter your own.
          </p>
          <div class="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              class="rounded-md bg-brand text-white px-4 py-2 text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
              @click="uploadOpen = true"
            >
              <AssistantMark class="h-4 w-4 text-white" />
              Upload PDF (Sage extracts)
            </button>
            <button
              type="button"
              class="rounded-md bg-surface-raised border border-brand text-brand px-4 py-2 text-sm font-semibold hover:bg-brand/5"
              @click="entryOpen = true"
            >Or type manually</button>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Active concerns ─────────────────────────────────────────── -->
    <section v-if="concerns.length > 0" class="card p-0 overflow-hidden border-warn/30">
      <header class="flex items-center justify-between gap-3 px-4 py-3 bg-warn/10 border-b border-warn/20">
        <div class="flex items-center gap-2">
          <span class="text-base">⚠️</span>
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-warn">
            Active concerns · {{ concerns.length }}
          </span>
        </div>
        <span class="text-[11px] text-ink-muted">From {{ drawnAtLabel }}</span>
      </header>
      <ul class="divide-y divide-divider">
        <!-- Real concerns from latest panel -->
        <template v-if="showingReal">
          <li v-for="c in (concerns as DerivedConcern[])" :key="c.marker_key" class="px-4 py-3 flex items-start gap-3">
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums shrink-0"
              :class="c.status === 'danger' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn'"
            >
              {{ c.value }}{{ c.unit ? ' ' + c.unit : '' }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-ink">{{ c.marker_label }} <span class="text-ink-muted font-normal text-xs">· target {{ c.range }}</span></div>
              <div class="text-[12px] text-ink-muted mt-0.5">
                {{ c.status === 'danger' ? 'Far outside range — Sage will treat this as a hard constraint in your weekly plan.' : 'Outside range — Sage will tighten guardrails accordingly.' }}
              </div>
            </div>
          </li>
        </template>
        <!-- Mock concerns shape (when no real panel) -->
        <template v-else>
          <li v-for="c in mockActiveConcerns" :key="c.label" class="px-4 py-3 flex items-start gap-3">
            <span class="inline-flex items-center rounded-full bg-warn/15 text-warn px-2 py-0.5 text-[11px] font-bold tabular-nums shrink-0">
              {{ c.value }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-ink">{{ c.label }} <span class="text-ink-muted font-normal text-xs">· target {{ c.target }}</span></div>
              <div class="text-[12px] text-ink-muted mt-0.5"><strong class="text-ink">Sage's constraint:</strong> {{ c.constraint }}</div>
            </div>
          </li>
        </template>
      </ul>
    </section>

    <!-- ── Sage's read (mock for now; real LLM read in next session) ─ -->
    <section v-if="!showingReal" class="card p-4 border-brand/20">
      <div class="flex items-start gap-2">
        <AssistantMark class="h-4 w-4 text-brand mt-0.5 shrink-0" />
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-1">
            Sage's read on the {{ mockBloodwork.drawnAt }} panel <span class="text-ink-disabled">(mock)</span>
          </div>
          <p class="text-sm text-ink leading-relaxed">{{ mockBloodwork.sageRead }}</p>
        </div>
      </div>
    </section>

    <!-- ── Full marker table ──────────────────────────────────────── -->
    <section class="card p-0 overflow-hidden">
      <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
            Full panel
            <span v-if="!showingReal" class="text-ink-disabled">(mock data)</span>
          </div>
          <div class="font-semibold text-ink mt-0.5">Last drawn {{ drawnAtLabel }}</div>
          <div class="text-[11px] text-ink-muted mt-0.5">via {{ drawnByLabel }}</div>
        </div>
      </header>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-canvas text-[10px] font-semibold text-ink-muted uppercase tracking-wide">
            <tr>
              <th class="px-4 py-2 text-left">Marker</th>
              <th class="px-4 py-2 text-left">Latest</th>
              <th class="px-4 py-2 text-left">Range</th>
              <th class="px-4 py-2 text-left">History</th>
              <th class="px-4 py-2 text-left">Trend</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-divider">
            <!-- Real rows -->
            <template v-if="showingReal">
              <tr v-for="(m, idx) in realMarkerRows" :key="m.name + idx" class="hover:bg-canvas/50">
                <td class="px-4 py-2 font-medium text-ink">
                  {{ m.name }}
                  <span v-if="!m.isRegistry" class="ml-1.5 text-[9px] uppercase tracking-wider text-ink-disabled font-normal">extra</span>
                </td>
                <td class="px-4 py-2">
                  <template v-if="m.isRegistry">
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums" :class="statusClass(m.status)">
                      <span>{{ statusIcon(m.status) }}</span>
                      <span>{{ m.latest }}</span>
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-sm text-ink tabular-nums font-medium">{{ m.latest }}</span>
                  </template>
                  <span class="ml-1.5 text-[11px] text-ink-muted">{{ m.unit }}</span>
                </td>
                <td class="px-4 py-2 text-xs text-ink-muted font-mono">
                  <span v-if="m.isRegistry">{{ m.range }}</span>
                  <span v-else class="text-ink-disabled italic">no built-in range</span>
                </td>
                <td class="px-4 py-2">
                  <svg v-if="m.history.length > 1" :viewBox="`0 0 200 40`" class="h-6 w-32 text-brand">
                    <path :d="buildSparklinePath(m.history)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <span v-else class="text-[11px] text-ink-disabled">no history</span>
                </td>
                <td class="px-4 py-2 text-[11px] text-ink-muted">{{ m.trendNote }}</td>
              </tr>
            </template>
            <!-- Mock rows -->
            <template v-else>
              <tr v-for="m in mockBloodwork.markers" :key="m.name" class="hover:bg-canvas/50">
                <td class="px-4 py-2 font-medium text-ink">{{ m.name }}</td>
                <td class="px-4 py-2">
                  <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums" :class="statusClass(m.status)">
                    <span>{{ statusIcon(m.status) }}</span>
                    <span>{{ m.latest }}</span>
                  </span>
                  <span class="ml-1.5 text-[11px] text-ink-muted">{{ m.unit }}</span>
                </td>
                <td class="px-4 py-2 text-xs text-ink-muted font-mono">{{ m.range }}</td>
                <td class="px-4 py-2">
                  <svg :viewBox="`0 0 200 40`" class="h-6 w-32 text-brand">
                    <path :d="buildSparklinePath(m.history)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </td>
                <td class="px-4 py-2 text-[11px] text-ink-muted">{{ m.trendNote }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Past draws (real or mock) ───────────────────────────────── -->
    <section v-if="hasAnyPanel" class="card p-0 overflow-hidden">
      <header class="px-4 py-3 border-b border-divider bg-surface-elevated">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Past draws</div>
        <div class="font-semibold text-ink mt-0.5">{{ panels.length }} panel{{ panels.length === 1 ? '' : 's' }} on file</div>
      </header>
      <ul class="divide-y divide-divider">
        <li v-for="p in panels" :key="p.id" class="px-4 py-2.5 flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-medium text-ink">{{ new Date(p.drawn_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }}</div>
            <div class="text-[11px] text-ink-muted">
              {{ p.drawn_by ?? 'unknown lab' }}
              <span v-if="p.notes"> · {{ p.notes }}</span>
              · {{ Object.keys(p.markers).length }} markers
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- ── Entry modal (manual typing) ─────────────────────────────── -->
    <JoshPersonalBloodworkEntryModal
      :open="entryOpen"
      @close="entryOpen = false"
      @saved="entryOpen = false"
    />

    <!-- ── Upload modal (PDF + Claude extraction) ──────────────────── -->
    <JoshPersonalBloodworkUploadModal
      :open="uploadOpen"
      @close="uploadOpen = false"
      @saved="uploadOpen = false"
    />

    <!-- ── Ask Sage floating chat ──────────────────────────────────── -->
    <button
      type="button"
      class="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-brand text-white px-4 py-2.5 shadow-lg hover:opacity-90 transition-all hover:scale-105"
      title="Ask Sage about your bloodwork"
      @click="chatOpen = !chatOpen"
    >
      <AssistantMark class="h-4 w-4 text-white" />
      Ask Sage
    </button>
    <JoshPersonalSageChatPanel
      :open="chatOpen"
      :seed-prompt="chatSeedPrompt"
      @close="onChatClose"
      @data-changed="onChatDataChanged"
    />
  </div>
</template>
