<script setup lang="ts">
/**
 * Josh Personal — Quick log popover.
 *
 * One-tap rows for the highest-frequency metrics:
 *   - Weight (free-form number)
 *   - Water (+8 / +16 / +32 oz buttons)
 *   - Mood (1-10 chip row)
 *   - BP (two short inputs)
 *
 * Each write goes directly to personal_metrics with source='manual'.
 * Closes after a successful write; shows inline confirmation briefly.
 */
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { logWaterOz } from '@/lib/clients/josh-personal/nowStateApi'

const props = defineProps<{ open: boolean; focus?: 'weight' | 'water' | 'mood' | 'bp' | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'logged', kind: 'weight' | 'water' | 'mood' | 'bp'): void
}>()

const weightInput = ref<string>('')
const moodInput = ref<number | null>(null)
const bpSystolic = ref<string>('')
const bpDiastolic = ref<string>('')

const writing = ref(false)
const flash = ref<string | null>(null)
const errorMsg = ref<string | null>(null)

function setFlash(msg: string) {
  flash.value = msg
  setTimeout(() => { flash.value = null }, 2500)
}

async function logMetric(metric_type: string, value: number, unit: string) {
  if (writing.value) return false
  writing.value = true
  errorMsg.value = null
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) { errorMsg.value = 'Not signed in'; writing.value = false; return false }
  const { error: e } = await supabase.from('personal_metrics').insert({
    metric_type, value, unit,
    recorded_at: new Date().toISOString(),
    source: 'manual',
    raw_payload: { logged_via: 'quick_log_popover' },
  } as never)
  writing.value = false
  if (e) { errorMsg.value = e.message; return false }
  return true
}

async function onLogWeight() {
  const n = parseFloat(weightInput.value)
  if (!isFinite(n) || n <= 0) return
  const ok = await logMetric('weight_body_mass', n, 'lbs')
  if (ok) {
    setFlash(`Logged ${n.toFixed(1)} lbs`)
    weightInput.value = ''
    emit('logged', 'weight')
  }
}

async function onLogWater(oz: number) {
  if (writing.value) return
  writing.value = true
  const r = await logWaterOz(oz)
  writing.value = false
  if (r.ok) {
    setFlash(`+${oz}oz logged`)
    emit('logged', 'water')
  } else {
    errorMsg.value = r.error ?? 'Log failed'
  }
}

async function onLogMood(score: number) {
  moodInput.value = score
  const ok = await logMetric('mood_rating', score, 'rating')
  if (ok) {
    setFlash(`Mood ${score}/10 logged`)
    moodInput.value = null
    emit('logged', 'mood')
  }
}

async function onLogBP() {
  const s = parseInt(bpSystolic.value, 10)
  const d = parseInt(bpDiastolic.value, 10)
  if (!isFinite(s) || !isFinite(d) || s <= 0 || d <= 0) return
  // Two metrics, one tap. Issue them sequentially so a failure on one
  // doesn't silently leave the other half logged with no feedback.
  const ok1 = await logMetric('blood_pressure_systolic', s, 'mmHg')
  if (!ok1) return
  const ok2 = await logMetric('blood_pressure_diastolic', d, 'mmHg')
  if (ok2) {
    setFlash(`BP ${s}/${d} logged`)
    bpSystolic.value = ''
    bpDiastolic.value = ''
    emit('logged', 'bp')
  }
}

// Reset focus state when reopened
watch(() => props.open, (open) => {
  if (open) {
    flash.value = null
    errorMsg.value = null
  }
})
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-100"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-75"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center bg-black/30 backdrop-blur-sm pt-24" @click="emit('close')">
      <div class="card p-0 w-[420px] max-w-[calc(100vw-2rem)] shadow-2xl overflow-hidden" @click.stop>
        <header class="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-divider bg-surface-elevated">
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Quick log</div>
          <button type="button" class="text-ink-muted hover:text-ink text-xl leading-none" @click="emit('close')">×</button>
        </header>

        <div class="px-4 py-3 space-y-4">
          <!-- Weight -->
          <div>
            <label class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Weight</label>
            <div class="flex items-center gap-2 mt-1">
              <input
                v-model="weightInput"
                type="number"
                step="0.1"
                inputmode="decimal"
                placeholder="178.4"
                class="flex-1 rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
                @keydown.enter="onLogWeight"
              />
              <span class="text-xs text-ink-muted">lbs</span>
              <button
                type="button"
                class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                :disabled="writing || !weightInput"
                @click="onLogWeight"
              >Log</button>
            </div>
          </div>

          <!-- Water -->
          <div>
            <label class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Water</label>
            <div class="flex items-center gap-2 mt-1">
              <button
                v-for="oz in [8, 16, 32]"
                :key="oz"
                type="button"
                class="flex-1 rounded-md border border-brand/30 bg-brand/5 text-brand px-3 py-1.5 text-xs font-semibold hover:bg-brand/15 disabled:opacity-50"
                :disabled="writing"
                @click="onLogWater(oz)"
              >+{{ oz }} oz</button>
            </div>
          </div>

          <!-- Mood -->
          <div>
            <label class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Mood (1-10)</label>
            <div class="flex items-center gap-1 mt-1">
              <button
                v-for="n in 10"
                :key="n"
                type="button"
                class="flex-1 rounded-md border border-divider bg-surface-raised text-xs font-semibold py-1.5 hover:border-brand hover:text-brand disabled:opacity-50"
                :class="moodInput === n ? 'border-brand text-brand bg-brand/5' : ''"
                :disabled="writing"
                @click="onLogMood(n)"
              >{{ n }}</button>
            </div>
          </div>

          <!-- BP -->
          <div>
            <label class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Blood pressure</label>
            <div class="flex items-center gap-2 mt-1">
              <input
                v-model="bpSystolic"
                type="number"
                inputmode="numeric"
                placeholder="122"
                class="w-20 rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
              />
              <span class="text-ink-muted">/</span>
              <input
                v-model="bpDiastolic"
                type="number"
                inputmode="numeric"
                placeholder="78"
                class="w-20 rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
                @keydown.enter="onLogBP"
              />
              <span class="text-xs text-ink-muted">mmHg</span>
              <button
                type="button"
                class="ml-auto rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                :disabled="writing || !bpSystolic || !bpDiastolic"
                @click="onLogBP"
              >Log</button>
            </div>
          </div>

          <p v-if="flash" class="text-xs text-success font-semibold">✓ {{ flash }}</p>
          <p v-if="errorMsg" class="text-xs text-danger">{{ errorMsg }}</p>
        </div>
      </div>
    </div>
  </Transition>
</template>
