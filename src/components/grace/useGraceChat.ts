/**
 * Assistant chat — module-level state shared between the floating
 * chat widget (AskAiFloatingButton) and any page-level component
 * that needs to push acknowledgments into the conversation.
 *
 * Why module-level: the chat persists across route changes within
 * a demo. When you Approve a card on Care, Grace can chime in
 * "Done — sent to the Sullivans" and you'll see it whether you
 * stay on Care or jump to Today.
 *
 * The `useAssistantChat` composable returns the SAME refs every
 * call — adding a message from page A is visible in component B.
 *
 * `reset(personaGreeting)` clears history and seeds with a new
 * greeting (called by the floating widget's persona watcher).
 */
import { ref, nextTick } from 'vue'

export interface AssistantMessage {
  role: 'user' | 'ai'
  text: string
}

const messages = ref<AssistantMessage[]>([])
const isOpen = ref(false)
const isStreaming = ref(false)
const unread = ref(0)
const scrollEl = ref<HTMLElement | null>(null)

function setScrollEl(el: HTMLElement | null) {
  scrollEl.value = el
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

function open() {
  isOpen.value = true
  unread.value = 0
  scrollToBottom()
}

function close() {
  isOpen.value = false
}

function reset(greeting?: string) {
  messages.value = greeting ? [{ role: 'ai', text: greeting }] : []
  unread.value = 0
  isStreaming.value = false
}

function addUserMessage(text: string) {
  messages.value.push({ role: 'user', text })
  scrollToBottom()
}

/**
 * Push an AI message into the chat from outside (e.g., approval queue
 * acknowledgment). Adds a brief typing delay so it feels natural.
 * If the chat is closed, increments the unread badge.
 */
function addAiMessage(text: string, withTyping = true) {
  const push = () => {
    messages.value.push({ role: 'ai', text })
    if (!isOpen.value) unread.value++
    scrollToBottom()
  }
  if (!withTyping) {
    push()
    return
  }
  // Add an empty placeholder that the AskAiFloatingButton renders as a
  // typing indicator, then fill it after a short pause.
  isStreaming.value = true
  messages.value.push({ role: 'ai', text: '' })
  const idx = messages.value.length - 1
  scrollToBottom()
  setTimeout(() => {
    messages.value[idx].text = text
    isStreaming.value = false
    if (!isOpen.value) unread.value++
    scrollToBottom()
  }, 700)
}

/** Push the next user turn into the message log (for askSuggested + askCustom flows). */
function appendStreamPlaceholder(): number {
  messages.value.push({ role: 'ai', text: '' })
  return messages.value.length - 1
}

function setStreamText(idx: number, text: string) {
  if (idx >= 0 && idx < messages.value.length) {
    messages.value[idx].text = text
  }
}

function appendStreamText(idx: number, delta: string) {
  if (idx >= 0 && idx < messages.value.length) {
    messages.value[idx].text += delta
  }
}

function setStreaming(v: boolean) {
  isStreaming.value = v
}

export function useAssistantChat() {
  return {
    messages,
    isOpen,
    isStreaming,
    unread,
    open,
    close,
    reset,
    addUserMessage,
    addAiMessage,
    appendStreamPlaceholder,
    setStreamText,
    appendStreamText,
    setStreaming,
    setScrollEl,
    scrollToBottom,
  }
}
