/**
 * Timeout helpers so long-running calls fail loudly instead of hanging
 * forever. Used by the lead research/save/enrich flow, where a stalled
 * edge function or DB call would otherwise leave the UI spinning with no
 * error and no way to recover (the user can retry an error, not a hang).
 */

/** Reject if the given promise hasn't settled within `ms`. */
export function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Try again.`)),
      ms,
    )
    Promise.resolve(p).then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

/** fetch() that aborts (and rejects with a readable message) after `ms`.
 *  Honors a caller-provided AbortSignal too (init.signal) so an operator-
 *  driven Cancel can interrupt the in-flight request without waiting for
 *  the timeout. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)

  // Chain the caller's signal into our controller so external cancellation
  // works the same as the timeout. If the caller has already aborted,
  // honor that immediately.
  const callerSignal = init.signal
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason)
    else callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), { once: true })
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (callerSignal?.aborted) {
        throw new Error(`${label} canceled.`)
      }
      throw new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Try again.`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
