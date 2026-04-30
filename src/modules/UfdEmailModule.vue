<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Client } from '@/types/database'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const auth = useAuthStore()

type Window = 'today' | '7d' | '15d' | '30d' | '90d' | '1y' | 'all'

interface EmailGroup {
  subject: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  pending: number
  first_sent: string
  last_sent: string
  emails: {
    id: string
    to: string
    subject: string
    created_at: string
    last_event: string
  }[]
  more_count: number
}

interface EmailsResponse {
  window: Window
  range: { since: string | null; now: string }
  cards: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    complained: number
    pending: number
  }
  rates: {
    delivery_rate: number
    open_rate: number
    click_rate: number
    bounce_rate: number
    complain_rate: number
  }
  series: { sent: Record<string, number> }
  groups: EmailGroup[]
  truncated: boolean
}

const windows: { key: Window; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '15d', label: '15 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: '1y', label: '1 Year' },
  { key: 'all', label: 'All Time' },
]

const active = ref<Window>('30d')
const emails = ref<EmailsResponse | null>(null)
const emailsLoading = ref(false)
const emailsError = ref<string | null>(null)

async function surfaceError(err: unknown, fallback: string): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json()
      return body?.error
        ? `${body.error} (HTTP ${err.context.status})`
        : `${err.message} (HTTP ${err.context.status})`
    } catch {
      return `${err.message} (HTTP ${err.context.status})`
    }
  }
  return (err as Error)?.message ?? fallback
}

async function loadEmails() {
  emailsLoading.value = true
  emailsError.value = null
  const { data, error: err } = await supabase.functions.invoke<EmailsResponse>('ufd-emails', {
    body: { window: active.value },
  })
  emailsLoading.value = false
  if (err) {
    emailsError.value = await surfaceError(err, 'Failed to load emails')
    return
  }
  emails.value = data ?? null
}

watch(active, loadEmails)
onMounted(loadEmails)

const activeLabel = computed(
  () => windows.find((w) => w.key === active.value)?.label ?? '',
)

function pct(rate: number): string {
  if (!Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Resend "risk" thresholds — bounce > 4%, complaint > 0.1% are danger.
const BOUNCE_RISK = 0.04
const COMPLAIN_RISK = 0.001

const rateCardDefs = computed(() => {
  const e = emails.value
  if (!e) return []
  const bounceOver = e.rates.bounce_rate > BOUNCE_RISK
  const complainOver = e.rates.complain_rate > COMPLAIN_RISK
  return [
    {
      key: 'delivery',
      label: 'Delivery Rate',
      value: pct(e.rates.delivery_rate),
      sub: 'Delivered / Sent',
      tone: 'text-success',
      accent: 'border-t-success',
    },
    {
      key: 'open',
      label: 'Open Rate',
      value: pct(e.rates.open_rate),
      sub: 'Opens / Delivered',
      tone: 'text-[#4CCCE8]',
      accent: 'border-t-[#4CCCE8]',
    },
    {
      key: 'click',
      label: 'Click Rate',
      value: pct(e.rates.click_rate),
      sub: 'Clicks / Delivered',
      tone: 'text-[#7C3AED]',
      accent: 'border-t-[#7C3AED]',
    },
    {
      key: 'bounce',
      label: 'Bounce Rate',
      value: pct(e.rates.bounce_rate),
      sub: bounceOver ? `Over ${pct(BOUNCE_RISK)} risk threshold` : `Risk at ${pct(BOUNCE_RISK)}`,
      tone: bounceOver ? 'text-danger' : 'text-warning',
      accent: bounceOver ? 'border-t-danger' : 'border-t-warning',
    },
    {
      key: 'complain',
      label: 'Complaint Rate',
      value: pct(e.rates.complain_rate),
      sub: complainOver ? `Over ${pct(COMPLAIN_RISK)} risk threshold` : `Risk at ${pct(COMPLAIN_RISK)}`,
      tone: complainOver ? 'text-danger' : 'text-ink',
      accent: complainOver ? 'border-t-danger' : 'border-t-divider',
    },
  ]
})

const emailCardDefs = computed(() => {
  const e = emails.value
  if (!e) return []
  return [
    {
      key: 'sent',
      label: 'Sent',
      value: e.cards.sent,
      sub: 'Total in window',
      accent: 'border-t-[#2E9FE0]',
      numberClass: 'text-[#2E9FE0]',
    },
    {
      key: 'delivered',
      label: 'Delivered',
      value: e.cards.delivered,
      sub: `${pct(e.rates.delivery_rate)} of sent`,
      accent: 'border-t-success',
      numberClass: 'text-success',
    },
    {
      key: 'opened',
      label: 'Opened',
      value: e.cards.opened,
      sub: `${pct(e.rates.open_rate)} of delivered`,
      accent: 'border-t-[#4CCCE8]',
      numberClass: 'text-[#4CCCE8]',
    },
    {
      key: 'clicked',
      label: 'Clicked',
      value: e.cards.clicked,
      sub: `${pct(e.rates.click_rate)} of delivered`,
      accent: 'border-t-[#7C3AED]',
      numberClass: 'text-[#7C3AED]',
    },
    {
      key: 'bounced',
      label: 'Bounced',
      value: e.cards.bounced,
      sub: `${pct(e.rates.bounce_rate)} of sent`,
      accent: 'border-t-warning',
      numberClass: 'text-warning',
    },
    {
      key: 'complained',
      label: 'Complained',
      value: e.cards.complained,
      sub: 'Marked as spam',
      accent: 'border-t-danger',
      numberClass: 'text-danger',
    },
  ]
})

const eventStyle: Record<string, string> = {
  sent: 'bg-surface-elevated text-ink-muted',
  delivered: 'bg-success/10 text-success',
  delivery_delayed: 'bg-warning/10 text-warning',
  opened: 'bg-[#4CCCE8]/15 text-[#0e7490]',
  clicked: 'bg-[#7C3AED]/15 text-[#6d28d9]',
  bounced: 'bg-warning/15 text-warning',
  complained: 'bg-danger/10 text-danger',
}

function eventChip(ev: string): string {
  return eventStyle[ev] ?? 'bg-surface-elevated text-ink-muted'
}

// Subject-group expansion state.
const expandedGroups = ref<Set<string>>(new Set())
function toggleGroup(subject: string) {
  const next = new Set(expandedGroups.value)
  if (next.has(subject)) next.delete(subject)
  else next.add(subject)
  expandedGroups.value = next
}

// Backfill action (admin + UFD client both allowed at the function level).
const backfilling = ref(false)
const backfillResult = ref<string | null>(null)

async function runBackfill() {
  if (!confirm('Backfill up to 180 days of email history from Resend into CommandSite? Safe to run multiple times.')) return
  backfilling.value = true
  backfillResult.value = null
  const { data, error: err } = await supabase.functions.invoke<{
    scanned: number
    inserted: number
    skipped: number
  }>('ufd-email-backfill', { body: { days: 180 } })
  backfilling.value = false
  if (err) {
    backfillResult.value = await surfaceError(err, 'Backfill failed')
    return
  }
  backfillResult.value = `Scanned ${data?.scanned ?? 0}, inserted ${data?.inserted ?? 0}, skipped ${data?.skipped ?? 0}.`
  loadEmails()
}

// Ensure auth is referenced so TS doesn't drop the import; reserved for
// future admin-only UI gating.
void auth
</script>

<template>
  <div class="space-y-6">
    <!-- Header: title + window filter -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">UFD · Email Activity</h2>
        <p class="text-sm text-ink-muted">
          Resend · transactional + marketing email performance
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="w in windows"
          :key="w.key"
          type="button"
          :class="['chip', active === w.key && 'chip-active']"
          @click="active = w.key"
        >
          {{ w.label }}
        </button>
      </div>
    </div>

    <section>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="eyebrow">Email Activity</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">{{ activeLabel }}</span>
        <span class="text-xs text-ink-muted ml-1">via Resend</span>
        <div class="ml-auto flex items-center gap-2">
          <span v-if="backfillResult" class="text-xs text-ink-muted">
            {{ backfillResult }}
          </span>
          <button
            type="button"
            class="btn-ghost text-xs"
            :disabled="backfilling"
            @click="runBackfill"
          >
            {{ backfilling ? 'Backfilling…' : 'Backfill history' }}
          </button>
        </div>
      </div>

      <div
        v-if="emailsError"
        class="card border border-danger/30 bg-danger/5 text-sm text-danger mb-3"
      >
        Couldn't load email activity: {{ emailsError }}
      </div>

      <div
        v-if="emails?.truncated"
        class="card border border-warning/30 bg-warning/5 text-xs text-warning mb-3"
      >
        Showing the most recent batch only. Widen the window and some older emails may be omitted.
      </div>

      <!-- Rate indicators -->
      <div v-if="emails" class="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div
          v-for="r in rateCardDefs"
          :key="r.key"
          :class="['card-flat border-t-4 shadow-card', r.accent]"
        >
          <div :class="['text-3xl font-semibold', r.tone]">{{ r.value }}</div>
          <div class="mt-1 text-xs font-medium text-ink">{{ r.label }}</div>
          <div class="mt-0.5 text-[11px] text-ink-muted">{{ r.sub }}</div>
        </div>
      </div>

      <!-- Counter cards -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <template v-if="emails">
          <div
            v-for="c in emailCardDefs"
            :key="c.key"
            :class="['card-flat border-t-4 shadow-card', c.accent]"
          >
            <div :class="['text-2xl font-semibold', c.numberClass]">{{ c.value }}</div>
            <div class="mt-1 text-xs font-medium text-ink">{{ c.label }}</div>
            <div class="mt-0.5 text-[11px] text-ink-muted">{{ c.sub }}</div>
          </div>
        </template>
        <template v-else>
          <div
            v-for="n in 6"
            :key="`skeleton-${n}`"
            class="card-flat h-24 animate-pulse bg-surface-elevated"
          />
        </template>
      </div>

      <!-- Grouped emails by subject, expandable -->
      <div v-if="emails && emails.groups.length > 0" class="card mt-4">
        <h3 class="mb-3 text-sm font-semibold text-ink">
          Email Campaigns ({{ emails.groups.length }} unique subjects)
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-divider text-left text-xs uppercase tracking-wide text-ink-muted">
                <th class="w-6 px-2 py-2"></th>
                <th class="px-3 py-2 font-medium">Subject</th>
                <th class="whitespace-nowrap px-3 py-2 text-right font-medium">Sent</th>
                <th class="whitespace-nowrap px-3 py-2 text-right font-medium">Delivered</th>
                <th class="whitespace-nowrap px-3 py-2 text-right font-medium">Opened</th>
                <th class="whitespace-nowrap px-3 py-2 text-right font-medium">Clicked</th>
                <th class="whitespace-nowrap px-3 py-2 text-right font-medium">Bounced</th>
                <th class="whitespace-nowrap px-3 py-2 font-medium">Last sent</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="g in emails.groups" :key="g.subject">
                <tr
                  class="cursor-pointer border-b border-divider/60 hover:bg-surface-elevated/50"
                  @click="toggleGroup(g.subject)"
                >
                  <td class="px-2 py-2 text-ink-muted">
                    {{ expandedGroups.has(g.subject) ? '▾' : '▸' }}
                  </td>
                  <td class="px-3 py-2 text-ink">{{ g.subject }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-right text-ink">{{ g.sent }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-right text-ink">
                    {{ g.delivered }}
                    <span class="text-[11px] text-ink-muted">
                      ({{ pct(g.sent ? g.delivered / g.sent : 0) }})
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-2 text-right text-ink">
                    {{ g.opened }}
                    <span class="text-[11px] text-ink-muted">
                      ({{ pct(g.delivered ? g.opened / g.delivered : 0) }})
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-2 text-right text-ink">
                    {{ g.clicked }}
                    <span class="text-[11px] text-ink-muted">
                      ({{ pct(g.delivered ? g.clicked / g.delivered : 0) }})
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-2 text-right text-ink">{{ g.bounced }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-ink-muted">
                    {{ fmtDateTime(g.last_sent) }}
                  </td>
                </tr>
                <tr v-if="expandedGroups.has(g.subject)" :key="g.subject + ':detail'">
                  <td></td>
                  <td colspan="7" class="bg-surface-elevated/40 px-3 py-3">
                    <table class="w-full text-xs">
                      <thead>
                        <tr class="text-left text-[10px] uppercase text-ink-muted">
                          <th class="px-2 py-1 font-medium">Sent</th>
                          <th class="px-2 py-1 font-medium">To</th>
                          <th class="px-2 py-1 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="em in g.emails"
                          :key="em.id"
                          class="border-t border-divider/40"
                        >
                          <td class="whitespace-nowrap px-2 py-1 text-ink-muted">
                            {{ fmtDateTime(em.created_at) }}
                          </td>
                          <td class="whitespace-nowrap px-2 py-1 text-ink">{{ em.to }}</td>
                          <td class="whitespace-nowrap px-2 py-1">
                            <span
                              :class="['inline-block rounded-full px-2 py-0.5 text-[10px] font-medium', eventChip(em.last_event)]"
                            >
                              {{ em.last_event }}
                            </span>
                          </td>
                        </tr>
                        <tr v-if="g.more_count > 0">
                          <td colspan="3" class="px-2 py-1 text-[11px] italic text-ink-muted">
                            + {{ g.more_count }} more not shown (widen window to fetch more)
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
