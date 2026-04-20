import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Client, UserProfile } from '@/types/database'

interface ProfileWithClient extends UserProfile {
  client: Pick<Client, 'slug' | 'name'> | null
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const profile = ref<ProfileWithClient | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!session.value && !!profile.value)
  const isAdmin = computed(() => profile.value?.role === 'admin')
  const clientSlug = computed(() => profile.value?.client?.slug ?? null)

  const redirectPath = computed(() => {
    if (!profile.value) return '/login'
    if (profile.value.role === 'admin') return '/admin'
    if (profile.value.client?.slug) return `/dashboard/${profile.value.client.slug}`
    return '/login'
  })

  async function loadProfile(userId: string) {
    const { data, error: err } = await supabase
      .from('users')
      .select('*, client:clients(slug, name)')
      .eq('id', userId)
      .maybeSingle<ProfileWithClient>()

    if (err) {
      error.value = err.message
      profile.value = null
      return
    }
    profile.value = data
  }

  async function init() {
    loading.value = true
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    if (data.session?.user) {
      await loadProfile(data.session.user.id)
    }
    loading.value = false

    supabase.auth.onAuthStateChange(async (_event, newSession) => {
      session.value = newSession
      if (newSession?.user) {
        await loadProfile(newSession.user.id)
      } else {
        profile.value = null
      }
    })
  }

  async function login(email: string, password: string) {
    error.value = null
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      error.value = err.message
      return false
    }
    session.value = data.session
    if (data.user) await loadProfile(data.user.id)
    return true
  }

  async function logout() {
    await supabase.auth.signOut()
    session.value = null
    profile.value = null
  }

  return {
    session,
    profile,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    clientSlug,
    redirectPath,
    init,
    login,
    logout,
  }
})
