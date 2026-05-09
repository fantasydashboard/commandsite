/**
 * Josh Personal — meal log composable.
 *
 * Reads from personal_meal_log (written by Sage's log_meal tool +
 * any future manual entry UI). Returns today's meals + running
 * macro totals, plus a recent-history slice for the food-log view.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

export interface MealLogEntry {
  id: string
  user_id: string
  logged_at: string
  description: string
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
  estimated_cal: number | null
  estimated_protein_g: number | null
  estimated_fat_g: number | null
  estimated_sat_fat_g: number | null
  estimated_carbs_g: number | null
  source: 'chat' | 'manual' | 'apple_health'
  created_at: string
}

export function useMealLog() {
  const meals = ref<MealLogEntry[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      meals.value = []
      loading.value = false
      return
    }
    // Last 14 days of meals — enough for today's tally + a recent
    // history view. Past that goes into a "view all" page later.
    const since = new Date()
    since.setDate(since.getDate() - 14)
    const { data, error: e } = await supabase
      .from('personal_meal_log')
      .select('*')
      .eq('user_id', userData.user.id)
      .gte('logged_at', since.toISOString())
      .order('logged_at', { ascending: false })
    if (e) error.value = e.message
    else meals.value = (data ?? []) as unknown as MealLogEntry[]
    loading.value = false
  }

  async function deleteMeal(id: string): Promise<{ ok: boolean; error?: string }> {
    const { error: e } = await supabase
      .from('personal_meal_log').delete().eq('id', id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  function isToday(iso: string): boolean {
    const d = new Date(iso)
    const today = new Date()
    return d.getFullYear() === today.getFullYear()
      && d.getMonth() === today.getMonth()
      && d.getDate() === today.getDate()
    }

  const todayMeals = computed<MealLogEntry[]>(() =>
    meals.value.filter((m) => isToday(m.logged_at))
      .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()),
  )

  const todayTotals = computed(() => {
    const t = { cal: 0, protein_g: 0, fat_g: 0, sat_fat_g: 0, carbs_g: 0 }
    for (const m of todayMeals.value) {
      t.cal       += m.estimated_cal       ?? 0
      t.protein_g += m.estimated_protein_g ?? 0
      t.fat_g     += m.estimated_fat_g     ?? 0
      t.sat_fat_g += m.estimated_sat_fat_g ?? 0
      t.carbs_g   += m.estimated_carbs_g   ?? 0
    }
    return t
  })

  // Group meals by day (newest day first), excluding today.
  const recentDays = computed(() => {
    const groups = new Map<string, MealLogEntry[]>()
    for (const m of meals.value) {
      if (isToday(m.logged_at)) continue
      const day = m.logged_at.slice(0, 10)
      if (!groups.has(day)) groups.set(day, [])
      groups.get(day)!.push(m)
    }
    return Array.from(groups.entries())
      .map(([day, items]) => {
        const totals = items.reduce(
          (acc, m) => ({
            cal: acc.cal + (m.estimated_cal ?? 0),
            protein: acc.protein + (m.estimated_protein_g ?? 0),
          }),
          { cal: 0, protein: 0 },
        )
        return {
          day,
          dayLabel: new Date(day + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          }),
          items: items.sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()),
          totals,
        }
      })
      .sort((a, b) => b.day.localeCompare(a.day))
  })

  const totalLogged = computed(() => meals.value.length)

  onMounted(load)

  return {
    meals,
    loading,
    error,
    todayMeals,
    todayTotals,
    recentDays,
    totalLogged,
    load,
    deleteMeal,
  }
}
