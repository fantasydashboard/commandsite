<script setup lang="ts">
/**
 * Reactivation — auto-default with digest pattern.
 *
 * The flip: instead of asking the owner to approve every dormant SMS
 * one-by-one, the automation runs every Monday at 10 AM and sends
 * outreach automatically. Owner sees a digest of what was sent + an
 * "exceptions" surface for the rare cases AI flagged for human eyes.
 * Inverse action ("Pause this customer") replaces "Approve."
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  reactivations,
  reactivationStats,
  REACTIVATION_OUTREACH_TEMPLATE,
} from '@/lib/clients/apex/reactivation'
import { automations } from '@/lib/clients/apex/automations'
import type { ReactivationRecord } from '@/lib/clients/apex/types'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => reactivationStats())
const pausedLocally = ref<Set<string>>(new Set())

const reactivationAutomation = computed(() =>
  automations.find((a) => a.kind === 'reactivation_outreach')!,
)

interface StageMeta {
  status: ReactivationRecord['status']
  label: string
  sub: string
  color: string
}

const stages: StageMeta[] = [
  { status: 'identified', label: 'Queued',     sub: 'Auto-sending next Monday',  color: '#94A3B8' },
  { status: 'contacted',  label: 'Contacted',  sub: 'Outreach sent · awaiting reply', color: 'rgb(var(--color-accent))' },
  { status: 'engaged',    label: 'Engaged',    sub: 'Replied with questions',    color: '#A0D8F8' },
  { status: 'booked',     label: 'Booked',     sub: 'Scheduled visit',           color: '#10B981' },
  { status: 'won_back',   label: 'Won-back',   sub: 'Service completed',         color: 'rgb(var(--color-brand))' },
]

function rxIn(s: ReactivationRecord['status']): ReactivationRecord[] {
  return reactivations
    .filter((r) => r.status === s)
    .sort((a, b) => b.estimated_value_cents - a.estimated_value_cents)
}

function stageValue(s: ReactivationRecord['status']): number {
  return rxIn(s).reduce((sum, r) => sum + r.estimated_value_cents, 0)
}

function money(cents: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && cents >= 100_000) return '$' + (cents / 100_000).toFixed(1) + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

function monthsAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const months = Math.round(ms / (30 * 24 * 60 * 60 * 1000))
  if (months < 12) return `${months} mo ago`
  const yr = (months / 12).toFixed(1).replace(/\.0$/, '')
  return `${yr} yr ago`
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const day = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (day === 0) return 'today'
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day}d ago`
  return `${Math.floor(day / 7)}w ago`
}

function fmtNextMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 1
  d.setDate(d.getDate() + daysUntilMonday)
  d.setHours(10, 0, 0, 0)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + ' at 10 AM'
}

function firstName(full: string): string { return full.split(' ')[0] }

function rendered(rx: ReactivationRecord): string {
  return REACTIVATION_OUTREACH_TEMPLATE
    .replace('{{first_name}}', firstName(rx.customer))
    .replace('{{last_service}}', rx.last_service.toLowerCase())
}

function pause(rx: ReactivationRecord) { pausedLocally.value.add(rx.id) }
function unpause(rx: ReactivationRecord) { pausedLocally.value.delete(rx.id) }

// "Needs your eyes" — the rare cases AI flagged because it's not sure
// what to do. For the demo, we hand-pick 1 from the queue.
const flaggedForReview = computed(() => {
  const queued = rxIn('identified')
  // Pick the highest-value one as the "needs eyes" case (high stakes = worth a look)
  return queued.slice(0, 1)
})

const totalIdentifiedValue = computed(() => stageValue('identified'))
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Reactivation</h2>
        <p class="text-sm text-ink-muted">
          The system auto-sends to dormant customers every Monday. You see what shipped + the rare cases that need your eyes.
        </p>
      </div>
    </div>

    <!-- Automation status banner — the headline framing -->
    <div class="rounded-card border border-success/30 bg-success/5 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0 flex-1">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-success text-white text-base flex-shrink-0">
            🤖
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <h3 class="text-sm font-semibold text-ink">Reactivation outreach is auto-running</h3>
              <span class="rounded-full bg-success text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Active</span>
            </div>
            <p class="text-xs text-ink-muted mt-0.5">{{ reactivationAutomation.description }}</p>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-disabled">
              <span>📅 Next batch: <span class="text-ink font-semibold">{{ fmtNextMonday() }}</span></span>
              <span>· Last sent {{ fmtAgo(reactivationAutomation.last_ran_at) }}</span>
              <span>· {{ rxIn('identified').length }} customer{{ rxIn('identified').length === 1 ? '' : 's' }} queued</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand">Pause automation</button>
          <button type="button" class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">Edit cadence</button>
        </div>
      </div>
    </div>

    <!-- Last 30 days digest -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">What this automation did for you · last 30 days</span>
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div>
          <div class="kpi-label">Outreach sent</div>
          <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ reactivationAutomation.outcomes_30d?.[0]?.value }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">to dormant customers</div>
        </div>
        <div>
          <div class="kpi-label">Replied</div>
          <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ reactivationAutomation.outcomes_30d?.[1]?.value }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">positive engagement</div>
        </div>
        <div>
          <div class="kpi-label">Booked</div>
          <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.booked + stats.won_back }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">scheduled or completed</div>
        </div>
        <div>
          <div class="kpi-label">Won-back revenue</div>
          <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ reactivationAutomation.outcomes_30d?.[2]?.value }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">attributed to this</div>
        </div>
        <div>
          <div class="kpi-label">Open opportunity</div>
          <div class="mt-1 text-2xl font-bold text-brand tabular-nums">{{ money(totalIdentifiedValue, { compact: true }) }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">in queued outreach</div>
        </div>
      </div>
    </section>

    <!-- Needs your eyes — the rare exceptions -->
    <section v-if="flaggedForReview.length > 0" class="card border border-warn/30 bg-warn/5">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow text-warn">⚠ Needs your eyes</span>
        <span class="text-xs text-ink-muted">{{ flaggedForReview.length }} customer{{ flaggedForReview.length === 1 ? '' : 's' }} the AI flagged before sending</span>
      </div>
      <div class="space-y-2">
        <article
          v-for="rx in flaggedForReview"
          :key="rx.id"
          class="rounded-card border border-warn/40 bg-surface p-3"
        >
          <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2 mb-0.5">
                <span class="text-sm font-semibold text-ink">{{ rx.customer }}</span>
                <span class="rounded-full bg-warn text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">High-value · {{ money(rx.estimated_value_cents) }}</span>
              </div>
              <div class="text-[11px] text-ink-muted">
                Last seen {{ monthsAgo(rx.last_service_date) }} · {{ rx.last_service }} · {{ rx.phone }}
              </div>
              <p class="mt-1 text-xs text-ink-muted italic">
                📝 AI flagged: high-ticket prior service ({{ money(rx.estimated_value_cents) }} est.) — worth a personal touch instead of the standard SMS template.
              </p>
            </div>
          </div>
          <div class="rounded-md bg-surface-elevated/60 border border-divider/60 p-2.5 mb-2">
            <div class="text-[10px] uppercase tracking-wide font-semibold text-ink-disabled mb-1">Standard template would send</div>
            <p class="text-[11px] text-ink leading-snug italic">"{{ rendered(rx) }}"</p>
          </div>
          <div class="flex items-center justify-end gap-2">
            <button type="button" class="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink">Skip this round</button>
            <button type="button" class="rounded-md bg-surface-elevated text-ink px-3 py-1.5 text-xs font-semibold hover:bg-surface-elevated/80">Send template anyway</button>
            <button type="button" class="rounded-md bg-warn text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">Personal call instead</button>
          </div>
        </article>
      </div>
    </section>

    <!-- Stage breakdown — funnel summary -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div
        v-for="s in stages"
        :key="s.status"
        class="card"
      >
        <div class="kpi-label">{{ s.label }}</div>
        <div class="mt-1 flex items-baseline justify-between">
          <span class="text-2xl font-bold text-ink tabular-nums">{{ stats[s.status] }}</span>
          <span class="text-[10px] tabular-nums" :style="{ color: s.color }">
            {{ money(stageValue(s.status), { compact: true }) }}
          </span>
        </div>
        <div class="text-[10px] text-ink-disabled mt-0.5">{{ s.sub }}</div>
      </div>
    </div>

    <!-- Queued for next batch -->
    <section v-if="rxIn('identified').length > 0" class="card">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Queued for next Monday</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">{{ rxIn('identified').length }} customers</span>
        </div>
        <span class="text-[11px] text-ink-disabled italic">
          Sending automatically · pause individual customers below if you don't want to reach out
        </span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium">Customer</th>
              <th class="px-3 py-2 font-medium">Last service</th>
              <th class="px-3 py-2 font-medium text-right">Est. ticket</th>
              <th class="px-3 py-2 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="rx in rxIn('identified')"
              :key="rx.id"
              class="border-b border-divider/60 last:border-b-0"
              :class="pausedLocally.has(rx.id) ? 'opacity-50' : 'hover:bg-surface-elevated/40 transition-colors'"
            >
              <td class="px-3 py-2.5">
                <div class="text-sm font-medium text-ink">{{ rx.customer }}</div>
                <div class="text-[11px] text-ink-muted">{{ rx.phone }}</div>
              </td>
              <td class="px-3 py-2.5 text-xs text-ink-muted">
                <div>{{ rx.last_service }}</div>
                <div class="text-[10px] text-ink-disabled">{{ monthsAgo(rx.last_service_date) }}</div>
              </td>
              <td class="px-3 py-2.5 text-right text-sm font-semibold text-ink tabular-nums">{{ money(rx.estimated_value_cents) }}</td>
              <td class="px-3 py-2.5 text-right">
                <button
                  v-if="!pausedLocally.has(rx.id)"
                  type="button"
                  class="text-[11px] font-semibold text-ink-muted hover:text-warn whitespace-nowrap"
                  @click="pause(rx)"
                >Pause</button>
                <button
                  v-else
                  type="button"
                  class="text-[11px] font-semibold text-warn whitespace-nowrap"
                  @click="unpause(rx)"
                >Paused · undo</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Active pipeline (everything past identified) -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Active pipeline</span>
        <span class="text-xs text-ink-muted">In motion across {{ stats.contacted + stats.engaged + stats.booked }} customers</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium">Customer</th>
              <th class="px-3 py-2 font-medium">Last service</th>
              <th class="px-3 py-2 font-medium">Stage</th>
              <th class="px-3 py-2 font-medium text-center">Attempts</th>
              <th class="px-3 py-2 font-medium text-right">Est. value</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="rx in [...rxIn('contacted'), ...rxIn('engaged'), ...rxIn('booked')]"
              :key="rx.id"
              class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
            >
              <td class="px-3 py-2.5">
                <div class="text-sm font-medium text-ink">{{ rx.customer }}</div>
                <div class="text-[11px] text-ink-muted">{{ rx.phone }}</div>
              </td>
              <td class="px-3 py-2.5 text-xs text-ink-muted">
                <div>{{ rx.last_service }}</div>
                <div class="text-[10px] text-ink-disabled">{{ monthsAgo(rx.last_service_date) }}</div>
              </td>
              <td class="px-3 py-2.5">
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  :style="{ backgroundColor: stages.find((s) => s.status === rx.status)!.color }"
                >{{ stages.find((s) => s.status === rx.status)!.label }}</span>
              </td>
              <td class="px-3 py-2.5 text-center text-xs text-ink-muted tabular-nums">{{ rx.contact_attempts }}</td>
              <td class="px-3 py-2.5 text-right text-sm tabular-nums text-ink">{{ money(rx.estimated_value_cents) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
