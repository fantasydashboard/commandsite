<script setup lang="ts">
/**
 * CommandSite — cold email drafts review modal.
 *
 * Shows one card per lead with the drafted subject + body, the
 * personalization signal Ada used, and per-draft actions (edit,
 * approve, copy-to-clipboard, discard). Approval just tags the lead
 * with `cold_email_approved` — actual sending is a separate step
 * (manual paste-to-Gmail today, push-to-Smartlead later).
 *
 * The modal accepts `leads` as a prop. Parent computes which leads
 * have drafts (`draft_cold_email_body is not null`) and passes them
 * in. Edits go through the parent's `updateLead` callback so the
 * leads composable refresh stays single-source.
 */
import { ref, computed, watch } from 'vue'
import type { CsLead } from '@/types/database'
import AssistantMark from '@/components/AssistantMark.vue'

const props = defineProps<{
  open: boolean
  leads: CsLead[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update', payload: { leadId: string; subject: string; body: string }): void
  (e: 'approve', leadId: string): void
  (e: 'discard', leadId: string): void
}>()

// Per-lead local edit state. Initialized from the lead's persisted
// draft when the modal opens; user edits live here until they hit
// Save (which emits 'update' to the parent).
const editedSubject = ref<Record<string, string>>({})
const editedBody = ref<Record<string, string>>({})
const copiedFlash = ref<string | null>(null)
const dirtyIds = ref<Set<string>>(new Set())

// Reset edit state every time the modal opens, so we don't show
// stale unsaved edits across sessions.
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  editedSubject.value = {}
  editedBody.value = {}
  dirtyIds.value = new Set()
})

const draftLeads = computed(() =>
  props.leads.filter((l) => l.draft_cold_email_body),
)

function getSubject(lead: CsLead): string {
  return editedSubject.value[lead.id] ?? lead.draft_cold_email_subject ?? ''
}

function getBody(lead: CsLead): string {
  return editedBody.value[lead.id] ?? lead.draft_cold_email_body ?? ''
}

function isApproved(lead: CsLead): boolean {
  return (lead.tags ?? []).includes('cold_email_approved')
}

function onSubjectInput(leadId: string, value: string) {
  editedSubject.value = { ...editedSubject.value, [leadId]: value }
  dirtyIds.value = new Set([...dirtyIds.value, leadId])
}

function onBodyInput(leadId: string, value: string) {
  editedBody.value = { ...editedBody.value, [leadId]: value }
  dirtyIds.value = new Set([...dirtyIds.value, leadId])
}

function saveEdit(lead: CsLead) {
  emit('update', {
    leadId: lead.id,
    subject: getSubject(lead),
    body: getBody(lead),
  })
  const next = new Set(dirtyIds.value)
  next.delete(lead.id)
  dirtyIds.value = next
}

async function copyToClipboard(lead: CsLead) {
  const text = `Subject: ${getSubject(lead)}\nTo: ${lead.contact_email ?? ''}\n\n${getBody(lead)}`
  try {
    await navigator.clipboard.writeText(text)
    copiedFlash.value = lead.id
    setTimeout(() => {
      if (copiedFlash.value === lead.id) copiedFlash.value = null
    }, 2000)
  } catch {
    // Clipboard API blocked — fall back to a textarea select trick
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copiedFlash.value = lead.id
    setTimeout(() => {
      if (copiedFlash.value === lead.id) copiedFlash.value = null
    }, 2000)
  }
}

function approve(lead: CsLead) {
  // Save any pending edits first so what's on screen matches what's stored
  if (dirtyIds.value.has(lead.id)) saveEdit(lead)
  emit('approve', lead.id)
}

function discard(lead: CsLead) {
  if (!window.confirm(`Discard the draft for ${lead.company_name}? The lead stays, only the draft is cleared.`)) return
  emit('discard', lead.id)
}

const stats = computed(() => {
  const total = draftLeads.value.length
  const approved = draftLeads.value.filter(isApproved).length
  const pending = total - approved
  return { total, approved, pending }
})

function close() {
  emit('close')
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function bodyWordCount(lead: CsLead): number {
  const body = getBody(lead)
  return body.trim().split(/\s+/).filter(Boolean).length
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-ink/60"
        @click.self="close"
      >
        <div
          class="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-card bg-surface-raised shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          <!-- ── Header ──────────────────────────────────────────────── -->
          <div class="flex items-start justify-between gap-4 border-b border-divider px-6 py-4">
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
                Cold email drafts
              </div>
              <h2 class="text-lg font-semibold text-ink inline-flex items-center gap-2">
                <AssistantMark class="h-5 w-5 text-brand" />
                Drafts from Ada · {{ stats.total }} {{ stats.total === 1 ? 'lead' : 'leads' }}
              </h2>
              <p class="text-xs text-ink-muted mt-0.5">
                Edit anything that doesn't sound right, then approve. Copy-paste into Gmail to send (Smartlead push coming later).
              </p>
            </div>
            <button
              type="button"
              class="text-ink-muted hover:text-ink text-2xl leading-none p-1 -mr-2"
              aria-label="Close"
              @click="close"
            >×</button>
          </div>

          <!-- ── Stats strip ─────────────────────────────────────────── -->
          <div class="grid grid-cols-3 gap-3 px-6 py-3 border-b border-divider bg-surface-elevated">
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Total drafts</div>
              <div class="text-xl font-bold text-ink leading-tight">{{ stats.total }}</div>
            </div>
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Pending review</div>
              <div class="text-xl font-bold text-ink leading-tight">{{ stats.pending }}</div>
            </div>
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-wider text-success">Approved</div>
              <div class="text-xl font-bold text-success leading-tight">{{ stats.approved }}</div>
            </div>
          </div>

          <!-- ── Body: per-lead draft cards ──────────────────────────── -->
          <div class="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div
              v-if="draftLeads.length === 0"
              class="rounded-card border border-divider bg-surface-elevated p-8 text-center"
            >
              <p class="text-sm text-ink-muted">No drafts yet. Draft some from the leads page first.</p>
            </div>

            <div
              v-for="lead in draftLeads"
              :key="lead.id"
              class="rounded-card border border-divider bg-surface overflow-hidden"
              :class="isApproved(lead) ? 'border-success/40 bg-success/[0.02]' : ''"
            >
              <!-- Card header: company + email + timestamp -->
              <div class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-ink">{{ lead.company_name }}</span>
                    <span
                      v-if="isApproved(lead)"
                      class="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-semibold"
                    >
                      <span class="h-1.5 w-1.5 rounded-full bg-success" />
                      Approved
                    </span>
                    <span
                      v-if="dirtyIds.has(lead.id)"
                      class="inline-flex items-center gap-1 rounded-full bg-warn/15 text-warn px-2 py-0.5 text-[10px] font-semibold"
                    >Unsaved edits</span>
                  </div>
                  <div class="text-[11px] text-ink-muted truncate font-mono">
                    To: {{ lead.contact_email }}
                    <span v-if="lead.industry" class="ml-2 not-italic">· {{ lead.industry }}</span>
                    <span v-if="lead.city" class="ml-1 not-italic">· {{ lead.city }}{{ lead.state ? ', ' + lead.state : '' }}</span>
                  </div>
                </div>
                <div class="text-right text-[10px] text-ink-disabled shrink-0">
                  Drafted {{ fmtTimestamp(lead.draft_cold_email_at) }}
                </div>
              </div>

              <!-- Subject -->
              <div class="px-4 pt-3">
                <label class="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  :value="getSubject(lead)"
                  @input="(e) => onSubjectInput(lead.id, (e.target as HTMLInputElement).value)"
                  class="w-full rounded-md border border-divider bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-brand font-medium"
                />
              </div>

              <!-- Body -->
              <div class="px-4 pt-3">
                <label class="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  <span>Body</span>
                  <span class="text-ink-disabled font-normal normal-case">{{ bodyWordCount(lead) }} words</span>
                </label>
                <textarea
                  :value="getBody(lead)"
                  @input="(e) => onBodyInput(lead.id, (e.target as HTMLTextAreaElement).value)"
                  rows="9"
                  class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink leading-relaxed focus:outline-none focus:border-brand font-sans"
                  style="white-space: pre-wrap;"
                />
              </div>

              <!-- Personalization signal — Ada's reasoning -->
              <div
                v-if="lead.draft_cold_email_signal || lead.draft_cold_email_rationale"
                class="px-4 pt-3 pb-1 space-y-2"
              >
                <div
                  v-if="lead.draft_cold_email_signal"
                  class="rounded-md bg-brand/5 border border-brand/15 px-3 py-2"
                >
                  <div class="flex items-start gap-2">
                    <AssistantMark class="h-3.5 w-3.5 text-brand mt-0.5 shrink-0" />
                    <div class="min-w-0 flex-1">
                      <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-0.5">
                        What Ada used to personalize
                      </div>
                      <p class="text-[12px] text-ink leading-snug italic">"{{ lead.draft_cold_email_signal }}"</p>
                    </div>
                  </div>
                </div>
                <div
                  v-if="lead.draft_cold_email_rationale"
                  class="text-[11px] text-ink-muted leading-snug px-1"
                >
                  <strong class="text-ink-muted font-semibold">Why this opener:</strong> {{ lead.draft_cold_email_rationale }}
                </div>
              </div>

              <!-- Card actions -->
              <div class="flex items-center justify-between gap-2 px-4 py-3 mt-3 border-t border-divider bg-surface-elevated">
                <button
                  type="button"
                  class="text-xs text-danger hover:underline"
                  @click="discard(lead)"
                >Discard draft</button>
                <div class="flex items-center gap-2">
                  <button
                    v-if="dirtyIds.has(lead.id)"
                    type="button"
                    class="rounded-md border border-divider bg-surface text-ink px-3 py-1.5 text-xs font-semibold hover:border-brand"
                    @click="saveEdit(lead)"
                  >Save edits</button>
                  <button
                    type="button"
                    class="rounded-md border border-divider bg-surface text-ink px-3 py-1.5 text-xs font-semibold hover:border-brand inline-flex items-center gap-1"
                    @click="copyToClipboard(lead)"
                  >
                    <span v-if="copiedFlash === lead.id" class="text-success">✓ Copied</span>
                    <span v-else>📋 Copy</span>
                  </button>
                  <button
                    v-if="!isApproved(lead)"
                    type="button"
                    class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"
                    @click="approve(lead)"
                  >Approve</button>
                  <span
                    v-else
                    class="text-[11px] text-success font-semibold inline-flex items-center gap-1"
                  >
                    <span class="h-1.5 w-1.5 rounded-full bg-success" />
                    Approved — copy &amp; send
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Footer ──────────────────────────────────────────────── -->
          <div class="flex items-center justify-between gap-3 border-t border-divider px-6 py-4 bg-surface-elevated">
            <p class="text-[11px] text-ink-muted">
              Approve drafts you're happy with, then copy-paste into Gmail. Sending automation comes next.
            </p>
            <button
              type="button"
              class="btn-secondary !text-sm"
              @click="close"
            >Done</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
