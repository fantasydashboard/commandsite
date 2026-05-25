<script setup lang="ts">
/**
 * Reply composer — bottom of the thread pane.
 *
 * Only renders when the lead has at least one inbound reply. Two
 * actions, per shape brief (Option B):
 *
 *   • Send         — sends the reply (in-thread, bypasses send window),
 *                    leaves outreach_paused = true so the sequence
 *                    stays paused (this is the common case)
 *   • Send & resume — sends, then clears outreach_paused so Ada picks
 *                     the sequence back up from where it was (rare)
 *
 * Subject defaults to "Re: <last subject>" — operator can edit before sending.
 */
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import AdaIcon from '@/components/ada/AdaIcon.vue'
import type { ConversationRow } from '@/lib/conversations/useConversations'

const props = defineProps<{
  row: ConversationRow
}>()

const emit = defineEmits<{
  (e: 'sent', payload: { resumed: boolean }): void
}>()

const subject = ref('')
const body = ref('')
const sending = ref(false)
const error = ref<string | null>(null)

// Reset draft when switching threads
watch(
  () => props.row.leadId,
  () => {
    subject.value = props.row.lastSubject
      ? props.row.lastSubject.startsWith('Re:')
        ? props.row.lastSubject
        : `Re: ${props.row.lastSubject}`
      : ''
    body.value = ''
    error.value = null
  },
  { immediate: true },
)

const canSend = computed(() =>
  !sending.value &&
  !!props.row.contactEmail &&
  subject.value.trim().length > 0 &&
  body.value.trim().length > 0,
)

async function send(resume: boolean) {
  if (!canSend.value || !props.row.contactEmail) return
  sending.value = true
  error.value = null

  // In-thread send via gmail-send. The thread_id makes it land in the
  // recipient's existing thread; gmail-send skips the send-window gate
  // for any payload with thread_id set (real reply, no cron deferral).
  const { data, error: fnErr } = await supabase.functions.invoke('gmail-send', {
    body: {
      to: props.row.contactEmail,
      subject: subject.value.trim(),
      body: body.value.trim(),
      lead_id: props.row.leadId,
      thread_id: props.row.lastReplyThreadId ?? undefined,
      // touch_number left undefined — this is a human-written reply,
      // not part of the auto sequence. The reserve gate is skipped
      // anyway because thread_id is set.
    },
  })

  type SendResult = { ok?: boolean; error?: string; message_id?: string; thread_id?: string }
  const result = data as SendResult | null
  if (fnErr || !result?.ok) {
    error.value = fnErr?.message ?? result?.error ?? 'Send failed'
    sending.value = false
    return
  }

  // Log the send to cs_outreach_sends so it appears in the timeline.
  // source='manual_gmail' since it's an operator-typed reply. No
  // touch_number — it's a human reply, not part of the auto sequence.
  await supabase
    .from('cs_outreach_sends')
    .insert({
      lead_id: props.row.leadId,
      subject: subject.value.trim(),
      body: body.value.trim(),
      channel: 'email',
      source: 'manual_gmail',
      sent_at: new Date().toISOString(),
      external_message_id: result.thread_id ?? result.message_id ?? null,
    } as never)

  if (resume) {
    // Resume the sequence — clear the paused flag so Ada picks it back
    // up. The follow-up cron will draft Touch N+1 on its next tick.
    await supabase
      .from('cs_leads')
      .update({
        outreach_paused: false,
        outreach_paused_reason: null,
        outreach_paused_at: null,
      } as never)
      .eq('id', props.row.leadId)
  }

  body.value = ''
  sending.value = false
  emit('sent', { resumed: resume })
}
</script>

<template>
  <div class="border-t border-divider bg-surface-elevated px-4 py-3">
    <div class="space-y-2">
      <!-- Subject -->
      <label class="block">
        <span class="sr-only">Subject</span>
        <input
          v-model="subject"
          type="text"
          placeholder="Subject"
          class="w-full rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-[12.5px] text-ink focus:border-brand focus:outline-none"
          :disabled="sending"
        />
      </label>

      <!-- Body -->
      <label class="block">
        <span class="sr-only">Message</span>
        <textarea
          v-model="body"
          rows="4"
          placeholder="Type your response…"
          class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-[12.5px] text-ink leading-relaxed resize-y focus:border-brand focus:outline-none"
          :disabled="sending"
        ></textarea>
      </label>

      <!-- Error -->
      <p v-if="error" class="text-[11px] text-danger">{{ error }}</p>

      <!-- Actions -->
      <div class="flex items-center justify-between gap-2">
        <span class="text-[10px] text-ink-disabled italic">
          Replies skip the send window. They go now, in-thread.
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:text-ink hover:border-divider-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 ease-out"
            :disabled="!canSend"
            :title="row.lead.outreach_paused ? 'Send and let Ada resume the sequence from Touch ' + (row.sendCount + 1) : 'Sequence not paused — Resume has no effect'"
            @click="send(true)"
          >
            <AdaIcon name="referral_hunter" class="h-3 w-3" />
            Send &amp; resume
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-[11px] font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-[opacity,transform] duration-150 ease-out active:scale-[0.97]"
            :disabled="!canSend"
            @click="send(false)"
          >
            <AdaIcon name="email_marketing" class="h-3 w-3" />
            {{ sending ? 'Sending…' : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
