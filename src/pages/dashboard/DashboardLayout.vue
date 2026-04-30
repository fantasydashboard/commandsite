<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { RouterView, RouterLink, useRouter, useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import BrandLogo from '@/components/BrandLogo.vue'
import { modulesForClient } from '@/config/clients'
import { visibleTabsFor } from '@/modules/registry'
import type { Client } from '@/types/database'
import { DashboardContextKey } from './context'

const props = defineProps<{ slug: string }>()

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const client = ref<Client | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Module enablement comes from src/config/clients.ts — edit that file to
// add/remove modules for a client; no DB round-trip.
const enabledModuleKeys = computed<Set<string>>(
  () => new Set(modulesForClient(props.slug).map((m) => m.key)),
)

// Tab structure (with subtabs) for this client. A subtab only appears
// in the nav if at least one of the client's enabled modules targets it.
const visibleTabs = computed(() => visibleTabsFor(enabledModuleKeys.value))

// The active top-level tab.
const activeTabKey = computed<string>(() => {
  if (route.name === 'dashboard.crm') return 'crm'
  return (route.params.tab as string) ?? ''
})

const activeTabDef = computed(() =>
  visibleTabs.value.find((t) => t.key === activeTabKey.value),
)

const activeSubtabKey = computed<string>(
  () => (route.params.subtab as string) ?? '',
)

// First subtab to land on for a given tab. Used when building the top-nav
// link so clicking "Marketing" goes straight to the first available subtab
// (e.g. /marketing/email).
function tabHref(tabKey: string): {
  name: 'dashboard.crm' | 'dashboard.tab'
  params: { slug: string; tab?: string; subtab?: string }
} {
  if (tabKey === 'crm') {
    return { name: 'dashboard.crm', params: { slug: props.slug } }
  }
  const def = visibleTabs.value.find((t) => t.key === tabKey)
  const subtab = def?.subtabs && def.subtabs.length > 0 ? def.subtabs[0].key : undefined
  return { name: 'dashboard.tab', params: { slug: props.slug, tab: tabKey, subtab } }
}

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
              :to="tabHref(tab.key)"
              class="text-ink-inverse/70 hover:text-ink-inverse transition-colors"
              :class="{
                'text-ink-inverse font-medium': activeTabKey === tab.key,
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

      <!-- Subtab nav: only shown when the active tab declares subtabs -->
      <div
        v-if="activeTabDef?.subtabs && activeTabDef.subtabs.length > 0"
        class="border-t border-ink-inverse/10"
      >
        <div class="mx-auto flex max-w-7xl items-center gap-4 px-6 py-2 text-xs">
          <RouterLink
            v-for="sub in activeTabDef.subtabs"
            :key="sub.key"
            :to="{
              name: 'dashboard.tab',
              params: { slug, tab: activeTabKey, subtab: sub.key },
            }"
            class="text-ink-inverse/60 hover:text-ink-inverse uppercase tracking-wide transition-colors"
            :class="{
              'text-ink-inverse font-semibold': activeSubtabKey === sub.key,
            }"
          >
            {{ sub.label }}
          </RouterLink>
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
