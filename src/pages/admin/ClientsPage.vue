<script setup lang="ts">
/**
 * Admin · Clients page.
 *
 * Customer operations dashboard. Two main sections:
 *
 *   1. Onboarding pipeline (kanban) — every signed customer flowing
 *      through signed → paid → discovery → provisioned → shadow → live.
 *   2. Active customers (enhanced table) — who's live, MRR, lifetime $,
 *      days as customer, health pill.
 *
 * The legacy "dashboards I manage" registry (the old `clients` table —
 * Apex demo, Cornerstone demo, UFD, CommandSite-on-CommandSite, etc.)
 * is kept below as a secondary collapsed section since it's still used
 * for dashboard routing.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useCustomers } from '@/lib/clients/commandsite/customersApi'
import type { Client } from '@/types/database'
import CommandSiteCustomerKanban from '@/components/CommandSiteCustomerKanban.vue'
import CommandSiteActiveCustomersTable from '@/components/CommandSiteActiveCustomersTable.vue'
import CommandSiteOnboardingDrawer from '@/components/CommandSiteOnboardingDrawer.vue'

const router = useRouter()

const {
  customers,
  activeCustomers,
  onboardingCustomers,
  loading: customersLoading,
  error: customersError,
  advanceStage,
  revertStage,
} = useCustomers()

// Onboarding drawer state — opens when an onboarding-stage card is clicked.
// Active customer rows still route to the detail page (the kanban-only
// click opens the drawer; the table-row click stays as before).
const drawerCustomerId = ref<string | null>(null)
const drawerCustomer = computed(() =>
  drawerCustomerId.value
    ? customers.value.find((c) => c.id === drawerCustomerId.value) ?? null
    : null,
)
function openOnboardingDrawer(id: string) {
  drawerCustomerId.value = id
}
function closeOnboardingDrawer() {
  drawerCustomerId.value = null
}

// Legacy dashboard registry — expanded by default so demo dashboards
// (Apex / Cornerstone / commandsite-demo) stay one click away.
const dashboards = ref<Client[]>([])
const dashboardsExpanded = ref(true)
const dashboardsLoading = ref(true)
const dashboardsError = ref<string | null>(null)

async function loadDashboards() {
  dashboardsLoading.value = true
  const { data, error: err } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })
  if (err) dashboardsError.value = err.message
  else dashboards.value = data ?? []
  dashboardsLoading.value = false
}

// Stage-advance state — disable buttons while a request is in flight
const stageBusy = ref(false)
const toast = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

async function onAdvance(id: string) {
  if (stageBusy.value) return
  stageBusy.value = true
  toast.value = null
  const res = await advanceStage(id)
  stageBusy.value = false
  if (!res.ok) {
    toast.value = { kind: 'err', text: `Advance failed: ${res.error}` }
    return
  }
  toast.value = {
    kind: 'ok',
    text: res.activated
      ? 'Customer activated — welcome email fired.'
      : 'Stage advanced.',
  }
  setTimeout(() => { toast.value = null }, 4000)
}

async function onRevert(id: string) {
  if (stageBusy.value) return
  stageBusy.value = true
  toast.value = null
  const res = await revertStage(id)
  stageBusy.value = false
  if (!res.ok) {
    toast.value = { kind: 'err', text: `Revert failed: ${res.error}` }
    return
  }
  toast.value = { kind: 'ok', text: 'Stage reverted.' }
  setTimeout(() => { toast.value = null }, 4000)
}

function openCustomerDetail(id: string) {
  // For active customers, jump straight to their dashboard (where the
  // operator actually works). For onboarding customers, we'd open the
  // drawer instead — but the kanban handles that path via @open ->
  // openOnboardingDrawer. This handler only gets called from the
  // active-customers table.
  const customer = customers.value.find((c) => c.id === id)
  if (customer?.status === 'active' && customer.slug) {
    router.push({ name: 'dashboard.home', params: { slug: customer.slug } })
    return
  }
  // Fallback to the legacy detail route
  router.push({ name: 'admin.client-detail', params: { id } })
}

function openDashboard(id: string) {
  router.push({ name: 'admin.client-detail', params: { id } })
}

onMounted(() => {
  loadDashboards()
})
</script>

<template>
  <div class="space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-ink">Customers</h1>
        <p class="text-sm text-ink-muted">
          Onboarding pipeline · active customers · health · revenue.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="text-xs font-semibold text-ink-muted hover:text-ink"
          @click="dashboardsExpanded = !dashboardsExpanded"
        >
          {{ dashboardsExpanded ? 'Hide' : 'Show' }} dashboards registry
        </button>
      </div>
    </header>

    <div
      v-if="toast"
      class="rounded-md px-3 py-2 text-xs font-medium"
      :class="toast.kind === 'ok'
        ? 'bg-success/10 text-success border border-success/30'
        : 'bg-danger/10 text-danger border border-danger/30'"
    >
      {{ toast.text }}
    </div>

    <p v-if="customersError" class="text-sm text-danger">{{ customersError }}</p>

    <!-- Public landing pages — quick links to every marketing surface
         in this repo. Useful when sending a prospect a link, doing a
         design review, or QA'ing after a deploy. -->
    <section class="card p-0 overflow-hidden">
      <header class="px-5 py-3 border-b border-divider bg-surface-raised">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
          Public landing pages
        </div>
        <p class="text-xs text-ink-muted mt-0.5">
          Marketing surfaces · open in new tab.
        </p>
      </header>
      <ul class="divide-y divide-divider">
        <li class="px-5 py-3 flex items-center justify-between gap-3 hover:bg-canvas/40 transition-colors">
          <div>
            <div class="text-sm font-semibold text-ink">CommandSite · Ada</div>
            <div class="text-[11px] text-ink-muted mt-0.5">
              AI employees for local service businesses · <code class="font-mono text-[10px]">/</code>
            </div>
          </div>
          <a href="/" target="_blank" rel="noopener" class="text-xs font-semibold text-brand hover:underline">Open →</a>
        </li>
        <li class="px-5 py-3 flex items-center justify-between gap-3 hover:bg-canvas/40 transition-colors">
          <div>
            <div class="text-sm font-semibold text-ink">CommandSite · Grace</div>
            <div class="text-[11px] text-ink-muted mt-0.5">
              AI ministry assistant for churches · <code class="font-mono text-[10px]">/churches</code>
            </div>
          </div>
          <a href="/churches" target="_blank" rel="noopener" class="text-xs font-semibold text-brand hover:underline">Open →</a>
        </li>
        <li class="px-5 py-3 flex items-center justify-between gap-3 hover:bg-canvas/40 transition-colors">
          <div>
            <div class="text-sm font-semibold text-ink">Staci Daniel Music</div>
            <div class="text-[11px] text-ink-muted mt-0.5">
              Classical piano lessons · Kissimmee, FL · <code class="font-mono text-[10px]">/staci</code>
            </div>
          </div>
          <a href="/staci" target="_blank" rel="noopener" class="text-xs font-semibold text-brand hover:underline">Open →</a>
        </li>
        <li class="px-5 py-3 flex items-center justify-between gap-3 hover:bg-canvas/40 transition-colors">
          <div>
            <div class="text-sm font-semibold text-ink">Pitch deck</div>
            <div class="text-[11px] text-ink-muted mt-0.5">
              Sales deck · used live on discovery calls · <code class="font-mono text-[10px]">/pitch</code>
            </div>
          </div>
          <a href="/pitch" target="_blank" rel="noopener" class="text-xs font-semibold text-brand hover:underline">Open →</a>
        </li>
      </ul>
    </section>

    <!-- Onboarding pipeline kanban -->
    <div v-if="customersLoading" class="text-sm text-ink-muted">Loading…</div>
    <template v-else>
      <CommandSiteCustomerKanban
        :customers="onboardingCustomers"
        :busy="stageBusy"
        @advance="onAdvance"
        @revert="onRevert"
        @open="openOnboardingDrawer"
      />

      <CommandSiteActiveCustomersTable
        :customers="activeCustomers"
        @open="openCustomerDetail"
      />

      <!-- Per-customer onboarding action drawer — opens from any
           kanban card click; shows the full task list + sign-offs. -->
      <CommandSiteOnboardingDrawer
        :customer="drawerCustomer"
        :open="drawerCustomerId !== null"
        @close="closeOnboardingDrawer"
      />

      <!-- Empty-state hint when there are no customers at all -->
      <div
        v-if="customers.length === 0"
        class="card text-center py-10"
      >
        <div class="text-4xl mb-2">📭</div>
        <p class="text-sm font-semibold text-ink">No signed customers yet</p>
        <p class="text-xs text-ink-muted mt-1">
          When a deal closes in Pipeline, promote it via the onboarding wizard
          and they'll show up in the "Signed" column above.
        </p>
      </div>
    </template>

    <!-- Legacy dashboards registry (collapsed by default) -->
    <section v-if="dashboardsExpanded" class="card p-0 overflow-hidden">
      <header class="px-5 py-3 border-b border-divider bg-surface-raised">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Dashboards registry
        </div>
        <p class="text-xs text-ink-muted mt-0.5">
          Every dashboard route (real customers + demos + personal). Used internally for slug routing.
        </p>
      </header>
      <div v-if="dashboardsLoading" class="px-5 py-3 text-sm text-ink-muted">Loading…</div>
      <p v-if="dashboardsError" class="px-5 py-3 text-sm text-danger">{{ dashboardsError }}</p>
      <table v-if="!dashboardsLoading && dashboards.length > 0" class="w-full text-sm">
        <thead class="bg-canvas text-[10px] font-medium text-ink-muted uppercase tracking-wide">
          <tr>
            <th class="px-5 py-2 text-left">Name</th>
            <th class="px-5 py-2 text-left">Slug</th>
            <th class="px-5 py-2 text-left">Tier</th>
            <th class="px-5 py-2 text-left">Active</th>
            <th class="px-5 py-2 text-right"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-divider">
          <tr v-for="d in dashboards" :key="d.id" class="hover:bg-canvas/50">
            <td class="px-5 py-2 font-medium text-ink">{{ d.name }}</td>
            <td class="px-5 py-2 text-ink-muted font-mono text-xs">{{ d.slug }}</td>
            <td class="px-5 py-2 text-ink-muted capitalize text-xs">{{ d.tier }}</td>
            <td class="px-5 py-2">
              <span
                class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                :class="d.active ? 'bg-success/15 text-success' : 'bg-ink-muted/15 text-ink-muted'"
              >{{ d.active ? 'Active' : 'Inactive' }}</span>
            </td>
            <td class="px-5 py-2 text-right">
              <button
                type="button"
                class="text-xs font-semibold text-brand hover:underline"
                @click="openDashboard(d.id)"
              >Open →</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
