<script setup lang="ts">
/**
 * ConversationsView — the two-pane layout.
 *
 * Designed reusable for future Ada/Grace tenants. Caller passes:
 *   • tenant       — which data source (defaults to 'commandsite')
 *   • personaName  — what the outbound badge says (defaults to 'Ada')
 *
 * Breakpoint behavior:
 *   • ≥1024px (lg): full two-pane (left ~360px, right fills)
 *   • <1024px:      list takes full width; selecting a row slides the
 *                    thread in from the right as an overlay panel. Tap
 *                    outside / close button returns to list.
 *
 * No scroll-triggered animations. No layout property animations.
 * Selection + filter changes use opacity + background transitions.
 */
import { computed } from 'vue'
import { useConversations, type ConversationStatus } from '@/lib/conversations/useConversations'
import CommandSiteLeadTimeline from '@/components/CommandSiteLeadTimeline.vue'
import ConversationListItem from './ConversationListItem.vue'
import ConversationThreadHeader from './ConversationThreadHeader.vue'
import ConversationReplyComposer from './ConversationReplyComposer.vue'
import AdaIcon from '@/components/ada/AdaIcon.vue'

const props = withDefaults(defineProps<{
  tenant?: string
  personaName?: string
}>(), {
  tenant: 'commandsite',
  personaName: 'Ada',
})

const conv = useConversations({ tenant: props.tenant })

// Filter chip definitions — order matters (most-used first).
const chips: { key: 'all' | ConversationStatus; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'needs_you', label: 'Needs you' },
  { key: 'active',    label: 'Active' },
  { key: 'paused',    label: 'Paused' },
  { key: 'done',      label: 'Done' },
]

const showThreadOverlay = computed(() => !!conv.selectedRow.value)

function closeOverlay() {
  conv.select(null)
}
</script>

<template>
  <div class="flex flex-col h-full min-h-[600px] bg-surface rounded-card border border-divider overflow-hidden">
    <!-- Page header eyebrow + title -->
    <header class="border-b border-divider bg-surface px-4 py-3">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">
        {{ personaName }} · conversations
      </div>
      <div class="flex items-baseline justify-between">
        <h1 class="text-lg font-semibold text-ink">Inbox</h1>
        <span v-if="!conv.loading.value" class="text-[11px] text-ink-disabled tabular-nums">
          {{ conv.rows.value.length }} {{ conv.rows.value.length === 1 ? 'thread' : 'threads' }}
        </span>
      </div>
    </header>

    <!-- Two-pane body -->
    <div class="flex-1 flex min-h-0 relative">

      <!-- ── Left pane: list ────────────────────────────────────────── -->
      <aside class="w-full lg:w-[360px] lg:flex-shrink-0 lg:border-r border-divider flex flex-col min-h-0">
        <!-- Search -->
        <div class="px-3 pt-3 pb-2 border-b border-divider/60">
          <div class="relative">
            <AdaIcon name="qa_assistant" class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-disabled" />
            <input
              v-model="conv.searchQuery.value"
              type="text"
              placeholder="Search by company or contact…"
              class="w-full rounded-md border border-divider bg-surface-raised pl-8 pr-3 py-1.5 text-[12px] text-ink focus:border-brand focus:outline-none"
            />
          </div>

          <!-- Filter chips -->
          <div class="mt-2 flex flex-wrap gap-1">
            <button
              v-for="chip in chips"
              :key="chip.key"
              type="button"
              class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ease-out"
              :class="conv.filterChip.value === chip.key
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-divider bg-surface-raised text-ink-muted hover:text-ink hover:border-divider-bright'"
              @click="conv.filterChip.value = chip.key"
            >
              {{ chip.label }}
              <span
                v-if="conv.counts.value[chip.key] > 0"
                class="text-[9px] tabular-nums opacity-70"
              >{{ conv.counts.value[chip.key] }}</span>
            </button>
          </div>
        </div>

        <!-- List -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="conv.loading.value" class="text-xs text-ink-muted py-8 text-center italic">
            Loading conversations…
          </div>
          <div
            v-else-if="conv.filtered.value.length === 0"
            class="text-xs text-ink-muted py-8 text-center italic px-6"
          >
            {{ conv.filterChip.value === 'all'
              ? 'No conversations yet. Outreach activity will show up here.'
              : 'Nothing in this view.' }}
          </div>
          <ConversationListItem
            v-for="row in conv.filtered.value"
            :key="row.leadId"
            :row="row"
            :selected="conv.selectedLeadId.value === row.leadId"
            @select="conv.select"
          />
        </div>
      </aside>

      <!-- ── Right pane: thread (desktop) ─────────────────────────── -->
      <section class="hidden lg:flex flex-1 flex-col min-h-0">
        <template v-if="conv.selectedRow.value">
          <ConversationThreadHeader
            :row="conv.selectedRow.value"
            :persona-name="personaName"
            @changed="conv.refresh"
          />
          <div class="flex-1 overflow-y-auto px-4 py-3">
            <CommandSiteLeadTimeline :lead-id="conv.selectedRow.value.leadId" />
          </div>
          <ConversationReplyComposer
            v-if="conv.selectedRow.value.hasUnreadReply || conv.selectedRow.value.lastActivityKind === 'reply'"
            :row="conv.selectedRow.value"
            @sent="conv.refresh"
          />
        </template>
        <div v-else class="flex-1 flex items-center justify-center">
          <div class="text-center max-w-xs px-6">
            <AdaIcon name="email_marketing" class="h-6 w-6 text-ink-disabled mx-auto mb-2" />
            <p class="text-xs text-ink-muted">
              Pick a conversation to read the thread.
            </p>
          </div>
        </div>
      </section>

      <!-- ── Right pane: drawer overlay (tablet/mobile) ──────────── -->
      <transition
        enter-active-class="transition-transform duration-220 ease-out"
        enter-from-class="translate-x-full"
        enter-to-class="translate-x-0"
        leave-active-class="transition-transform duration-180 ease-out"
        leave-from-class="translate-x-0"
        leave-to-class="translate-x-full"
      >
        <section
          v-if="showThreadOverlay && conv.selectedRow.value"
          class="lg:hidden absolute inset-y-0 right-0 w-full max-w-[480px] bg-surface border-l border-divider flex flex-col z-10 shadow-2xl"
          style="transform-origin: right;"
        >
          <div class="flex items-center justify-between border-b border-divider bg-surface px-3 py-2">
            <button
              type="button"
              class="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink transition-colors duration-150 ease-out"
              @click="closeOverlay"
            >
              <AdaIcon name="phone-off" class="h-3 w-3" />
              Back to list
            </button>
          </div>
          <ConversationThreadHeader
            :row="conv.selectedRow.value"
            :persona-name="personaName"
            @changed="conv.refresh"
          />
          <div class="flex-1 overflow-y-auto px-4 py-3">
            <CommandSiteLeadTimeline :lead-id="conv.selectedRow.value.leadId" />
          </div>
          <ConversationReplyComposer
            v-if="conv.selectedRow.value.hasUnreadReply || conv.selectedRow.value.lastActivityKind === 'reply'"
            :row="conv.selectedRow.value"
            @sent="conv.refresh"
          />
        </section>
      </transition>
    </div>
  </div>
</template>
