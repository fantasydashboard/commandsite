<script setup lang="ts">
/**
 * Grace approval queue — the page hero.
 *
 * Self-contained: takes a list of items, owns the slide-out animation,
 * a per-page resolved-this-week counter, and emits to global toasts +
 * chat on each action. Used on every Cornerstone page with that page's
 * own queue items.
 */
import { ref, computed } from 'vue'
import { useToasts } from './useToasts'
import { useAssistantChat } from './useGraceChat'

export interface ApprovalQueueItem {
  id: string
  icon: string                   // emoji
  badge: string                  // small role tag
  badgeClass: string             // tailwind classes for the badge pill
  title: string
  recipient: string
  preview: string                // body of what Grace drafted
  approved_response: string      // what Grace says in chat after approve
  ticker_after_approval: string  // optional — emit to ticker after approve (handled by parent)
}

const props = defineProps<{
  items: ApprovalQueueItem[]
  /** Section title — defaults to "Waiting for your eyes" */
  heading?: string
  /** Subtitle copy under the heading */
  subtitle?: string
  /** Counter on the right ("Resolved this week") — initial value */
  initialResolved?: number
  /** Counter label */
  resolvedLabel?: string
}>()

const emit = defineEmits<{
  (e: 'approved', item: ApprovalQueueItem): void
  (e: 'edited', item: ApprovalQueueItem): void
  (e: 'skipped', item: ApprovalQueueItem): void
}>()

const toasts = useToasts()
const chat = useAssistantChat()

const queueItems = ref<ApprovalQueueItem[]>([...props.items])
const recentlyResolved = ref<string[]>([])
const processingId = ref<string | null>(null)
const resolvedCounter = ref<number>(props.initialResolved ?? 0)

const heading = computed(() => props.heading ?? 'Waiting for your eyes')
const resolvedLabel = computed(() => props.resolvedLabel ?? 'Resolved this week')

const queueLabel = computed(() => {
  const n = queueItems.value.length
  if (n === 0) return 'All clear — Grace will surface the next batch as it lands'
  return `${n} ${n === 1 ? 'item needs' : 'items need'} your eyes`
})

async function actOnItem(item: ApprovalQueueItem, action: 'approve' | 'edit' | 'skip') {
  if (processingId.value) return
  processingId.value = item.id

  if (action === 'approve') {
    recentlyResolved.value.push(item.id)
  }

  await new Promise((r) => setTimeout(r, 350))

  queueItems.value = queueItems.value.filter((q) => q.id !== item.id)
  recentlyResolved.value = recentlyResolved.value.filter((id) => id !== item.id)

  if (action === 'approve') {
    resolvedCounter.value++
    toasts.push('✓ Done — Grace just sent it', 'success')
    setTimeout(() => {
      chat.addAiMessage(item.approved_response)
    }, 900)
    emit('approved', item)
  } else if (action === 'edit') {
    toasts.push('Opened for editing — your changes will go into the queue', 'info')
    emit('edited', item)
  } else if (action === 'skip') {
    toasts.push('Skipped — Grace will resurface this in 24 hrs', 'info')
    emit('skipped', item)
  }

  processingId.value = null
}
</script>

<template>
  <section class="rounded-card border-2 border-brand/40 bg-gradient-to-br from-brand/5 to-surface overflow-hidden">
    <header class="flex items-start justify-between gap-3 px-5 py-4 bg-brand/10 border-b border-brand/20 flex-wrap">
      <div class="flex items-start gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white text-lg font-bold flex-shrink-0">
          G
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">
            {{ heading }}
          </div>
          <h2 class="text-lg font-bold text-ink leading-tight">{{ queueLabel }}</h2>
          <p v-if="subtitle" class="text-xs text-ink-muted mt-0.5">{{ subtitle }}</p>
        </div>
      </div>
      <div class="flex items-center gap-3 text-right">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{{ resolvedLabel }}</div>
          <div class="text-2xl font-bold text-success tabular-nums">{{ resolvedCounter }}</div>
        </div>
      </div>
    </header>

    <TransitionGroup
      tag="div"
      class="divide-y divide-brand/10"
      enter-active-class="transition-all duration-400 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-400 ease-out absolute w-full"
      leave-from-class="opacity-100 translate-x-0"
      leave-to-class="opacity-0 translate-x-32"
      move-class="transition-transform duration-300 ease-out"
    >
      <article
        v-for="item in queueItems"
        :key="item.id"
        class="px-5 py-4 flex items-start gap-4 transition-colors duration-300 relative"
        :class="recentlyResolved.includes(item.id) ? 'bg-success/15' : 'bg-transparent'"
      >
        <div class="text-2xl flex-shrink-0 mt-0.5">{{ item.icon }}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span
              class="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              :class="item.badgeClass"
            >{{ item.badge }}</span>
            <h3 class="text-sm font-semibold text-ink">{{ item.title }}</h3>
          </div>
          <p class="text-[11px] text-ink-muted mb-2">{{ item.recipient }}</p>
          <div class="rounded-md bg-surface-raised border border-divider px-3 py-2.5 text-[12.5px] leading-relaxed text-ink italic">
            {{ item.preview }}
          </div>
        </div>
        <div class="flex flex-col gap-1.5 flex-shrink-0 w-24">
          <button
            type="button"
            class="rounded-md bg-success text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all hover:scale-105"
            :disabled="processingId === item.id"
            @click="actOnItem(item, 'approve')"
          >
            {{ processingId === item.id ? '✓' : 'Approve' }}
          </button>
          <button
            type="button"
            class="rounded-md border border-brand/40 text-brand bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-brand/10 disabled:opacity-50"
            :disabled="processingId === item.id"
            @click="actOnItem(item, 'edit')"
          >Edit</button>
          <button
            type="button"
            class="rounded-md text-[11px] text-ink-muted hover:text-ink py-1"
            :disabled="processingId === item.id"
            @click="actOnItem(item, 'skip')"
          >Skip</button>
        </div>
      </article>
    </TransitionGroup>

    <div v-if="queueItems.length === 0" class="px-5 py-10 text-center">
      <div class="text-4xl mb-2">✨</div>
      <p class="text-sm font-semibold text-ink">All clear</p>
      <p class="text-xs text-ink-muted mt-1">
        Grace will surface the next batch as it lands. {{ resolvedCounter }} resolved this week.
      </p>
    </div>
  </section>
</template>
