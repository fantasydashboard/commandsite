<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Client } from '@/types/database'

// Slide-over user detail panel. Aggregates UFD profile + Stripe history +
// Resend email timeline + freeform notes for one user, identified by
// email. Designed to overlay anything (cohort modal, revenue tables) at
// z-60 — so it sits above existing modals.

const props = defineProps<{
  open: boolean
  email: string | null
  client: Client
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const auth = useAuthStore()

interface SubscriptionItem {
  price_id: string
  nickname: string | null
  unit_amount: number | null
  currency: string
  interval: string | null
  interval_count: number | null
  quantity: number
}
interface Subscription {
  id: string
  status: string
  cancel_at_period_end: boolean
  start_date: number
  current_period_end: number
  canceled_at: number | null
  items: SubscriptionItem[]
  mrr_cents: number
}
interface Charge {
  id: string
  amount: number
  amount_refunded: number
  currency: string
  created: number
  status: string
  paid: boolean
  description: string | null
  failure_message: string | null
  receipt_url: string | null
}
interface EmailRollup {
  email_id: string
  subject: string | null
  first_seen: string
  latest_status: string
  opened: boolean
  clicked: boolean
  events: { event_type: string; occurred_at: string; click_url: string | null }[]
}
interface Note {
  id: string
  body: string
  created_by: string | null
  created_at: string
  updated_at: string
  author: { id: string; email: string; role: string } | null
}
interface DetailResponse {
  email: string
  // deno-lint-ignore no-explicit-any
  profile: any
  stripe: {
    customer: { id: string; email: string | null; name: string | null } | null
    subscriptions: Subscription[]
    charges: Charge[]
  }
  emails: EmailRollup[]
  notes: Note[]
  stats: {
    lifetime_revenue_cents: number
    current_mrr_cents: number
    total_emails_received: number
    last_email_received: string | null
    last_email_opened: string | null
  }
}

const data = ref<DetailResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const tab = ref<'overview' | 'subscriptions' | 'charges' | 'emails' | 'notes'>('overview')
const noteDraft = ref('')
const noteSaving = ref(false)
const noteError = ref<string | null>(null)

async function load() {
  if (!props.email) return
  loading.value = true
  error.value = null
  data.value = null
  noteDraft.value = ''
  const { data: result, error: err } = await supabase.functions.invoke<DetailResponse>(
    'ufd-user-detail',
    { body: { email: props.email } },
  )
  loading.value = false
  if (err) {
    if (err instanceof FunctionsHttpError) {
      try {
        const body = await err.context.json()
        error.value = body?.error
          ? `${body.error} (HTTP ${err.context.status})`
          : `${err.message} (HTTP ${err.context.status})`
      } catch {
        error.value = `${err.message} (HTTP ${err.context.status})`
      }
    } else {
      error.value = err.message
    }
    return
  }
  data.value = result
  tab.value = 'overview'
}

watch(
  () => [props.open, props.email],
  ([open]) => {
    if (open) load()
  },
  { immediate: true },
)

// ── Notes CRUD (RLS allows client_users to manage their own client's notes) ──
async function addNote() {
  if (!props.email) return
  const body = noteDraft.value.trim()
  if (!body) return
  noteSaving.value = true
  noteError.value = null
  const { data: row, error: err } = await supabase
    .from('user_notes')
    .insert({
      client_id: props.client.id,
      user_email: props.email.toLowerCase(),
      body,
      created_by: auth.profile?.id ?? null,
    })
    .select('id, body, created_by, created_at, updated_at')
    .single()
  noteSaving.value = false
  if (err) {
    noteError.value = err.message
    return
  }
  // Stitch the new note onto the local data so the UI reflects immediately.
  if (data.value) {
    const author = auth.profile
      ? { id: auth.profile.id, email: auth.profile.email, role: auth.profile.role }
      : null
    data.value = {
      ...data.value,
      notes: [{ ...row, author }, ...data.value.notes],
    }
  }
  noteDraft.value = ''
}

async function deleteNote(noteId: string) {
  if (!confirm('Delete this note?')) return
  const { error: err } = await supabase.from('user_notes').delete().eq('id', noteId)
  if (err) {
    noteError.value = err.message
    return
  }
  if (data.value) {
    data.value = { ...data.value, notes: data.value.notes.filter((n) => n.id !== noteId) }
  }
}

// ── Format helpers ─────────────────────────────────────────────────────
function money(cents: number, opts: { decimals?: number } = {}): string {
  const dollars = (cents ?? 0) / 100
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.decimals ?? (Math.abs(dollars) < 100 ? 2 : 0),
    maximumFractionDigits: opts.decimals ?? 2,
  })
}
function fmtDate(value: string | number | null): string {
  if (!value) return '—'
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtDateTime(value: string | number | null): string {
  if (!value) return '—'
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

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

const subStatusStyle: Record<string, string> = {
  active: 'bg-success/10 text-success',
  trialing: 'bg-[#4CCCE8]/15 text-[#0e7490]',
  past_due: 'bg-warning/15 text-warning',
  canceled: 'bg-ink-muted/20 text-ink-muted',
  incomplete: 'bg-warning/10 text-warning',
  unpaid: 'bg-danger/10 text-danger',
}
function subChip(status: string): string {
  return subStatusStyle[status] ?? 'bg-surface-elevated text-ink-muted'
}

const headerName = computed(() => {
  const name = data.value?.profile?.full_name || data.value?.stripe.customer?.name
  return name || data.value?.email || props.email || ''
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[60] flex justify-end bg-ink/40"
    @click.self="emit('close')"
  >
    <div
      class="flex h-full w-full max-w-2xl flex-col bg-surface-raised shadow-2xl"
      @click.stop
    >
      <!-- Header -->
      <div class="flex items-start justify-between border-b border-divider px-6 py-4">
        <div>
          <h3 class="text-base font-semibold text-ink">{{ headerName || 'User detail' }}</h3>
          <p class="text-xs text-ink-muted">{{ email }}</p>
        </div>
        <button type="button" class="btn-ghost text-xs" @click="emit('close')">Close</button>
      </div>

      <!-- Tabs -->
      <div v-if="data" class="flex gap-1 border-b border-divider px-6">
        <button
          v-for="t in [
            { key: 'overview', label: 'Overview' },
            { key: 'subscriptions', label: `Subscriptions (${data.stripe.subscriptions.length})` },
            { key: 'charges', label: `Charges (${data.stripe.charges.length})` },
            { key: 'emails', label: `Emails (${data.emails.length})` },
            { key: 'notes', label: `Notes (${data.notes.length})` },
          ]"
          :key="t.key"
          type="button"
          :class="[
            'px-3 py-2 text-xs font-medium border-b-2 -mb-px',
            tab === t.key
              ? 'border-brand text-ink'
              : 'border-transparent text-ink-muted hover:text-ink',
          ]"
          @click="tab = t.key as 'overview' | 'subscriptions' | 'charges' | 'emails' | 'notes'"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-6 py-4">
        <div v-if="loading" class="py-8 text-center text-sm text-ink-muted">Loading…</div>
        <div v-else-if="error" class="card border border-danger/30 bg-danger/5 text-sm text-danger">
          {{ error }}
        </div>
        <template v-else-if="data">
          <!-- Overview tab -->
          <div v-if="tab === 'overview'" class="space-y-5">
            <!-- Stats cards -->
            <div class="grid grid-cols-2 gap-3">
              <div class="card-flat border border-divider">
                <div class="text-xs text-ink-muted">Lifetime revenue</div>
                <div class="mt-1 text-xl font-semibold text-success">
                  {{ money(data.stats.lifetime_revenue_cents) }}
                </div>
              </div>
              <div class="card-flat border border-divider">
                <div class="text-xs text-ink-muted">Current MRR</div>
                <div class="mt-1 text-xl font-semibold text-[#2E9FE0]">
                  {{ money(data.stats.current_mrr_cents) }}
                </div>
              </div>
              <div class="card-flat border border-divider">
                <div class="text-xs text-ink-muted">Emails received</div>
                <div class="mt-1 text-xl font-semibold text-ink">
                  {{ data.stats.total_emails_received }}
                </div>
              </div>
              <div class="card-flat border border-divider">
                <div class="text-xs text-ink-muted">Last opened email</div>
                <div class="mt-1 text-sm font-medium text-ink">
                  {{ fmtDate(data.stats.last_email_opened) }}
                </div>
              </div>
            </div>

            <!-- Profile facts -->
            <div v-if="data.profile" class="card-flat border border-divider space-y-2">
              <div class="eyebrow">Profile (UFD)</div>
              <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt class="text-ink-muted">Full name</dt>
                <dd class="text-ink">{{ data.profile.full_name ?? '—' }}</dd>
                <dt class="text-ink-muted">Signed up</dt>
                <dd class="text-ink">{{ fmtDate(data.profile.created_at) }}</dd>
                <dt class="text-ink-muted">Trial started</dt>
                <dd class="text-ink">{{ fmtDate(data.profile.trial_started_at) }}</dd>
                <dt class="text-ink-muted">Trial ends</dt>
                <dd class="text-ink">{{ fmtDate(data.profile.trial_expires_at) }}</dd>
              </dl>
            </div>
            <div v-else class="text-xs italic text-ink-muted">
              No matching UFD profile found for this email.
            </div>

            <!-- Stripe customer -->
            <div v-if="data.stripe.customer" class="card-flat border border-divider space-y-2">
              <div class="eyebrow">Stripe</div>
              <div class="text-sm text-ink">
                {{ data.stripe.customer.name ?? data.stripe.customer.email }}
              </div>
              <div class="font-mono text-[11px] text-ink-muted">{{ data.stripe.customer.id }}</div>
            </div>
            <div v-else class="text-xs italic text-ink-muted">
              No Stripe customer matching this email.
            </div>
          </div>

          <!-- Subscriptions tab -->
          <div v-else-if="tab === 'subscriptions'" class="space-y-3">
            <div
              v-if="data.stripe.subscriptions.length === 0"
              class="py-8 text-center text-sm text-ink-muted"
            >
              No subscriptions on record.
            </div>
            <div
              v-for="s in data.stripe.subscriptions"
              :key="s.id"
              class="card-flat border border-divider"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span :class="['rounded-full px-2 py-0.5 text-[10px] font-medium uppercase', subChip(s.status)]">
                    {{ s.status }}
                  </span>
                  <span v-if="s.cancel_at_period_end" class="text-[11px] text-warning">
                    cancels at period end
                  </span>
                </div>
                <span class="text-xs text-ink-muted">{{ money(s.mrr_cents) }} / mo</span>
              </div>
              <div class="mt-2 space-y-1 text-xs text-ink">
                <div v-for="(it, i) in s.items" :key="i">
                  {{ it.nickname ?? it.price_id }} ·
                  {{ money(it.unit_amount ?? 0) }}
                  <span v-if="it.interval"> / {{ it.interval }}</span>
                  <span v-if="it.quantity > 1"> × {{ it.quantity }}</span>
                </div>
              </div>
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
                <span>Started {{ fmtDate(s.start_date) }}</span>
                <span>Renews {{ fmtDate(s.current_period_end) }}</span>
                <span v-if="s.canceled_at">Canceled {{ fmtDate(s.canceled_at) }}</span>
              </div>
            </div>
          </div>

          <!-- Charges tab -->
          <div v-else-if="tab === 'charges'" class="space-y-2">
            <div
              v-if="data.stripe.charges.length === 0"
              class="py-8 text-center text-sm text-ink-muted"
            >
              No charges on record.
            </div>
            <div
              v-for="c in data.stripe.charges"
              :key="c.id"
              class="card-flat border border-divider flex items-center justify-between"
            >
              <div>
                <div class="text-sm font-medium text-ink">
                  {{ money(c.amount) }}
                  <span
                    v-if="c.amount_refunded > 0"
                    class="ml-2 text-[11px] text-warning"
                  >
                    refunded {{ money(c.amount_refunded) }}
                  </span>
                </div>
                <div class="text-[11px] text-ink-muted">{{ fmtDateTime(c.created) }}</div>
                <div v-if="c.description" class="text-xs text-ink-muted">{{ c.description }}</div>
                <div v-if="c.failure_message" class="text-xs text-danger">{{ c.failure_message }}</div>
              </div>
              <div class="flex flex-col items-end gap-1">
                <span
                  :class="[
                    'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                    c.status === 'succeeded' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                  ]"
                >
                  {{ c.status }}
                </span>
                <a
                  v-if="c.receipt_url"
                  :href="c.receipt_url"
                  target="_blank"
                  rel="noopener"
                  class="text-[10px] text-[#2E9FE0] hover:underline"
                >
                  receipt ↗
                </a>
              </div>
            </div>
          </div>

          <!-- Emails tab -->
          <div v-else-if="tab === 'emails'" class="space-y-2">
            <div v-if="data.emails.length === 0" class="py-8 text-center text-sm text-ink-muted">
              No emails captured. Run "Backfill history" on the Email tab to seed historical events.
            </div>
            <div
              v-for="em in data.emails"
              :key="em.email_id"
              class="card-flat border border-divider"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1">
                  <div class="text-sm font-medium text-ink">{{ em.subject ?? '—' }}</div>
                  <div class="text-[11px] text-ink-muted">{{ fmtDateTime(em.first_seen) }}</div>
                </div>
                <div class="flex flex-col items-end gap-1">
                  <span
                    :class="['inline-block rounded-full px-2 py-0.5 text-[10px] font-medium', eventChip(em.latest_status)]"
                  >
                    {{ em.latest_status }}
                  </span>
                  <div class="flex gap-1 text-[10px]">
                    <span v-if="em.opened" class="text-success">✓ opened</span>
                    <span v-if="em.clicked" class="text-[#7C3AED]">✓ clicked</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Notes tab -->
          <div v-else-if="tab === 'notes'" class="space-y-3">
            <div class="card-flat border border-divider space-y-2">
              <textarea
                v-model="noteDraft"
                rows="3"
                placeholder="Add a note about this user… (visible to admin + UFD team)"
                class="w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
              />
              <div class="flex items-center justify-between gap-2">
                <span v-if="noteError" class="text-xs text-danger">{{ noteError }}</span>
                <span v-else class="text-[11px] text-ink-muted">
                  Notes are scoped to this client. Cmd+Enter to add.
                </span>
                <button
                  type="button"
                  class="btn-primary text-xs"
                  :disabled="noteSaving || !noteDraft.trim()"
                  @click="addNote"
                >
                  {{ noteSaving ? 'Adding…' : 'Add note' }}
                </button>
              </div>
            </div>
            <div
              v-if="data.notes.length === 0"
              class="py-4 text-center text-xs italic text-ink-muted"
            >
              No notes yet.
            </div>
            <div
              v-for="n in data.notes"
              :key="n.id"
              class="card-flat border border-divider"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 whitespace-pre-wrap text-sm text-ink">{{ n.body }}</div>
                <button
                  type="button"
                  class="text-xs text-ink-muted hover:text-danger"
                  @click="deleteNote(n.id)"
                >
                  ×
                </button>
              </div>
              <div class="mt-2 text-[11px] text-ink-muted">
                {{ n.author?.email ?? 'unknown' }} · {{ fmtDateTime(n.created_at) }}
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
