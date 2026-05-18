import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// .trim() guards against stray whitespace or newlines in env values
// (a common Vercel paste hazard — fetch throws if headers contain a newline).
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!url || !anonKey) {
  // Surface early — prevents confusing 401s later.
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in env')
}

// Cap any single Supabase fetch at 90s. Without this, a stalled response
// (e.g., a 204 PATCH whose body-read never resolves) holds the auth
// client's internal pendingInLock queue open, and every subsequent
// supabase call queues behind it forever — visible as "Saving…" stuck
// after the second consecutive write. 90s comfortably exceeds the slowest
// real Edge Function call (Apollo, cold-email drafting) while still
// guaranteeing the UI unsticks.
const FETCH_TIMEOUT_MS = 90_000

const timedFetch: typeof fetch = (input, init) => {
  const ac = new AbortController()
  const timer = setTimeout(
    () => ac.abort(new DOMException(`Supabase fetch timed out after ${FETCH_TIMEOUT_MS}ms`, 'TimeoutError')),
    FETCH_TIMEOUT_MS,
  )
  // Honor any caller-provided signal too.
  const callerSignal = init?.signal
  if (callerSignal) {
    if (callerSignal.aborted) ac.abort(callerSignal.reason)
    else callerSignal.addEventListener('abort', () => ac.abort(callerSignal.reason), { once: true })
  }
  return fetch(input, { ...init, signal: ac.signal }).finally(() => clearTimeout(timer))
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: timedFetch,
  },
})

// Exported for code paths that bypass the JS client (e.g. SSE streaming
// against Edge Functions, where supabase.functions.invoke buffers the
// whole response and breaks streaming).
export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = anonKey
