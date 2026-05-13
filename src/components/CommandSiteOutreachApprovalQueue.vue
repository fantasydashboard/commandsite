<script setup lang="ts">
/**
 * CommandSite cold-email Approval Queue.
 *
 * The dopamine surface for outreach: leads land here once a draft is
 * ready, you approve / edit / skip, and a "sent today" counter ticks
 * up. Cards animate in on arrival and slide out on action. An
 * auto-approve toggle in the header flips the whole thing into
 * hands-off mode.
 */
import { computed, ref, watch } from 'vue'
import type { CsLead } from '@/types/database'
import type { QueueItem } from '@/lib/clients/commandsite/useAutoOutreach'

const props = defineProps<{
  items: QueueItem[]
  sentToday: number
  draftedToday: number
  autoApprove: boolean
  minScore: number
  /** Gmail OAuth status — drives the send-mode badge + warns when
   *  auto-approve is on without a connection. */
  gmailConnected: boolean
  gmailEmail?: string | null
  /** Lead id most recently approved — used for a brief highlight pulse. */
  lastApprovedId?: string | null
  /** Disable buttons while an action is in flight. */
  busy?: boolean
}>()

const emit = defineEmits<{
  (e: 'approve', lead: CsLead): void
  (e: 'edit', lead: CsLead): void
  (e: 'skip', lead: CsLead): void
  (e: 'approveAll'): void
  (e: 'update:autoApprove', value: boolean): void
}>()

const processingId = ref<string | null>(null)

// Count-up animation for the "Sent today" tile so each new send feels
// like a hit instead of just an integer increment.
const displayedSent = ref(props.sentToday)
const displayedDrafted = ref(props.draftedToday)

function animateCount(target: number, current: { value: number }) {
  const start = current.value
  const delta = target - start
  if (delta === 0) return
  const duration = 450
  const startTs = performance.now()
  function tick(now: number) {
    const t = Math.min(1, (now - startTs) / duration)
    // ease-out-quart for the satisfying "lands soft" feel
    const eased = 1 - Math.pow(1 - t, 4)
    current.value = Math.round(start + delta * eased)
    if (t < 1) requestAnimationFrame(tick)
    else current.value = target
  }
  requestAnimationFrame(tick)
}

watch(() => props.sentToday, (n) => animateCount(n, displayedSent))
watch(() => props.draftedToday, (n) => animateCount(n, displayedDrafted))

const queueLabel = computed(() => {
  const n = props.items.length
  if (n === 0) return 'All clear — drafts will appear here as Ada writes them'
  return `${n} ${n === 1 ? 'draft needs' : 'drafts need'} your eyes`
})

async function act(lead: CsLead, action: 'approve' | 'edit' | 'skip') {
  if (processingId.value || props.busy) return
  processingId.value = lead.id
  // Hold the highlight briefly before emitting so the slide-out reads
  await new Promise((r) => setTimeout(r, 220))
  if (action === 'approve') emit('approve', lead)
  else if (action === 'edit') emit('edit', lead)
  else emit('skip', lead)
  setTimeout(() => {
    processingId.value = null
  }, 320)
}

function bandClass(color: QueueItem['scoreColor']): string {
  switch (color) {
    case 'violet':  return 'bg-brand/15 text-brand border-brand/40'
    case 'emerald': return 'bg-success/15 text-success border-success/40'
    case 'lime':    return 'bg-warn/15 text-warn border-warn/40'
    case 'amber':   return 'bg-ink-muted/10 text-ink-muted border-divider'
  }
}

function bandLabel(color: QueueItem['scoreColor']): string {
  switch (color) {
    case 'violet':  return 'Top fit'
    case 'emerald': return 'Strong'
    case 'lime':    return 'Moderate'
    case 'amber':   return 'Weak'
  }
}

function snippet(body: string | null): string {
  if (!body) return ''
  const trimmed = body.replace(/\s+/g, ' ').trim()
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}…` : trimmed
}
</script>

<template>
  <section class="rounded-card border-2 border-brand/40 bg-gradient-to-br from-brand/5 to-surface overflow-hidden">
    <!-- ── Header: title, auto-approve toggle, counters ─────────────── -->
    <header class="flex items-start justify-between gap-4 px-5 py-4 bg-brand/10 border-b border-brand/20 flex-wrap">
      <div class="flex items-start gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white text-lg font-bold flex-shrink-0">
          📨
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">
            Approval queue
          </div>
          <h2 class="text-lg font-bold text-ink leading-tight">{{ queueLabel }}</h2>
          <p class="text-xs text-ink-muted mt-0.5">
            Threshold: score ≥ {{ minScore }} ·
            <template v-if="gmailConnected">
              sending as <strong class="text-success">{{ gmailEmail }}</strong>
            </template>
            <template v-else>
              <span class="text-warn font-semibold">Gmail not connected</span>
              — Approve opens a compose tab
            </template>
          </p>
          <p
            v-if="autoApprove && !gmailConnected"
            class="text-[11px] text-danger mt-1.5 font-semibold"
          >
            ⚠️ Auto-approve is on but Gmail isn't connected. Drafts will log as sent without actually delivering.
            Connect Gmail in the Settings tab.
          </p>
        </div>
      </div>

      <!-- Right cluster: auto-approve toggle + 2 stat tiles -->
      <div class="flex items-stretch gap-4 flex-wrap">
        <!-- Auto-approve toggle -->
        <label
          class="flex items-center gap-2.5 rounded-md border px-3 py-2 cursor-pointer transition-colors"
          :class="autoApprove
            ? 'border-success/50 bg-success/10'
            : 'border-divider bg-surface-raised hover:bg-canvas/30'"
        >
          <span class="relative inline-flex h-5 w-9 items-center">
            <input
              type="checkbox"
              class="sr-only peer"
              :checked="autoApprove"
              @change="emit('update:autoApprove', ($event.target as HTMLInputElement).checked)"
            />
            <span class="absolute inset-0 rounded-full bg-ink-muted/30 peer-checked:bg-success transition-colors"></span>
            <span
              class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
              :class="autoApprove ? 'translate-x-4' : ''"
            ></span>
          </span>
          <div class="text-left">
            <div class="text-[11px] font-bold uppercase tracking-wider"
              :class="autoApprove ? 'text-success' : 'text-ink'">
              {{ autoApprove ? 'Auto-approve ON' : 'Manual approve' }}
            </div>
            <div class="text-[10px] text-ink-muted">
              {{ autoApprove ? 'Drafts send without you' : 'You review each draft' }}
            </div>
          </div>
        </label>

        <!-- Stat: Drafted today -->
        <div class="rounded-md border border-divider bg-surface-raised px-3 py-2 text-right min-w-[88px]">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Drafted today
          </div>
          <div class="text-2xl font-bold text-brand tabular-nums">{{ displayedDrafted }}</div>
        </div>

        <!-- Stat: Sent today -->
        <div class="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-right min-w-[88px]">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-success">
            Sent today
          </div>
          <div class="text-2xl font-bold text-success tabular-nums">{{ displayedSent }}</div>
        </div>
      </div>
    </header>

    <!-- ── Bulk action ─────────────────────────────────────────────── -->
    <div
      v-if="items.length > 1"
      class="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-divider/60 bg-surface-raised"
    >
      <p class="text-xs text-ink-muted">
        Trust the batch? Send them all in one go.
      </p>
      <button
        type="button"
        class="rounded-md bg-brand text-white px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all hover:scale-105"
        :disabled="busy"
        @click="emit('approveAll')"
      >
        Approve all ({{ items.length }})
      </button>
    </div>

    <!-- ── Queue cards ─────────────────────────────────────────────── -->
    <TransitionGroup
      tag="div"
      class="divide-y divide-brand/10 relative"
      enter-active-class="transition-all duration-400 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-400 ease-out absolute w-full"
      leave-from-class="opacity-100 translate-x-0"
      leave-to-class="opacity-0 translate-x-32"
      move-class="transition-transform duration-300 ease-out"
    >
      <article
        v-for="{ lead, scoreColor } in items"
        :key="lead.id"
        class="px-5 py-4 flex items-start gap-4 transition-colors duration-300 relative"
        :class="lastApprovedId === lead.id
          ? 'bg-success/15'
          : (processingId === lead.id ? 'bg-brand/5' : 'bg-transparent')"
      >
        <!-- Score chip -->
        <div
          class="flex flex-col items-center justify-center rounded-md border-2 px-2.5 py-2 min-w-[64px]"
          :class="bandClass(scoreColor)"
        >
          <div class="text-xl font-bold tabular-nums leading-none">{{ lead.icp_score ?? '–' }}</div>
          <div class="text-[9px] font-bold uppercase tracking-wider mt-1">{{ bandLabel(scoreColor) }}</div>
        </div>

        <!-- Body -->
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2 flex-wrap mb-0.5">
            <h3 class="text-sm font-semibold text-ink truncate">
              {{ lead.company_name }}
            </h3>
            <span class="text-[11px] text-ink-muted">
              · {{ lead.contact_name || 'no contact name' }}
              <template v-if="lead.contact_email"> · {{ lead.contact_email }}</template>
            </span>
          </div>
          <p class="text-[12.5px] font-semibold text-ink mb-1.5 truncate">
            {{ lead.draft_cold_email_subject || '(no subject)' }}
          </p>
          <div class="rounded-md bg-surface-raised border border-divider px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted italic">
            {{ snippet(lead.draft_cold_email_body) }}
          </div>
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-1.5 flex-shrink-0 w-24">
          <button
            type="button"
            class="rounded-md bg-success text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all hover:scale-105"
            :disabled="processingId === lead.id || busy"
            @click="act(lead, 'approve')"
          >
            {{ processingId === lead.id ? '✓' : 'Approve' }}
          </button>
          <button
            type="button"
            class="rounded-md border border-brand/40 text-brand bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-brand/10 disabled:opacity-50"
            :disabled="processingId === lead.id || busy"
            @click="act(lead, 'edit')"
          >Edit</button>
          <button
            type="button"
            class="rounded-md text-[11px] text-ink-muted hover:text-ink py-1"
            :disabled="processingId === lead.id || busy"
            @click="act(lead, 'skip')"
          >Skip</button>
        </div>
      </article>
    </TransitionGroup>

    <!-- ── Empty state ─────────────────────────────────────────────── -->
    <div v-if="items.length === 0" class="px-5 py-10 text-center">
      <div class="text-4xl mb-2">✨</div>
      <p class="text-sm font-semibold text-ink">All clear</p>
      <p class="text-xs text-ink-muted mt-1">
        <template v-if="autoApprove">
          Auto-approve is on. New drafts will send the moment they're ready.
        </template>
        <template v-else>
          New leads scored above {{ minScore }} will land here with a draft attached.
        </template>
      </p>
    </div>
  </section>
</template>
