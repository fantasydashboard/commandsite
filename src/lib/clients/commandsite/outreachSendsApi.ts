/**
 * CommandSite Outreach — sends event log composable.
 *
 * Wraps cs_outreach_sends. The Outreach page reads from this to show
 * "Sent" history; "Mark sent" actions write to it. The DB trigger
 * keeps the cs_leads aggregates fresh (contacted_at, send_count).
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import type { CsOutreachSend, CsOutreachSendInsert } from '@/types/database'

export function useOutreachSends() {
  const sends = ref<CsOutreachSend[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: e } = await supabase
      .from('cs_outreach_sends')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(500)
    if (e) error.value = e.message
    else sends.value = (data ?? []) as unknown as CsOutreachSend[]
    loading.value = false
  }

  /**
   * Record a manual send (Josh just pasted into Gmail and clicked
   * "Mark sent"). Trigger on cs_outreach_sends bumps cs_leads
   * aggregates + flips status to 'contacted'.
   */
  async function markSent(input: {
    leadId: string
    subject: string
    body: string
    source?: CsOutreachSend['source']
  }): Promise<{ ok: boolean; error?: string }> {
    const { data: userData } = await supabase.auth.getUser()
    const payload: CsOutreachSendInsert = {
      lead_id: input.leadId,
      subject: input.subject,
      body: input.body,
      channel: 'email',
      source: input.source ?? 'manual_gmail',
      sent_at: new Date().toISOString(),
      sent_by: userData.user?.id ?? null,
    }
    const { error: e } = await supabase
      .from('cs_outreach_sends')
      .insert(payload as never)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  /** Latest send per lead (deduped). */
  const latestSendByLead = computed<Map<string, CsOutreachSend>>(() => {
    const m = new Map<string, CsOutreachSend>()
    for (const s of sends.value) {
      // sends are ordered desc, so first one we see per lead is the latest
      if (!m.has(s.lead_id)) m.set(s.lead_id, s)
    }
    return m
  })

  /** Sends fired today (for the "sent today" KPI). */
  const sentToday = computed(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = today.toISOString()
    return sends.value.filter((s) => s.sent_at >= todayIso)
  })

  /** Sends fired in the last N days. */
  function sentLastNDays(n: number): CsOutreachSend[] {
    const since = new Date()
    since.setDate(since.getDate() - n)
    since.setHours(0, 0, 0, 0)
    const sinceIso = since.toISOString()
    return sends.value.filter((s) => s.sent_at >= sinceIso)
  }

  onMounted(load)

  return {
    sends, loading, error,
    latestSendByLead, sentToday, sentLastNDays,
    load, markSent,
  }
}
