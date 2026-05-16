/**
 * Josh Personal — Trends-tab 8-week summary composable.
 *
 * Same shape as useSageSummary (History tab) but reads/writes
 * personal_trends_summary and calls generate-trends-summary.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'

export type TrendsHighlight = {
  label: string
  kind: 'weight' | 'sleep' | 'hrv' | 'adherence' | 'experiment' | 'bloodwork' | 'workout'
}

export interface TrendsSummary {
  user_id: string
  body: string
  highlights: TrendsHighlight[]
  window_start: string
  window_end: string
  generated_at: string
  updated_at: string
}

export function useTrendsSummary() {
  const state = ref<TrendsSummary | null>(null)
  const loading = ref(true)
  const refreshing = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { state.value = null; loading.value = false; return }
    const { data, error: e } = await supabase
      .from('personal_trends_summary')
      .select('*')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (e) error.value = e.message
    else state.value = (data as unknown as TrendsSummary | null) ?? null
    loading.value = false
  }

  async function refresh(): Promise<{ ok: boolean; error?: string }> {
    if (refreshing.value) return { ok: false, error: 'Already refreshing' }
    refreshing.value = true
    error.value = null
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return { ok: false, error: 'Not signed in' }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-trends-summary`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'authorization': `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        error.value = `${res.status}: ${detail.slice(0, 200)}`
        return { ok: false, error: error.value }
      }
      await load()
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      error.value = msg
      return { ok: false, error: msg }
    } finally {
      refreshing.value = false
    }
  }

  const refreshedAgo = computed(() => {
    if (!state.value) return ''
    const then = new Date(state.value.generated_at).getTime()
    const mins = Math.floor((Date.now() - then) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  })

  onMounted(load)
  return { state, loading, refreshing, error, refresh, refreshedAgo, load }
}
