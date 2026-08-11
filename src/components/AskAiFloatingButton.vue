<script setup lang="ts">
/**
 * Floating "Ask Ada" / "Ask Grace" chat — lives in DashboardLayout
 * so it's accessible from every tab in every demo. Slug-aware:
 * picks the right persona + question set automatically.
 *
 * Suggested-question buttons return canned answers from the persona
 * registry (zero-latency, zero-cost, scripted-on-purpose). The custom
 * input streams a real response from the ask-ada Edge Function via SSE.
 */
import { computed, nextTick, ref, watch, onMounted } from 'vue'
import { personaForSlug, type SuggestedQuestion } from '@/lib/personas/registry'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'
import AssistantMark from '@/components/AssistantMark.vue'
import { useAssistantChat } from '@/components/grace/useGraceChat'

const props = defineProps<{ slug: string }>()

const persona = computed(() => personaForSlug(props.slug))
const chat = useAssistantChat()

// Local refs proxied to the shared composable so the existing template
// keeps working with minimal changes.
const isOpen = chat.isOpen
const isStreaming = chat.isStreaming
const chatMessages = chat.messages

const customQuestion = ref('')
const chatScrollEl = ref<HTMLElement | null>(null)
let activeAbort: AbortController | null = null

// Reset chat when persona changes (switching demos)
watch(persona, (p) => {
  cancelActiveStream()
  chat.reset(p?.greeting)
}, { immediate: true })

onMounted(() => {
  chat.setScrollEl(chatScrollEl.value)
})

function open() {
  chat.open()
  nextTick(scrollChatToBottom)
}
function close() {
  chat.close()
  cancelActiveStream()
}

function cancelActiveStream() {
  activeAbort?.abort()
  activeAbort = null
  chat.setStreaming(false)
}

async function askSuggested(q: SuggestedQuestion) {
  if (isStreaming.value) return
  chat.addUserMessage(q.q)
  await nextTick()
  scrollChatToBottom()
  // Brief pause so the canned answer doesn't pop instantly (feels artificial otherwise).
  setTimeout(() => {
    chat.addAiMessage(q.a, false)
  }, 450)
}

async function askCustom() {
  const text = customQuestion.value.trim()
  if (!text || isStreaming.value) return

  // Snapshot history BEFORE pushing the new user turn or the empty AI placeholder.
  // The greeting (first assistant turn) is filtered server-side.
  const history = chatMessages.value.map((m) => ({ role: m.role, text: m.text }))

  chat.addUserMessage(text)
  const aiIndex = chat.appendStreamPlaceholder()
  customQuestion.value = ''
  chat.setStreaming(true)
  await nextTick()
  scrollChatToBottom()

  const controller = new AbortController()
  activeAbort = controller

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ask-ada`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ slug: props.slug, history, message: text }),
      signal: controller.signal,
    })

    if (!res.ok || !res.body) {
      let detail = ''
      try { detail = (await res.json())?.error ?? '' } catch { /* ignore */ }
      chat.setStreamText(aiIndex, detail
        ? `Sorry, something went wrong. ${detail}`
        : "Sorry, I'm offline right now. Try again in a moment.")
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE events are separated by blank lines.
      let boundary
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const parsed = parseSseEvent(rawEvent)
        if (!parsed) continue
        if (parsed.event === 'content_block_delta' && parsed.data?.delta?.type === 'text_delta') {
          const delta = parsed.data.delta.text
          if (typeof delta === 'string') {
            chat.appendStreamText(aiIndex, delta)
            await nextTick()
            scrollChatToBottom()
          }
        } else if (parsed.event === 'error') {
          if (!chatMessages.value[aiIndex].text) {
            chat.setStreamText(aiIndex, "Sorry, the connection dropped.")
          }
        }
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // User closed chat or persona changed mid-stream. Leave any partial text.
      return
    }
    if (!chatMessages.value[aiIndex].text) {
      chat.setStreamText(aiIndex, "Sorry, I lost the connection. Try again?")
    }
  } finally {
    if (activeAbort === controller) {
      activeAbort = null
      chat.setStreaming(false)
    }
  }
}

interface SseEvent { event: string; data: any }
function parseSseEvent(raw: string): SseEvent | null {
  let event = ''
  let dataRaw = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataRaw += line.slice(5).trim()
  }
  if (!event || !dataRaw) return null
  try {
    return { event, data: JSON.parse(dataRaw) }
  } catch {
    return null
  }
}

function scrollChatToBottom() {
  if (chatScrollEl.value) chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight
}
</script>

<template>
  <Teleport to="body">
    <!-- Floating bubble button (only when there's a persona for this client).
         Do NOT add `relative` to the class list. It was there, presumably to
         anchor the unread badge, but Tailwind emits .relative AFTER .fixed, so
         it won and the button was never fixed at all: it sat in the document
         flow at the foot of the page and got clipped. `fixed` already
         establishes the containing block the absolute badge needs. -->
    <button
      v-if="persona && !isOpen"
      type="button"
      class="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-brand text-ink-inverse pl-3 pr-4 py-2.5 shadow-raised hover:shadow-card hover:opacity-95 transition-all"
      :aria-label="`Open chat with ${persona.name}`"
      @click="open"
    >
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-ink-inverse/15 ring-1 ring-ink-inverse/20">
        <AssistantMark class="h-5 w-5" />
      </span>
      <span class="text-sm font-semibold">Ask {{ persona.name }}</span>
      <span class="hidden sm:inline-flex h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
      <span
        v-if="chat.unread.value > 0"
        class="absolute -top-1.5 -right-1.5 h-5 min-w-[1.25rem] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-surface"
      >{{ chat.unread.value }}</span>
    </button>

    <!-- Chat panel (slides up from bottom-right on open) -->
    <Transition name="slide-fade">
      <div
        v-if="persona && isOpen"
        class="fixed bottom-5 right-5 z-50 flex flex-col w-[min(96vw,420px)] max-h-[min(85vh,640px)] rounded-2xl bg-surface-raised border border-divider shadow-2xl overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center gap-3 bg-gradient-to-r from-brand to-brand/80 text-ink-inverse px-4 py-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-ink-inverse/15 ring-1 ring-ink-inverse/30">
            <AssistantMark class="h-6 w-6" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold">{{ persona.name }}</span>
              <span class="rounded-full bg-success/30 text-ink-inverse px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
                <span class="h-1 w-1 rounded-full" style="background-color:#86efac"></span>
                Online
              </span>
            </div>
            <p class="text-[11px] opacity-85 leading-tight">{{ persona.subtitle }}</p>
          </div>
          <button
            type="button"
            class="text-ink-inverse opacity-80 hover:opacity-100 text-xl leading-none p-1"
            aria-label="Close chat"
            @click="close"
          >×</button>
        </div>

        <!-- Messages -->
        <div ref="chatScrollEl" class="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-canvas/40">
          <div
            v-for="(m, i) in chatMessages"
            :key="i"
            class="flex"
            :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
              :class="m.role === 'user'
                ? 'bg-ink text-ink-inverse rounded-br-sm'
                : 'bg-surface-raised text-ink border border-divider rounded-bl-sm'"
            >
              <template v-if="m.role === 'ai' && m.text === '' && isStreaming && i === chatMessages.length - 1">
                <span class="inline-flex items-center gap-1" aria-label="Typing">
                  <span class="h-1.5 w-1.5 rounded-full bg-ink-muted animate-pulse" style="animation-delay:0ms"></span>
                  <span class="h-1.5 w-1.5 rounded-full bg-ink-muted animate-pulse" style="animation-delay:150ms"></span>
                  <span class="h-1.5 w-1.5 rounded-full bg-ink-muted animate-pulse" style="animation-delay:300ms"></span>
                </span>
              </template>
              <template v-else>{{ m.text }}</template>
            </div>
          </div>
        </div>

        <!-- Suggested questions -->
        <div class="border-t border-divider bg-surface-raised px-4 py-2.5 max-h-[140px] overflow-y-auto">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">Try asking</div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="(q, i) in persona.questions"
              :key="i"
              type="button"
              class="rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:text-ink hover:border-brand hover:bg-brand/5 transition-colors text-left disabled:opacity-50 disabled:pointer-events-none"
              :disabled="isStreaming"
              @click="askSuggested(q)"
            >{{ q.q }}</button>
          </div>
        </div>

        <!-- Custom input -->
        <form
          class="flex items-center gap-2 border-t border-divider bg-surface-raised px-4 py-2.5"
          @submit.prevent="askCustom"
        >
          <input
            v-model="customQuestion"
            type="text"
            :placeholder="isStreaming ? `${persona.name} is typing…` : `Ask ${persona.name} anything...`"
            class="flex-1 rounded-full border border-divider bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-ink-disabled focus:outline-none focus:border-brand disabled:opacity-60"
            :disabled="isStreaming"
          />
          <button
            type="submit"
            class="rounded-full bg-brand text-ink-inverse px-3 py-1.5 text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50"
            :disabled="!customQuestion.trim() || isStreaming"
          >Send</button>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(20px) scale(0.95);
  opacity: 0;
}
</style>
