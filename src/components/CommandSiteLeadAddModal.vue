<script setup lang="ts">
/**
 * Add-lead modal — quick manual lead entry.
 *
 * Just enough fields to land a lead that the auto-draft cron will
 * pick up: company, contact name/email, industry, ICP score. Score
 * defaults above the auto-draft threshold so the chain starts moving
 * the second the lead saves.
 */
import { ref, watch } from 'vue'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', payload: {
    company_name: string
    contact_name: string
    contact_email: string
    contact_title: string | null
    contact_phone: string | null
    industry: string | null
    city: string | null
    state: string | null
    icp_score: number | null
    notes: string | null
  }): void
}>()

const company_name = ref('')
const contact_name = ref('')
const contact_email = ref('')
const contact_title = ref('')
const contact_phone = ref('')
const industry = ref('')
const city = ref('')
const state = ref('')
const icp_score = ref<number | null>(75)
const notes = ref('')
const error = ref<string | null>(null)
const saving = ref(false)

// Reset form whenever the modal opens fresh
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    company_name.value = ''
    contact_name.value = ''
    contact_email.value = ''
    contact_title.value = ''
    contact_phone.value = ''
    industry.value = ''
    city.value = ''
    state.value = ''
    icp_score.value = 75
    notes.value = ''
    error.value = null
    saving.value = false
  }
})

function close() { emit('close') }

function validate(): string | null {
  if (!company_name.value.trim()) return 'Company name is required'
  if (!contact_email.value.trim()) return 'Contact email is required'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email.value.trim())) {
    return 'Contact email looks invalid'
  }
  if (icp_score.value !== null && (icp_score.value < 0 || icp_score.value > 100)) {
    return 'ICP score must be 0–100'
  }
  return null
}

async function save() {
  const err = validate()
  if (err) { error.value = err; return }
  saving.value = true
  emit('save', {
    company_name: company_name.value.trim(),
    contact_name: contact_name.value.trim(),
    contact_email: contact_email.value.trim().toLowerCase(),
    contact_title: contact_title.value.trim() || null,
    contact_phone: contact_phone.value.trim() || null,
    industry: industry.value.trim() || null,
    city: city.value.trim() || null,
    state: state.value.trim() || null,
    icp_score: icp_score.value,
    notes: notes.value.trim() || null,
  })
}

defineExpose({ resetSaving: () => { saving.value = false } })
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-ink/40" @click="close"></div>

        <div class="relative w-full max-w-xl rounded-card border border-divider bg-surface shadow-2xl">
          <header class="flex items-start justify-between gap-3 px-5 py-4 border-b border-divider">
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">
                Add lead
              </div>
              <h2 class="text-base font-bold text-ink">Quick manual entry</h2>
              <p class="text-xs text-ink-muted">
                Score ≥ {{ 65 }} drops the lead into the auto-draft cron within 5 minutes.
              </p>
            </div>
            <button
              type="button"
              class="text-ink-muted hover:text-ink text-lg leading-none"
              @click="close"
              aria-label="Close"
            >✕</button>
          </header>

          <div class="p-5 space-y-4">
            <!-- Required: Company + Email -->
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2 sm:col-span-1">
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Company name *
                </label>
                <input
                  v-model="company_name"
                  type="text"
                  placeholder="Acme Heating &amp; Air"
                  class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </div>
              <div class="col-span-2 sm:col-span-1">
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Contact email *
                </label>
                <input
                  v-model="contact_email"
                  type="email"
                  placeholder="owner@acmehvac.com"
                  class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </div>
            </div>

            <!-- Contact name + title -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Contact name
                </label>
                <input
                  v-model="contact_name"
                  type="text"
                  placeholder="Mike Smith"
                  class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Title
                </label>
                <input
                  v-model="contact_title"
                  type="text"
                  placeholder="Owner"
                  class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </div>
            </div>

            <!-- Industry + Phone -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Industry
                </label>
                <input
                  v-model="industry"
                  type="text"
                  placeholder="HVAC"
                  class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Phone
                </label>
                <input
                  v-model="contact_phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </div>
            </div>

            <!-- City + State + Score -->
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  City
                </label>
                <input
                  v-model="city"
                  type="text"
                  placeholder="Austin"
                  class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  State
                </label>
                <input
                  v-model="state"
                  type="text"
                  placeholder="TX"
                  maxlength="2"
                  class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none uppercase"
                />
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  ICP score
                </label>
                <input
                  v-model.number="icp_score"
                  type="number"
                  min="0"
                  max="100"
                  class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none tabular-nums"
                />
              </div>
            </div>

            <!-- Notes -->
            <div>
              <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                Notes
              </label>
              <textarea
                v-model="notes"
                rows="2"
                placeholder="Anything Ada should know — recent reviews, hiring signals, mutual connection…"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink resize-y focus:border-brand focus:outline-none"
              />
            </div>

            <p v-if="error" class="text-xs text-danger">{{ error }}</p>
          </div>

          <footer class="flex items-center justify-end gap-2 px-5 py-3 border-t border-divider bg-surface-raised">
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink"
              @click="close"
            >Cancel</button>
            <button
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-[opacity,transform] duration-200 ease-out-quart active:scale-[0.97]"
              :disabled="saving"
              @click="save"
            >
              {{ saving ? 'Adding…' : 'Add lead' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
