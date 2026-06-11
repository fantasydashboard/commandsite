import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { markRequestSlow, unmarkRequestSlow } from './requestStatus'

// .trim() guards against stray whitespace or newlines in env values
// (a common Vercel paste hazard — fetch throws if headers contain a newline).
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!url || !anonKey) {
  // Surface early — prevents confusing 401s later.
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in env')
}

// Cap Supabase fetches with two different timeouts depending on what's
// being called:
//
//   PostgREST queries (/rest/v1/...): 15s
//     These should finish in 2-5 seconds normally. A 15s timeout means
//     a stuck query fails fast instead of leaving the UI frozen for a
//     minute and a half (the prior 90s timeout was "user already gave
//     up and refreshed" territory).
//
//   Edge function invocations (/functions/v1/...): 60s
//     Real edge function calls (cold-email drafting, Apollo enrich,
//     score-leads-ada) can take 30-50s legitimately. 60s gives them
//     room without leaving things hung indefinitely.
//
// Both fail with a clear TimeoutError so callers can surface useful
// error messages instead of the request just hanging.
const REST_TIMEOUT_MS = 15_000
const FUNCTIONS_TIMEOUT_MS = 60_000

// Slow-request threshold: when a fetch has been pending this long, bump
// the global slow-request counter so the UI can show a "still working..."
// indicator. Gives users visual confirmation that something IS happening,
// not just frozen, before the timeout fires.
const SLOW_REQUEST_THRESHOLD_MS = 5_000

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

const timedFetch: typeof fetch = (input, init) => {
  const ac = new AbortController()
  const urlStr = extractUrl(input)
  const isEdgeFunction = urlStr.includes('/functions/v1/')
  const timeoutMs = isEdgeFunction ? FUNCTIONS_TIMEOUT_MS : REST_TIMEOUT_MS

  const timeoutTimer = setTimeout(
    () => ac.abort(new DOMException(`Supabase fetch timed out after ${timeoutMs}ms`, 'TimeoutError')),
    timeoutMs,
  )

  // Track whether THIS request crossed the slow threshold, so we know
  // whether to decrement on completion. (Without the flag, fast requests
  // would decrement the counter incorrectly.)
  let markedSlow = false
  const slowTimer = setTimeout(() => {
    markedSlow = true
    markRequestSlow()
  }, SLOW_REQUEST_THRESHOLD_MS)

  // Honor any caller-provided signal too.
  const callerSignal = init?.signal
  if (callerSignal) {
    if (callerSignal.aborted) ac.abort(callerSignal.reason)
    else callerSignal.addEventListener('abort', () => ac.abort(callerSignal.reason), { once: true })
  }
  return fetch(input, { ...init, signal: ac.signal }).finally(() => {
    clearTimeout(timeoutTimer)
    clearTimeout(slowTimer)
    if (markedSlow) unmarkRequestSlow()
  })
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
