/**
 * Josh Personal — "Now" card composable.
 *
 * Reads cached now_state from personal_now_state; offers refresh() to
 * trigger a fresh Sage generation via the generate-now-state edge
 * function. The Today page binds to this; refresh is on-demand only.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'

export type NowActionKind = 'log_water' | 'log_weight' | 'open_plan' | 'open_chat' | 'log_mood'

export interface NowAction {
  label: string
  kind: NowActionKind
  payload?: Record<string, unknown>
}

export interface NowState {
  user_id: string
  hero_text: string
  secondary_text: string | null
  suggested_actions: NowAction[]
  time_bucket: 'morning' | 'midday' | 'evening' | 'late'
  generated_at: string
  updated_at: string
}

export function useNowState() {
  const state = ref<NowState | null>(null)
  const loading = ref(true)
  const refreshing = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      state.value = null
      loading.value = false
      return
    }
    const { data, error: e } = await supabase
      .from('personal_now_state')
      .select('*')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (e) error.value = e.message
    else state.value = (data as unknown as NowState | null) ?? null
    loading.value = false
  }

  async function refresh(): Promise<{ ok: boolean; error?: string }> {
    if (refreshing.value) return { ok: false, error: 'Already refreshing' }
    refreshing.value = true
    error.value = null
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return { ok: false, error: 'Not signed in' }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-now-state`, {
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

  /** Friendly "Xm ago" style label for the refreshed time. */
  const refreshedAgo = computed(() => {
    if (!state.value) return ''
    const then = new Date(state.value.generated_at).getTime()
    const mins = Math.floor((Date.now() - then) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  })

  /** Stale = older than 4 hours. UI uses to nudge a refresh button. */
  const isStale = computed(() => {
    if (!state.value) return false
    const then = new Date(state.value.generated_at).getTime()
    return Date.now() - then > 4 * 60 * 60 * 1000
  })

  onMounted(load)

  return { state, loading, refreshing, error, refresh, refreshedAgo, isStale, load }
}

/** Silent +Xoz water log used by Now-card action chips and the hydration card. */
export async function logWaterOz(oz: number): Promise<{ ok: boolean; error?: string }> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { ok: false, error: 'Not signed in' }
  const { error: e } = await supabase.from('personal_metrics').insert({
    metric_type: 'water_intake',
    value: oz,
    unit: 'oz',
    recorded_at: new Date().toISOString(),
    source: 'manual',
    raw_payload: { logged_via: 'now_action_or_hydration_card' },
  } as never)
  if (e) return { ok: false, error: e.message }
  return { ok: true }
}
