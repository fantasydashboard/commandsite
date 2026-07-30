// Grace send client, a thin wrapper around the `grace-send` edge function.
// The function owns every guardrail (messaging enabled, test mode, quiet
// hours, rate limits, suppression list) and always returns a status; this
// wrapper just normalizes a transport-level failure into the same shape.
import { supabase } from '@/lib/supabase'

export interface GraceSendParams {
  tenant: string
  messageType: string
  cardId: string
  personId: string
  subject: string
  body: string
}

export interface GraceSendResult {
  ok: boolean
  status: string
  detail: string
}

export async function graceSend(p: GraceSendParams): Promise<GraceSendResult> {
  const { data, error } = await supabase.functions.invoke('grace-send', { body: p })
  if (error) return { ok: false, status: 'failed', detail: error.message ?? 'Send failed.' }
  return data as GraceSendResult
}
