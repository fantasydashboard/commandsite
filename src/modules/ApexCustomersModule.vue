<script setup lang="ts">
/**
 * Customers list — sortable table of every customer on file with funnel
 * stage chip + last-touch summary. Click a row to open the detail drawer
 * with the full timeline.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  customers,
  customerStats,
  STAGE_META,
  type Customer,
  type FunnelStage,
} from '@/lib/clients/apex/customers'
import ApexCustomerDrawer from '@/components/ApexCustomerDrawer.vue'
import SourceIndicator from '@/components/SourceIndicator.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

type SortKey = 'name' | 'stage' | 'last_touch' | 'ltv'
const sortBy = ref<SortKey>('last_touch')
const sortDir = ref<'asc' | 'desc'>('desc')
const filterStage = ref<FunnelStage | 'all'>('all')

const stats = computed(() => customerStats())

const stageOrder: FunnelStage[] = [
  'new_lead',
  'engaged',
  'quoted',
  'booked',
  'job_complete',
  'review_requested',
  'won',
  'dormant',
  'lost',
]

const filtered = computed<Customer[]>(() => {
  let rows = customers
  if (filterStage.value !== 'all') {
    rows = rows.filter((c) => c.funnel_stage === filterStage.value)
  }
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (sortBy.value === 'name') return a.name.localeCompare(b.name) * dir
    if (sortBy.value === 'ltv') return (a.lifetime_value_cents - b.lifetime_value_cents) * dir
    if (sortBy.value === 'stage') {
      return (stageOrder.indexOf(a.funnel_stage) - stageOrder.indexOf(b.funnel_stage)) * dir
    }
    // default: last_touch
    return (new Date(a.last_touch_at).getTime() - new Date(b.last_touch_at).getTime()) * dir
  })
})

function toggleSort(k: SortKey) {
  if (sortBy.value === k) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortBy.value = k; sortDir.value = k === 'name' ? 'asc' : 'desc' }
}

function sortIndicator(k: SortKey): string {
  if (sortBy.value !== k) return ''
  return sortDir.value === 'asc' ? '↑' : '↓'
}

const detailCustomer = ref<Customer | null>(null)
function openDetail(c: Customer) { detailCustomer.value = c }
function closeDetail() { detailCustomer.value = null }

function money(cents: number): string {
  if (cents === 0) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function lastTouchLabel(c: Customer): string {
  if (!c.last_touch_kind) return '—'
  switch (c.last_touch_kind) {
    case 'inbound_call': return 'Inbound call'
    case 'sms_sent': return 'SMS sent'
    case 'sms_received': return 'SMS received'
    case 'email_sent': return 'Email sent'
    case 'email_received': return 'Email received'
    case 'appointment_booked': return 'Appointment booked'
    case 'job_completed': return 'Job completed'
    case 'review_request_sent': return 'Review request'
    case 'review_received': return 'Review received'
    case 'reactivation_triggered': return 'Reactivation'
    default: return c.last_touch_kind
  }
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Customers</h2>
        <p class="text-sm text-ink-muted">
          Every customer on file with funnel stage + every interaction. Click a row to see the full timeline.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <SourceIndicator source="Twilio · Email · Stripe · Job system" :synced-at="new Date(Date.now() - 2 * 60 * 1000).toISOString()" />
        <div class="text-xs text-ink-muted">
          <span class="font-semibold text-ink">{{ stats.total }}</span> customers · auto-logged
        </div>
      </div>
    </div>

    <!-- Stage filter chips -->
    <div class="card">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
          :class="filterStage === 'all' ? 'bg-brand text-ink-inverse' : 'bg-surface-elevated text-ink-muted hover:bg-surface-elevated/80'"
          @click="filterStage = 'all'"
        >
          All ({{ stats.total }})
        </button>
        <button
          v-for="s in stageOrder"
          :key="s"
          type="button"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors text-white"
          :style="filterStage === s
            ? { backgroundColor: STAGE_META[s].color }
            : { backgroundColor: STAGE_META[s].color + '22', color: STAGE_META[s].color }"
          @click="filterStage = s"
        >
          {{ STAGE_META[s].label }} ({{ stats.by_stage[s] }})
        </button>
      </div>
    </div>

    <!-- Customer table -->
    <section class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('name')">
                Customer {{ sortIndicator('name') }}
              </th>
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('stage')">
                Stage {{ sortIndicator('stage') }}
              </th>
              <th class="px-3 py-2 font-medium cursor-pointer hover:text-ink" @click="toggleSort('last_touch')">
                Last Touch {{ sortIndicator('last_touch') }}
              </th>
              <th class="px-3 py-2 font-medium">Source</th>
              <th class="px-3 py-2 font-medium">Tech</th>
              <th class="px-3 py-2 font-medium text-right cursor-pointer hover:text-ink" @click="toggleSort('ltv')">
                LTV {{ sortIndicator('ltv') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in filtered"
              :key="c.id"
              class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 cursor-pointer transition-colors"
              @click="openDetail(c)"
            >
              <td class="px-3 py-2.5">
                <div class="text-sm font-medium text-ink">{{ c.name }}</div>
                <div class="text-[11px] text-ink-muted">{{ c.phone }}</div>
              </td>
              <td class="px-3 py-2.5">
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  :style="{ backgroundColor: STAGE_META[c.funnel_stage].color }"
                >
                  {{ STAGE_META[c.funnel_stage].label }}
                </span>
              </td>
              <td class="px-3 py-2.5">
                <div class="text-xs text-ink">{{ lastTouchLabel(c) }}</div>
                <div class="text-[11px] text-ink-disabled">{{ fmtAgo(c.last_touch_at) }}</div>
              </td>
              <td class="px-3 py-2.5 text-xs text-ink-muted">{{ c.source }}</td>
              <td class="px-3 py-2.5 text-xs text-ink-muted">{{ c.assigned_tech ?? '—' }}</td>
              <td class="px-3 py-2.5 text-right text-sm tabular-nums text-ink">{{ money(c.lifetime_value_cents) }}</td>
            </tr>
            <tr v-if="filtered.length === 0">
              <td colspan="6" class="px-3 py-6 text-center text-sm text-ink-muted italic">
                No customers in this stage.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Detail drawer -->
    <ApexCustomerDrawer
      :open="detailCustomer !== null"
      :customer="detailCustomer"
      @close="closeDetail"
    />
  </div>
</template>
