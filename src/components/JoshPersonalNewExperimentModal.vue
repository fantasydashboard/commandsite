<script setup lang="ts">
/**
 * Josh Personal — manual experiment creation modal.
 *
 * For experiments Josh wants to start without going through Sage chat.
 * Same fields as propose_experiment tool, written directly to
 * personal_experiments with source='manual'. Baseline is captured at
 * save time the same way Sage's tool does it.
 */
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', id: string): void
}>()

const title = ref('')
const hypothesis = ref('')
const category = ref<'nutrition' | 'sleep' | 'activity' | 'hydration' | 'supplement' | 'recovery' | 'other'>('nutrition')
const decisionSummary = ref('')
const primaryMetric = ref('weight_body_mass')
const durationDays = ref<number>(30)
const successCriteria = ref('')

const writing = ref(false)
const error = ref<string | null>(null)
const flash = ref<string | null>(null)

const CATEGORIES = [
  { value: 'nutrition',  label: 'Nutrition' },
  { value: 'sleep',      label: 'Sleep' },
  { value: 'activity',   label: 'Activity / workouts' },
  { value: 'hydration',  label: 'Hydration' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'recovery',   label: 'Recovery' },
  { value: 'other',      label: 'Other' },
]

// Same allowlist Sage uses + how to derive baseline.
const METRICS = [
  { value: 'ldl_mg_dl',           label: 'LDL (mg/dL)',                   source: 'bloodwork' },
  { value: 'a1c_pct',             label: 'A1C (%)',                       source: 'bloodwork' },
  { value: 'triglycerides_mg_dl', label: 'Triglycerides (mg/dL)',         source: 'bloodwork' },
  { value: 'weight_body_mass',    label: 'Weight (lbs, latest)',          source: 'metric_latest' },
  { value: 'hrv_14d_avg',         label: 'HRV avg (14d, ms)',             source: 'metric_avg', metric: 'heart_rate_variability', days: 14 },
  { value: 'sleep_7d_avg',        label: 'Sleep avg (7d, h)',             source: 'metric_avg', metric: 'sleep_asleep',           days: 7 },
  { value: 'water_intake_oz_avg', label: 'Water avg (7d, oz)',            source: 'metric_avg', metric: 'water_intake',           days: 7 },
]

watch(() => props.open, (open) => {
  if (open) {
    error.value = null
    flash.value = null
  }
})

async function captureBaseline(metric: string): Promise<{ value: number | null; snapshot: Record<string, unknown> }> {
  const m = METRICS.find((x) => x.value === metric)
  if (!m) return { value: null, snapshot: {} }
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { value: null, snapshot: {} }

  if (m.source === 'bloodwork') {
    const { data } = await supabase.from('personal_bloodwork_panels')
      .select('markers').eq('user_id', userData.user.id)
      .order('drawn_at', { ascending: false }).limit(1).maybeSingle()
    const v = (data as { markers?: Record<string, number> } | null)?.markers?.[metric]
    return { value: typeof v === 'number' ? v : null, snapshot: typeof v === 'number' ? { [metric]: v } : {} }
  }
  if (m.source === 'metric_latest') {
    const { data } = await supabase.from('personal_metrics').select('value')
      .eq('metric_type', metric).order('recorded_at', { ascending: false }).limit(1).maybeSingle()
    const v = data ? Number((data as { value: number | string }).value) : null
    return { value: v, snapshot: v != null ? { [metric]: v } : {} }
  }
  if (m.source === 'metric_avg' && m.metric && m.days) {
    const since = new Date(); since.setDate(since.getDate() - m.days); since.setHours(0, 0, 0, 0)
    const { data } = await supabase.from('personal_metrics').select('value')
      .eq('metric_type', m.metric).gte('recorded_at', since.toISOString())
    const vals = ((data ?? []) as { value: number | string }[]).map((r) => Number(r.value))
    if (vals.length === 0) return { value: null, snapshot: {} }
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    return { value: Number(avg.toFixed(1)), snapshot: { [metric]: Number(avg.toFixed(1)) } }
  }
  return { value: null, snapshot: {} }
}

async function onSave() {
  if (writing.value) return
  error.value = null
  if (!title.value.trim()) { error.value = 'Title is required'; return }
  if (!hypothesis.value.trim()) { error.value = 'Hypothesis is required'; return }
  if (!decisionSummary.value.trim()) { error.value = 'Describe the change you\'re making'; return }
  if (!successCriteria.value.trim()) { error.value = 'Success criteria is required (numeric and unambiguous)'; return }
  if (durationDays.value < 1 || durationDays.value > 365) { error.value = 'Duration must be 1-365 days'; return }

  writing.value = true
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) { error.value = 'Not signed in'; writing.value = false; return }

  const baseline = await captureBaseline(primaryMetric.value)

  const row = {
    user_id: userData.user.id,
    title: title.value.trim(),
    hypothesis: hypothesis.value.trim(),
    category: category.value,
    decision_summary: decisionSummary.value.trim(),
    start_date: new Date().toISOString().slice(0, 10),
    duration_days: durationDays.value,
    primary_metric: primaryMetric.value,
    baseline_value: baseline.value,
    baseline_snapshot: baseline.snapshot,
    success_criteria: successCriteria.value.trim(),
    status: 'active' as const,
    source: 'manual' as const,
  }
  const { data, error: e } = await supabase
    .from('personal_experiments')
    .insert(row as never)
    .select('id').single()

  writing.value = false
  if (e) { error.value = e.message; return }

  flash.value = 'Experiment created'
  emit('created', (data as { id: string }).id)
  // Reset for next time
  setTimeout(() => {
    title.value = ''
    hypothesis.value = ''
    decisionSummary.value = ''
    successCriteria.value = ''
    durationDays.value = 30
    flash.value = null
    emit('close')
  }, 800)
}

function close() { if (!writing.value) emit('close') }
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-100"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8" @click="close">
      <div class="w-full max-w-xl mx-4 card p-0 overflow-hidden shadow-2xl" @click.stop>
        <header class="flex items-center justify-between gap-3 px-5 py-3 border-b border-divider bg-brand/5">
          <div>
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">New experiment</div>
            <div class="text-sm font-semibold text-ink">Frame the test you want to run</div>
          </div>
          <button type="button" class="text-ink-muted hover:text-ink text-2xl leading-none" @click="close">×</button>
        </header>

        <div class="px-5 py-4 space-y-4">
          <div>
            <label class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Title</label>
            <input v-model="title" type="text" placeholder="e.g. Lower sat fat to 14g/day"
              class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          </div>

          <div>
            <label class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Hypothesis</label>
            <textarea v-model="hypothesis" rows="2" placeholder="If I do X, then Y will happen — what you expect to observe."
              class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none resize-none" />
          </div>

          <div class="grid sm:grid-cols-2 gap-3">
            <div>
              <label class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Category</label>
              <select v-model="category" class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none">
                <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
              </select>
            </div>
            <div>
              <label class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Duration (days)</label>
              <input v-model.number="durationDays" type="number" min="1" max="365"
                class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            </div>
          </div>

          <div>
            <label class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">What's changing?</label>
            <input v-model="decisionSummary" type="text" placeholder='e.g. "Set sat fat ceiling from 20g to 14g"'
              class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          </div>

          <div>
            <label class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Primary metric (what proves/refutes)</label>
            <select v-model="primaryMetric" class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none">
              <option v-for="m in METRICS" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
            <p class="text-[10px] text-ink-muted mt-1">Baseline gets captured automatically when you save.</p>
          </div>

          <div>
            <label class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Success criteria</label>
            <input v-model="successCriteria" type="text" placeholder='e.g. "LDL ≤ 130 mg/dL at next draw"'
              class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            <p class="text-[10px] text-ink-muted mt-1">Numeric and unambiguous. "LDL drops below 130" beats "LDL improves".</p>
          </div>

          <p v-if="error" class="text-xs text-danger">{{ error }}</p>
          <p v-if="flash" class="text-xs text-success font-semibold">✓ {{ flash }}</p>
        </div>

        <footer class="px-5 py-3 border-t border-divider bg-surface-elevated flex items-center justify-end gap-2">
          <button type="button" class="text-xs text-ink-muted hover:text-ink" :disabled="writing" @click="close">Cancel</button>
          <button type="button"
            class="rounded-md bg-brand text-white px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
            :disabled="writing"
            @click="onSave">{{ writing ? 'Saving…' : 'Create experiment' }}</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>
