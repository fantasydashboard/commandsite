<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  getModule,
  visibleTabsFor,
  type ModuleDefinition,
} from '@/modules/registry'
import { modulesForUser } from '@/lib/clients/church/access'
import { useDashboardContext } from './context'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ tab?: string; subtab?: string }>()
const { client } = useDashboardContext()
const router = useRouter()
const auth = useAuthStore()

interface ResolvedModule {
  key: string
  config: Record<string, unknown>
  def: ModuleDefinition
}

const allModules = computed<ResolvedModule[]>(() => {
  if (!client.value) return []
  return modulesForUser(client.value.slug, { role: auth.profile?.role, permissionScope: auth.permissionScope })
    .map((m) => {
      const def = getModule(m.key)
      if (!def) return null
      return { key: m.key, config: m.config ?? {}, def }
    })
    .filter((m): m is ResolvedModule => m !== null)
})

// Tab structure (with subtabs) for this client — only tabs/subtabs that
// have at least one enabled module are kept.
const visibleTabs = computed(() =>
  visibleTabsFor(new Set(allModules.value.map((m) => m.key))),
)

// The current tab's definition (for subtab logic).
const currentTabDef = computed(() =>
  visibleTabs.value.find((t) => t.key === props.tab),
)

// Modules to render right now: filtered by the active tab AND, if the tab
// has subtabs, also filtered by the active subtab.
const visibleModules = computed<ResolvedModule[]>(() => {
  if (visibleTabs.value.length === 0) return allModules.value
  if (!props.tab) return []
  const tabModules = allModules.value.filter((m) => m.def.tab === props.tab)
  if (currentTabDef.value?.subtabs && currentTabDef.value.subtabs.length > 0) {
    if (!props.subtab) return []
    return tabModules.filter((m) => m.def.subtab === props.subtab)
  }
  return tabModules
})

// Redirects:
//   - bare /dashboard/:slug                  → first tab (or its first subtab)
//   - /dashboard/:slug/:tab on a sub-tabbed  → first available subtab
//     tab and no subtab in the URL
//
// CRM keeps its dedicated route — handled by routing in the layout.
watch(
  [
    () => client.value?.slug,
    () => props.tab,
    () => props.subtab,
    visibleTabs,
    currentTabDef,
  ],
  ([slug, tab, subtab, tabs, tabDef]) => {
    if (!slug || tabs.length === 0) return

    if (!tab) {
      // Land on first tab. If it has subtabs, land on first subtab too.
      const target = tabs[0]
      if (target.key === 'crm') {
        router.replace({ name: 'dashboard.crm', params: { slug } })
        return
      }
      const params: { slug: string; tab: string; subtab?: string } = {
        slug,
        tab: target.key,
      }
      if (target.subtabs && target.subtabs.length > 0) {
        params.subtab = target.subtabs[0].key
      }
      router.replace({ name: 'dashboard.tab', params })
      return
    }

    // We have a tab in the URL. If it has subtabs and no subtab is
    // selected, redirect to the first available subtab.
    if (tabDef?.subtabs && tabDef.subtabs.length > 0 && !subtab) {
      router.replace({
        name: 'dashboard.tab',
        params: { slug, tab, subtab: tabDef.subtabs[0].key },
      })
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
      Nothing here yet.
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
