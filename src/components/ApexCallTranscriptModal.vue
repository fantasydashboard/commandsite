<script setup lang="ts">
/**
 * Listen modal — shows the AI transcript for a single call.
 * Highest-impact demo moment per the Apex spec: clicking "Listen" should
 * make it obvious the AI is having real, useful conversations.
 */
import { computed } from 'vue'
import type { CallRecord } from '@/lib/clients/apex/types'

const props = defineProps<{ open: boolean; call: CallRecord | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

function close() { emit('close') }

const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}m ${sec.toString().padStart(2, '0')}s`
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

const outcomeChip = computed(() => {
  const o = props.call?.outcome
  switch (o) {
    case 'dispatched': return { label: 'Dispatched',  bg: '#EF4444' }
    case 'booked':     return { label: 'Booked',      bg: 'rgb(var(--color-brand))' }
    case 'voicemail':  return { label: 'Voicemail',   bg: '#94A3B8' }
    case 'opted_out':  return { label: 'Opted Out',   bg: '#64748B' }
    default:           return { label: '—',           bg: '#94A3B8' }
  }
})

const leadDot = computed(() => {
  switch (props.call?.lead_quality) {
    case 'hot':  return '#EF4444'
    case 'warm': return '#F59E0B'
    case 'cold': return '#94A3B8'
    default:     return '#94A3B8'
  }
})

const handledByLabel = computed(() => {
  switch (props.call?.handled_by) {
    case 'ai':        return 'AI Receptionist'
    case 'human':     return 'Human dispatcher'
    case 'voicemail': return 'Voicemail'
    default:          return '—'
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open && call"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4"
        @click.self="close"
      >
        <div class="w-full max-w-2xl rounded-card bg-surface shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
          <!-- Header -->
          <div class="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="text-lg font-semibold text-ink truncate">{{ call.caller }}</h3>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  :style="{ backgroundColor: outcomeChip.bg }"
                >{{ outcomeChip.label }}</span>
              </div>
              <div class="text-xs text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{{ call.phone }}</span>
                <span>·</span>
                <span>{{ fmtWhen(call.time) }}</span>
                <span>·</span>
                <span>{{ fmtDuration(call.duration) }}</span>
                <span>·</span>
                <span>{{ handledByLabel }}</span>
                <span class="inline-flex items-center gap-1">
                  <span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: leadDot }"></span>
                  <span class="capitalize">{{ call.lead_quality }} lead</span>
                </span>
              </div>
              <div v-if="call.job_type" class="mt-1.5 text-xs text-ink">
                <span class="text-ink-muted">Topic:</span>
                <span class="ml-1 font-medium">{{ call.job_type }}</span>
              </div>
            </div>
            <button
              type="button"
              class="text-ink-muted hover:text-ink text-xl leading-none p-1 -mr-1"
              @click="close"
              aria-label="Close"
            >×</button>
          </div>

          <!-- Body: transcript -->
          <div class="overflow-y-auto px-5 py-4 flex-1 bg-surface-elevated/30">
            <div v-if="call.transcript" class="space-y-1">
              <div class="flex items-center gap-2 mb-2">
                <span class="eyebrow">Transcript</span>
                <span class="chip !py-0.5 !px-2 !text-[10px]">AI-generated</span>
              </div>
              <pre class="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-ink">{{ call.transcript }}</pre>
            </div>
            <div v-else class="text-center py-8">
              <div class="text-4xl mb-2 opacity-40">🎙</div>
              <div class="text-sm text-ink-muted">
                No transcript captured for this call.
              </div>
              <div class="text-xs text-ink-disabled mt-1">
                Transcripts are stored for AI-handled calls — voicemails and very short calls aren't transcribed.
              </div>
            </div>
          </div>

          <!-- Footer actions -->
          <div class="flex items-center justify-between gap-2 border-t border-divider px-5 py-3 bg-surface">
            <div class="text-xs text-ink-muted">
              Want a copy of this transcript? It's auto-archived under the customer record.
            </div>
            <button
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90"
              @click="close"
            >Close</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 120ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
