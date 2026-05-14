<script setup lang="ts">
/**
 * UFD Outreach Draft Modal.
 *
 * Opens when Josh clicks ✉️ Email on a UFD user row. Triggers Bones
 * (via draft-ufd-outreach edge function) to draft a personalized
 * email, shows the draft for review/edit, then opens Gmail compose
 * pre-filled with the result.
 *
 * Parallels CommandSiteOutreachEditDraftModal for the cold-email
 * loop, but lifecycle/B2C-framed rather than cold-pitch-framed.
 */
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import {
  gmailComposeUrlForUser,
  type UfdUserRow,
  type Cohort,
  COHORT_META,
} from '@/lib/clients/ufd-redesign/useUfdUsersData'

const props = defineProps<{
  open: boolean
  user: UfdUserRow | null
  cohort: Cohort
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const subject = ref('')
const body = ref('')
const drafting = ref(false)
const error = ref<string | null>(null)
const sent = ref(false)

async function draft() {
  if (!props.user) return
  drafting.value = true
  error.value = null
  subject.value = ''
  body.value = ''
  sent.value = false
  try {
    const { data, error: e } = await supabase.functions.invoke('draft-ufd-outreach', {
      body: { user: props.user, cohort: props.cohort },
    })
    if (e) throw new Error(e.message)
    const result = data as { subject?: string; body?: string; error?: string } | null
    if (result?.error) throw new Error(result.error)
    if (!result?.subject || !result?.body) throw new Error('Empty draft returned')
    subject.value = result.subject
    body.value = result.body
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    drafting.value = false
  }
}

// Re-draft whenever modal opens for a new user
watch(
  () => props.open && props.user?.email,
  (val) => {
    if (val) {
      void draft()
    }
  },
  { immediate: true },
)

function close() {
  emit('close')
}

function openInGmail() {
  if (!props.user) return
  const url = gmailComposeUrlForUser(props.user, { subject: subject.value, body: body.value })
  window.open(url, '_blank', 'noopener')
  sent.value = true
}

const wordCount = computed(() => body.value.trim().split(/\s+/).filter(Boolean).length)
const cohortLabel = computed(() => COHORT_META[props.cohort]?.label ?? props.cohort)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="open && user" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-ink/40" @click="close"></div>

        <div class="relative w-full max-w-2xl rounded-card border border-divider bg-surface shadow-2xl">
          <header class="flex items-start justify-between gap-3 px-5 py-4 border-b border-divider">
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">
                Bones drafted this · {{ cohortLabel }} outreach
              </div>
              <h2 class="text-base font-bold text-ink">
                To {{ user.full_name || user.email }}
              </h2>
              <p class="text-xs text-ink-muted font-mono">{{ user.email }}</p>
            </div>
            <button
              type="button"
              class="text-ink-muted hover:text-ink text-lg leading-none"
              @click="close"
              aria-label="Close"
            >✕</button>
          </header>

          <!-- Draft body -->
          <div class="p-5 space-y-4 min-h-[280px]">
            <div v-if="drafting" class="flex items-center justify-center py-12 text-sm text-ink-muted">
              <span class="inline-flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-brand animate-pulse"></span>
                Bones is drafting…
              </span>
            </div>
            <div v-else-if="error" class="rounded-md bg-danger/10 text-danger px-3 py-3 text-sm">
              <p class="font-semibold mb-1">Draft failed</p>
              <p class="text-xs">{{ error }}</p>
              <button
                type="button"
                class="mt-2 rounded-md bg-danger text-white px-2.5 py-1 text-[11px] font-semibold hover:opacity-90"
                @click="draft"
              >Retry</button>
            </div>
            <template v-else>
              <div>
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Subject
                </label>
                <input
                  v-model="subject"
                  type="text"
                  class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    Body
                  </label>
                  <span class="text-[10px] tabular-nums text-ink-muted">{{ wordCount }} words</span>
                </div>
                <textarea
                  v-model="body"
                  rows="10"
                  class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink font-mono leading-relaxed focus:border-brand focus:outline-none resize-y"
                />
              </div>
              <p v-if="sent" class="text-[11px] text-success">
                ✓ Gmail compose opened in a new tab — finish + send from there.
              </p>
            </template>
          </div>

          <footer class="flex items-center justify-end gap-2 px-5 py-3 border-t border-divider bg-surface-raised">
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink"
              @click="close"
            >Close</button>
            <button
              type="button"
              class="rounded-md border border-brand/40 text-brand bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-brand/10 disabled:opacity-50"
              :disabled="drafting"
              @click="draft"
            >
              ↻ Re-draft
            </button>
            <button
              type="button"
              class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all hover:scale-105"
              :disabled="drafting || !subject || !body"
              @click="openInGmail"
            >
              ✉️ Open in Gmail →
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
