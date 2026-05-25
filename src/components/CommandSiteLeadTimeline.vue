<script setup lang="ts">
/**
 * Per-lead conversation timeline.
 *
 * Merges three event sources into a chronological feed, grouped by day:
 *   • cs_outreach_sends — every cold email Ada sent
 *   • cs_replies        — every reply that landed
 *   • cs_lead_events    — status changes, pauses, drafts (audit log)
 *
 * Reads on mount. Re-fetches when leadId changes. Renders calmly:
 * outbound = brand-tinted card, inbound = neutral elevated card, system
 * events = single muted line. Apple Mail thread aesthetic — not Salesforce
 * activity log.
 */
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import AdaIcon from '@/components/ada/AdaIcon.vue'

const props = defineProps<{
  leadId: string | null
}>()

interface OutreachSendRow {
  id: string
  subject: string | null
  body: string | null
  sent_at: string
  sequence_step_number: number | null
  source: string
}
interface ReplyRow {
  id: string
  subject: string | null
  body: string | null
  from_name: string | null
  from_email: string
  received_at: string
  classification: string | null
}
interface EventRow {
  id: string
  event_type: string
  payload: Record<string, unknown>
  summary: string | null
  created_at: string
}

const sends = ref<OutreachSendRow[]>([])
const replies = ref<ReplyRow[]>([])
const events = ref<EventRow[]>([])
const loading = ref(false)
const expandedIds = ref<Set<string>>(new Set())

async function load() {
  if (!props.leadId) {
    sends.value = []
    replies.value = []
    events.value = []
    return
  }
  loading.value = true
  const [s, r, e] = await Promise.all([
    supabase
      .from('cs_outreach_sends')
      .select('id, subject, body, sent_at, sequence_step_number, source')
      .eq('lead_id', props.leadId)
      .order('sent_at', { ascending: false })
      .limit(50),
    supabase
      .from('cs_replies')
      .select('id, subject, body, from_name, from_email, received_at, classification')
      .eq('lead_id', props.leadId)
      .order('received_at', { ascending: false })
      .limit(50),
    supabase
      .from('cs_lead_events')
      .select('id, event_type, payload, summary, created_at')
      .eq('lead_id', props.leadId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  sends.value = (s.data ?? []) as OutreachSendRow[]
  replies.value = (r.data ?? []) as ReplyRow[]
  events.value = (e.data ?? []) as EventRow[]
  loading.value = false
}

watch(() => props.leadId, load, { immediate: true })

// ── Unified timeline shape ───────────────────────────────────────────
type TimelineItem =
  | { kind: 'send';   id: string; at: string; data: OutreachSendRow }
  | { kind: 'reply';  id: string; at: string; data: ReplyRow }
  | { kind: 'event';  id: string; at: string; data: EventRow }

const items = computed<TimelineItem[]>(() => {
  const all: TimelineItem[] = [
    ...sends.value.map((s): TimelineItem => ({ kind: 'send', id: s.id, at: s.sent_at, data: s })),
    ...replies.value.map((r): TimelineItem => ({ kind: 'reply', id: r.id, at: r.received_at, data: r })),
    ...events.value.map((e): TimelineItem => ({ kind: 'event', id: e.id, at: e.created_at, data: e })),
  ]
  return all.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
})

// Group items by day for the date header dividers
const groupedByDay = computed(() => {
  const groups: { day: string; key: string; items: TimelineItem[] }[] = []
  for (const item of items.value) {
    const d = new Date(item.at)
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const existing = groups[groups.length - 1]
    if (existing && existing.key === key) existing.items.push(item)
    else groups.push({ day: label, key, items: [item] })
  }
  return groups
})

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) expandedIds.value.delete(id)
  else expandedIds.value.add(id)
  // Force reactivity — Set mutations don't trigger watchers
  expandedIds.value = new Set(expandedIds.value)
}

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id)
}

function eventIcon(type: string): string {
  switch (type) {
    case 'status_change':   return 'shuffle'
    case 'paused':          return 'phone-off'
    case 'resumed':         return 'check-circle'
    case 'draft_generated': return 'quote_followup'
    case 'enriched':        return 'flask'
    case 'note':            return 'qa_assistant'
    case 'campaign_assigned': return 'referral_hunter'
    default:                return 'clock'
  }
}

function classifyTone(c: string | null): { label: string; class: string } {
  if (c === 'positive')  return { label: 'positive', class: 'bg-success/15 text-success' }
  if (c === 'objection') return { label: 'objection', class: 'bg-warn/15 text-warn' }
  if (c === 'unsubscribe') return { label: 'unsub', class: 'bg-danger/15 text-danger' }
  if (c === 'bounce')    return { label: 'bounce', class: 'bg-danger/15 text-danger' }
  return { label: c ?? 'reply', class: 'bg-brand/15 text-brand' }
}
</script>

<template>
  <section>
    <header class="flex items-center justify-between mb-2">
      <h3 class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Conversation</h3>
      <span v-if="items.length > 0" class="text-[11px] text-ink-disabled">
        {{ items.length }} event{{ items.length === 1 ? '' : 's' }}
      </span>
    </header>

    <div v-if="loading" class="text-xs text-ink-muted py-4 text-center italic">Loading…</div>

    <div v-else-if="items.length === 0" class="text-xs text-ink-muted py-4 text-center italic">
      Nothing yet. Sends, replies, and status changes will appear here.
    </div>

    <div v-else class="space-y-4">
      <div v-for="group in groupedByDay" :key="group.key">
        <!-- Day divider -->
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
            {{ group.day }}
          </span>
          <span class="flex-1 h-px bg-divider/60"></span>
        </div>

        <ul class="space-y-1.5">
          <li v-for="item in group.items" :key="item.id">
            <!-- Outbound send (Ada) -->
            <div
              v-if="item.kind === 'send'"
              class="rounded-md border border-brand/20 bg-brand/5 px-3 py-2"
            >
              <div class="flex items-baseline justify-between gap-2 mb-0.5">
                <div class="flex items-center gap-2 min-w-0">
                  <AdaIcon name="email_marketing" class="h-3.5 w-3.5 text-brand flex-shrink-0" />
                  <span class="text-[11px] font-bold uppercase tracking-wider text-brand">
                    Ada sent
                  </span>
                  <span
                    v-if="item.data.sequence_step_number"
                    class="rounded-full bg-brand/10 text-brand text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5"
                  >Touch {{ item.data.sequence_step_number }}</span>
                </div>
                <span class="text-[10px] text-ink-disabled tabular-nums flex-shrink-0">{{ fmtTime(item.at) }}</span>
              </div>
              <p class="text-[12.5px] font-semibold text-ink truncate">
                {{ item.data.subject || '(no subject)' }}
              </p>
              <button
                v-if="item.data.body"
                type="button"
                class="text-[11px] text-brand hover:underline mt-0.5"
                @click="toggleExpand(item.id)"
              >{{ isExpanded(item.id) ? '— Hide body' : '+ Show body' }}</button>
              <p
                v-if="isExpanded(item.id) && item.data.body"
                class="text-[12px] text-ink-muted whitespace-pre-wrap mt-1.5 leading-relaxed border-t border-brand/15 pt-1.5"
              >{{ item.data.body }}</p>
            </div>

            <!-- Inbound reply (human) -->
            <div
              v-else-if="item.kind === 'reply'"
              class="rounded-md border border-divider bg-surface-elevated px-3 py-2.5 shadow-sm"
            >
              <div class="flex items-baseline justify-between gap-2 mb-1">
                <div class="flex items-center gap-2 min-w-0">
                  <AdaIcon name="qa_assistant" class="h-3.5 w-3.5 text-ink-muted flex-shrink-0" />
                  <span class="text-[12px] font-semibold text-ink truncate">
                    {{ item.data.from_name || item.data.from_email }} replied
                  </span>
                  <span
                    v-if="item.data.classification"
                    class="rounded-full text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5"
                    :class="classifyTone(item.data.classification).class"
                  >{{ classifyTone(item.data.classification).label }}</span>
                </div>
                <span class="text-[10px] text-ink-disabled tabular-nums flex-shrink-0">{{ fmtTime(item.at) }}</span>
              </div>
              <p
                v-if="item.data.body"
                class="text-[12.5px] text-ink leading-relaxed italic line-clamp-3"
              >"{{ item.data.body.replace(/\s+/g, ' ').slice(0, 280) }}{{ item.data.body.length > 280 ? '…' : '' }}"</p>
            </div>

            <!-- System event — muted single line -->
            <div
              v-else
              class="flex items-center gap-2 px-3 py-1 text-[11px] text-ink-muted"
            >
              <AdaIcon :name="eventIcon(item.data.event_type)" class="h-3 w-3 flex-shrink-0" />
              <span class="flex-1 truncate">{{ item.data.summary ?? item.data.event_type }}</span>
              <span class="text-[10px] text-ink-disabled tabular-nums flex-shrink-0">{{ fmtTime(item.at) }}</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
