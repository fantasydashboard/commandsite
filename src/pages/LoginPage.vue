<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import BrandLogo from '@/components/BrandLogo.vue'

const email = ref('')
const password = ref('')
const submitting = ref(false)

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

// Forward an already-authenticated visitor to their dashboard. This is also how
// the set-password page lands a new user cleanly: it does a full reload to /login
// (avoiding in-page auth lock contention), and this sends them onward.
onMounted(() => {
  if (auth.isAuthenticated) {
    router.replace((route.query.redirect as string | undefined) ?? auth.redirectPath)
  }
})

async function onSubmit() {
  submitting.value = true
  const ok = await auth.login(email.value, password.value)
  submitting.value = false
  if (!ok) return

  const redirect = (route.query.redirect as string | undefined) ?? auth.redirectPath
  router.replace(redirect)
}
</script>

<template>
  <div class="min-h-screen bg-surface flex flex-col items-center justify-center px-6">
    <div class="mb-8">
      <BrandLogo :height="48" />
    </div>

    <div class="w-full max-w-md card">
      <div class="mb-6">
        <div class="text-xl font-semibold tracking-tight text-ink">
          Sign in
        </div>
        <p class="text-sm text-ink-muted mt-1">Access your CommandSite dashboard</p>
      </div>

      <form class="space-y-4" @submit.prevent="onSubmit">
        <div>
          <label class="block text-sm font-medium text-ink mb-1">Email</label>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="input"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-ink mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="input"
          />
        </div>

        <p v-if="auth.error" class="text-sm text-danger">{{ auth.error }}</p>

        <button type="submit" class="btn-primary w-full" :disabled="submitting">
          {{ submitting ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </div>
  </div>
</template>
