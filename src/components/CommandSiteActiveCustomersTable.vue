<script setup lang="ts">
/**
 * CommandSite active customers table.
 *
 * Replaces the bare clients table with operator-relevant metrics:
 *   - MRR (monthly_rate_cents)
 *   - Lifetime $ earned (monthly_rate * months active + setup fee)
 *   - Days as customer (since billing_start_at)
 *   - Time saved estimate (placeholder — wired in once per-customer
 *     telemetry lands; for now shows "—" with a tooltip)
 *   - Tasks completed this month (placeholder, same)
 *   - Health pill (Healthy / Watch / At risk / New)
 *
 * Click "Configure" to drill into a per-customer view (route already
 * exists at admin.client-detail).
 */
import {
  type Customer,
  type HealthStatus,
  fmtMoney,
  daysSince,
  lifetimeCents,
  healthStatus,
} from '@/lib/clients/commandsite/customersApi'

defineProps<{
  customers: Customer[]
}>()

const emit = defineEmits<{
  (e: 'open', id: string): void
}>()

const HEALTH_META: Record<HealthStatus, { label: string; pillClass: string; title: string }> = {
  healthy: {
    label: '🟢 Healthy',
    pillClass: 'bg-success/15 text-success',
    title: 'Activity within the last 3 days. Customer is engaged.',
  },
  watch: {
    label: '🟡 Watch',
    pillClass: 'bg-warn/15 text-warn',
    title: 'No automated activity in 3-14 days. Worth a check-in.',
  },
  at_risk: {
    label: '🔴 At risk',
    pillClass: 'bg-danger/15 text-danger',
    title: 'No activity in 14+ days OR welcome email failed. Call them.',
  },
  new: {
    label: '◔ New',
    pillClass: 'bg-ink-muted/15 text-ink-muted',
    title: 'In their first 14 days — too early to compute a stable health score.',
  },
}

function personaIcon(c: Customer): string {
  if (c.persona_type === 'grace') return '⛪'
  if (c.persona_type === 'ada') return '🔧'
  return '✦'
}

function daysAsCustomer(c: Customer): string {
  const start = c.billing_start_at ?? c.signed_at ?? c.created_at
  const d = daysSince(start)
  if (d === 0) return 'today'
  if (d < 30) return `${d}d`
  const m = Math.floor(d / 30)
  return `${m}mo`
}
</script>

<template>
  <section class="card p-0 overflow-hidden">
    <header class="px-5 py-4 border-b border-divider bg-surface-raised">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">
        Active customers
      </div>
      <div class="flex items-baseline justify-between">
        <h2 class="text-lg font-bold text-ink">Who's live and what they're doing</h2>
        <div class="text-xs text-ink-muted">
          {{ customers.length }} {{ customers.length === 1 ? 'customer' : 'customers' }}
        </div>
      </div>
    </header>

    <div v-if="customers.length === 0" class="px-5 py-8 text-center">
      <div class="text-3xl mb-2">🌱</div>
      <p class="text-sm font-semibold text-ink">No active customers yet</p>
      <p class="text-xs text-ink-muted mt-1">
        Once a customer flows through the pipeline above and activates, they show up here with live metrics.
      </p>
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-canvas text-[10px] font-medium text-ink-muted uppercase tracking-wide">
          <tr>
            <th class="px-3 py-2 text-left">Customer</th>
            <th class="px-3 py-2 text-right">MRR</th>
            <th class="px-3 py-2 text-right">Lifetime $</th>
            <th class="px-3 py-2 text-right">Days</th>
            <th class="px-3 py-2 text-right">Time saved · this mo</th>
            <th class="px-3 py-2 text-right">Tasks done · this mo</th>
            <th class="px-3 py-2 text-left">Health</th>
            <th class="px-3 py-2 text-right"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-divider">
          <tr
            v-for="c in customers"
            :key="c.id"
            class="hover:bg-brand/5 cursor-pointer"
            @click="emit('open', c.id)"
          >
            <td class="px-3 py-2.5">
              <div class="font-semibold text-ink">
                <span class="mr-1">{{ personaIcon(c) }}</span>
                {{ c.org_name }}
              </div>
              <div class="text-[11px] text-ink-muted">
                {{ c.persona_type === 'grace' ? 'Grace' : 'Ada' }} ·
                {{ c.industry || c.tier }}
              </div>
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums text-ink">
              {{ fmtMoney(c.monthly_rate_cents) }}<span class="text-ink-muted">/mo</span>
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums text-ink">
              {{ fmtMoney(lifetimeCents(c)) }}
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums text-ink-muted">
              {{ daysAsCustomer(c) }}
            </td>
            <td class="px-3 py-2.5 text-right text-ink-muted" title="Per-customer telemetry coming soon — fills in as Grace/Ada take actions on their behalf.">
              <span class="italic text-[11px]">—</span>
            </td>
            <td class="px-3 py-2.5 text-right text-ink-muted" title="Per-customer telemetry coming soon.">
              <span class="italic text-[11px]">—</span>
            </td>
            <td class="px-3 py-2.5">
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                :class="HEALTH_META[healthStatus(c)].pillClass"
                :title="HEALTH_META[healthStatus(c)].title"
              >
                {{ HEALTH_META[healthStatus(c)].label }}
              </span>
            </td>
            <td class="px-3 py-2.5 text-right" @click.stop>
              <button
                type="button"
                class="text-xs font-semibold text-brand hover:underline"
                @click="emit('open', c.id)"
              >Configure →</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer
      v-if="customers.length > 0"
      class="border-t border-divider px-3 py-2 text-[11px] text-ink-muted bg-canvas"
    >
      Time saved + Tasks done are placeholders — they'll populate as per-customer telemetry comes online.
    </footer>
  </section>
</template>
