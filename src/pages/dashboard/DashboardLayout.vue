<script setup lang="ts">
import { onMounted, provide, ref, watch } from 'vue'
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import BrandLogo from '@/components/BrandLogo.vue'
import type { Client } from '@/types/database'
import { DashboardContextKey } from './context'

const props = defineProps<{ slug: string }>()

const auth = useAuthStore()
const router = useRouter()

const client = ref<Client | null>(null)
const enabledModuleKeys = ref<Set<string>>(new Set())
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  const { data: c, error: e1 } = await supabase
    .from('clients')
    .select('*')
    .eq('slug', props.slug)
    .maybeSingle()

  if (e1) error.value = e1.message
  client.value = c as Client | null

  if (client.value) {
    const { data: m, error: e2 } = await supabase
      .from('client_modules')
      .select('module_key, enabled')
      .eq('client_id', client.value.id)
    if (e2) error.value = e2.message
    enabledModuleKeys.value = new Set(
      (m ?? []).filter((r) => r.enabled).map((r) => r.module_key),
    )
  }
  loading.value = false
}

provide(DashboardContextKey, {
  client,
  enabledModuleKeys,
  loading,
  error,
})

onMounted(load)
watch(() => props.slug, load)

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
          <RouterLink :to="`/dashboard/${slug}`" class="flex items-center gap-3">
            <BrandLogo :height="32" />
            <span v-if="client" class="text-sm text-ink-muted border-l border-divider pl-3">
              {{ client.name }}
            </span>
          </RouterLink>
          <nav v-if="enabledModuleKeys.size > 0" class="flex gap-4 text-sm">
            <RouterLink
              :to="`/dashboard/${slug}`"
              class="text-ink-muted hover:text-ink transition-colors"
              :class="{ 'text-ink font-medium': $route.name === 'dashboard.home' }"
            >
              Overview
            </RouterLink>
            <RouterLink
              v-if="enabledModuleKeys.has('crm')"
              :to="`/dashboard/${slug}/crm`"
              class="text-ink-muted hover:text-ink transition-colors"
              active-class="text-ink font-medium"
            >
              CRM
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
      <p v-if="error" class="text-sm text-danger mb-4">{{ error }}</p>
      <div v-if="loading" class="text-sm text-ink-muted">Loading…</div>
      <div v-else-if="!client" class="card text-center text-ink-muted">
        Dashboard not found.
      </div>
      <RouterView v-else />
    </main>
  </div>
</template>
