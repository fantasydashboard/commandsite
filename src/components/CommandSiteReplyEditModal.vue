<script setup lang="ts">
/**
 * Edit-reply modal — tweak Sage's drafted response before sending.
 *
 * Shows the recipient's original reply at the top for context, then
 * an editable textarea for the response. Two save paths:
 *   • Save & send — persists the edit + fires the approve action
 *   • Save (don't send yet) — persists the edit, keeps card in queue
 */
import { computed, ref, watch } from 'vue'
import type { CsReply } from '@/types/database'

const props = defineProps<{
  open: boolean
  reply: CsReply | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', payload: { reply: CsReply; body: string }): void
  (e: 'saveAndSend', payload: { reply: CsReply; body: string }): void
}>()

const body = ref('')

watch(
  () => props.reply?.id,
  () => {
    body.value = props.reply?.drafted_response ?? ''
  },
  { immediate: true },
)

const replySubject = computed(() => {
  const s = props.reply?.subject ?? ''
  if (!s) return '(no subject)'
  return s.startsWith('Re:') ? s : `Re: ${s}`
})

const wordCount = computed(() => body.value.trim().split(/\s+/).filter(Boolean).length)

function close() { emit('close') }
function save() {
  if (!props.reply) return
  emit('save', { reply: props.reply, body: body.value })
}
function saveAndSend() {
  if (!props.reply) return
  emit('saveAndSend', { reply: props.reply, body: body.value })
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
      <div v-if="open && reply" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-ink/40" @click="close"></div>

        <div class="relative w-full max-w-2xl rounded-card border border-divider bg-surface shadow-2xl">
          <header class="flex items-start justify-between gap-3 px-5 py-4 border-b border-divider">
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-0.5">
                Edit response
              </div>
              <h2 class="text-base font-bold text-ink">
                Replying to {{ reply.from_name || reply.from_email }}
              </h2>
              <p class="text-xs text-ink-muted">{{ replySubject }} · sending as you</p>
            </div>
            <button
              type="button"
              class="text-ink-muted hover:text-ink text-lg leading-none"
              @click="close"
              aria-label="Close"
            >✕</button>
          </header>

          <div class="p-5 space-y-4">
            <!-- Their original message for context -->
            <div>
              <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                They said
              </label>
              <div class="rounded-md border border-divider bg-surface-raised px-3 py-2.5 text-sm text-ink leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                {{ reply.body }}
              </div>
            </div>

            <!-- Editable response -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Your response
                </label>
                <span class="text-[10px] tabular-nums text-ink-muted">
                  {{ wordCount }} words
                </span>
              </div>
              <textarea
                v-model="body"
                rows="10"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink font-mono leading-relaxed focus:border-accent focus:outline-none resize-y"
              />
              <p v-if="reply.classification_reason" class="text-[11px] text-ink-muted mt-2 italic">
                <strong>Sage classified as {{ reply.classification }}:</strong>
                {{ reply.classification_reason }}
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
              class="rounded-md border border-accent/40 text-accent bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-accent/10"
              @click="save"
            >Save (stay in queue)</button>
            <button
              type="button"
              class="rounded-md bg-success text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-200 ease-out-quart active:scale-[0.97]"
              @click="saveAndSend"
            >Save & send →</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
