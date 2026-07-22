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

// Auto-retry config for read operations. Catches transient network blips
// and 5xx server errors invisibly so users don't see "stuck" states that
// would have worked on retry.
//
// Only retries:
//   - GET requests (POST/PATCH/DELETE could be partially applied; never
//     auto-retry writes)
//   - PostgREST queries, NOT edge functions (edge functions are
//     legitimately long; retrying compounds the wait)
//   - Network errors + 5xx responses (4xx are client errors that won't
//     change on retry)
//
// Exponential backoff so transient blips clear without compounding load
// on the DB.
const RETRY_MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [200, 500, 1000] as const

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

/** Single fetch attempt with retry semantics for transient errors.
 *  Re-throws non-retryable errors and the last error after exhausting
 *  retries. Honors the AbortController so a timeout/cancel during retry
 *  exits the loop immediately. */
async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  abortSignal: AbortSignal,
  maxRetries: number,
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, { ...init, signal: abortSignal })
      // 2xx-4xx: don't retry. 4xx is a client error that won't change;
      // 2xx + 3xx are successful as far as the wire is concerned.
      // 5xx: retry if we have attempts left.
      if (res.status < 500 || attempt === maxRetries) return res
      // Fall through to retry on 5xx
    } catch (err) {
      // If the abort fired (timeout or caller cancel), bail immediately.
      // Don't retry — the request is meant to stop.
      if (abortSignal.aborted) throw err
      lastError = err
      if (attempt === maxRetries) throw err
    }
    // Wait before the next attempt
    const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, delay)
      abortSignal.addEventListener(
        'abort',
        () => {
          clearTimeout(t)
          reject(abortSignal.reason ?? new DOMException('Aborted', 'AbortError'))
        },
        { once: true },
      )
    })
  }
  // Should be unreachable, but keep the type-checker happy.
  throw lastError ?? new Error('fetchWithRetry: all retries exhausted')
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

  // Decide whether to auto-retry: GET requests to PostgREST only.
  // Edge functions are too long to retry (compounding wait). Writes
  // could be partially applied (idempotency risk).
  const method = (init?.method ?? 'GET').toUpperCase()
  const isReadOnly = method === 'GET'
  const shouldRetry = isReadOnly && !isEdgeFunction
  const maxRetries = shouldRetry ? RETRY_MAX_ATTEMPTS : 0

  return fetchWithRetry(input, init, ac.signal, maxRetries).finally(() => {
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
    // Disable the Web Locks API guard. Concurrent auth calls (the router's
    // session check, recovery-token processing, updateUser, functions.invoke)
    // were contending for the token lock and surfacing "lock ... was released
    // because another request stole it", hanging set-password and invites. This
    // app is single-user-per-tab and does not need cross-tab token coordination,
    // so a no-op lock (just run the operation) removes the contention entirely.
    lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
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
