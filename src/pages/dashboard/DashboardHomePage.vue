<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { dashboardTabs, getModule, type ModuleDefinition } from '@/modules/registry'
import { modulesForClient } from '@/config/clients'
import { useDashboardContext } from './context'

const props = defineProps<{ tab?: string }>()
const { client } = useDashboardContext()
const router = useRouter()

interface ResolvedModule {
  key: string
  config: Record<string, unknown>
  def: ModuleDefinition
}

const allModules = computed<ResolvedModule[]>(() => {
  if (!client.value) return []
  return modulesForClient(client.value.slug)
    .map((m) => {
      const def = getModule(m.key)
      if (!def) return null
      return { key: m.key, config: m.config ?? {}, def }
    })
    .filter((m): m is ResolvedModule => m !== null)
})

// Tabs the current client has at least one enabled module for, in the
// canonical order from the registry's dashboardTabs list.
const availableTabKeys = computed<string[]>(() => {
  const keysWithModules = new Set(allModules.value.map((m) => m.def.tab).filter(Boolean) as string[])
  return dashboardTabs.filter((t) => keysWithModules.has(t.key)).map((t) => t.key)
})

// Modules that should render right now: those tagged with the active tab,
// or — if no tabs exist for this client — every module (legacy mode).
const visibleModules = computed<ResolvedModule[]>(() => {
  if (availableTabKeys.value.length === 0) return allModules.value
  if (!props.tab) return []
  return allModules.value.filter((m) => m.def.tab === props.tab)
})

// If we landed on the bare home (no :tab) and the client has tabbed
// modules, redirect to the first available tab. Done as a watcher with
// `immediate: true` so it fires both on initial mount and when the slug
// switches (admin previewing different clients).
watch(
  [() => client.value?.slug, () => props.tab, availableTabKeys],
  ([slug, tab, tabs]) => {
    if (!slug || tab) return
    if (tabs.length === 0) return
    // CRM has its own named route — use it for nice URLs.
    const target = tabs[0]
    if (target === 'crm') {
      router.replace({ name: 'dashboard.crm', params: { slug } })
    } else {
      router.replace({ name: 'dashboard.tab', params: { slug, tab: target } })
    }
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <div
      v-if="allModules.length === 0"
      class="card text-center text-ink-muted"
    >
      No modules are configured for this dashboard yet.
    </div>

    <div
      v-else-if="props.tab && visibleModules.length === 0"
      class="card text-center text-ink-muted"
    >
      Nothing in the {{ props.tab }} tab yet.
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-2">
      <section
        v-for="m in visibleModules"
        :key="m.key"
        :class="m.def.fullWidth ? 'lg:col-span-2' : 'card'"
      >
        <component
          :is="m.def.component"
          :client="client!"
          :config="m.config"
        />
      </section>
    </div>
  </div>
</template>
