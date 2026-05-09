/**
 * Josh Personal — morning brief composable.
 *
 * Reads the latest brief from personal_morning_briefs and exposes
 * a `regenerate()` action that fires the generate-morning-brief
 * Edge Function. The function upserts on (user_id, brief_date) so
 * regenerations overwrite the day's brief in place.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'

export interface MorningBrief {
  id: string
  user_id: string
  brief_date: string
  headline: string | null
  todays_focus: string | null
  watch_out_for: string | null
  patterns_noticed: string | null
  goal_check: string | null
  generated_at: string
  generated_by: 'manual' | 'cron' | 'auto_after_data'
  model: string | null
  context_snapshot: unknown
}

export function useMorningBrief() {
  const brief = ref<MorningBrief | null>(null)
  const loading = ref(true)
  const generating = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      brief.value = null
      loading.value = false
      return
    }
    // Pull the most recent brief regardless of date — if today's
    // hasn't been generated yet, we show yesterday's with a "stale"
    // hint instead of an empty state.
    const { data, error: e } = await supabase
      .from('personal_morning_briefs')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('brief_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (e) error.value = e.message
    else brief.value = (data as unknown as MorningBrief | null) ?? null
    loading.value = false
  }

  async function regenerate(): Promise<{ ok: boolean; error?: string }> {
    if (generating.value) return { ok: false, error: 'Already generating' }
    generating.value = true
    error.value = null
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return { ok: false, error: 'Not signed in' }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-morning-brief`, {
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
        return { ok: false, error: `${res.status}: ${detail.slice(0, 250)}` }
      }
      const data = await res.json() as { briefs: { status: string; error?: string }[] }
      const first = data.briefs?.[0]
      if (first?.status === 'error') {
        return { ok: false, error: first.error ?? 'Generation failed' }
      }
      await load()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      generating.value = false
    }
  }

  const briefDate = computed<string | null>(() => brief.value?.brief_date ?? null)
  const isStale = computed<boolean>(() => {
    if (!brief.value) return false
    const today = new Date().toISOString().slice(0, 10)
    return brief.value.brief_date !== today
  })

  onMounted(load)

  return { brief, loading, generating, error, briefDate, isStale, load, regenerate }
}
