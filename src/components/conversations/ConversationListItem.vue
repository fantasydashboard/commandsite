<script setup lang="ts">
/**
 * Conversation list row.
 *
 * Calm, scannable. The hierarchy from top to bottom: contact name
 * (bold) + company (muted, same line) + timestamp (right-aligned),
 * status line ("Touch 2 sent" / "Replied"), snippet line (italic if
 * inbound, neutral if outbound). Unread reply = 6px brand dot on the
 * right margin (NOT a left side stripe — impeccable ban).
 *
 * Selected = bg-brand/10 background, no border change. Hover =
 * bg-surface-elevated. Both transition 150ms ease-out.
 */
import { computed } from 'vue'
import type { ConversationRow } from '@/lib/conversations/useConversations'

const props = defineProps<{
  row: ConversationRow
  selected: boolean
}>()

defineEmits<{ (e: 'select', leadId: string): void }>()

// Avatar initials from contact name → company name fallback
const initials = computed(() => {
  const src = props.row.contactName || props.row.companyName || '?'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
})

const displayName = computed(() => props.row.contactName || props.row.companyName || 'Unknown')

const statusLine = computed(() => {
  switch (props.row.status) {
    case 'needs_you':
      return 'Replied · awaiting your response'
    case 'paused':
      return props.row.lead.outreach_paused_reason ?? 'Paused'
    case 'done':
      return 'Sequence complete'
    case 'active':
    default:
      if (props.row.lastActivityKind === 'send') {
        const touch = props.row.sendCount
        if (touch <= 1) return 'Touch 1 sent'
        if (touch === 2) return 'Touch 2 sent'
        return 'Touch 3 sent'
      }
      return 'Active sequence'
  }
})

const snippet = computed(() => {
  if (!props.row.lastSnippet) return ''
  const text = props.row.lastSnippet.replace(/\s+/g, ' ').trim()
  return text.length > 80 ? text.slice(0, 80) + '…' : text
})

const relativeTime = computed(() => {
  const then = new Date(props.row.lastActivityAt).getTime()
  const diff = Date.now() - then
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w`
  return new Date(props.row.lastActivityAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
})
</script>

<template>
  <button
    type="button"
    class="group relative w-full px-3 py-2.5 text-left transition-colors duration-150 ease-out border-b border-divider/60"
    :class="selected
      ? 'bg-brand/10'
      : 'bg-transparent hover:bg-surface-elevated'"
    @click="$emit('select', row.leadId)"
  >
    <div class="flex items-start gap-2.5">
      <!-- Avatar -->
      <div
        class="flex-shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums"
        :class="row.hasUnreadReply
          ? 'bg-brand/20 text-brand'
          : 'bg-surface-raised text-ink-muted'"
      >{{ initials }}</div>

      <!-- Body -->
      <div class="flex-1 min-w-0">
        <!-- Top line: name · company · time -->
        <div class="flex items-baseline justify-between gap-2">
          <div class="min-w-0 flex-1 flex items-baseline gap-1.5">
            <span class="text-[12.5px] font-semibold text-ink truncate">{{ displayName }}</span>
            <span
              v-if="row.contactName && row.companyName"
              class="text-[11px] text-ink-muted truncate"
            >· {{ row.companyName }}</span>
          </div>
          <span class="text-[10px] text-ink-disabled tabular-nums flex-shrink-0">{{ relativeTime }}</span>
        </div>

        <!-- Status line -->
        <div class="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted truncate">
          <span :class="row.hasUnreadReply ? 'text-brand font-semibold' : ''">{{ statusLine }}</span>
        </div>

        <!-- Snippet line -->
        <p
          v-if="snippet"
          class="mt-0.5 text-[11px] text-ink-muted truncate"
          :class="row.lastActivityKind === 'reply' ? 'italic' : ''"
        >{{ snippet }}</p>
      </div>

      <!-- Unread dot (right side, not a stripe) -->
      <div
        v-if="row.hasUnreadReply"
        class="flex-shrink-0 mt-3 h-1.5 w-1.5 rounded-full bg-brand"
        aria-label="Awaiting your reply"
      />
    </div>
  </button>
</template>
