<script setup lang="ts">
/**
 * Right-pane top — compact lead summary for the open conversation.
 *
 * Avoids the hero-metric template (big number, small label, etc.).
 * Just the essentials: who they are, what ICP they scored, what state
 * the sequence is in, and quiet action buttons (pause/resume, open in
 * Leads). Status pill on the right.
 */
import { computed } from 'vue'
import { supabase } from '@/lib/supabase'
import AdaIcon from '@/components/ada/AdaIcon.vue'
import type { ConversationRow } from '@/lib/conversations/useConversations'

const props = defineProps<{
  row: ConversationRow
  /** Which AI persona is doing the sending. Drives the "Ada sent" /
   *  "Grace sent" badge on outbound rows in the timeline. Defaulted by
   *  the parent view; thread header just displays it. */
  personaName?: string
}>()

const emit = defineEmits<{
  (e: 'changed'): void
}>()

const displayName = computed(() =>
  props.row.contactName || props.row.companyName || 'Unknown'
)

const statusPill = computed(() => {
  switch (props.row.status) {
    case 'needs_you':
      return { label: 'Needs you', class: 'bg-brand/15 text-brand' }
    case 'paused':
      return { label: 'Paused', class: 'bg-warn/15 text-warn' }
    case 'done':
      return { label: 'Done', class: 'bg-ink-muted/15 text-ink-muted' }
    case 'active':
    default:
      return { label: 'In sequence', class: 'bg-success/15 text-success' }
  }
})

const sequenceProgress = computed(() => {
  const count = props.row.sendCount
  if (count <= 0) return 'No touches sent yet'
  if (count === 1) return 'Touch 1 sent · Touch 2 scheduled'
  if (count === 2) return 'Touch 2 sent · Touch 3 scheduled'
  return 'Touch 3 sent · sequence complete'
})

const icpScore = computed(() => props.row.lead.icp_score ?? null)

async function togglePause() {
  const next = !props.row.lead.outreach_paused
  await supabase
    .from('cs_leads')
    .update({
      outreach_paused: next,
      outreach_paused_at: next ? new Date().toISOString() : null,
      outreach_paused_reason: next ? 'Manually paused' : null,
    } as never)
    .eq('id', props.row.leadId)
  emit('changed')
}
</script>

<template>
  <header class="border-b border-divider bg-surface px-4 py-3">
    <!-- Row 1: name + status -->
    <div class="flex items-baseline justify-between gap-3 mb-1">
      <div class="flex items-baseline gap-2 min-w-0">
        <h2 class="text-base font-semibold text-ink truncate">{{ displayName }}</h2>
        <span v-if="row.contactName && row.companyName" class="text-xs text-ink-muted truncate">
          · {{ row.companyName }}
        </span>
      </div>
      <span
        class="flex-shrink-0 rounded-full text-[10px] font-bold uppercase tracking-wider px-2 py-0.5"
        :class="statusPill.class"
      >{{ statusPill.label }}</span>
    </div>

    <!-- Row 2: meta -->
    <div class="flex items-center gap-3 text-[11px] text-ink-muted">
      <span v-if="row.contactEmail" class="truncate">{{ row.contactEmail }}</span>
      <span v-if="icpScore !== null" class="inline-flex items-center gap-1">
        <AdaIcon name="quote_followup" class="h-3 w-3" />
        ICP {{ icpScore }}
      </span>
      <span class="text-ink-disabled italic truncate flex-1">{{ sequenceProgress }}</span>

      <!-- Quiet actions -->
      <button
        type="button"
        class="flex-shrink-0 inline-flex items-center gap-1 rounded-md border border-divider bg-surface-raised px-2 py-1 text-[10px] font-semibold text-ink-muted hover:text-ink hover:border-divider-bright transition-colors duration-150 ease-out"
        @click="togglePause"
      >
        <AdaIcon :name="row.lead.outreach_paused ? 'check-circle' : 'phone-off'" class="h-3 w-3" />
        {{ row.lead.outreach_paused ? 'Resume' : 'Pause' }}
      </button>
    </div>
  </header>
</template>
