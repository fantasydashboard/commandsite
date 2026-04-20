<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import BrandLogo from '@/components/BrandLogo.vue'

const auth = useAuthStore()
const router = useRouter()

async function onLogout() {
  await auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="min-h-screen bg-surface">
    <header class="border-b border-divider bg-surface-raised">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div class="flex items-center gap-8">
          <RouterLink to="/admin" class="flex items-center gap-3">
            <BrandLogo :height="32" />
            <span class="text-xs uppercase tracking-wider text-ink-muted">Admin</span>
          </RouterLink>
          <nav class="flex gap-4 text-sm">
            <RouterLink
              to="/admin"
              class="text-ink-muted hover:text-ink transition-colors"
              active-class="text-ink font-medium"
            >
              Clients
            </RouterLink>
          </nav>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-sm text-ink-muted">{{ auth.profile?.email }}</span>
          <button class="btn-secondary" @click="onLogout">Sign out</button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-6 py-8">
      <RouterView />
    </main>
  </div>
</template>
