/**
 * Josh Personal — Sage chat composable.
 *
 * Wraps the ask-sage Edge Function. Maintains in-session conversation
 * state (no persistence across page reloads in v1 — refresh starts
 * fresh). Each sendMessage runs the full agent loop server-side and
 * returns the assistant's final text + the tool-trace so the UI can
 * show "Sage used fetch_url, read_targets..." indicators.
 */
import { ref } from 'vue'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  // For assistant turns, a list of tools Sage called to answer
  tool_trace?: { name: string; input: unknown; result: unknown; duration_ms: number }[]
}

// Hard ceiling for a single chat turn. The server caps at 5 Anthropic
// calls × ~10s each plus tool calls; 90s leaves margin for fetch_url
// turns without letting a hung request lock the UI forever.
const CLIENT_TIMEOUT_MS = 90_000

export function useSage() {
  const messages = ref<ChatMessage[]>([])
  const sending = ref(false)
  const error = ref<string | null>(null)
  // Tracks the in-flight request so the UI's Stop button can cancel.
  let activeController: AbortController | null = null

  async function sendMessage(text: string): Promise<{ ok: boolean; error?: string }> {
    if (sending.value) return { ok: false, error: 'Already sending' }
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, error: 'Empty message' }

    sending.value = true
    error.value = null

    // Optimistically append user message
    messages.value.push({ role: 'user', content: trimmed })

    const controller = new AbortController()
    activeController = controller
    const timeoutId = setTimeout(() => controller.abort('timeout'), CLIENT_TIMEOUT_MS)

    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) {
        error.value = 'Not signed in'
        messages.value.pop()
        return { ok: false, error: 'Not signed in' }
      }

      // The Anthropic API expects role + content shape — for our
      // multi-turn replay, send our chat history as user/assistant
      // text-only messages (the server adds the system prompt + tools).
      const apiMessages = messages.value.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ask-sage`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'authorization': `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        error.value = `${res.status}: ${detail.slice(0, 200)}`
        // Roll back the optimistic user message so retry doesn't
        // append two copies.
        messages.value.pop()
        return { ok: false, error: error.value }
      }

      const data = await res.json() as {
        assistant_text: string
        tool_trace: ChatMessage['tool_trace']
        stop_reason: string
      }

      messages.value.push({
        role: 'assistant',
        content: data.assistant_text,
        tool_trace: data.tool_trace,
      })
      return { ok: true }
    } catch (err) {
      // Distinguish user-cancel vs. timeout vs. unknown so the UI can
      // show a sensible message instead of a raw "AbortError".
      const wasAborted = err instanceof DOMException && err.name === 'AbortError'
      if (wasAborted) {
        error.value = controller.signal.reason === 'timeout'
          ? `Sage didn't respond in ${CLIENT_TIMEOUT_MS / 1000}s. Try again or rephrase.`
          : 'Stopped.'
      } else {
        error.value = err instanceof Error ? err.message : String(err)
      }
      messages.value.pop()
      return { ok: false, error: error.value }
    } finally {
      clearTimeout(timeoutId)
      if (activeController === controller) activeController = null
      sending.value = false
    }
  }

  /** Cancel the in-flight request, if any. Used by the chat panel's Stop button. */
  function abort() {
    if (activeController) activeController.abort('user_stopped')
  }

  function clear() {
    messages.value = []
    error.value = null
  }

  return { messages, sending, error, sendMessage, abort, clear }
}
