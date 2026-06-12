/**
 * logClientEvent — append-only helper for the cs_client_events log.
 *
 * Use this from any edge function that does something noteworthy for a
 * specific customer (the Grace or Ada operating under that customer's slug).
 *
 *   await logClientEvent(supabase, {
 *     customer_id: '...',
 *     event_kind: 'sage_chat',
 *     payload: { question: q, model: 'claude-sonnet-4-6' },
 *     cost_cents: 4,
 *     source: 'ask-sage',
 *     actor_id: user.id,
 *   })
 *
 * Two design rules:
 *
 * 1. Best-effort, never throw. A failed log insert should not break the
 *    function it's instrumenting. If the table is missing or RLS blocks
 *    the insert, we log to console and continue. Phase 2 / 3 surfaces
 *    that read this table need to tolerate gaps.
 *
 * 2. Caller controls cost. We don't compute Anthropic / API cost here —
 *    that's the caller's responsibility because the caller knows the
 *    model + tokens + provider. This helper just stores what's passed.
 *
 * See migration 0080 for the full event_kind taxonomy.
 */

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any }

export type ClientEventInput = {
  customer_id: string
  event_kind: string
  payload?: Record<string, unknown>
  cost_cents?: number | null
  source?: string
  actor_id?: string | null
}

export async function logClientEvent(
  supabase: SupabaseLike,
  event: ClientEventInput,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('cs_client_events')
      .insert({
        customer_id: event.customer_id,
        event_kind: event.event_kind,
        payload: event.payload ?? {},
        cost_cents: event.cost_cents ?? null,
        source: event.source ?? null,
        actor_id: event.actor_id ?? null,
      })
    if (error) {
      console.warn(`logClientEvent(${event.event_kind}) insert failed:`, error.message)
    }
  } catch (err) {
    console.warn(
      `logClientEvent(${event.event_kind}) threw:`,
      err instanceof Error ? err.message : String(err),
    )
  }
}

/**
 * Anthropic cost calculator for the helpers above.
 *
 * Models supported (prices in USD per million tokens, USD cents internally):
 *
 *   claude-opus-4-7              $15 in / $75 out
 *   claude-sonnet-4-6            $3 in / $15 out
 *   claude-haiku-4-5             $0.80 in / $4 out
 *
 * Returns cost in CENTS (rounded). Returns 0 if model not recognized —
 * callers can still log the event without cost attribution.
 */
const ANTHROPIC_PRICES_USD_PER_M_TOKENS: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7': { in: 15, out: 75 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 0.8, out: 4 },
}

export function anthropicCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const prices = ANTHROPIC_PRICES_USD_PER_M_TOKENS[model]
  if (!prices) return 0
  const inputDollars = (inputTokens / 1_000_000) * prices.in
  const outputDollars = (outputTokens / 1_000_000) * prices.out
  const totalCents = (inputDollars + outputDollars) * 100
  return Math.round(totalCents)
}
