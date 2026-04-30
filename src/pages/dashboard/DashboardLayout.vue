<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import BrandLogo from '@/components/BrandLogo.vue'
import { modulesForClient } from '@/config/clients'
import { dashboardTabs, getModule } from '@/modules/registry'
import type { Client } from '@/types/database'
import { DashboardContextKey } from './context'

const props = defineProps<{ slug: string }>()

const auth = useAuthStore()
const router = useRouter()

const client = ref<Client | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Module enablement comes from src/config/clients.ts — edit that file to
// add/remove modules for a client; no DB round-trip.
const enabledModuleKeys = computed<Set<string>>(
  () => new Set(modulesForClient(props.slug).map((m) => m.key)),
)

// Tabs visible in the nav: the canonical dashboardTabs order, filtered to
// those that have at least one enabled module for this client.
const visibleTabs = computed(() => {
  const tabsInUse = new Set<string>()
  for (const m of modulesForClient(props.slug)) {
    const def = getModule(m.key)
    if (def?.tab) tabsInUse.add(def.tab)
  }
  return dashboardTabs.filter((t) => tabsInUse.has(t.key))
})

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
    <header class="bg-surface-dark">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div class="flex items-center gap-8">
          <RouterLink :to="`/dashboard/${slug}`" class="flex items-center gap-3">
            <BrandLogo surface="dark" :height="32" />
            <span
              v-if="client"
              class="text-sm text-ink-inverse/80 border-l border-ink-inverse/20 pl-3"
            >
              {{ client.name }}
            </span>
          </RouterLink>
          <nav v-if="visibleTabs.length > 0" class="flex gap-4 text-sm">
            <RouterLink
              v-for="tab in visibleTabs"
              :key="tab.key"
              :to="
                tab.key === 'crm'
                  ? `/dashboard/${slug}/crm`
                  : `/dashboard/${slug}/${tab.key}`
              "
              class="text-ink-inverse/70 hover:text-ink-inverse transition-colors"
              :class="{
                'text-ink-inverse font-medium':
                  $route.params.tab === tab.key ||
                  (tab.key === 'crm' && $route.name === 'dashboard.crm'),
              }"
            >
              {{ tab.label }}
            </RouterLink>
          </nav>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-sm text-ink-inverse/70">{{ auth.profile?.email }}</span>
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
