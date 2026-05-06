<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { RouterView, RouterLink, useRouter, useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import ClientWordmark from '@/components/ClientWordmark.vue'
import AskAiFloatingButton from '@/components/AskAiFloatingButton.vue'
import { modulesForClient } from '@/config/clients'
import { themeForClient } from '@/config/clientThemes'
import { visibleTabsFor, badgesForTab, type TabBadge } from '@/modules/registry'
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

// Per-client theme — CSS variable overrides. Applied to documentElement
// (not the wrapper) so the body's page-wash gradient picks them up too.
// Cleaned up on unmount and re-applied when the slug changes.
const theme = computed(() => themeForClient(props.slug))

let appliedKeys: string[] = []
function applyTheme() {
  // Remove anything from the previous client first.
  for (const k of appliedKeys) document.documentElement.style.removeProperty(k)
  appliedKeys = []
  for (const [k, v] of Object.entries(theme.value.vars)) {
    document.documentElement.style.setProperty(k, v)
    appliedKeys.push(k)
  }
}
watch(theme, applyTheme, { immediate: true })
onUnmounted(() => {
  for (const k of appliedKeys) document.documentElement.style.removeProperty(k)
  appliedKeys = []
})

// Tab structure (with subtabs) for this client. A subtab only appears
// in the nav if at least one of the client's enabled modules targets it.
const visibleTabs = computed(() => visibleTabsFor(enabledModuleKeys.value))

// Settings is reachable from a gear icon in the page header rather than
// the top tab bar — keeps room for primary navigation tabs.
const navTabs = computed(() => visibleTabs.value.filter((t) => t.key !== 'settings'))
const hasSettings = computed(() => visibleTabs.value.some((t) => t.key === 'settings'))

// Per-tab badge — modules under each tab can declare a count. Aggregated
// here so the nav shows "Calls 2" without each component knowing about
// the others.
function tabBadge(tabKey: string): TabBadge | null {
  return badgesForTab(tabKey, enabledModuleKeys.value)
}

function badgeClass(tone: TabBadge['tone']): string {
  if (tone === 'danger') return 'bg-danger text-white'
  if (tone === 'warn')   return 'bg-amber-500 text-white'
  return 'bg-accent text-white'
}

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

// Display name for synthetic demo clients (slug -> name). Real customer
// clients have their name in the DB; demo dashboards are local-only and
// need a friendly title here.
const DEMO_CLIENT_NAMES: Record<string, string> = {
  'apex': 'Apex Heating & Air',
  'apex-heating-and-air': 'Apex Heating & Air',
  'cornerstone-church': 'Cornerstone Community Church',
  'commandsite': 'CommandSite',
  'commandsite-demo': 'CommandSite (demo snapshot)',
  'ufd-redesign': 'Ultimate Fantasy Dashboard',
  'ultimate-fantasy-dashboard': 'Ultimate Fantasy Dashboard',
}

function titleizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
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

  if (c) {
    // Real client row from the DB — production customers, etc.
    client.value = c as Client
  } else if (modulesForClient(props.slug).length > 0) {
    // Demo client — slug exists in src/config/clients.ts but has no DB
    // row. Synthesize a Client so the dashboard renders. Real customers
    // will always come through the DB branch above.
    client.value = {
      id: `demo-${props.slug}`,
      name: DEMO_CLIENT_NAMES[props.slug] ?? titleizeSlug(props.slug),
      slug: props.slug,
      active: true,
      tier: 'demo',
      monthly_rate: 0,
      created_at: new Date().toISOString(),
    }
  } else {
    client.value = null
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
  <div class="min-h-screen">
    <!-- Top chrome: brand bar + primary nav. Subtle gradient gives the
         dark header a hint of brand warmth without overwhelming. -->
    <header
      class="bg-chrome relative"
      :style="{
        backgroundImage:
          'linear-gradient(180deg, rgb(var(--color-chrome)) 0%, rgb(var(--color-chrome)) 70%, color-mix(in srgb, rgb(var(--color-chrome)) 92%, rgb(var(--color-brand)) 8%) 100%)',
      }"
    >
      <div class="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3.5">
        <RouterLink :to="`/dashboard/${slug}`" class="flex items-center gap-3 flex-shrink-0">
          <ClientWordmark :theme="theme" surface="dark" :height="30" />
        </RouterLink>
        <nav
          v-if="navTabs.length > 0"
          class="flex gap-1 text-sm overflow-x-auto whitespace-nowrap min-w-0 flex-1 scrollbar-thin"
        >
          <RouterLink
            v-for="tab in navTabs"
            :key="tab.key"
            :to="tabHref(tab.key)"
            class="rounded-full px-3 py-1.5 text-chrome-ink/65 hover:text-chrome-ink hover:bg-chrome-ink/5 transition-colors inline-flex items-center gap-1.5 flex-shrink-0"
            :class="{
              'text-chrome-ink bg-chrome-ink/10 font-medium': activeTabKey === tab.key,
            }"
          >
            {{ tab.label }}
            <span
              v-if="tabBadge(tab.key)"
              class="rounded-full px-1.5 min-w-[1.25rem] text-center text-[10px] font-bold leading-[1.1rem]"
              :class="badgeClass(tabBadge(tab.key)!.tone)"
            >
              {{ tabBadge(tab.key)!.count }}
            </span>
          </RouterLink>
        </nav>
        <div class="flex items-center gap-3 flex-shrink-0">
          <RouterLink
            v-if="auth.isAdmin"
            to="/admin"
            class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-chrome-ink/70 hover:text-chrome-ink hover:bg-chrome-ink/5 transition-colors whitespace-nowrap"
            title="Back to admin clients page"
          >
            ← Admin
          </RouterLink>
          <button v-if="auth.isAuthenticated" class="btn-secondary" @click="onLogout">Sign out</button>
          <RouterLink
            v-else
            to="/"
            class="btn-secondary"
          >← Back to commandsite.io</RouterLink>
        </div>
      </div>

      <!-- Subtab nav — only render when 2+ subtabs are visible.
           A lone subtab is just clutter; the auto-redirect already
           lands the user there. -->
      <div
        v-if="activeTabDef?.subtabs && activeTabDef.subtabs.length > 1"
        class="border-t border-chrome-ink/10"
      >
        <div class="mx-auto flex max-w-7xl items-center gap-1 px-6 py-1.5 text-xs">
          <RouterLink
            v-for="sub in activeTabDef.subtabs"
            :key="sub.key"
            :to="{
              name: 'dashboard.tab',
              params: { slug, tab: activeTabKey, subtab: sub.key },
            }"
            class="rounded-full px-3 py-1 text-chrome-ink/55 hover:text-chrome-ink uppercase tracking-wider transition-colors"
            :class="{
              'text-chrome-ink bg-chrome-ink/10 font-semibold': activeSubtabKey === sub.key,
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
      <template v-else>
        <header class="mb-6 flex items-baseline justify-between gap-3 border-b border-divider pb-4">
          <h1 class="text-2xl font-semibold text-ink tracking-tight">{{ client.name }}</h1>
          <div class="flex items-center gap-2">
            <span v-if="auth.profile?.email" class="text-xs text-ink-muted">{{ auth.profile.email }}</span>
            <RouterLink
              v-if="hasSettings"
              :to="tabHref('settings')"
              class="rounded-full p-1.5 text-ink-muted hover:text-ink hover:bg-surface-elevated transition-colors"
              :aria-label="'Settings'"
              title="Settings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="h-4 w-4"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </RouterLink>
          </div>
        </header>
        <RouterView />
      </template>
    </main>

    <!-- Floating Ask-Ada / Ask-Grace button — only renders for clients
         that have a persona configured in personas/registry.ts -->
    <AskAiFloatingButton :slug="props.slug" />
  </div>
</template>
