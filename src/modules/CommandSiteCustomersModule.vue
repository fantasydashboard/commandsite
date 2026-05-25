<script setup lang="ts">
/**
 * CommandSite Customers — book of business view. Each row is a paying
 * (or trialing / churned) home-services company. Surfaces health
 * score, MRR, plan, and a one-line "signal" so the founder can spot
 * expansion + retention work at a glance.
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Client } from '@/types/database'
import {
  companies,
  customerStats,
  PLAN_META,
  STAGE_META,
  INDUSTRY_LABEL,
  type Company,
  type CustomerStage,
  type Plan,
} from '@/lib/clients/commandsite/companies'
import CommandSiteAdaActivityStrip from '@/components/CommandSiteAdaActivityStrip.vue'
import CommandSiteOnboardingWizard from '@/components/CommandSiteOnboardingWizard.vue'
import { useCustomers } from '@/lib/clients/commandsite/customersApi'
import { useDeals } from '@/lib/clients/commandsite/dealsApi'
import { useToasts } from '@/components/grace/useToasts'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// ── Real customers (cs_customers) ─────────────────────────────────────
const customersApi = useCustomers()
const dealsApi = useDeals()
const toasts = useToasts()

const wizardOpen = ref(false)
const wizardSourceDeal = ref<{ id: string; company_name: string; contact_name?: string; contact_email?: string; industry?: string; city?: string; state?: string } | null>(null)

// Closed-won deals not yet promoted to customers
const closedWonDeals = computed(() => {
  const customerDealIds = new Set(customersApi.customers.value.map((c) => c.deal_id).filter(Boolean))
  return dealsApi.deals.value.filter((d) => d.stage === 'closed_won' && !customerDealIds.has(d.id))
})

function openWizardBlank() {
  wizardSourceDeal.value = null
  wizardOpen.value = true
}
// deno-lint-ignore no-explicit-any
function openWizardFromDeal(deal: any) {
  wizardSourceDeal.value = deal
  wizardOpen.value = true
}

async function onWizardSave(payload: Record<string, unknown>) {
  // deno-lint-ignore no-explicit-any
  const result = await customersApi.createCustomer(payload as any)
  if (result.ok) {
    wizardOpen.value = false
    wizardSourceDeal.value = null
    toasts.push(`✓ ${payload.org_name} onboarded — opening their dashboard`, 'success')
    // If the customer was promoted from a deal, flip the deal to closed_won
    if (payload.deal_id) {
      try { await dealsApi.updateStage(payload.deal_id as string, 'closed_won') } catch { /* ignore */ }
    }
    await customersApi.load()
  } else {
    toasts.push(result.error ?? 'Failed to onboard customer', 'warn')
  }
}

// ── Welcome email send / resend ───────────────────────────────────────
const welcomeSending = ref<string | null>(null)
async function onSendWelcome(customerId: string, force: boolean) {
  if (welcomeSending.value) return
  welcomeSending.value = customerId
  const result = await customersApi.sendWelcome(customerId, { force })
  welcomeSending.value = null
  if (result.ok) toasts.push(force ? '✓ Welcome resent' : '✓ Welcome sent', 'success')
  else toasts.push(`Welcome send failed: ${result.error ?? 'unknown'}`, 'warn')
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

const stats = computed(() => customerStats())

type SortKey = 'name' | 'mrr' | 'health' | 'last_login' | 'signed_at'
const sortBy = ref<SortKey>('mrr')
const sortDir = ref<'asc' | 'desc'>('desc')
const stageFilter = ref<CustomerStage | 'all'>('all')
const planFilter = ref<Plan | 'all'>('all')

const stageOrder: CustomerStage[] = [
  'expansion_ready', 'active', 'onboarding', 'trial', 'at_risk', 'churned',
]

const filtered = computed<Company[]>(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...companies]
    .filter((c) => stageFilter.value === 'all' || c.stage === stageFilter.value)
    .filter((c) => planFilter.value === 'all' || c.plan === planFilter.value)
    .sort((a, b) => {
      if (sortBy.value === 'name')       return a.name.localeCompare(b.name) * dir
      if (sortBy.value === 'mrr')        return (a.mrr_cents - b.mrr_cents) * dir
      if (sortBy.value === 'health')     return (a.health_score - b.health_score) * dir
      if (sortBy.value === 'signed_at')  return (new Date(a.signed_at).getTime() - new Date(b.signed_at).getTime()) * dir
      return (new Date(a.last_login_at).getTime() - new Date(b.last_login_at).getTime()) * dir
    })
})

function toggleSort(k: SortKey) {
  if (sortBy.value === k) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortBy.value = k; sortDir.value = k === 'name' ? 'asc' : 'desc' }
}
function sortInd(k: SortKey): string {
  if (sortBy.value !== k) return ''
  return sortDir.value === 'asc' ? '↑' : '↓'
}

function money(cents: number, opts: { compact?: boolean } = {}): string {
  if (cents === 0) return '—'
  if (opts.compact && cents >= 100_000) return '$' + Math.round(cents / 1000) + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return `${Math.floor(day / 30)}mo ago`
}

function fmtSigned(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const day = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (day < 30) return `${day}d ago`
  if (day < 365) return `${Math.floor(day / 30)}mo ago`
  return `${(day / 365).toFixed(1)}yr ago`
}

function healthColor(score: number): string {
  if (score >= 80) return '#10B981'  // emerald
  if (score >= 60) return 'rgb(var(--color-brand))'
  if (score >= 40) return '#F59E0B'  // amber
  return '#EF4444'
}

function healthTrendArrow(t: Company['health_trend']): string {
  if (t === 'up') return '↑'
  if (t === 'down') return '↓'
  return '→'
}
function healthTrendColor(t: Company['health_trend']): string {
  if (t === 'up') return '#10B981'
  if (t === 'down') return '#EF4444'
  return '#94A3B8'
}
</script>

<template>
  <div class="space-y-4">
    <CommandSiteAdaActivityStrip
      tab-key="customers"
      summary="Ada watches every paying customer for early churn signals (MRR drops, product-usage cliffs, support ticket spikes) and triages inbound support tickets with drafted replies."
      :activity="[
        { icon: 'customer_health', label: 'No customers yet', detail: 'roles activate once you onboard your first paying customer', ago: 'live' },
        { icon: 'qa_assistant', label: 'Support Triage standing by', detail: 'will classify + draft replies to inbound tickets when they start', ago: '—' },
      ]"
    />

    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Customers</h2>
        <p class="text-sm text-ink-muted">
          Your book of business — every paying client, trial, and recently-churned account, with health + MRR + signal.
        </p>
      </div>
      <button
        type="button"
        class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90"
        @click="openWizardBlank"
      >+ Onboard customer</button>
    </div>

    <!-- ── REAL CUSTOMERS (cs_customers) — appears once Josh has signed any -->
    <section
      v-if="customersApi.customers.value.length > 0 || closedWonDeals.length > 0"
      class="rounded-card border-2 border-brand/30 bg-gradient-to-br from-brand/5 to-surface overflow-hidden"
    >
      <header class="px-5 py-4 border-b border-brand/20 bg-brand/10">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">Live customers</div>
        <h3 class="text-base font-bold text-ink">Paying CommandSite customers</h3>
      </header>

      <!-- Closed-won deals waiting to be onboarded -->
      <div v-if="closedWonDeals.length > 0" class="px-5 py-4 border-b border-divider bg-warn/5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-warn mb-2">
          {{ closedWonDeals.length }} closed-won {{ closedWonDeals.length === 1 ? 'deal' : 'deals' }} waiting to be onboarded
        </div>
        <ul class="space-y-2">
          <li
            v-for="d in closedWonDeals"
            :key="d.id"
            class="flex items-center justify-between gap-3 rounded-md bg-surface-raised border border-divider px-3 py-2"
          >
            <div class="min-w-0">
              <div class="text-sm font-semibold text-ink">{{ d.company_name }}</div>
              <div class="text-[11px] text-ink-muted">{{ d.contact_name }} · {{ d.industry || 'industry not set' }}</div>
            </div>
            <button
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 whitespace-nowrap"
              @click="openWizardFromDeal(d)"
            >Start onboarding →</button>
          </li>
        </ul>
      </div>

      <!-- Active + onboarding customers -->
      <ul v-if="customersApi.customers.value.length > 0" class="divide-y divide-divider">
        <li
          v-for="c in customersApi.customers.value"
          :key="c.id"
          class="px-5 py-3 flex items-center justify-between gap-3"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ c.org_name }}</span>
              <span
                class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                :class="c.status === 'active' ? 'bg-success/15 text-success' : c.status === 'onboarding' ? 'bg-warn/15 text-warn' : 'bg-ink-muted/15 text-ink-muted'"
              >{{ c.status }}</span>
              <span class="rounded-full bg-brand/10 text-brand text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5">
                {{ c.persona_type === 'grace' ? 'Grace' : 'Ada' }}
              </span>
              <span v-if="c.founding_partner" class="rounded-full bg-accent/15 text-accent text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5">
                Founding
              </span>
            </div>
            <div class="text-[11px] text-ink-muted mt-0.5">
              <code class="font-mono text-brand">/dashboard/{{ c.slug }}</code>
              · {{ c.tier }} tier · ${{ Math.round(c.monthly_rate_cents / 100).toLocaleString() }}/mo
              <template v-if="c.contacts && c.contacts.length > 0">
                · {{ c.contacts[0].name }}{{ c.contacts.length > 1 ? ` (+${c.contacts.length - 1})` : '' }}
              </template>
            </div>
            <div v-if="c.welcome_sent_at || c.welcome_send_error" class="text-[10px] mt-1 inline-flex items-center gap-1.5">
              <span v-if="c.welcome_sent_at" class="text-success">
                ✓ Welcome sent {{ fmtRelative(c.welcome_sent_at) }}
              </span>
              <span v-else-if="c.welcome_send_error" class="text-danger">
                ⚠ Welcome send failed: {{ c.welcome_send_error.slice(0, 80) }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="!c.welcome_sent_at"
              type="button"
              class="rounded-md border border-brand/40 text-brand bg-surface-raised px-2.5 py-1 text-[11px] font-semibold hover:bg-brand/10 disabled:opacity-50"
              :disabled="welcomeSending === c.id"
              :title="c.welcome_send_error ? 'Retry the welcome send (last error shown above)' : 'Send the welcome email now'"
              @click="onSendWelcome(c.id, false)"
            >
              {{ welcomeSending === c.id ? 'Sending…' : (c.welcome_send_error ? 'Retry welcome' : 'Send welcome') }}
            </button>
            <button
              v-else
              type="button"
              class="rounded-md text-[11px] text-ink-muted hover:text-ink underline"
              :disabled="welcomeSending === c.id"
              @click="onSendWelcome(c.id, true)"
            >Resend</button>
            <RouterLink
              :to="`/dashboard/${c.slug}`"
              class="rounded-md border border-divider text-ink bg-surface-raised px-2.5 py-1 text-[11px] font-semibold hover:border-brand"
            >Open dashboard →</RouterLink>
          </div>
        </li>
      </ul>
    </section>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Paying Customers</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.total_paying }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">+ {{ stats.total_trialing }} trialing</div>
      </div>
      <div class="card">
        <div class="kpi-label">Total MRR</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ money(stats.total_mrr_cents) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ money(stats.total_mrr_cents * 12) }} ARR run-rate</div>
      </div>
      <div class="card">
        <div class="kpi-label">Avg Health</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :style="{ color: healthColor(stats.avg_health) }">
          {{ stats.avg_health }}
        </div>
        <div class="text-[11px] mt-0.5" :class="stats.total_at_risk > 0 ? 'text-warn' : 'text-ink-disabled'">
          {{ stats.total_at_risk }} at-risk · {{ stats.total_churned_30d }} churned
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Expansion Opportunity</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ money(stats.expansion_opportunity_cents) }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">monthly upgrade potential</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="card flex flex-wrap items-center gap-3">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mr-1">Stage:</span>
        <button
          type="button"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
          :class="stageFilter === 'all' ? 'bg-brand text-ink-inverse' : 'bg-surface-elevated text-ink-muted hover:bg-surface-elevated/80'"
          @click="stageFilter = 'all'"
        >All</button>
        <button
          v-for="s in stageOrder"
          :key="s"
          type="button"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-ink-inverse"
          :style="stageFilter === s
            ? { backgroundColor: STAGE_META[s].color }
            : { backgroundColor: STAGE_META[s].color + '22', color: STAGE_META[s].color }"
          @click="stageFilter = s"
        >{{ STAGE_META[s].label }}</button>
      </div>
      <div class="flex flex-wrap items-center gap-1.5 ml-auto">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mr-1">Plan:</span>
        <button
          type="button"
          class="chip"
          :class="planFilter === 'all' ? 'chip-active' : ''"
          @click="planFilter = 'all'"
        >All</button>
        <button
          v-for="(meta, p) in PLAN_META"
          :key="p"
          type="button"
          class="chip"
          :class="planFilter === p ? 'chip-active' : ''"
          @click="planFilter = (p as Plan)"
        >{{ meta.label }}</button>
      </div>
    </div>

    <!-- Customer table -->
    <section class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('name')">
                Customer {{ sortInd('name') }}
              </th>
              <th class="px-3 py-2 font-medium">Stage</th>
              <th class="px-3 py-2 font-medium">Plan</th>
              <th class="px-3 py-2 font-medium text-right cursor-pointer hover:text-ink" @click="toggleSort('mrr')">
                MRR {{ sortInd('mrr') }}
              </th>
              <th class="px-3 py-2 font-medium text-center cursor-pointer hover:text-ink" @click="toggleSort('health')">
                Health {{ sortInd('health') }}
              </th>
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('last_login')">
                Last login {{ sortInd('last_login') }}
              </th>
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('signed_at')">
                Signed {{ sortInd('signed_at') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="c in filtered" :key="c.id">
              <tr class="border-b border-divider/60 hover:bg-surface-elevated/40 transition-colors">
                <td class="px-3 py-2.5">
                  <div class="text-sm font-semibold text-ink">{{ c.name }}</div>
                  <div class="text-[11px] text-ink-muted">
                    {{ INDUSTRY_LABEL[c.industry] }} · {{ c.city }}, {{ c.state }} · {{ c.team_size }} techs
                  </div>
                </td>
                <td class="px-3 py-2.5">
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-inverse whitespace-nowrap"
                    :style="{ backgroundColor: STAGE_META[c.stage].color }"
                  >{{ STAGE_META[c.stage].label }}</span>
                </td>
                <td class="px-3 py-2.5">
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-inverse whitespace-nowrap"
                    :style="{ backgroundColor: PLAN_META[c.plan].color }"
                  >{{ PLAN_META[c.plan].label }}</span>
                </td>
                <td class="px-3 py-2.5 text-right text-sm font-semibold text-ink tabular-nums">{{ money(c.mrr_cents) }}</td>
                <td class="px-3 py-2.5 text-center">
                  <div class="inline-flex items-center gap-1">
                    <span
                      class="text-base font-bold tabular-nums"
                      :style="{ color: healthColor(c.health_score) }"
                    >{{ c.health_score }}</span>
                    <span
                      class="text-xs"
                      :style="{ color: healthTrendColor(c.health_trend) }"
                    >{{ healthTrendArrow(c.health_trend) }}</span>
                  </div>
                </td>
                <td class="px-3 py-2.5 text-xs text-ink-muted whitespace-nowrap">{{ fmtAgo(c.last_login_at) }}</td>
                <td class="px-3 py-2.5 text-xs text-ink-muted whitespace-nowrap">{{ fmtSigned(c.signed_at) }}</td>
              </tr>
              <!-- Signal row (one-line context under any row that has a signal) -->
              <tr v-if="c.signal" class="border-b border-divider/60">
                <td colspan="7" class="px-3 pb-2 -mt-1">
                  <div
                    class="text-[11px] inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
                    :style="{
                      backgroundColor: STAGE_META[c.stage].color + '22',
                      color: STAGE_META[c.stage].color,
                    }"
                  >
                    <span class="font-semibold">SIGNAL ·</span>
                    <span>{{ c.signal }}</span>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="filtered.length === 0">
              <td colspan="7" class="px-3 py-6 text-center text-sm text-ink-muted italic">
                No customers match these filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Health legend -->
    <div class="text-[11px] text-ink-disabled flex flex-wrap items-center gap-3 px-2">
      <span class="font-semibold text-ink-muted">Health score:</span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color: #10B981"></span>
        80–100 healthy
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color: rgb(var(--color-brand))"></span>
        60–79 ok
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color: #F59E0B"></span>
        40–59 watch
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="h-2 w-2 rounded-full" style="background-color: #EF4444"></span>
        &lt; 40 critical
      </span>
      <span class="opacity-70 ml-2">Composite of usage frequency · payment status · open tickets · NPS</span>
    </div>

    <!-- Onboarding wizard -->
    <CommandSiteOnboardingWizard
      :open="wizardOpen"
      :source-deal="wizardSourceDeal as never"
      @close="wizardOpen = false; wizardSourceDeal = null"
      @save="onWizardSave"
    />
  </div>
</template>
