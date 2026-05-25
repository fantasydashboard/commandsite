<script setup lang="ts">
/**
 * Josh Personal — bloodwork PDF upload modal.
 *
 * Drop a Quest / LabCorp / etc. PDF, Claude Sonnet 4.6 reads it
 * (native PDF support), and surfaces every numeric marker on the
 * report. Josh reviews + edits if Claude misread anything, then
 * saves — same destination as the manual entry path.
 *
 * Two-stage UI:
 *   1. File picker (drag-drop or click)
 *   2. Review extracted markers (canonical-key markers in the top
 *      table with editable values; "additional markers" extracted
 *      below for full-panel coverage)
 */
import { ref, computed, watch } from 'vue'
import AssistantMark from '@/components/AssistantMark.vue'
import LoadingBar from '@/components/LoadingBar.vue'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'
import {
  useBloodwork,
  MARKERS,
  CATEGORY_LABELS,
  markerStatus,
  type MarkerDef,
} from '@/lib/clients/josh-personal/bloodworkApi'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const { savePanel, recomputeTargetsAfterBloodwork } = useBloodwork()

type Stage = 'pick' | 'extracting' | 'review' | 'targets-updated'
const stage = ref<Stage>('pick')

// Diff returned by recomputeTargetsAfterBloodwork — shown to the user on
// the 'targets-updated' stage so they SEE what Sage changed before
// closing. This is the closed-loop moment the whole product hinges on.
interface TargetChange {
  key: string
  label: string
  before: number | string | null
  after: number | string | null
  unit: string
  direction: 'tighter' | 'looser' | 'changed' | 'neutral'
}
const targetChanges = ref<TargetChange[]>([])
const regeneratingPlan = ref(false)
const planRegenStatus = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

const file = ref<File | null>(null)
const dragOver = ref(false)
const errorMsg = ref<string | null>(null)
const submitting = ref(false)

// Extracted state
interface UnmappedMarker {
  key: string
  lab_name: string
  value: number
  unit: string
  reference_range?: string
  flagged_by_lab?: boolean
}
const drawnAt = ref('')
const drawnBy = ref('')
const notes = ref('')
const canonicalValues = ref<Record<string, number | null>>({})
const additionalMarkers = ref<UnmappedMarker[]>([])
const extractionNotes = ref<string | null>(null)

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    stage.value = 'pick'
    file.value = null
    errorMsg.value = null
    drawnAt.value = ''
    drawnBy.value = ''
    notes.value = ''
    canonicalValues.value = {}
    additionalMarkers.value = []
    extractionNotes.value = null
    targetChanges.value = []
    planRegenStatus.value = null
  }
})

// ── File handling ─────────────────────────────────────────────────────

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    setFile(input.files[0])
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false
  const f = event.dataTransfer?.files?.[0]
  if (f) setFile(f)
}

function setFile(f: File) {
  if (f.type !== 'application/pdf') {
    errorMsg.value = 'Only PDFs work for this. Save the lab report as PDF first.'
    return
  }
  if (f.size > 4 * 1024 * 1024) {
    errorMsg.value = `${(f.size / 1024 / 1024).toFixed(1)}MB is too large (max 4MB). Try saving the report at lower quality.`
    return
  }
  file.value = f
  errorMsg.value = null
}

// ── Extract via Claude ────────────────────────────────────────────────

async function readFileAsBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip "data:application/pdf;base64," prefix
      const base64 = result.split(',')[1] ?? result
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(f)
  })
}

async function runExtract() {
  if (!file.value) return
  errorMsg.value = null
  stage.value = 'extracting'

  try {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) {
      errorMsg.value = 'Not signed in. Refresh and try again.'
      stage.value = 'pick'
      return
    }
    const base64 = await readFileAsBase64(file.value)
    const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-bloodwork-pdf`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'authorization': `Bearer ${session.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ pdf_base64: base64 }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      errorMsg.value = `Extraction failed (${res.status}): ${detail.slice(0, 250)}`
      stage.value = 'pick'
      return
    }

    const data = await res.json() as {
      drawn_at: string
      drawn_by: string
      notes: string | null
      markers: Record<string, number>
      unmapped: UnmappedMarker[]
      extraction_notes: string | null
    }

    drawnAt.value = data.drawn_at
    drawnBy.value = data.drawn_by
    notes.value = data.notes ?? ''
    canonicalValues.value = {}
    for (const def of MARKERS) {
      canonicalValues.value[def.key] = data.markers[def.key] ?? null
    }
    additionalMarkers.value = data.unmapped
    extractionNotes.value = data.extraction_notes
    stage.value = 'review'
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err)
    stage.value = 'pick'
  }
}

// ── Save final panel ──────────────────────────────────────────────────

async function onSave() {
  submitting.value = true
  errorMsg.value = null

  // Combine canonical + additional markers into a single jsonb payload
  const allMarkers: Record<string, number | null> = { ...canonicalValues.value }
  for (const m of additionalMarkers.value) {
    if (typeof m.value === 'number' && !isNaN(m.value)) {
      allMarkers[m.key] = m.value
    }
  }

  const result = await savePanel({
    drawn_at: drawnAt.value,
    drawn_by: drawnBy.value || null,
    notes: notes.value || null,
    markers: allMarkers,
  })

  if (!result.ok) {
    submitting.value = false
    errorMsg.value = result.error ?? 'Failed to save panel'
    return
  }

  // Closed-loop: recompute targets against the new bloodwork. If
  // anything changed, transition to the 'targets-updated' stage so
  // the user sees what Sage moved (sat fat ceiling, cal target, etc.)
  // and can optionally fire a fresh meal plan. If nothing material
  // changed, close as before.
  const recompute = await recomputeTargetsAfterBloodwork()
  submitting.value = false

  if (recompute.ok && recompute.changes.length > 0) {
    targetChanges.value = recompute.changes as TargetChange[]
    stage.value = 'targets-updated'
    emit('saved')  // emit early so parent reloads the underlying bloodwork list
    return
  }

  // No material change OR recompute failed silently — close normally.
  emit('saved')
  emit('close')
}

async function regeneratePlan() {
  regeneratingPlan.value = true
  planRegenStatus.value = null
  const { data, error: fnErr } = await supabase.functions.invoke('generate-weekly-plan', {
    body: { reason: 'bloodwork_updated' },
  })
  regeneratingPlan.value = false
  type GenResult = { ok?: boolean; error?: string }
  const result = data as GenResult | null
  if (fnErr || !result?.ok) {
    planRegenStatus.value = {
      kind: 'err',
      text: fnErr?.message ?? result?.error ?? 'Plan regeneration failed',
    }
    return
  }
  planRegenStatus.value = {
    kind: 'ok',
    text: 'New weekly plan generated. Open the Plan tab to see it.',
  }
}

function finishAndClose() {
  emit('close')
}

function close() {
  if (submitting.value || stage.value === 'extracting') return
  emit('close')
}

function backToPick() {
  stage.value = 'pick'
}

// ── UI helpers ────────────────────────────────────────────────────────

const groupedCanonical = computed(() => {
  const buckets = new Map<MarkerDef['category'], MarkerDef[]>()
  for (const m of MARKERS) {
    if (!buckets.has(m.category)) buckets.set(m.category, [])
    buckets.get(m.category)!.push(m)
  }
  return Array.from(buckets.entries()).map(([category, defs]) => ({
    category,
    label: CATEGORY_LABELS[category],
    defs,
  }))
})

const extractedCount = computed(() => {
  let c = 0
  for (const v of Object.values(canonicalValues.value)) {
    if (typeof v === 'number') c++
  }
  return c + additionalMarkers.value.length
})

function statusClass(status: string): string {
  if (status === 'good')   return 'border-success/40 bg-success/5'
  if (status === 'warn')   return 'border-warn/40 bg-warn/5'
  if (status === 'danger') return 'border-danger/40 bg-danger/5'
  return 'border-divider'
}
function statusBadgeClass(status: string): string {
  if (status === 'good')   return 'bg-success/15 text-success'
  if (status === 'warn')   return 'bg-warn/15 text-warn'
  if (status === 'danger') return 'bg-danger/15 text-danger'
  return 'hidden'
}
function statusIcon(status: string): string {
  if (status === 'good')   return '✓'
  if (status === 'warn')   return '⚠'
  if (status === 'danger') return '✕'
  return ''
}
function humanizeKey(key: string): string {
  return key
    .replace(/_mg_dl$/, '')
    .replace(/_ng_dl$/, '')
    .replace(/_ng_ml$/, '')
    .replace(/_pg_ml$/, '')
    .replace(/_miu_l$/, '')
    .replace(/_ug_dl$/, '')
    .replace(/_u_l$/, '')
    .replace(/_g_dl$/, '')
    .replace(/_pct$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-ink/60"
        @click.self="close"
      >
        <div
          class="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-card bg-surface-raised shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          <!-- ── Header ────────────────────────────────────────────── -->
          <div class="px-6 py-4 border-b border-divider bg-surface-elevated">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <AssistantMark class="h-5 w-5 text-brand" />
                  <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
                    Upload bloodwork PDF
                  </span>
                </div>
                <h2 class="text-lg font-semibold text-ink">
                  <span v-if="stage === 'pick'">Drop your lab report</span>
                  <span v-else-if="stage === 'extracting'">Sage is reading your panel</span>
                  <span v-else-if="stage === 'targets-updated'">Sage updated your targets</span>
                  <span v-else>Review what Sage extracted</span>
                </h2>
                <p v-if="stage === 'pick'" class="text-xs text-ink-muted mt-0.5">
                  Quest, LabCorp, Sonora Quest — any standard lab PDF. Sage extracts every marker, even ones our manual form doesn't cover.
                </p>
                <p v-else-if="stage === 'review'" class="text-xs text-ink-muted mt-0.5">
                  Edit any value if Sage misread it. Save when it looks right.
                </p>
                <p v-else-if="stage === 'targets-updated'" class="text-xs text-ink-muted mt-0.5">
                  Here's what moved based on your new bloodwork. Your meal plan can regenerate against the new ceilings.
                </p>
              </div>
              <button
                type="button"
                class="text-ink-muted hover:text-ink text-2xl leading-none p-1 -mr-2 disabled:opacity-30"
                :disabled="submitting || stage === 'extracting'"
                @click="close"
              >×</button>
            </div>
          </div>

          <!-- ── Body ──────────────────────────────────────────────── -->
          <div class="flex-1 overflow-y-auto px-6 py-5">

            <!-- STAGE 1: file picker -->
            <div v-if="stage === 'pick'">
              <label
                class="block rounded-card border-2 border-dashed p-8 text-center cursor-pointer transition-colors"
                :class="dragOver ? 'border-brand bg-brand/5' : 'border-divider hover:border-brand/40'"
                @dragover.prevent="dragOver = true"
                @dragleave="dragOver = false"
                @drop="onDrop"
              >
                <input type="file" accept="application/pdf" class="sr-only" @change="onFilePicked" />
                <div class="text-3xl mb-2">📄</div>
                <div v-if="!file" class="text-sm font-semibold text-ink mb-1">Drop a PDF here, or click to choose</div>
                <div v-else class="text-sm font-semibold text-ink mb-1">{{ file.name }} · {{ (file.size / 1024).toFixed(0) }} KB</div>
                <div class="text-xs text-ink-muted">Max 4MB · standard lab PDFs only</div>
              </label>

              <p v-if="errorMsg" class="text-sm text-danger mt-3">{{ errorMsg }}</p>

              <div v-if="file" class="mt-4 flex items-center justify-end">
                <button
                  type="button"
                  class="rounded-md bg-brand text-white px-4 py-2 text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
                  @click="runExtract"
                >
                  <AssistantMark class="h-4 w-4 text-white" />
                  Sage, extract this →
                </button>
              </div>
            </div>

            <!-- STAGE 2: extracting -->
            <div v-else-if="stage === 'extracting'" class="rounded-card border border-brand/20 bg-brand/5 p-5 space-y-3">
              <div class="flex items-center gap-2 mb-2">
                <AssistantMark class="h-5 w-5 text-brand" />
                <span class="text-sm font-semibold text-ink">Sage is on it</span>
              </div>
              <LoadingBar
                message="Reading every marker from the PDF..."
                hint="Usually 15-30 seconds depending on panel size. She handles 30-50 markers per typical Quest report."
              />
            </div>

            <!-- STAGE 3: review extracted -->
            <div v-else-if="stage === 'review'" class="space-y-5">
              <!-- Panel meta -->
              <div class="grid sm:grid-cols-3 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Date drawn</label>
                  <input v-model="drawnAt" type="date" class="input" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Lab</label>
                  <input v-model="drawnBy" type="text" class="input" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Notes</label>
                  <input v-model="notes" type="text" class="input" placeholder="Optional" />
                </div>
              </div>

              <!-- Sage's extraction notes if any -->
              <div v-if="extractionNotes" class="rounded-card border border-brand/15 bg-brand/5 p-3">
                <div class="flex items-start gap-2">
                  <AssistantMark class="h-3.5 w-3.5 text-brand mt-0.5 shrink-0" />
                  <p class="text-xs text-ink leading-relaxed">
                    <strong class="font-semibold">Sage's extraction note:</strong> {{ extractionNotes }}
                  </p>
                </div>
              </div>

              <!-- Canonical markers (only show ones we have values for) -->
              <div v-for="group in groupedCanonical" :key="group.category">
                <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-2">
                  {{ group.label }}
                </div>
                <div class="grid sm:grid-cols-2 gap-2">
                  <div
                    v-for="def in group.defs"
                    :key="def.key"
                    v-show="canonicalValues[def.key] !== null && canonicalValues[def.key] !== undefined"
                    class="rounded-card border p-3 transition-colors"
                    :class="statusClass(markerStatus(def, canonicalValues[def.key]))"
                  >
                    <div class="flex items-center justify-between gap-2 mb-1">
                      <label class="text-sm font-medium text-ink">{{ def.label }}</label>
                      <span
                        v-if="markerStatus(def, canonicalValues[def.key]) !== 'unknown'"
                        class="inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold"
                        :class="statusBadgeClass(markerStatus(def, canonicalValues[def.key]))"
                      >{{ statusIcon(markerStatus(def, canonicalValues[def.key])) }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <input
                        v-model.number="canonicalValues[def.key]"
                        type="number"
                        step="0.01"
                        class="input flex-1 text-sm"
                      />
                      <span class="text-[11px] text-ink-muted whitespace-nowrap">{{ def.unit }}</span>
                    </div>
                    <div class="text-[10px] text-ink-disabled mt-1">target: {{ def.rangeNote }}</div>
                  </div>
                </div>
              </div>

              <!-- Additional markers (everything Sage extracted that isn't in our registry) -->
              <div v-if="additionalMarkers.length > 0">
                <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-2">
                  Additional markers · {{ additionalMarkers.length }} (saved as-is)
                </div>
                <p class="text-[11px] text-ink-muted mb-2">
                  Sage extracted these but doesn't have built-in guardrails for them yet. Saved verbatim — you can reference them later.
                </p>
                <div class="grid sm:grid-cols-2 gap-2">
                  <div
                    v-for="(m, i) in additionalMarkers"
                    :key="m.key"
                    class="rounded-card border border-divider p-3"
                  >
                    <div class="text-sm font-medium text-ink truncate" :title="m.lab_name">{{ m.lab_name || humanizeKey(m.key) }}</div>
                    <div class="flex items-center gap-2 mt-1">
                      <input
                        v-model.number="additionalMarkers[i].value"
                        type="number"
                        step="0.01"
                        class="input flex-1 text-sm"
                      />
                      <span class="text-[11px] text-ink-muted whitespace-nowrap">{{ m.unit }}</span>
                    </div>
                    <div v-if="m.reference_range" class="text-[10px] text-ink-disabled mt-1">lab range: {{ m.reference_range }}</div>
                  </div>
                </div>
              </div>

              <p v-if="errorMsg" class="text-sm text-danger">{{ errorMsg }}</p>
            </div>

            <!-- STAGE 4: targets updated — closed-loop reveal -->
            <!-- The pitch-defining moment. Sage just read new bloodwork
                 and the user sees WHAT she changed: sat fat ceiling moved,
                 cal target adjusted, guardrails updated. One click to push
                 those changes into a regenerated meal plan. -->
            <div v-else-if="stage === 'targets-updated'" class="space-y-4">
              <div class="rounded-card border border-success/40 bg-success/5 px-4 py-3 flex items-start gap-3">
                <AssistantMark class="h-5 w-5 text-success mt-0.5 shrink-0" />
                <div>
                  <div class="text-sm font-semibold text-ink">Panel saved. Your targets moved.</div>
                  <p class="text-xs text-ink-muted mt-0.5 leading-snug">
                    Sage recomputed your daily targets against the new markers. Below is what changed. Your meal plan can regenerate against the new ceilings whenever you're ready.
                  </p>
                </div>
              </div>

              <!-- Diff list -->
              <ul class="rounded-card border border-divider divide-y divide-divider overflow-hidden">
                <li
                  v-for="change in targetChanges"
                  :key="String(change.key)"
                  class="px-4 py-3 flex items-baseline justify-between gap-3 flex-wrap"
                >
                  <div class="min-w-0 flex-1">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{{ change.label }}</div>
                    <div class="text-sm text-ink mt-0.5">
                      <template v-if="typeof change.before === 'number' && typeof change.after === 'number'">
                        <span class="text-ink-muted line-through tabular-nums">{{ change.before }}{{ change.unit }}</span>
                        <span class="text-ink-muted mx-1.5">→</span>
                        <span class="font-semibold tabular-nums">{{ change.after }}{{ change.unit }}</span>
                      </template>
                      <template v-else>
                        <span class="text-ink-muted italic block">Was: {{ change.before || 'none' }}</span>
                        <span class="font-semibold block mt-0.5">Now: {{ change.after || 'none' }}</span>
                      </template>
                    </div>
                  </div>
                  <span
                    v-if="change.direction !== 'neutral'"
                    class="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0"
                    :class="{
                      'bg-warn/15 text-warn':    change.direction === 'tighter',
                      'bg-success/15 text-success': change.direction === 'looser',
                      'bg-brand/15 text-brand':  change.direction === 'changed',
                    }"
                  >{{ change.direction }}</span>
                </li>
              </ul>

              <!-- Regenerate meal plan CTA -->
              <div class="rounded-card border border-brand/30 bg-brand/5 px-4 py-3">
                <div class="text-sm font-semibold text-ink mb-1">Want Sage to redraft this week's meal plan?</div>
                <p class="text-xs text-ink-muted mb-2 leading-snug">
                  She'll rebuild the next 7 days against your new sat fat ceiling, protein target, and calorie window. Takes about 30 seconds.
                </p>
                <p
                  v-if="planRegenStatus"
                  class="text-xs mb-2"
                  :class="planRegenStatus.kind === 'ok' ? 'text-success' : 'text-danger'"
                >{{ planRegenStatus.text }}</p>
                <button
                  type="button"
                  class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
                  :disabled="regeneratingPlan || planRegenStatus?.kind === 'ok'"
                  @click="regeneratePlan"
                >
                  <AssistantMark class="h-3.5 w-3.5 text-white" />
                  <span v-if="regeneratingPlan">Sage is drafting…</span>
                  <span v-else-if="planRegenStatus?.kind === 'ok'">Plan regenerated</span>
                  <span v-else>Regenerate this week's plan</span>
                </button>
              </div>
            </div>
          </div>

          <!-- ── Footer ────────────────────────────────────────────── -->
          <div class="flex items-center justify-between gap-3 px-6 py-4 border-t border-divider bg-surface-elevated">
            <button
              v-if="stage === 'review'"
              type="button"
              class="btn-ghost !px-3 !text-xs"
              :disabled="submitting"
              @click="backToPick"
            >← Upload different PDF</button>
            <span v-else></span>

            <div class="flex items-center gap-2">
              <span v-if="stage === 'review'" class="text-xs text-ink-muted">
                {{ extractedCount }} markers ready to save
              </span>
              <button
                v-if="stage !== 'targets-updated'"
                type="button"
                class="btn-secondary !text-sm"
                :disabled="submitting || stage === 'extracting'"
                @click="close"
              >Cancel</button>
              <button
                v-if="stage === 'review'"
                type="button"
                class="btn-primary !text-sm"
                :disabled="submitting"
                @click="onSave"
              >
                <span v-if="submitting">Saving…</span>
                <span v-else>Save panel</span>
              </button>
              <button
                v-if="stage === 'targets-updated'"
                type="button"
                class="btn-primary !text-sm"
                @click="finishAndClose"
              >Done</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
