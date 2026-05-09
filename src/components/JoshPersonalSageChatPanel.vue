<script setup lang="ts">
/**
 * Josh Personal — Sage chat panel.
 *
 * Floating panel that opens from the "Ask Sage" button on the Today
 * tab. Shows message history + an input at the bottom + tool-call
 * trace per assistant turn ("Sage used fetch_url, read_targets") so
 * Josh can see what data she pulled to answer.
 *
 * Conversation lives in-session (no persistence v1). Refresh = fresh
 * conversation. Future: save threads to a personal_chat_threads table.
 */
import { ref, computed, nextTick, watch } from 'vue'
import AssistantMark from '@/components/AssistantMark.vue'
import { useSage, type ChatMessage } from '@/lib/clients/josh-personal/sageApi'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  /** Fired whenever Sage's last response used a tool that mutates state
   *  (currently log_meal). Parent reloads relevant data. */
  (e: 'data-changed', payload: { tools: string[] }): void
}>()

const { messages, sending, error, sendMessage, clear } = useSage()

const input = ref('')
const scrollEl = ref<HTMLElement | null>(null)

const samplePrompts = [
  'Going to Longhorn for dinner: https://www.longhornsteakhouse.com/menu — what should I order?',
  'I\'m sore today. Should I do tomorrow\'s push workout or swap?',
  'Why is my LDL not dropping yet?',
  'Log: 3 eggs scrambled, oatmeal with berries, black coffee',
  'What are my macros remaining for the day?',
]

// Tools that mutate state — when Sage uses these, we tell the parent
// to reload its data (so the food log on the Today tab updates the
// instant Sage logs a meal, etc.)
const STATE_MUTATING_TOOLS = new Set(['log_meal'])

async function onSend() {
  const text = input.value
  if (!text.trim() || sending.value) return
  input.value = ''
  await sendMessage(text)
  await scrollToBottom()

  // Inspect the latest assistant message — if Sage used any state-
  // mutating tool, notify the parent.
  const last = messages.value[messages.value.length - 1]
  if (last?.role === 'assistant' && last.tool_trace) {
    const used = last.tool_trace.map((t) => t.name).filter((n) => STATE_MUTATING_TOOLS.has(n))
    if (used.length > 0) emit('data-changed', { tools: used })
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    onSend()
  }
}

function pickPrompt(p: string) {
  input.value = p
}

async function scrollToBottom() {
  await nextTick()
  if (scrollEl.value) {
    scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  }
}

watch(messages, () => { scrollToBottom() }, { deep: true })

watch(() => props.open, (isOpen) => {
  if (isOpen) scrollToBottom()
})

function close() {
  emit('close')
}

// Prettier human label for tool names in the trace
const TOOL_LABELS: Record<string, string> = {
  fetch_url:            'fetched the page',
  read_targets:         'checked your targets',
  read_active_concerns: 'checked your bloodwork',
  read_recent_metrics:  'looked at your metrics',
  read_weekly_plan:     'pulled this week\'s plan',
  read_meal_log_today:  'checked today\'s log',
  read_profile:         'pulled your profile',
  log_meal:             'logged the meal',
}

function summarizeToolTrace(trace: ChatMessage['tool_trace']): string {
  if (!trace || trace.length === 0) return ''
  const labels = trace.map((t) => TOOL_LABELS[t.name] ?? t.name)
  return labels.join(' · ')
}

const isEmpty = computed(() => messages.value.length === 0)
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 translate-y-3"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-150"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-3"
  >
    <div
      v-if="open"
      class="fixed bottom-24 right-6 z-40 w-[440px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-8rem)] flex flex-col card p-0 shadow-2xl border-brand/30 overflow-hidden"
    >
      <!-- ── Header ────────────────────────────────────────────────── -->
      <div class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-brand/5">
        <div class="flex items-center gap-2">
          <AssistantMark class="h-5 w-5 text-brand" />
          <div>
            <div class="font-semibold text-ink text-sm">Ask Sage</div>
            <div class="text-[10px] text-ink-muted">She has tools — your bloodwork, metrics, profile, plan</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="messages.length > 0"
            type="button"
            class="text-[11px] text-ink-muted hover:text-ink"
            @click="clear"
          >Clear</button>
          <button
            type="button"
            class="text-ink-muted hover:text-ink text-xl leading-none"
            @click="close"
          >×</button>
        </div>
      </div>

      <!-- ── Messages ──────────────────────────────────────────────── -->
      <div ref="scrollEl" class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <!-- Empty state: sample prompts -->
        <div v-if="isEmpty" class="space-y-3">
          <div class="rounded-card bg-brand/5 border border-brand/15 p-3">
            <div class="flex items-start gap-2">
              <AssistantMark class="h-4 w-4 text-brand mt-0.5 shrink-0" />
              <p class="text-[12px] text-ink leading-relaxed">
                Hey. I have access to your profile, today's targets, your latest bloodwork, your Apple Health metrics, and this week's plan. Ask me anything — or share a URL and I'll read it.
              </p>
            </div>
          </div>
          <div class="space-y-1.5">
            <p class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Try:</p>
            <button
              v-for="p in samplePrompts"
              :key="p"
              type="button"
              class="block w-full text-left text-xs text-brand bg-brand/5 hover:bg-brand/10 rounded-md px-2.5 py-2 leading-snug"
              @click="pickPrompt(p)"
            >{{ p }}</button>
          </div>
        </div>

        <!-- Conversation -->
        <template v-for="(msg, i) in messages" :key="i">
          <!-- User message -->
          <div v-if="msg.role === 'user'" class="flex justify-end">
            <div class="max-w-[85%] rounded-card bg-brand text-white px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
              {{ msg.content }}
            </div>
          </div>
          <!-- Assistant message -->
          <div v-else class="flex flex-col gap-1">
            <div class="flex items-start gap-2">
              <AssistantMark class="h-5 w-5 text-brand mt-0.5 shrink-0" />
              <div class="flex-1 min-w-0">
                <div
                  v-if="msg.tool_trace && msg.tool_trace.length > 0"
                  class="text-[10px] text-ink-muted italic mb-1.5"
                >
                  Sage {{ summarizeToolTrace(msg.tool_trace) }}.
                </div>
                <div class="text-sm text-ink leading-relaxed whitespace-pre-wrap">{{ msg.content }}</div>
              </div>
            </div>
          </div>
        </template>

        <!-- Sending indicator -->
        <div v-if="sending" class="flex items-start gap-2">
          <AssistantMark class="h-5 w-5 text-brand mt-0.5 shrink-0 animate-pulse" />
          <div class="flex-1">
            <div class="text-xs text-ink-muted italic">Sage is thinking…</div>
            <div class="mt-1.5 flex items-center gap-1">
              <span class="h-1.5 w-1.5 rounded-full bg-brand animate-bounce" style="animation-delay: 0ms" />
              <span class="h-1.5 w-1.5 rounded-full bg-brand animate-bounce" style="animation-delay: 150ms" />
              <span class="h-1.5 w-1.5 rounded-full bg-brand animate-bounce" style="animation-delay: 300ms" />
            </div>
          </div>
        </div>

        <p v-if="error" class="text-xs text-danger">{{ error }}</p>
      </div>

      <!-- ── Input ─────────────────────────────────────────────────── -->
      <div class="border-t border-divider p-3 bg-surface-elevated">
        <div class="flex items-end gap-2">
          <textarea
            v-model="input"
            rows="1"
            class="flex-1 rounded-md border border-divider bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand resize-none max-h-32"
            placeholder="Ask Sage… (Enter to send, Shift+Enter for new line)"
            @keydown="onKeydown"
          />
          <button
            type="button"
            class="rounded-md bg-brand text-white px-3 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50 shrink-0"
            :disabled="sending || !input.trim()"
            @click="onSend"
          >
            {{ sending ? '…' : 'Send' }}
          </button>
        </div>
        <p class="text-[10px] text-ink-disabled mt-1.5">
          Sage may take a few seconds when fetching URLs or running multiple tools.
        </p>
      </div>
    </div>
  </Transition>
</template>
