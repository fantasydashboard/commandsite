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
import AdaIcon from '@/components/ada/AdaIcon.vue'
import AssistantMark from '@/components/AssistantMark.vue'

export interface ApprovalQueueItem {
  id: string
  icon: string                   // AdaIcon name (e.g. 'qa_assistant', 'truck') or emoji fallback
  badge: string                  // small role tag
  badgeClass: string             // tailwind classes for the badge pill
  title: string
  recipient: string
  preview: string                // body of what the assistant drafted
  approved_response: string      // what the assistant says in chat after approve (only used if pushApprovedToChat is true)
  ticker_after_approval: string  // optional — emit to ticker after approve (handled by parent)
  /** Ada role key this item belongs to. Used by parents to tag the live-feed
   *  event when this item is approved (replaces per-module badge inference). */
  role?: string
}

const props = withDefaults(defineProps<{
  items: ApprovalQueueItem[]
  /** Section title — defaults to "Today's sign-offs" */
  heading?: string
  /** Subtitle copy under the heading */
  subtitle?: string
  /** Counter on the right ("Resolved this week") — initial value */
  initialResolved?: number
  /** Counter label — kept for back-compat; no longer rendered (counter is now in the headline). */
  resolvedLabel?: string
  /** Display name of the assistant. Defaults to "Grace". Apex pages pass "Ada". */
  assistantName?: string
  /** Push the `approved_response` text into the shared assistant chat
   *  store on approve. Cornerstone renders that chat (floating widget),
   *  so the chime-in works; Apex doesn't, so its consumers pass `false`. */
  pushApprovedToChat?: boolean
}>(), {
  pushApprovedToChat: true,
})

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

const heading = computed(() => props.heading ?? "Today's sign-offs")
const assistantName = computed(() => props.assistantName ?? 'Grace')

// Quietly leads with what Ada (or Grace) ALREADY did today, then notes what's
// left for owner sign-off. Reframes the queue from "your TODO list" to
// "her finished work waiting on a co-sign" — matches the persona promise.
const queueLabel = computed(() => {
  const pending = queueItems.value.length
  const done = resolvedCounter.value
  if (pending === 0 && done === 0) return `${assistantName.value} is on the lookout — nothing to sign off yet`
  if (pending === 0) return `${done} handled today · all clear`
  if (done === 0) return `${pending} ready for your sign-off`
  return `${done} handled today · ${pending} ready for your sign-off`
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
    toasts.push(`Done — ${assistantName.value} just sent it`, 'success')
    if (props.pushApprovedToChat) {
      setTimeout(() => {
        chat.addAiMessage(item.approved_response)
      }, 900)
    }
    emit('approved', item)
  } else if (action === 'edit') {
    toasts.push('Opened for editing — your changes will go into the queue', 'info')
    emit('edited', item)
  } else if (action === 'skip') {
    toasts.push(`Skipped — ${assistantName.value} will resurface this in 24 hrs`, 'info')
    emit('skipped', item)
  }

  processingId.value = null
}
</script>

<template>
  <section class="rounded-card border border-divider bg-surface-raised overflow-hidden">
    <header class="flex items-start gap-3 px-5 py-4 bg-surface-elevated/40 border-b border-divider flex-wrap">
      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand flex-shrink-0">
        <AssistantMark class="h-5 w-5" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">
          {{ heading }}
        </div>
        <h2 class="text-lg font-semibold text-ink leading-tight">{{ queueLabel }}</h2>
        <p v-if="subtitle" class="text-xs text-ink-muted mt-0.5">{{ subtitle }}</p>
      </div>
    </header>

    <TransitionGroup
      tag="div"
      class="divide-y divide-divider"
      enter-active-class="transition-[opacity,transform] duration-[250ms] ease-out-quart"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-[opacity,transform] duration-200 ease-out-quart absolute w-full"
      leave-from-class="opacity-100 translate-x-0"
      leave-to-class="opacity-0 translate-x-12"
      move-class="transition-transform duration-[250ms] ease-out-quart"
    >
      <article
        v-for="item in queueItems"
        :key="item.id"
        class="px-5 py-4 flex items-start gap-4 transition-colors duration-200 ease-out-quart relative"
        :class="recentlyResolved.includes(item.id) ? 'bg-success/15' : 'bg-transparent'"
      >
        <AdaIcon :name="item.icon" class="h-5 w-5 text-ink-muted flex-shrink-0 mt-1" />
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
            class="rounded-md bg-brand-active text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:bg-brand disabled:opacity-50 transition-[transform,background-color,opacity] duration-150 ease-out-quart active:scale-[0.97]"
            :disabled="processingId === item.id"
            @click="actOnItem(item, 'approve')"
          >
            {{ processingId === item.id ? 'Sending' : 'Sign off' }}
          </button>
          <button
            type="button"
            class="rounded-md border border-divider bg-surface-raised text-ink-muted px-3 py-1.5 text-xs font-semibold hover:border-ink-muted hover:text-ink hover:bg-surface-elevated disabled:opacity-50 transition-[transform,background-color,border-color,color] duration-150 ease-out-quart active:scale-[0.97]"
            :disabled="processingId === item.id"
            @click="actOnItem(item, 'edit')"
          >Edit</button>
          <button
            type="button"
            class="rounded-md text-[11px] text-ink-muted hover:text-ink py-1 transition-[transform,color] duration-150 ease-out-quart active:scale-[0.97]"
            :disabled="processingId === item.id"
            @click="actOnItem(item, 'skip')"
          >Skip</button>
        </div>
      </article>
    </TransitionGroup>

    <div v-if="queueItems.length === 0" class="px-5 py-10 text-center">
      <p class="text-sm font-semibold text-ink">All clear for today</p>
      <p class="text-xs text-ink-muted mt-1">
        {{ assistantName }} will surface the next batch as it lands.
        <span v-if="resolvedCounter > 0">{{ resolvedCounter }} handled today.</span>
      </p>
    </div>
  </section>
</template>
