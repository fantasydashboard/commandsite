/**
 * CommandSite — discovery-call composable.
 *
 * Wraps cs_deals filtered to demo-related rows (scheduled or done).
 * Plus actions to generate the pre-call brief, save post-call notes
 * and get Ada's drafted follow-up email.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'

export interface DiscoveryDeal {
  id: string
  lead_id: string | null
  company_name: string
  contact_name: string
  contact_email: string | null
  industry: string | null
  city: string | null
  state: string | null
  stage: string
  scheduled_at: string | null
  scheduled_call_duration_min: number | null
  calendly_event_id: string | null
  discovery_brief: string | null
  discovery_brief_generated_at: string | null
  discovery_demo_url: string | null
  // deno-lint-ignore no-explicit-any
  post_call_notes: Record<string, any> | null
  post_call_followup_draft: string | null
  post_call_followup_drafted_at: string | null
  post_call_followup_sent_at: string | null
  next_action: string | null
  notes: string | null
  last_touch_at: string
  created_at: string
}

export function useDiscovery() {
  const deals = ref<DiscoveryDeal[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const generatingBriefId = ref<string | null>(null)
  const draftingFollowupId = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: e } = await supabase
      .from('cs_deals')
      .select('*')
      .or('stage.eq.demo_booked,stage.eq.demo_done,scheduled_at.not.is.null')
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .limit(100)
    if (e) error.value = e.message
    else deals.value = (data ?? []) as unknown as DiscoveryDeal[]
    loading.value = false
  }

  /** Upcoming = scheduled in the future (or scheduled today, even if past). */
  const upcoming = computed<DiscoveryDeal[]>(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return deals.value
      .filter((d) => d.scheduled_at && new Date(d.scheduled_at).getTime() >= todayStart.getTime() && d.stage !== 'closed_lost')
      .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())
  })

  /** Past = scheduled date is before today */
  const past = computed<DiscoveryDeal[]>(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return deals.value
      .filter((d) => d.scheduled_at && new Date(d.scheduled_at).getTime() < todayStart.getTime())
      .sort((a, b) => new Date(b.scheduled_at!).getTime() - new Date(a.scheduled_at!).getTime())
  })

  async function generateBrief(dealId: string): Promise<{ ok: boolean; error?: string }> {
    if (generatingBriefId.value) return { ok: false, error: 'Already generating' }
    generatingBriefId.value = dealId
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return { ok: false, error: 'Not signed in' }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-discovery-brief`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'authorization': `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ deal_id: dealId }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        return { ok: false, error: `${res.status}: ${detail.slice(0, 250)}` }
      }
      await load()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      generatingBriefId.value = null
    }
  }

  async function draftFollowup(input: {
    deal_id: string
    interest_level: 'hot' | 'warm' | 'lukewarm' | 'cold'
    specific_concern?: string
    next_step: string
    extra_notes?: string
  }): Promise<{ ok: boolean; error?: string; subject?: string; body?: string }> {
    if (draftingFollowupId.value) return { ok: false, error: 'Already drafting' }
    draftingFollowupId.value = input.deal_id
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return { ok: false, error: 'Not signed in' }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/draft-post-call-followup`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'authorization': `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        return { ok: false, error: `${res.status}: ${detail.slice(0, 250)}` }
      }
      const data = await res.json() as { subject: string; body: string }
      await load()
      return { ok: true, subject: data.subject, body: data.body }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      draftingFollowupId.value = null
    }
  }

  /** Mark the follow-up as sent (Josh copied + pasted into Gmail). */
  async function markFollowupSent(dealId: string): Promise<{ ok: boolean; error?: string }> {
    const { error: e } = await supabase
      .from('cs_deals')
      .update({ post_call_followup_sent_at: new Date().toISOString() } as never)
      .eq('id', dealId)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  onMounted(load)

  return {
    deals, loading, error,
    upcoming, past,
    generatingBriefId, draftingFollowupId,
    load, generateBrief, draftFollowup, markFollowupSent,
  }
}
