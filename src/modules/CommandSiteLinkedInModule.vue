<script setup lang="ts">
/**
 * CommandSite LinkedIn — daily warm-call queue for LinkedIn outreach.
 *
 * Lists up to 15 top-ICP leads not yet contacted on LinkedIn, each row
 * with a pre-drafted Touch 1 connection request. Operator copies the
 * message + opens LinkedIn manually (LinkedIn bans accounts that
 * automate sends; the manual step is the safety boundary).
 *
 * Flow per row:
 *   1. Read lead context + draft (in your face, no clicks needed)
 *   2. Click "Open profile" — opens stored LinkedIn URL OR Google
 *      search for the prospect
 *   3. Click "Copy message" — drafted text on clipboard
 *   4. Paste into LinkedIn connection request, send manually
 *   5. Click "Mark sent" — lead drops from queue, won't reappear
 *
 * Optional: paste the LinkedIn profile URL back so future surfaces
 * (Touch 2-5, reply tracking) can deep-link.
 */
import { ref } from 'vue'
import type { Client } from '@/types/database'
import { useLinkedInQueue, type LinkedInQueueLead } from '@/lib/clients/commandsite/useLinkedInQueue'
import AdaIcon from '@/components/ada/AdaIcon.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const { leads, loading, isEmpty, queueCount, markSent, saveLinkedInUrl } = useLinkedInQueue()

// Track which lead's URL-input is open + which had its message just copied
const editingUrlFor = ref<string | null>(null)
const urlInput = ref('')
const justCopied = ref<string | null>(null)
const markingSent = ref<string | null>(null)
const errorMsg = ref<string | null>(null)

async function copyMessage(lead: LinkedInQueueLead) {
  try {
    await navigator.clipboard.writeText(lead.draftedMessage)
    justCopied.value = lead.id
    setTimeout(() => {
      if (justCopied.value === lead.id) justCopied.value = null
    }, 2500)
  } catch {
    errorMsg.value = 'Could not copy to clipboard. Select the text manually instead.'
  }
}

function openLinkedIn(lead: LinkedInQueueLead) {
  const url = lead.linkedin_url || lead.linkedinSearchUrl
  window.open(url, '_blank', 'noopener')
}

function openUrlInput(lead: LinkedInQueueLead) {
  editingUrlFor.value = lead.id
  urlInput.value = lead.linkedin_url ?? ''
}

async function confirmUrl(lead: LinkedInQueueLead) {
  if (!urlInput.value.trim()) {
    editingUrlFor.value = null
    return
  }
  const res = await saveLinkedInUrl(lead.id, urlInput.value)
  if (!res.ok) {
    errorMsg.value = res.error ?? 'Could not save URL'
    return
  }
  editingUrlFor.value = null
  urlInput.value = ''
}

async function markLeadSent(lead: LinkedInQueueLead) {
  markingSent.value = lead.id
  const res = await markSent(lead.id)
  markingSent.value = null
  if (!res.ok) {
    errorMsg.value = res.error ?? 'Could not mark sent'
  }
}

function icpColor(score: number | null): string {
  if (score === null) return 'bg-ink-muted/15 text-ink-muted'
  if (score >= 85) return 'bg-success/15 text-success'
  if (score >= 70) return 'bg-brand/15 text-brand'
  if (score >= 55) return 'bg-warn/15 text-warn'
  return 'bg-ink-muted/15 text-ink-muted'
}
</script>

<template>
  <div class="space-y-5">

    <!-- Header + scope context -->
    <header class="card p-4">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
            LinkedIn Today
          </div>
          <h2 class="text-lg font-semibold text-ink">
            Today's connection requests
          </h2>
          <p class="text-xs text-ink-muted mt-1 leading-relaxed max-w-2xl">
            Top-ICP leads that haven't been touched on LinkedIn yet, with Touch 1 drafted. Copy each message, open the profile in a new tab, send the request manually, then mark sent.
            <span class="text-ink-disabled italic">~15 min/day · LinkedIn bans accounts that auto-send so the manual step is intentional.</span>
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <div class="card p-2 px-3 flex items-center gap-2">
            <span class="text-[10px] uppercase tracking-wider text-ink-muted">Queue</span>
            <span class="text-sm font-bold tabular-nums text-ink">{{ queueCount }}</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Errors -->
    <div
      v-if="errorMsg"
      class="card p-3 border-danger/30 bg-danger/5 text-xs text-danger flex items-start justify-between gap-2"
    >
      <span>{{ errorMsg }}</span>
      <button type="button" class="text-ink-muted hover:text-ink" @click="errorMsg = null">✕</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="card p-6 text-center text-sm text-ink-muted italic">
      Loading the queue…
    </div>

    <!-- Empty state -->
    <div v-else-if="isEmpty" class="card p-8 text-center">
      <AdaIcon name="check-circle" class="h-6 w-6 text-success mx-auto mb-2" />
      <p class="text-sm font-semibold text-ink">Queue clear.</p>
      <p class="text-xs text-ink-muted mt-1 max-w-md mx-auto leading-relaxed">
        Every high-ICP lead has had a LinkedIn touch. Pull more leads via the Campaigns surface, or wait for tomorrow's batch from lead-sourcing-cron.
      </p>
    </div>

    <!-- Queue -->
    <ul v-else class="space-y-3">
      <li
        v-for="lead in leads"
        :key="lead.id"
        class="card p-0 overflow-hidden"
      >
        <!-- Lead header -->
        <div class="px-4 py-3 border-b border-divider bg-surface-elevated flex items-start justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <div class="flex items-baseline gap-2 flex-wrap mb-0.5">
              <span class="text-sm font-semibold text-ink truncate">{{ lead.company_name }}</span>
              <span
                v-if="lead.icp_score !== null"
                class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                :class="icpColor(lead.icp_score)"
              >ICP {{ lead.icp_score }}</span>
              <span v-if="lead.industry" class="text-[11px] text-ink-muted">· {{ lead.industry }}</span>
              <span v-if="lead.city" class="text-[11px] text-ink-muted">· {{ lead.city }}{{ lead.state ? ', ' + lead.state : '' }}</span>
            </div>
            <p v-if="lead.icp_score_reason" class="text-[11px] text-ink-muted italic leading-snug max-w-2xl truncate">
              {{ lead.icp_score_reason }}
            </p>
          </div>
          <div class="shrink-0 text-[10px] text-ink-disabled">
            {{ lead.contact_name || 'No contact name yet' }}
          </div>
        </div>

        <!-- Drafted message -->
        <div class="px-4 py-3">
          <div class="flex items-baseline justify-between mb-1.5">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Touch 1 · connection request
            </span>
            <span class="text-[10px] text-ink-disabled tabular-nums">{{ lead.draftedMessage.length }}/300</span>
          </div>
          <div class="rounded-md border border-divider bg-surface-raised px-3 py-2 text-[12.5px] text-ink leading-relaxed">
            {{ lead.draftedMessage }}
          </div>
        </div>

        <!-- Optional LinkedIn URL save row -->
        <div v-if="editingUrlFor === lead.id" class="px-4 pb-3 -mt-1">
          <label class="block">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              LinkedIn profile URL
            </span>
            <div class="mt-1 flex items-center gap-2">
              <input
                v-model="urlInput"
                type="url"
                placeholder="https://www.linkedin.com/in/..."
                class="flex-1 rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-[12px] text-ink focus:border-brand focus:outline-none"
                @keyup.enter="confirmUrl(lead)"
              />
              <button
                type="button"
                class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-[11px] font-semibold hover:opacity-90"
                @click="confirmUrl(lead)"
              >Save</button>
              <button
                type="button"
                class="text-[11px] text-ink-muted hover:text-ink px-2"
                @click="editingUrlFor = null"
              >Cancel</button>
            </div>
          </label>
        </div>

        <!-- Actions -->
        <div class="px-4 py-3 border-t border-divider bg-surface flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-[11px] font-semibold hover:opacity-90 transition-opacity"
              @click="copyMessage(lead)"
            >
              <AdaIcon :name="justCopied === lead.id ? 'check-circle' : 'quote_followup'" class="h-3 w-3" />
              {{ justCopied === lead.id ? 'Copied!' : 'Copy message' }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:text-ink hover:border-divider-bright transition-colors"
              @click="openLinkedIn(lead)"
            >
              <AdaIcon name="email_marketing" class="h-3 w-3" />
              {{ lead.linkedin_url ? 'Open profile' : 'Find on LinkedIn' }}
            </button>
            <button
              v-if="!lead.linkedin_url"
              type="button"
              class="text-[10px] text-ink-muted hover:text-ink italic"
              @click="openUrlInput(lead)"
            >+ Save profile URL</button>
            <button
              v-else-if="editingUrlFor !== lead.id"
              type="button"
              class="text-[10px] text-ink-muted hover:text-ink italic"
              @click="openUrlInput(lead)"
            >Edit URL</button>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md bg-success/10 text-success border border-success/30 px-3 py-1.5 text-[11px] font-semibold hover:bg-success/20 transition-colors disabled:opacity-50"
            :disabled="markingSent === lead.id"
            @click="markLeadSent(lead)"
          >
            <AdaIcon name="check-circle" class="h-3 w-3" />
            {{ markingSent === lead.id ? 'Saving…' : 'Mark sent' }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
