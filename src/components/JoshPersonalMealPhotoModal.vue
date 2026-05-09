<script setup lang="ts">
/**
 * Josh Personal — meal photo upload modal.
 *
 * Snap a phone photo of a meal, Sage parses it (Sonnet 4.6 vision)
 * into a macro estimate + saves to personal_meal_log. Optional note
 * field for context Sage can't see ("had this with a Diet Coke").
 *
 * Mobile-first: <input type="file" accept="image/*" capture="environment">
 * opens the rear camera directly on iOS/Android. Same code on desktop
 * just opens a file picker.
 */
import { ref, computed, watch } from 'vue'
import AssistantMark from '@/components/AssistantMark.vue'
import LoadingBar from '@/components/LoadingBar.vue'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'logged'): void                  // fire to refresh parent food log
}>()

type Stage = 'pick' | 'sending' | 'review'
const stage = ref<Stage>('pick')

const file = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const note = ref('')
const mealSlot = ref<'breakfast' | 'lunch' | 'dinner' | 'snack' | ''>('')
const dragOver = ref(false)
const errorMsg = ref<string | null>(null)

interface SavedMeal {
  id: string
  description: string
  meal_slot: string | null
  estimated_cal: number | null
  estimated_protein_g: number | null
  estimated_fat_g: number | null
  estimated_sat_fat_g: number | null
  estimated_carbs_g: number | null
}
const savedMeal = ref<SavedMeal | null>(null)
const confidence = ref<'high' | 'medium' | 'low' | null>(null)
const sageNotes = ref<string | null>(null)

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    stage.value = 'pick'
    file.value = null
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
    note.value = ''
    mealSlot.value = inferMealSlot()
    errorMsg.value = null
    savedMeal.value = null
    confidence.value = null
    sageNotes.value = null
  }
})

// Infer meal slot from current local time of day
function inferMealSlot(): 'breakfast' | 'lunch' | 'dinner' | 'snack' | '' {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 15) return 'lunch'
  if (h >= 17 && h < 22) return 'dinner'
  return 'snack'
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) setFile(input.files[0])
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false
  const f = event.dataTransfer?.files?.[0]
  if (f) setFile(f)
}

function setFile(f: File) {
  if (!f.type.startsWith('image/')) {
    errorMsg.value = 'Photos only — JPG, PNG, or HEIC.'
    return
  }
  if (f.size > 4 * 1024 * 1024) {
    errorMsg.value = `${(f.size / 1024 / 1024).toFixed(1)}MB is too large (max 4MB). iOS phones snap ~3MB by default — usually fine.`
    return
  }
  file.value = f
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(f)
  errorMsg.value = null
}

async function readFileAsBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1] ?? result
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(f)
  })
}

async function onSubmit() {
  if (!file.value) return
  errorMsg.value = null
  stage.value = 'sending'

  try {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) {
      errorMsg.value = 'Not signed in.'
      stage.value = 'pick'
      return
    }
    const base64 = await readFileAsBase64(file.value)

    const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-meal-photo`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'authorization': `Bearer ${session.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        image_base64: base64,
        note: note.value || undefined,
        meal_slot: mealSlot.value || undefined,
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      errorMsg.value = `${res.status}: ${detail.slice(0, 250)}`
      stage.value = 'pick'
      return
    }

    const data = await res.json() as {
      meal: SavedMeal
      confidence: 'high' | 'medium' | 'low'
      sage_notes: string
    }

    savedMeal.value = data.meal
    confidence.value = data.confidence
    sageNotes.value = data.sage_notes
    stage.value = 'review'
    emit('logged')   // parent refreshes food log
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err)
    stage.value = 'pick'
  }
}

function close() {
  if (stage.value === 'sending') return
  emit('close')
}

function reset() {
  stage.value = 'pick'
  file.value = null
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
  note.value = ''
  savedMeal.value = null
  confidence.value = null
  sageNotes.value = null
  errorMsg.value = null
}

const confidenceLabel = computed(() => {
  if (confidence.value === 'high')   return { label: 'High confidence', class: 'bg-success/15 text-success' }
  if (confidence.value === 'medium') return { label: 'Medium confidence', class: 'bg-warn/15 text-warn' }
  if (confidence.value === 'low')    return { label: 'Low confidence — please verify', class: 'bg-danger/15 text-danger' }
  return null
})
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
          class="w-full max-w-xl max-h-[92vh] flex flex-col rounded-card bg-surface-raised shadow-2xl overflow-hidden"
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
                    Snap a meal
                  </span>
                </div>
                <h2 class="text-lg font-semibold text-ink">
                  <span v-if="stage === 'pick'">Take a photo of your plate</span>
                  <span v-else-if="stage === 'sending'">Sage is reading the photo</span>
                  <span v-else>Logged · Sage's estimate</span>
                </h2>
                <p v-if="stage === 'pick'" class="text-xs text-ink-muted mt-0.5">
                  Sage identifies the foods + estimates portions + macros. Faster than typing.
                </p>
              </div>
              <button
                type="button"
                class="text-ink-muted hover:text-ink text-2xl leading-none p-1 -mr-2 disabled:opacity-30"
                :disabled="stage === 'sending'"
                @click="close"
              >×</button>
            </div>
          </div>

          <!-- ── Body ──────────────────────────────────────────────── -->
          <div class="flex-1 overflow-y-auto px-6 py-5">

            <!-- STAGE 1: pick -->
            <div v-if="stage === 'pick'" class="space-y-4">
              <!-- File picker / drop zone -->
              <label
                class="block rounded-card border-2 border-dashed cursor-pointer transition-colors overflow-hidden"
                :class="dragOver ? 'border-brand bg-brand/5' : 'border-divider hover:border-brand/40'"
                @dragover.prevent="dragOver = true"
                @dragleave="dragOver = false"
                @drop="onDrop"
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  class="sr-only"
                  @change="onFilePicked"
                />
                <div v-if="!previewUrl" class="p-8 text-center">
                  <div class="text-3xl mb-2">📷</div>
                  <div class="text-sm font-semibold text-ink mb-1">Tap to take a photo or choose one</div>
                  <div class="text-xs text-ink-muted">Mobile opens your camera. Desktop opens a file picker.</div>
                </div>
                <div v-else class="relative">
                  <img :src="previewUrl" alt="meal preview" class="w-full max-h-72 object-contain bg-canvas" />
                  <div class="px-4 py-2 bg-surface-elevated text-[11px] text-ink-muted">
                    {{ file?.name }} · {{ file ? (file.size / 1024).toFixed(0) : 0 }} KB · tap to choose another
                  </div>
                </div>
              </label>

              <!-- Meal slot picker -->
              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Meal slot</label>
                <div class="inline-flex rounded-md border border-divider overflow-hidden text-xs">
                  <button
                    v-for="slot in (['breakfast', 'lunch', 'dinner', 'snack'] as const)"
                    :key="slot"
                    type="button"
                    class="px-3 py-1.5 font-semibold transition-colors capitalize border-r border-divider last:border-r-0"
                    :class="mealSlot === slot ? 'bg-brand text-white' : 'bg-surface text-ink hover:bg-canvas/50'"
                    @click="mealSlot = slot"
                  >{{ slot }}</button>
                </div>
              </div>

              <!-- Optional note -->
              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">
                  Add context <span class="text-ink-muted font-normal">(optional — anything Sage can't see)</span>
                </label>
                <input
                  v-model="note"
                  type="text"
                  class="input"
                  placeholder="e.g. had this with a Diet Coke, no cheese on the burger"
                />
              </div>

              <p v-if="errorMsg" class="text-sm text-danger">{{ errorMsg }}</p>
            </div>

            <!-- STAGE 2: sending -->
            <div v-else-if="stage === 'sending'" class="rounded-card border border-brand/20 bg-brand/5 p-5 space-y-3">
              <div class="flex items-center gap-2 mb-2">
                <AssistantMark class="h-5 w-5 text-brand" />
                <span class="text-sm font-semibold text-ink">Sage is on it</span>
              </div>
              <div v-if="previewUrl" class="rounded-card overflow-hidden border border-divider mb-3">
                <img :src="previewUrl" alt="meal" class="w-full max-h-48 object-contain bg-canvas" />
              </div>
              <LoadingBar
                message="Identifying foods, estimating portions, calculating macros…"
                hint="Usually 8-15 seconds. Smaller photos go faster."
              />
            </div>

            <!-- STAGE 3: review -->
            <div v-else-if="stage === 'review' && savedMeal" class="space-y-4">
              <!-- Meal preview thumbnail -->
              <div v-if="previewUrl" class="rounded-card overflow-hidden border border-divider">
                <img :src="previewUrl" alt="meal" class="w-full max-h-56 object-contain bg-canvas" />
              </div>

              <!-- Confidence badge + Sage's reasoning -->
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  v-if="confidenceLabel"
                  class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  :class="confidenceLabel.class"
                >{{ confidenceLabel.label }}</span>
                <span class="text-[10px] text-ink-muted">· Logged to your food log</span>
              </div>

              <!-- The estimate -->
              <div class="card p-4">
                <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
                  {{ savedMeal.meal_slot ? savedMeal.meal_slot[0].toUpperCase() + savedMeal.meal_slot.slice(1) : 'Meal' }}
                </div>
                <p class="text-sm font-semibold text-ink leading-snug">{{ savedMeal.description }}</p>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-divider">
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-ink-muted">Calories</div>
                    <div class="text-base font-bold text-ink tabular-nums">{{ savedMeal.estimated_cal ?? '—' }}</div>
                  </div>
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-ink-muted">Protein</div>
                    <div class="text-base font-bold text-ink tabular-nums">{{ savedMeal.estimated_protein_g ?? '—' }}g</div>
                  </div>
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-ink-muted">Fat</div>
                    <div class="text-base font-bold text-ink tabular-nums">{{ savedMeal.estimated_fat_g ?? '—' }}g</div>
                  </div>
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-warn">Sat fat</div>
                    <div class="text-base font-bold text-warn tabular-nums">{{ savedMeal.estimated_sat_fat_g ?? '—' }}g</div>
                  </div>
                </div>
              </div>

              <!-- Sage's caveats -->
              <div v-if="sageNotes" class="rounded-card border border-brand/15 bg-brand/5 p-3">
                <div class="flex items-start gap-2">
                  <AssistantMark class="h-3.5 w-3.5 text-brand mt-0.5 shrink-0" />
                  <p class="text-[12px] text-ink leading-relaxed">
                    <strong class="font-semibold">Sage's note:</strong> {{ sageNotes }}
                  </p>
                </div>
              </div>

              <p class="text-[11px] text-ink-disabled italic text-center">
                Want to edit values? Open the food log on the Today tab and edit there. Or open Sage chat and tell her.
              </p>
            </div>
          </div>

          <!-- ── Footer ────────────────────────────────────────────── -->
          <div class="flex items-center justify-between gap-3 px-6 py-4 border-t border-divider bg-surface-elevated">
            <span></span>
            <div class="flex items-center gap-2">
              <button
                v-if="stage === 'review'"
                type="button"
                class="btn-ghost !text-xs !px-3"
                @click="reset"
              >Snap another</button>
              <button
                type="button"
                class="btn-secondary !text-sm"
                :disabled="stage === 'sending'"
                @click="close"
              >{{ stage === 'review' ? 'Done' : 'Cancel' }}</button>
              <button
                v-if="stage === 'pick'"
                type="button"
                class="btn-primary !text-sm inline-flex items-center gap-1.5"
                :disabled="!file"
                @click="onSubmit"
              >
                <AssistantMark class="h-3.5 w-3.5 text-white" />
                Sage, log this →
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
