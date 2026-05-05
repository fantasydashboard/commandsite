<script setup lang="ts">
/**
 * Floating "Ask Ada" / "Ask Grace" chat — lives in DashboardLayout
 * so it's accessible from every tab in every demo. Slug-aware:
 * picks the right persona + question set automatically.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { personaForSlug, type SuggestedQuestion } from '@/lib/personas/registry'

const props = defineProps<{ slug: string }>()

const persona = computed(() => personaForSlug(props.slug))

const isOpen = ref(false)

interface ChatMessage { role: 'user' | 'ai'; text: string }
const chatMessages = ref<ChatMessage[]>([])
const customQuestion = ref('')
const chatScrollEl = ref<HTMLElement | null>(null)

// Reset chat when persona changes (switching demos)
watch(persona, (p) => {
  chatMessages.value = p ? [{ role: 'ai', text: p.greeting }] : []
}, { immediate: true })

function open() {
  isOpen.value = true
  nextTick(scrollChatToBottom)
}
function close() { isOpen.value = false }

async function askSuggested(q: SuggestedQuestion) {
  chatMessages.value.push({ role: 'user', text: q.q })
  await nextTick()
  scrollChatToBottom()
  setTimeout(() => {
    chatMessages.value.push({ role: 'ai', text: q.a })
    nextTick(scrollChatToBottom)
  }, 600)
}

async function askCustom() {
  const text = customQuestion.value.trim()
  if (!text) return
  chatMessages.value.push({ role: 'user', text })
  customQuestion.value = ''
  await nextTick()
  scrollChatToBottom()
  setTimeout(() => {
    chatMessages.value.push({
      role: 'ai',
      text: "Let me check on that. I'll draft something for your review and queue it on the right page based on what fits.",
    })
    nextTick(scrollChatToBottom)
  }, 700)
}

function scrollChatToBottom() {
  if (chatScrollEl.value) chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight
}
</script>

<template>
  <Teleport to="body">
    <!-- Floating bubble button (only when there's a persona for this client) -->
    <button
      v-if="persona && !isOpen"
      type="button"
      class="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-brand text-ink-inverse pl-3 pr-4 py-2.5 shadow-raised hover:shadow-card hover:opacity-95 transition-all"
      :aria-label="`Open chat with ${persona.name}`"
      @click="open"
    >
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-ink-inverse/15 text-sm font-bold ring-2 ring-ink-inverse/20">
        {{ persona.name.charAt(0) }}
      </span>
      <span class="text-sm font-semibold">Ask {{ persona.name }}</span>
      <span class="hidden sm:inline-flex h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
    </button>

    <!-- Chat panel (slides up from bottom-right on open) -->
    <Transition name="slide-fade">
      <div
        v-if="persona && isOpen"
        class="fixed bottom-5 right-5 z-50 flex flex-col w-[min(96vw,420px)] max-h-[min(85vh,640px)] rounded-2xl bg-surface-raised border border-divider shadow-2xl overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center gap-3 bg-gradient-to-r from-brand to-brand/80 text-ink-inverse px-4 py-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-ink-inverse/15 text-sm font-bold ring-2 ring-ink-inverse/30">
            {{ persona.name.charAt(0) }}
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
              class="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
              :class="m.role === 'user'
                ? 'bg-ink text-ink-inverse rounded-br-sm'
                : 'bg-surface-raised text-ink border border-divider rounded-bl-sm'"
            >
              {{ m.text }}
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
              class="rounded-full border border-divider bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:text-ink hover:border-brand hover:bg-brand/5 transition-colors text-left"
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
            :placeholder="`Ask ${persona.name} anything...`"
            class="flex-1 rounded-full border border-divider bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-ink-disabled focus:outline-none focus:border-brand"
          />
          <button
            type="submit"
            class="rounded-full bg-brand text-ink-inverse px-3 py-1.5 text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50"
            :disabled="!customQuestion.trim()"
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
