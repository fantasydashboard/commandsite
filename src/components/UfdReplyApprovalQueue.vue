<script setup lang="ts">
/**
 * UFD Reply Approval Queue — parallel to CommandSite's reply queue
 * but for UFD support inbox replies. Bones drafts the response;
 * Josh approves; sends from support@ultimatefantasydashboard.com
 * threaded into the original conversation.
 */
import { computed, ref } from 'vue'
import type { UfdReply, UfdReplyClassification } from '@/types/database'
import { UFD_CLASSIFICATION_META, type UfdReplyQueueItem } from '@/lib/clients/ufd-redesign/useUfdReplyApproval'

const props = defineProps<{
  items: UfdReplyQueueItem[]
  busy?: boolean
  lastSentId?: string | null
}>()

const emit = defineEmits<{
  (e: 'approve', reply: UfdReply): void
  (e: 'edit', reply: UfdReply): void
  (e: 'skip', reply: UfdReply): void
  (e: 'retryDraft', reply: UfdReply): void
}>()

const processingId = ref<string | null>(null)
const retryingId = ref<string | null>(null)

const queueLabel = computed(() => {
  const n = props.items.length
  if (n === 0) return 'Inbox clear — no UFD replies waiting'
  return `${n} ${n === 1 ? 'UFD reply needs' : 'UFD replies need'} a response`
})

async function act(reply: UfdReply, action: 'approve' | 'edit' | 'skip') {
  if (processingId.value || props.busy) return
  processingId.value = reply.id
  await new Promise((r) => setTimeout(r, 220))
  if (action === 'approve') emit('approve', reply)
  else if (action === 'edit') emit('edit', reply)
  else emit('skip', reply)
  setTimeout(() => { processingId.value = null }, 320)
}

async function retryDraft(reply: UfdReply) {
  if (retryingId.value) return
  retryingId.value = reply.id
  emit('retryDraft', reply)
  setTimeout(() => { retryingId.value = null }, 1500)
}

function classificationMeta(c: UfdReplyClassification | null) {
  return UFD_CLASSIFICATION_META[c ?? 'unclassified']
}

function snippet(text: string | null, max = 220): string {
  if (!text) return ''
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 3)}…` : trimmed
}

function ageStr(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
</script>

<template>
  <section
    class="rounded-card border-2 overflow-hidden transition-colors duration-500"
    :class="items.length > 0
      ? 'border-accent/40 bg-gradient-to-br from-accent/10 to-surface'
      : 'border-divider bg-surface'"
  >
    <header
      class="flex items-start justify-between gap-3 px-5 py-4 border-b flex-wrap"
      :class="items.length > 0 ? 'bg-accent/15 border-accent/25' : 'bg-surface-raised border-divider'"
    >
      <div class="flex items-start gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold flex-shrink-0"
          :class="items.length > 0 ? 'bg-accent text-white' : 'bg-ink-muted/20 text-ink-muted'"
        >
          💬
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] mb-0.5"
            :class="items.length > 0 ? 'text-accent' : 'text-ink-muted'">
            UFD support replies
          </div>
          <h2 class="text-lg font-bold text-ink leading-tight">{{ queueLabel }}</h2>
          <p class="text-xs text-ink-muted mt-0.5">
            <template v-if="items.length > 0">
              Replies from trial users. Approve sends from support@ultimatefantasydashboard.com in-thread.
            </template>
            <template v-else>
              Replies to UFD lifecycle emails will land here automatically.
            </template>
          </p>
        </div>
      </div>
    </header>

    <TransitionGroup
      tag="div"
      class="divide-y divide-accent/10 relative"
      enter-active-class="transition-all duration-400 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-400 ease-out absolute w-full"
      leave-from-class="opacity-100 translate-x-0"
      leave-to-class="opacity-0 translate-x-32"
      move-class="transition-transform duration-300 ease-out"
    >
      <article
        v-for="item in items"
        :key="item.reply.id"
        class="px-5 py-4 transition-colors duration-300 relative"
        :class="lastSentId === item.reply.id
          ? 'bg-success/15'
          : (processingId === item.reply.id ? 'bg-accent/5' : 'bg-transparent')"
      >
        <div class="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap mb-0.5">
              <span class="font-semibold text-ink text-sm">
                {{ item.reply.from_name || item.reply.from_email }}
              </span>
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                :class="classificationMeta(item.reply.classification).pillClass"
              >
                {{ classificationMeta(item.reply.classification).label }}
              </span>
              <span
                v-if="item.reply.reply_to_step"
                class="text-[10px] text-ink-muted"
              >· reply to {{ item.reply.reply_to_step }}</span>
            </div>
            <div class="text-[11px] text-ink-muted">
              <template v-if="item.reply.subject">{{ item.reply.subject }} · </template>
              {{ ageStr(item.reply.received_at) }}
            </div>
          </div>
        </div>

        <!-- They said -->
        <div class="rounded-md border border-divider bg-surface-raised px-3 py-2.5 text-[12.5px] text-ink leading-relaxed mb-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">They said</div>
          {{ snippet(item.reply.body, 280) }}
        </div>

        <!-- Bones drafted -->
        <div
          v-if="item.reply.drafted_response"
          class="rounded-md border border-accent/30 bg-accent/5 px-3 py-2.5 text-[12.5px] text-ink leading-relaxed italic"
        >
          <div class="text-[10px] font-semibold uppercase tracking-wider text-accent mb-1 not-italic">
            ✍️ Bones drafted — review before sending
          </div>
          {{ item.reply.drafted_response }}
        </div>
        <div
          v-else
          class="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-[12px] text-warn italic flex items-center justify-between gap-2"
        >
          <span>Bones hasn't drafted yet — tap retry, or use Write manually.</span>
          <button
            type="button"
            class="rounded-md bg-warn text-white px-2.5 py-1 text-[11px] font-semibold hover:opacity-90 disabled:opacity-50 not-italic"
            :disabled="retryingId === item.reply.id || busy"
            @click="retryDraft(item.reply)"
          >
            {{ retryingId === item.reply.id ? 'Asking Bones…' : 'Retry draft' }}
          </button>
        </div>

        <div class="flex items-center gap-2 mt-3">
          <button
            type="button"
            class="rounded-md bg-success text-white px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all hover:scale-105"
            :disabled="!item.reply.drafted_response || processingId === item.reply.id || busy"
            @click="act(item.reply, 'approve')"
          >
            {{ processingId === item.reply.id ? '✓' : 'Approve & send' }}
          </button>
          <button
            type="button"
            class="rounded-md border border-accent/40 text-accent bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-accent/10 disabled:opacity-50"
            :disabled="processingId === item.reply.id || busy"
            @click="act(item.reply, 'edit')"
          >{{ item.reply.drafted_response ? 'Edit & send' : 'Write manually' }}</button>
          <button
            type="button"
            class="rounded-md text-[11px] text-ink-muted hover:text-ink py-1.5 px-2 ml-auto"
            :disabled="processingId === item.reply.id || busy"
            @click="act(item.reply, 'skip')"
          >Skip · won't send</button>
        </div>
      </article>
    </TransitionGroup>

    <div v-if="items.length === 0" class="px-5 py-8 text-center">
      <div class="text-3xl mb-2">🌊</div>
      <p class="text-sm font-semibold text-ink">All caught up</p>
      <p class="text-xs text-ink-muted mt-1">
        Inbox poll runs every 10 minutes. UFD replies + Bones drafts land here automatically.
      </p>
    </div>
  </section>
</template>
