<script setup lang="ts">
/**
 * Apex Email Marketing — campaign library + recent send activity.
 * Owner can browse the configured campaigns (transactional / lifecycle
 * / seasonal / broadcast), see open/click/revenue stats per campaign,
 * preview the email body, and toggle active/inactive.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  campaigns,
  campaignStats,
  recentSends,
  type EmailCampaign,
  type CampaignKind,
  type SendRecord,
} from '@/lib/clients/apex/emailCampaigns'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => campaignStats())
const kindFilter = ref<CampaignKind | 'all'>('all')
const previewing = ref<EmailCampaign | null>(null)

// Reactive copy of campaigns so toggling active works in the demo.
const list = ref<EmailCampaign[]>(campaigns.map((c) => ({ ...c })))

const kinds: { key: CampaignKind | 'all'; label: string; color: string }[] = [
  { key: 'all',           label: 'All',            color: 'rgb(var(--color-brand))' },
  { key: 'transactional', label: 'Transactional',  color: 'rgb(var(--color-accent))' },
  { key: 'lifecycle',     label: 'Lifecycle',      color: '#10B981' },
  { key: 'seasonal',      label: 'Seasonal',       color: '#F59E0B' },
  { key: 'broadcast',     label: 'Broadcast',      color: '#A855F7' },
]

const filtered = computed(() =>
  list.value.filter((c) => kindFilter.value === 'all' || c.kind === kindFilter.value),
)

function kindMeta(k: CampaignKind) {
  return kinds.find((x) => x.key === k)!
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`
}

function money(cents: number): string {
  if (cents === 0) return '—'
  if (cents >= 1_000_000) return '$' + Math.round(cents / 100_000) / 10 + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return `${Math.floor(day / 30)}mo ago`
}

function statusMeta(s: SendRecord['status']): { label: string; color: string } {
  if (s === 'opened')    return { label: 'Opened',    color: '#0EA5E9' }
  if (s === 'clicked')   return { label: 'Clicked',   color: 'rgb(var(--color-brand))' }
  if (s === 'replied')   return { label: 'Replied',   color: '#10B981' }
  if (s === 'bounced')   return { label: 'Bounced',   color: '#EF4444' }
  return                       { label: 'Delivered', color: '#94A3B8' }
}

function campaignName(id: string): string {
  return list.value.find((c) => c.id === id)?.name ?? '—'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Email Marketing</h2>
        <p class="text-sm text-ink-muted">
          Campaign library — review requests, maintenance reminders, financing offers, and seasonal pushes.
        </p>
      </div>
      <button
        type="button"
        class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"
      >+ New campaign</button>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Active Campaigns</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ stats.active_count }} <span class="text-base text-ink-muted">/ {{ stats.total_count }}</span>
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Sends (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.sends_30d.toLocaleString() }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Avg Open · Click</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ pct(stats.avg_open_rate) }} · <span class="text-accent">{{ pct(stats.avg_click_rate) }}</span>
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Attributed Revenue (90d)</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ money(stats.attributed_revenue_90d_cents) }}</div>
      </div>
    </div>

    <!-- Kind filter -->
    <div class="card">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="k in kinds"
          :key="k.key"
          type="button"
          class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
          :style="kindFilter === k.key
            ? { backgroundColor: k.color, color: '#fff' }
            : { backgroundColor: k.color + '22', color: k.color }"
          @click="kindFilter = k.key"
        >
          {{ k.label }}
        </button>
      </div>
    </div>

    <!-- Campaign cards -->
    <div class="space-y-3">
      <article
        v-for="c in filtered"
        :key="c.id"
        class="card"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <h3 class="text-base font-semibold text-ink">{{ c.name }}</h3>
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                :style="{ backgroundColor: kindMeta(c.kind).color }"
              >{{ kindMeta(c.kind).label }}</span>
              <span
                v-if="!c.active"
                class="rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-disabled"
              >Inactive</span>
            </div>
            <div class="text-xs text-ink-muted">{{ c.trigger }}</div>
            <div class="mt-2 text-sm text-ink">
              <span class="font-medium">Subject:</span> {{ c.subject }}
            </div>
            <div class="text-[11px] text-ink-disabled italic mt-0.5">{{ c.preview }}</div>
          </div>
          <div class="flex flex-col items-end gap-2 flex-shrink-0">
            <label class="inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="c.active" class="sr-only peer" />
              <span class="relative h-5 w-9 rounded-full bg-surface-elevated transition-colors peer-checked:bg-brand">
                <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4"></span>
              </span>
            </label>
            <button
              type="button"
              class="rounded-md bg-brand/10 text-brand px-2.5 py-1 text-[11px] font-semibold hover:bg-brand/20"
              @click="previewing = c"
            >Preview</button>
          </div>
        </div>

        <!-- Stats row -->
        <div class="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 border-t border-divider pt-3">
          <div>
            <div class="kpi-label">Sent</div>
            <div class="text-sm font-semibold text-ink tabular-nums">{{ c.recipients_total.toLocaleString() }}</div>
          </div>
          <div>
            <div class="kpi-label">Open</div>
            <div class="text-sm font-semibold text-ink tabular-nums">{{ pct(c.open_rate) }}</div>
          </div>
          <div>
            <div class="kpi-label">Click</div>
            <div class="text-sm font-semibold text-accent tabular-nums">{{ pct(c.click_rate) }}</div>
          </div>
          <div v-if="c.reply_rate !== undefined">
            <div class="kpi-label">Reply</div>
            <div class="text-sm font-semibold text-ink tabular-nums">{{ pct(c.reply_rate) }}</div>
          </div>
          <div v-else>
            <div class="kpi-label">Last Sent</div>
            <div class="text-sm font-semibold text-ink-muted">{{ fmtAgo(c.last_sent_at) }}</div>
          </div>
          <div>
            <div class="kpi-label">Attributed Revenue</div>
            <div class="text-sm font-semibold tabular-nums" :class="c.attributed_revenue_cents > 0 ? 'text-success' : 'text-ink-disabled'">
              {{ money(c.attributed_revenue_cents) }}
            </div>
          </div>
        </div>
      </article>
    </div>

    <!-- Recent sends -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Recent Sends</span>
        <span class="text-xs text-ink-muted">Last 24h</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium">Recipient</th>
              <th class="px-3 py-2 font-medium">Campaign</th>
              <th class="px-3 py-2 font-medium">Status</th>
              <th class="px-3 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in recentSends"
              :key="s.id"
              class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
            >
              <td class="px-3 py-2.5">
                <div class="text-sm font-medium text-ink">{{ s.recipient_name }}</div>
                <div class="text-[11px] text-ink-disabled">{{ s.recipient_email }}</div>
              </td>
              <td class="px-3 py-2.5 text-xs text-ink-muted">{{ campaignName(s.campaign_id) }}</td>
              <td class="px-3 py-2.5">
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  :style="{ backgroundColor: statusMeta(s.status).color }"
                >{{ statusMeta(s.status).label }}</span>
                <div v-if="s.reply_excerpt" class="mt-1 text-[11px] italic text-ink-muted">
                  💬 {{ s.reply_excerpt }}
                </div>
              </td>
              <td class="px-3 py-2.5 text-[11px] text-ink-muted whitespace-nowrap">{{ fmtAgo(s.sent_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Preview modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="previewing"
          class="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4"
          @click.self="previewing = null"
        >
          <div class="w-full max-w-xl rounded-card bg-surface shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div class="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="text-base font-semibold text-ink truncate">{{ previewing.name }}</h3>
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                    :style="{ backgroundColor: kindMeta(previewing.kind).color }"
                  >{{ kindMeta(previewing.kind).label }}</span>
                </div>
                <div class="text-xs text-ink-muted">{{ previewing.trigger }}</div>
              </div>
              <button
                type="button"
                class="text-ink-muted hover:text-ink text-xl leading-none p-1 -mr-1"
                @click="previewing = null"
              >×</button>
            </div>

            <!-- Email preview -->
            <div class="overflow-y-auto px-5 py-4 flex-1 bg-surface-elevated/30">
              <div class="rounded-md bg-surface border border-divider p-4">
                <div class="text-[10px] uppercase tracking-wide font-semibold text-ink-muted">From</div>
                <div class="text-sm text-ink mb-2">Apex Heating &amp; Air &lt;hello@apex-air.com&gt;</div>

                <div class="text-[10px] uppercase tracking-wide font-semibold text-ink-muted">Subject</div>
                <div class="text-sm font-semibold text-ink mb-3">{{ previewing.subject }}</div>

                <div class="border-t border-divider pt-3">
                  <pre class="whitespace-pre-wrap font-sans text-sm text-ink leading-relaxed">{{ previewing.body }}</pre>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 border-t border-divider px-5 py-3 bg-surface">
              <button
                type="button"
                class="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
                @click="previewing = null"
              >Close</button>
              <button
                type="button"
                class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"
              >Edit template</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 120ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
