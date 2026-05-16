/**
 * Josh Personal — patterns composable.
 *
 * Reads from personal_patterns_detected (written nightly by the
 * detect-patterns edge function). UI-side dismissal goes through
 * Sage chat for accountability — this composable is read-only for
 * the Today card.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

export type PatternSeverity = 'info' | 'notable' | 'concerning'

export interface DetectedPattern {
  id: string
  user_id: string
  pattern_type: string
  window_key: string
  title: string
  evidence_summary: string
  evidence_data: Record<string, unknown>
  severity: PatternSeverity
  suggested_experiment: Record<string, unknown> | null
  detected_at: string
  seen_at: string | null
  dismissed_at: string | null
  experiment_id: string | null
}

export function usePatterns() {
  const patterns = ref<DetectedPattern[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      patterns.value = []
      loading.value = false
      return
    }
    const { data, error: e } = await supabase
      .from('personal_patterns_detected')
      .select('*')
      .eq('user_id', userData.user.id)
      .is('dismissed_at', null)
      .order('detected_at', { ascending: false })
      .limit(20)
    if (e) error.value = e.message
    else patterns.value = ((data ?? []) as unknown as DetectedPattern[])
    loading.value = false
  }

  /** Mark a pattern as seen (not dismissed — that goes through Sage). */
  async function markSeen(id: string): Promise<void> {
    await supabase
      .from('personal_patterns_detected')
      .update({ seen_at: new Date().toISOString() } as never)
      .eq('id', id)
  }

  // Newest first; concerning > notable > info within same recency
  const ordered = computed<DetectedPattern[]>(() => {
    const sevRank = (s: PatternSeverity) => s === 'concerning' ? 0 : s === 'notable' ? 1 : 2
    return [...patterns.value].sort((a, b) => {
      const sevDiff = sevRank(a.severity) - sevRank(b.severity)
      if (sevDiff !== 0) return sevDiff
      return b.detected_at.localeCompare(a.detected_at)
    })
  })

  onMounted(load)

  return { patterns, ordered, loading, error, load, markSeen }
}
