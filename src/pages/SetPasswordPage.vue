<script setup lang="ts">
/**
 * Set-password landing for Supabase invite + password-recovery links. Supabase
 * (detectSessionInUrl) establishes the session from the URL automatically, so we
 * just collect a password and call updateUser. We deliberately do NOT call
 * getSession here: it raced the router's own session check and surfaced the
 * Web Locks "another request stole it" error.
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const password = ref('')
const confirm = ref('')
const error = ref<string | null>(null)
const saving = ref(false)

async function updatePassword() {
  // supabase-js guards its auth token with the Web Locks API; a concurrent auth
  // call can transiently "steal" the lock ("lock ... released because another
  // request stole it"). That is not a real failure, so retry once on it.
  let res = await supabase.auth.updateUser({ password: password.value })
  if (res.error && /lock|stole/i.test(res.error.message)) {
    await new Promise((r) => setTimeout(r, 400))
    res = await supabase.auth.updateUser({ password: password.value })
  }
  return res.error
}

async function submit() {
  error.value = null
  if (password.value.length < 8) { error.value = 'Use at least 8 characters.'; return }
  if (password.value !== confirm.value) { error.value = 'Passwords do not match.'; return }
  saving.value = true
  try {
    const err = await updatePassword()
    if (err) {
      error.value = /session|missing|expired/i.test(err.message)
        ? 'This link has expired or was already used. Ask for a new invite, or use "Forgot password" on the sign-in page.'
        : err.message
      return
    }
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
      <p class="mt-1 text-sm text-ink-muted">Choose a password to finish setting up your account.</p>
      <form class="mt-4 space-y-3" @submit.prevent="submit">
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
    </div>
  </div>
</template>
