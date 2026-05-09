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

export function useSage() {
  const messages = ref<ChatMessage[]>([])
  const sending = ref(false)
  const error = ref<string | null>(null)

  async function sendMessage(text: string): Promise<{ ok: boolean; error?: string }> {
    if (sending.value) return { ok: false, error: 'Already sending' }
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, error: 'Empty message' }

    sending.value = true
    error.value = null

    // Optimistically append user message
    messages.value.push({ role: 'user', content: trimmed })

    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) {
        error.value = 'Not signed in'
        sending.value = false
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
      error.value = err instanceof Error ? err.message : String(err)
      messages.value.pop()
      return { ok: false, error: error.value }
    } finally {
      sending.value = false
    }
  }

  function clear() {
    messages.value = []
    error.value = null
  }

  return { messages, sending, error, sendMessage, clear }
}
