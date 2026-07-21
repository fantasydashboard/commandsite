<script setup lang="ts">
/**
 * Set-password landing for Supabase invite + password-recovery links. Supabase
 * parses the URL hash and establishes a session on load; we then let the user set
 * a password and send them to their dashboard (or /login if no session).
 */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const ready = ref(false)
const hasSession = ref(false)
const password = ref('')
const confirm = ref('')
const error = ref<string | null>(null)
const saving = ref(false)

onMounted(async () => {
  // Supabase auto-detects the session from the URL hash. Give it a tick, then check.
  const { data } = await supabase.auth.getSession()
  hasSession.value = !!data.session
  ready.value = true
})

async function submit() {
  error.value = null
  if (password.value.length < 8) { error.value = 'Use at least 8 characters.'; return }
  if (password.value !== confirm.value) { error.value = 'Passwords do not match.'; return }
  saving.value = true
  try {
    const { error: err } = await supabase.auth.updateUser({ password: password.value })
    if (err) { error.value = err.message; return }
    await auth.init()
    router.replace(auth.redirectPath)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-elevated px-4">
    <div class="w-full max-w-sm card">
      <h1 class="text-lg font-semibold text-ink">Set your password</h1>
      <p v-if="ready && !hasSession" class="mt-2 text-sm text-ink-muted">
        This link is expired or already used. <RouterLink to="/login" class="text-brand hover:underline">Go to sign in</RouterLink>.
      </p>
      <form v-else-if="ready" class="mt-4 space-y-3" @submit.prevent="submit">
        <input v-model="password" type="password" placeholder="New password" autocomplete="new-password"
          class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
        <input v-model="confirm" type="password" placeholder="Confirm password" autocomplete="new-password"
          class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
        <p v-if="error" class="text-xs text-danger">{{ error }}</p>
        <button type="submit" :disabled="saving"
          class="w-full rounded-md bg-brand text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:opacity-90">
          {{ saving ? 'Saving...' : 'Set password' }}
        </button>
      </form>
      <p v-else class="mt-2 text-sm text-ink-muted">Loading...</p>
    </div>
  </div>
</template>
