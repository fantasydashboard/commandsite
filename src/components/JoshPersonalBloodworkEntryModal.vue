<script setup lang="ts">
/**
 * Josh Personal — manual bloodwork entry modal.
 *
 * Type values straight from your Quest/LabCorp PDF. Grouped by
 * category so you can fill the section that matches your panel and
 * skip the rest. Markers out of range light up live as you type.
 */
import { ref, computed, watch } from 'vue'
import AssistantMark from '@/components/AssistantMark.vue'
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

const { savePanel } = useBloodwork()

const drawnAt = ref(new Date().toISOString().slice(0, 10))
const drawnBy = ref('Quest Diagnostics')
const notes = ref('')
const values = ref<Record<string, number | null>>({})
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    // Default to today's date + clear values; lab name persists
    drawnAt.value = new Date().toISOString().slice(0, 10)
    notes.value = ''
    values.value = {}
    errorMsg.value = null
  }
})

const grouped = computed(() => {
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

const filledCount = computed(() => {
  return Object.values(values.value).filter(
    (v) => typeof v === 'number' && !isNaN(v),
  ).length
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

function close() {
  if (submitting.value) return
  emit('close')
}

async function onSave() {
  if (filledCount.value === 0) {
    errorMsg.value = 'Add at least one marker value before saving.'
    return
  }
  submitting.value = true
  errorMsg.value = null
  const result = await savePanel({
    drawn_at: drawnAt.value,
    drawn_by: drawnBy.value || null,
    notes: notes.value || null,
    markers: values.value,
  })
  submitting.value = false
  if (!result.ok) {
    errorMsg.value = result.error ?? 'Failed to save panel'
    return
  }
  emit('saved')
  emit('close')
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
                    Add bloodwork panel
                  </span>
                </div>
                <h2 class="text-lg font-semibold text-ink">Type values from your lab report</h2>
                <p class="text-xs text-ink-muted mt-0.5">
                  Skip any marker not on your panel. Sage uses these to tighten your sat fat ceiling, flag concerns, and shape your weekly meal plan.
                </p>
              </div>
              <button
                type="button"
                class="text-ink-muted hover:text-ink text-2xl leading-none p-1 -mr-2 disabled:opacity-30"
                :disabled="submitting"
                @click="close"
              >×</button>
            </div>
          </div>

          <!-- ── Body ──────────────────────────────────────────────── -->
          <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <!-- Panel meta -->
            <div class="grid sm:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Date drawn</label>
                <input v-model="drawnAt" type="date" class="input" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Lab</label>
                <input v-model="drawnBy" type="text" class="input" placeholder="Quest, LabCorp, etc." />
              </div>
              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Notes (optional)</label>
                <input v-model="notes" type="text" class="input" placeholder="Annual physical, etc." />
              </div>
            </div>

            <!-- Marker entry — grouped by category -->
            <div v-for="group in grouped" :key="group.category" class="space-y-2">
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
                {{ group.label }}
              </div>
              <div class="grid sm:grid-cols-2 gap-2">
                <div
                  v-for="def in group.defs"
                  :key="def.key"
                  class="rounded-card border p-3 transition-colors"
                  :class="statusClass(markerStatus(def, values[def.key]))"
                >
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <label class="text-sm font-medium text-ink">{{ def.label }}</label>
                    <span
                      v-if="markerStatus(def, values[def.key]) !== 'unknown'"
                      class="inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold"
                      :class="statusBadgeClass(markerStatus(def, values[def.key]))"
                    >{{ statusIcon(markerStatus(def, values[def.key])) }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="values[def.key]"
                      type="number"
                      step="0.01"
                      class="input flex-1 text-sm"
                      :placeholder="def.rangeNote"
                    />
                    <span class="text-[11px] text-ink-muted whitespace-nowrap">{{ def.unit }}</span>
                  </div>
                  <div class="text-[10px] text-ink-disabled mt-1">target: {{ def.rangeNote }}</div>
                </div>
              </div>
            </div>

            <p v-if="errorMsg" class="text-sm text-danger">{{ errorMsg }}</p>
          </div>

          <!-- ── Footer ────────────────────────────────────────────── -->
          <div class="flex items-center justify-between gap-3 px-6 py-4 border-t border-divider bg-surface-elevated">
            <span class="text-xs text-ink-muted">
              {{ filledCount }} marker{{ filledCount === 1 ? '' : 's' }} entered
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="btn-secondary !text-sm"
                :disabled="submitting"
                @click="close"
              >Cancel</button>
              <button
                type="button"
                class="btn-primary !text-sm"
                :disabled="submitting || filledCount === 0"
                @click="onSave"
              >
                <span v-if="submitting">Saving…</span>
                <span v-else>Save panel</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
