<script setup lang="ts">
/**
 * Customer detail drawer — slides in from the right, mirrors the
 * UfdUserDetailDrawer pattern. Renders the full reverse-chronological
 * timeline of every interaction CommandSite has logged for this
 * customer: AI calls (with expandable transcripts), SMS in/out (chat
 * bubbles), emails (subject + preview + status), appointments,
 * completed jobs (tech / amount / notes), review requests, reviews
 * received, and reactivation triggers.
 */
import { ref, watch } from 'vue'
import type { Customer, TimelineEvent } from '@/lib/clients/apex/customers'
import { STAGE_META } from '@/lib/clients/apex/customers'

const props = defineProps<{
  open: boolean
  customer: Customer | null
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

// Transcript collapse state — keyed by event id.
const expanded = ref<Set<string>>(new Set())
function toggle(id: string) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
  // Force reactivity — Set mutation isn't deep-watched
  expanded.value = new Set(expanded.value)
}

// Reset expand state when customer changes
watch(
  () => props.customer?.id,
  () => {
    expanded.value = new Set()
  },
)

function money(cents: number | undefined): string {
  if (cents === undefined) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtDuration(s: number | undefined): string {
  if (!s) return ''
  if (s < 60) return `${s}s`
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return secs ? `${mins}m ${secs}s` : `${mins}m`
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const day = 86400000
  if (diff < day) {
    return `Today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  if (diff < 2 * day) {
    return `Yesterday, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  const days = Math.floor(diff / day)
  if (days < 30) return `${days}d ago · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function eventIcon(kind: TimelineEvent['kind']): string {
  switch (kind) {
    case 'inbound_call': return '📞'
    case 'sms_sent':
    case 'sms_received': return '💬'
    case 'email_sent':
    case 'email_received': return '📧'
    case 'appointment_booked': return '📅'
    case 'job_completed': return '🔧'
    case 'review_request_sent': return '⭐'
    case 'review_received': return '⭐'
    case 'reactivation_triggered': return '🔄'
    case 'note_added': return '📝'
  }
}

function eventLabel(kind: TimelineEvent['kind']): string {
  switch (kind) {
    case 'inbound_call':           return 'Inbound Call — AI Handled'
    case 'sms_sent':               return 'SMS Sent'
    case 'sms_received':           return 'SMS Received'
    case 'email_sent':             return 'Email Sent'
    case 'email_received':         return 'Email Received'
    case 'appointment_booked':     return 'Appointment Booked'
    case 'job_completed':          return 'Job Completed'
    case 'review_request_sent':    return 'Review Request Sent'
    case 'review_received':        return 'Review Received'
    case 'reactivation_triggered': return 'Reactivation Triggered'
    case 'note_added':             return 'Note Added'
  }
}

function reviewStars(rating: number | undefined): string {
  if (!rating) return ''
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[60] flex justify-end bg-ink/40"
    @click.self="emit('close')"
  >
    <div
      class="flex h-full w-full max-w-3xl flex-col bg-surface-raised shadow-2xl"
      @click.stop
    >
      <template v-if="customer">
        <!-- Header -->
        <div class="border-b border-divider px-6 py-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-lg font-semibold text-ink">{{ customer.name }}</h3>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  :style="{ backgroundColor: STAGE_META[customer.funnel_stage].color }"
                >
                  {{ STAGE_META[customer.funnel_stage].label }}
                </span>
              </div>
              <div class="mt-1 text-xs text-ink-muted space-x-3">
                <span>{{ customer.phone }}</span>
                <span>·</span>
                <span>{{ customer.email }}</span>
              </div>
              <div class="mt-0.5 text-xs text-ink-muted">{{ customer.address }}</div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button type="button" class="btn-secondary text-xs">Take Over</button>
              <button type="button" class="btn-ghost text-xs" @click="emit('close')">Close</button>
            </div>
          </div>

          <!-- Quick stats row -->
          <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div class="kpi-label">Source</div>
              <div class="mt-0.5 text-ink font-medium">{{ customer.source }}</div>
            </div>
            <div>
              <div class="kpi-label">Lifetime Value</div>
              <div class="mt-0.5 text-ink font-medium">{{ money(customer.lifetime_value_cents) }}</div>
            </div>
            <div>
              <div class="kpi-label">Assigned Tech</div>
              <div class="mt-0.5 text-ink font-medium">{{ customer.assigned_tech ?? '—' }}</div>
            </div>
            <div>
              <div class="kpi-label">First Contact</div>
              <div class="mt-0.5 text-ink font-medium">{{ fmtTimestamp(customer.first_contact_at) }}</div>
            </div>
          </div>

          <!-- Tags + notes -->
          <div v-if="customer.tags.length > 0" class="mt-3 flex flex-wrap items-center gap-1.5">
            <span
              v-for="t in customer.tags"
              :key="t"
              class="rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-semibold"
            >
              {{ t }}
            </span>
          </div>
          <div
            v-if="customer.notes"
            class="mt-3 rounded-md bg-surface-elevated/60 border border-divider px-3 py-2 text-xs text-ink-muted italic"
          >
            <span class="font-semibold not-italic text-ink-muted">Notes:</span> {{ customer.notes }}
          </div>
        </div>

        <!-- Timeline -->
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div class="mb-3 flex items-center justify-between">
            <span class="eyebrow">Timeline</span>
            <span class="text-[11px] text-ink-disabled">{{ customer.timeline.length }} events</span>
          </div>

          <div class="relative space-y-3">
            <!-- Vertical rule down the icon column -->
            <div class="absolute left-3.5 top-2 bottom-2 w-px bg-divider"></div>

            <div
              v-for="ev in customer.timeline"
              :key="ev.id"
              class="relative flex items-start gap-3"
            >
              <!-- Icon bubble -->
              <div class="relative z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-raised border border-divider text-sm">
                {{ eventIcon(ev.kind) }}
              </div>

              <!-- Card -->
              <div class="flex-1 min-w-0 rounded-md border border-divider bg-surface-raised px-3 py-2 shadow-card">
                <div class="flex items-baseline justify-between gap-2">
                  <div class="text-[11px] font-semibold uppercase tracking-wide text-ink-muted truncate">
                    {{ eventLabel(ev.kind) }}<span v-if="ev.title"> · {{ ev.title }}</span>
                  </div>
                  <div class="text-[10px] text-ink-disabled flex-shrink-0">
                    {{ fmtTimestamp(ev.at) }}
                  </div>
                </div>

                <!-- Review received -->
                <div v-if="ev.kind === 'review_received'" class="mt-1.5 space-y-1.5">
                  <div class="flex items-center gap-2">
                    <span class="text-warn font-semibold tracking-tight">{{ reviewStars(ev.rating) }}</span>
                    <span v-if="ev.source" class="text-[10px] uppercase tracking-wide text-ink-muted">
                      via {{ ev.source }}
                    </span>
                  </div>
                  <p class="text-xs text-ink leading-snug">"{{ ev.body }}"</p>
                </div>

                <!-- SMS -->
                <div v-else-if="ev.kind === 'sms_sent' || ev.kind === 'sms_received'" class="mt-1.5">
                  <div
                    :class="[
                      'inline-block rounded-2xl px-3 py-1.5 text-xs leading-snug max-w-full whitespace-pre-wrap',
                      ev.kind === 'sms_sent'
                        ? 'bg-brand/10 text-ink rounded-br-sm'
                        : 'bg-surface-elevated text-ink rounded-bl-sm',
                    ]"
                  >
                    {{ ev.body }}
                  </div>
                  <div v-if="ev.status" class="mt-1 text-[10px] text-ink-disabled">
                    {{ ev.status }}
                  </div>
                </div>

                <!-- Email -->
                <div v-else-if="ev.kind === 'email_sent' || ev.kind === 'email_received'" class="mt-1.5 space-y-1">
                  <div v-if="ev.subject" class="text-xs font-semibold text-ink">{{ ev.subject }}</div>
                  <div v-if="ev.body" class="text-xs text-ink-muted line-clamp-2">{{ ev.body }}</div>
                  <div v-if="ev.status" class="text-[10px] text-ink-disabled">{{ ev.status }}</div>
                </div>

                <!-- Inbound call -->
                <div v-else-if="ev.kind === 'inbound_call'" class="mt-1.5 space-y-2">
                  <div v-if="ev.duration_seconds" class="text-xs text-ink-muted">
                    Duration: {{ fmtDuration(ev.duration_seconds) }}
                  </div>
                  <button
                    v-if="ev.transcript"
                    type="button"
                    class="text-xs text-brand font-semibold hover:underline"
                    @click="toggle(ev.id)"
                  >
                    {{ expanded.has(ev.id) ? '▾ Hide transcript' : '▸ Show transcript' }}
                  </button>
                  <pre
                    v-if="ev.transcript && expanded.has(ev.id)"
                    class="whitespace-pre-wrap rounded-md bg-surface-elevated/60 px-3 py-2 text-[11px] leading-relaxed text-ink font-mono"
                  >{{ ev.transcript }}</pre>
                  <div
                    v-if="ev.ai_actions && ev.ai_actions.length > 0"
                    class="rounded-md border border-success/30 bg-success/5 px-3 py-2"
                  >
                    <div class="text-[10px] uppercase tracking-wide font-semibold text-success mb-1">
                      AI actions taken
                    </div>
                    <ul class="space-y-0.5 text-[11px] text-ink">
                      <li v-for="a in ev.ai_actions" :key="a">✓ {{ a }}</li>
                    </ul>
                  </div>
                </div>

                <!-- Job completed -->
                <div v-else-if="ev.kind === 'job_completed'" class="mt-1.5 space-y-1.5">
                  <div class="flex flex-wrap items-baseline gap-3 text-xs">
                    <span v-if="ev.tech" class="text-ink">{{ ev.tech }}</span>
                    <span v-if="ev.amount_cents" class="font-semibold text-ink">{{ money(ev.amount_cents) }}</span>
                    <span v-if="ev.duration_seconds" class="text-ink-muted">{{ fmtDuration(ev.duration_seconds) }}</span>
                  </div>
                  <div v-if="ev.meta && ev.meta.length > 0" class="space-y-0.5 text-[11px]">
                    <div v-for="m in ev.meta" :key="m.label">
                      <span class="text-ink-disabled">{{ m.label }}:</span>
                      <span class="ml-1 text-ink-muted">{{ m.value }}</span>
                    </div>
                  </div>
                </div>

                <!-- Appointment booked -->
                <div v-else-if="ev.kind === 'appointment_booked'" class="mt-1.5 space-y-1">
                  <div v-if="ev.tech" class="text-xs text-ink">Tech: {{ ev.tech }}</div>
                  <div v-if="ev.meta && ev.meta.length > 0" class="space-y-0.5 text-[11px]">
                    <div v-for="m in ev.meta" :key="m.label">
                      <span class="text-ink-disabled">{{ m.label }}:</span>
                      <span class="ml-1 text-ink-muted">{{ m.value }}</span>
                    </div>
                  </div>
                </div>

                <!-- Review request sent -->
                <div v-else-if="ev.kind === 'review_request_sent'" class="mt-1.5">
                  <div
                    class="inline-block rounded-2xl bg-brand/10 text-ink px-3 py-1.5 text-xs leading-snug rounded-br-sm whitespace-pre-wrap"
                  >
                    {{ ev.body }}
                  </div>
                  <div v-if="ev.status" class="mt-1 text-[10px] text-ink-disabled">{{ ev.status }}</div>
                </div>

                <!-- Reactivation triggered -->
                <div v-else-if="ev.kind === 'reactivation_triggered'" class="mt-1.5 space-y-1">
                  <div v-if="ev.body" class="text-xs text-ink">{{ ev.body }}</div>
                  <div v-if="ev.status" class="text-[10px] text-ink-disabled">{{ ev.status }}</div>
                </div>

                <!-- Generic fallback -->
                <div v-else-if="ev.body" class="mt-1.5 text-xs text-ink">{{ ev.body }}</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
