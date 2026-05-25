<script setup lang="ts">
/**
 * Edit-draft modal — quick subject + body tweak before send.
 *
 * Opens when "Edit" is clicked on a queue card. Save persists the
 * changes to cs_leads.draft_cold_email_subject/body and emits 'saved'.
 * Save-and-approve is a single click that does both: persists the
 * edit AND fires the approve action upstream.
 */
import { computed, ref, watch } from 'vue'
import type { CsLead } from '@/types/database'

const props = defineProps<{
  open: boolean
  lead: CsLead | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', payload: { id: string; subject: string; body: string }): void
  (e: 'saveAndApprove', payload: { id: string; subject: string; body: string }): void
}>()

const subject = ref('')
const body = ref('')

watch(
  () => props.lead?.id,
  () => {
    subject.value = props.lead?.draft_cold_email_subject ?? ''
    body.value = props.lead?.draft_cold_email_body ?? ''
  },
  { immediate: true },
)

const wordCount = computed(() => body.value.trim().split(/\s+/).filter(Boolean).length)
const overLimit = computed(() => wordCount.value > 100)

function close() {
  emit('close')
}

function save() {
  if (!props.lead) return
  emit('save', { id: props.lead.id, subject: subject.value, body: body.value })
}

function saveAndApprove() {
  if (!props.lead) return
  emit('saveAndApprove', { id: props.lead.id, subject: subject.value, body: body.value })
}
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
      <div
        v-if="open && lead"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-ink/40" @click="close"></div>

        <!-- Modal panel -->
        <div class="relative w-full max-w-2xl rounded-card border border-divider bg-surface shadow-2xl">
          <header class="flex items-start justify-between gap-3 px-5 py-4 border-b border-divider">
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">
                Edit draft
              </div>
              <h2 class="text-base font-bold text-ink">{{ lead.company_name }}</h2>
              <p class="text-xs text-ink-muted">
                {{ lead.contact_name || 'no contact name' }}
                <template v-if="lead.contact_email"> · {{ lead.contact_email }}</template>
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
            <!-- Subject -->
            <div>
              <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                Subject
              </label>
              <input
                v-model="subject"
                type="text"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
                placeholder="Quick question for…"
              />
            </div>

            <!-- Body -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Body
                </label>
                <span
                  class="text-[10px] tabular-nums font-semibold"
                  :class="overLimit ? 'text-danger' : 'text-ink-muted'"
                >
                  {{ wordCount }} / 100 words
                </span>
              </div>
              <textarea
                v-model="body"
                rows="10"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink font-mono leading-relaxed focus:border-brand focus:outline-none resize-y"
              />
              <p v-if="overLimit" class="text-[11px] text-danger mt-1">
                Over the 100-word target. Cold emails get scrolled past on phone screens.
              </p>
            </div>
          </div>

          <footer class="flex items-center justify-end gap-2 px-5 py-3 border-t border-divider bg-surface-raised">
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink"
              @click="close"
            >Cancel</button>
            <button
              type="button"
              class="rounded-md border border-brand/40 text-brand bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-brand/10"
              @click="save"
            >Save (stay in queue)</button>
            <button
              type="button"
              class="rounded-md bg-success text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-200 ease-out-quart active:scale-[0.97]"
              @click="saveAndApprove"
            >Save & approve →</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
