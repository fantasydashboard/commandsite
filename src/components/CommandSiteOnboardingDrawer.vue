<script setup lang="ts">
/**
 * Per-customer onboarding action drawer.
 *
 * Renders the checklist for the customer's CURRENT stage with action
 * buttons for any blocking manual task. Shown by clicking a card in
 * the customer kanban. Driven by src/lib/clients/commandsite/onboarding.ts.
 *
 * Layout: header (customer name + stage + SLA chip), goal line,
 * checklist (one row per task with status icon + action button),
 * footer with the Advance/Revert controls (advance disabled when
 * blockers exist).
 */
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import {
  type Customer,
  useCustomers,
  ONBOARDING_STAGES,
  STAGE_META,
} from '@/lib/clients/commandsite/customersApi'
import {
  STAGE_DEFINITIONS,
  stageDefinition,
  computeProgress,
  canAdvance,
  type OnboardingTask,
} from '@/lib/clients/commandsite/onboarding'
import {
  renderEmail,
  EMAIL_LABELS,
  type OnboardingEmailKey,
  type EmailContent,
} from '@/lib/clients/commandsite/onboardingEmails'
import AdaIcon from '@/components/ada/AdaIcon.vue'

const props = defineProps<{
  customer: Customer | null
  open: boolean
}>()

defineEmits<{
  (e: 'close'): void
}>()

const cs = useCustomers()

// Local state for any text input dialogs (contract URL, payment ref, etc.)
const showContractUrlInput = ref<'sent' | 'signed' | null>(null)
const contractUrlInput = ref('')
const showPaymentDialog = ref(false)
const paymentMethod = ref<'invoice' | 'stripe' | 'wire' | 'check' | 'other'>('invoice')
const paymentReference = ref('')
const showKickoffDialog = ref(false)
const kickoffDate = ref('')
const discoveryLinkShown = ref<string | null>(null)
const busy = ref(false)
const msg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

// Email preview state — when set, shows the modal that renders the
// email + lets the operator hit Send (real gmail-send call) or close.
interface PendingEmail {
  key: OnboardingEmailKey
  content: EmailContent
  /** Recipient — primary contact's email (or whatever they edit it to). */
  to: string
  /** Side-effect to run AFTER successful send — e.g., mark
   *  discovery_brief_sent_at, schedule_kickoff_at, etc. The drawer
   *  fires this only after gmail-send returns ok. */
  onSent?: () => Promise<void>
}
const pendingEmail = ref<PendingEmail | null>(null)
const editingTo = ref('')

watch(() => props.customer?.id, () => {
  showContractUrlInput.value = null
  contractUrlInput.value = ''
  showPaymentDialog.value = false
  showKickoffDialog.value = false
  discoveryLinkShown.value = null
  pendingEmail.value = null
  editingTo.value = ''
  msg.value = null
})

// ── Email send helper ────────────────────────────────────────────
/** Open the email preview modal. Operator can read the rendered
 *  subject/body, edit the recipient, then hit Send (real gmail-send)
 *  or close to abort. */
function openEmailPreview(
  key: OnboardingEmailKey,
  content: EmailContent,
  toEmail: string,
  onSent?: () => Promise<void>,
) {
  pendingEmail.value = { key, content, to: toEmail, onSent }
  editingTo.value = toEmail
}

async function confirmSendEmail() {
  if (!pendingEmail.value || !props.customer) return
  busy.value = true
  msg.value = null

  const { data, error: fnErr } = await supabase.functions.invoke('gmail-send', {
    body: {
      to: editingTo.value.trim(),
      subject: pendingEmail.value.content.subject,
      body: pendingEmail.value.content.body,
      // Onboarding emails are 1:1 transactional, not bulk cold outreach.
      // Skip the time-of-day + daily-cap gate so they go now.
      bypass_send_window: true,
    },
  })

  type SendResult = { ok?: boolean; error?: string }
  const result = data as SendResult | null
  if (fnErr || !result?.ok) {
    busy.value = false
    msg.value = { kind: 'err', text: fnErr?.message ?? result?.error ?? 'Email send failed' }
    return
  }

  // Run the post-send side effect (mark sent timestamp, etc.) only after
  // gmail-send confirms delivery.
  if (pendingEmail.value.onSent) {
    try { await pendingEmail.value.onSent() }
    catch (e) {
      msg.value = { kind: 'err', text: e instanceof Error ? e.message : 'Post-send update failed' }
    }
  }

  busy.value = false
  msg.value = { kind: 'ok', text: 'Sent.' }
  pendingEmail.value = null
}

function primaryEmail(): string {
  if (!props.customer) return ''
  const primary = props.customer.contacts.find((c) => c.primary) ?? props.customer.contacts[0]
  return primary?.email ?? ''
}

// ── Derived: progress + stage definition for the open customer ─────
const def = computed(() =>
  props.customer?.onboarding_stage ? stageDefinition(props.customer.onboarding_stage) : null,
)

const progress = computed(() => (props.customer ? computeProgress(props.customer) : null))

const advanceCheck = computed(() => (props.customer ? canAdvance(props.customer) : { ok: true } as const))

// ── Action dispatch — each task's manual button routes here ────────
async function runAction(task: OnboardingTask) {
  if (!props.customer) return
  // Some actions need extra input; show their dialog instead of firing immediately.
  switch (task.key) {
    case 'welcome_sent':
      await fireWelcomeEmail()
      return
    case 'contract_sent':
      showContractUrlInput.value = 'sent'
      return
    case 'contract_signed':
      showContractUrlInput.value = 'signed'
      return
    case 'payment_received':
      showPaymentDialog.value = true
      return
    case 'kickoff_scheduled':
      showKickoffDialog.value = true
      return
    case 'discovery_brief_sent':
      await fireDiscoveryBrief()
      return
    case 'kickoff_completed':
      await fire('markKickoffComplete')
      return
    case 'voice_profile':
      await fire('markVoiceProfileBuilt')
      return
    case 'tenant_provisioned':
      await fire('markTenantProvisioned')
      return
    case 'shadow_started':
      await openShadowStartedEmail()
      return
    case 'live_started':
      await openLiveActivatedEmail()
      return
  }
}

/** Customer-facing email previews for stages that ought to announce
 *  themselves. Each opens the preview modal first; the actual stage
 *  flip happens after the email send succeeds. */
async function openShadowStartedEmail() {
  if (!props.customer) return
  const content = renderEmail('shadow_started', props.customer)
  openEmailPreview('shadow_started', content, primaryEmail(), async () => {
    await cs.startShadowMode(props.customer!.id)
  })
}

async function openLiveActivatedEmail() {
  if (!props.customer) return
  const content = renderEmail('live_activated', props.customer)
  openEmailPreview('live_activated', content, primaryEmail(), async () => {
    await cs.startLiveMode(props.customer!.id)
  })
}

/** Welcome email is AI-drafted by customer-welcome-send (Anthropic
 *  inside the edge function), so we can't preview it before it goes.
 *  Fire-and-show pattern: send it, then show what was drafted by
 *  reloading the customer's welcome_email_subject + body. */
async function fireWelcomeEmail() {
  if (!props.customer) return
  busy.value = true
  msg.value = null
  console.log('[onboarding] sendWelcome firing for', props.customer.id, 'to', primaryEmail())
  const res = await cs.sendWelcome(props.customer.id, { force: true })
  console.log('[onboarding] sendWelcome returned', res)
  busy.value = false
  if (!res.ok) {
    msg.value = { kind: 'err', text: res.error ?? 'Welcome send failed (check the browser console + Supabase function logs)' }
    return
  }
  msg.value = {
    kind: 'ok',
    text: `Welcome email sent to ${primaryEmail() || 'the customer'}. Check your inbox.`,
  }
}

async function fire(method: keyof ReturnType<typeof useCustomers>) {
  if (!props.customer) return
  busy.value = true
  msg.value = null
  // @ts-expect-error — dynamic method dispatch with consistent signature
  const res = await cs[method](props.customer.id)
  busy.value = false
  if (!res.ok) msg.value = { kind: 'err', text: res.error ?? 'Action failed' }
  else msg.value = { kind: 'ok', text: 'Done.' }
}

async function confirmContractAction() {
  if (!props.customer || !showContractUrlInput.value) return
  busy.value = true
  const url = contractUrlInput.value.trim() || undefined
  const res = showContractUrlInput.value === 'sent'
    ? await cs.markContractSent(props.customer.id, url)
    : await cs.markContractSigned(props.customer.id, url)
  busy.value = false
  showContractUrlInput.value = null
  contractUrlInput.value = ''
  if (!res.ok) msg.value = { kind: 'err', text: res.error ?? 'Action failed' }
}

async function confirmPayment() {
  if (!props.customer) return
  busy.value = true
  const res = await cs.markPaymentReceived(
    props.customer.id,
    paymentMethod.value,
    paymentReference.value.trim() || undefined,
  )
  busy.value = false
  showPaymentDialog.value = false
  paymentReference.value = ''
  if (!res.ok) msg.value = { kind: 'err', text: res.error ?? 'Action failed' }
}

async function confirmKickoff() {
  if (!props.customer || !kickoffDate.value) return
  busy.value = true
  const scheduledIso = new Date(kickoffDate.value).toISOString()
  const res = await cs.scheduleKickoff(props.customer.id, scheduledIso)
  busy.value = false
  showKickoffDialog.value = false
  if (!res.ok) {
    msg.value = { kind: 'err', text: res.error ?? 'Action failed' }
    return
  }
  // Open the kickoff-confirmation email preview right after scheduling.
  // Operator can edit + send (real email) or close to skip.
  const content = renderEmail('kickoff_confirmation', props.customer, { kickoffAt: scheduledIso })
  openEmailPreview('kickoff_confirmation', content, primaryEmail())
  kickoffDate.value = ''
}

/** Discovery brief — generate the token, then open the email preview
 *  modal so the operator can read what the customer will receive and
 *  send for real (or close to fall back to manual copy/paste). */
async function fireDiscoveryBrief() {
  if (!props.customer) return
  busy.value = true
  const res = await cs.sendDiscoveryBrief(props.customer.id)
  busy.value = false
  if (!res.ok || !res.token) {
    msg.value = { kind: 'err', text: res.error ?? 'Action failed' }
    return
  }
  // Show the link (still useful for the operator to keep) AND open the
  // preview modal so they can send the real email if they want.
  discoveryLinkShown.value = `${window.location.origin}/onboarding/discovery/${res.token}`
  const content = renderEmail('discovery_brief', props.customer, { discoveryToken: res.token })
  openEmailPreview('discovery_brief', content, primaryEmail())
}

async function advance() {
  if (!props.customer || advanceCheck.value.ok === false) return
  busy.value = true
  msg.value = null
  const res = await cs.advanceStage(props.customer.id)
  busy.value = false
  if (!res.ok) msg.value = { kind: 'err', text: res.error ?? 'Advance failed' }
}

async function revert() {
  if (!props.customer) return
  busy.value = true
  await cs.revertStage(props.customer.id)
  busy.value = false
}

function copyDiscoveryLink() {
  if (!discoveryLinkShown.value) return
  void navigator.clipboard.writeText(discoveryLinkShown.value)
}

// ── Stage-by-stage rendering for "full pipeline" preview ────────────
const allStages = ONBOARDING_STAGES

function isCurrentStage(stage: typeof allStages[number]): boolean {
  return props.customer?.onboarding_stage === stage
}
function isPastStage(stage: typeof allStages[number]): boolean {
  if (!props.customer?.onboarding_stage) return false
  return allStages.indexOf(stage) < allStages.indexOf(props.customer.onboarding_stage)
}

function taskStatusIcon(t: OnboardingTask): { name: string; class: string } {
  if (!props.customer) return { name: 'clock', class: 'text-ink-disabled' }
  const status = t.status(props.customer)
  if (status === 'done') return { name: 'check-circle', class: 'text-success' }
  if (status === 'blocking') return { name: 'clock', class: t.required ? 'text-warn' : 'text-ink-muted' }
  return { name: 'clock', class: 'text-ink-disabled' }
}
</script>

<template>
  <transition
    enter-active-class="transition-opacity duration-150 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-150 ease-out"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open && customer"
      class="fixed inset-0 z-40 bg-ink/40"
      @click="$emit('close')"
    />
  </transition>

  <transition
    enter-active-class="transition-transform duration-220 ease-out"
    enter-from-class="translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transition-transform duration-180 ease-out"
    leave-from-class="translate-x-0"
    leave-to-class="translate-x-full"
  >
    <aside
      v-if="open && customer"
      class="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-surface border-l border-divider flex flex-col shadow-2xl"
      style="transform-origin: right;"
    >
      <!-- Header -->
      <header class="flex-shrink-0 border-b border-divider bg-surface-elevated px-5 py-4">
        <div class="flex items-baseline justify-between mb-1">
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
            Onboarding · {{ customer.persona_type === 'grace' ? 'Grace' : 'Ada' }}
          </div>
          <button
            type="button"
            class="text-[11px] text-ink-muted hover:text-ink transition-colors"
            @click="$emit('close')"
          >Close ✕</button>
        </div>
        <h2 class="text-lg font-semibold text-ink">{{ customer.org_name }}</h2>
        <div v-if="def && progress" class="mt-2 flex items-center gap-2 text-[11px] text-ink-muted">
          <span class="rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            {{ STAGE_META[progress.stage].label }}
          </span>
          <span
            class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            :class="{
              'bg-success/15 text-success': progress.slaStatus === 'ok',
              'bg-warn/15 text-warn': progress.slaStatus === 'warning',
              'bg-danger/15 text-danger': progress.slaStatus === 'breach',
            }"
          >
            {{ progress.daysInStage }}d · target {{ progress.slaDays }}d
          </span>
          <span class="text-ink-disabled tabular-nums">{{ progress.done }}/{{ progress.total }} done</span>
        </div>
        <p v-if="def" class="mt-2 text-[12px] text-ink-muted leading-relaxed italic">
          {{ def.goal }}
        </p>
      </header>

      <!-- Body: checklist + future stages -->
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-6">

        <!-- Sticky result banner — visible regardless of scroll position
             so you don't miss the success/error message from an action. -->
        <div
          v-if="msg"
          class="sticky top-0 z-10 -mt-2 rounded-md border px-3 py-2 text-[11.5px] font-medium flex items-start gap-2"
          :class="msg.kind === 'ok'
            ? 'border-success/40 bg-success/10 text-success'
            : 'border-danger/40 bg-danger/10 text-danger'"
        >
          <AdaIcon :name="msg.kind === 'ok' ? 'check-circle' : 'alert-triangle'" class="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span class="flex-1">{{ msg.text }}</span>
          <button
            type="button"
            class="text-[11px] opacity-60 hover:opacity-100"
            @click="msg = null"
          >✕</button>
        </div>

        <!-- Current stage checklist -->
        <section v-if="def">
          <h3 class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
            This stage
          </h3>
          <ul class="space-y-2">
            <li
              v-for="task in def.tasks"
              :key="task.key"
              class="rounded-card border border-divider bg-surface-elevated px-3 py-2.5"
            >
              <div class="flex items-start gap-2.5">
                <AdaIcon :name="taskStatusIcon(task).name" :class="['h-4 w-4 flex-shrink-0 mt-0.5', taskStatusIcon(task).class]" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-2 mb-0.5">
                    <span class="text-[12.5px] font-semibold text-ink">{{ task.label }}</span>
                    <span
                      v-if="!task.required"
                      class="rounded-full bg-ink-muted/15 text-ink-muted text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5"
                    >Optional</span>
                  </div>
                  <p class="text-[11px] text-ink-muted leading-relaxed">{{ task.description }}</p>
                  <div
                    v-if="task.manual && task.status(customer) !== 'done'"
                    class="mt-1.5"
                  >
                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 rounded-md bg-brand text-ink-inverse px-2.5 py-1 text-[11px] font-semibold hover:opacity-90 disabled:opacity-40 transition-[opacity,transform] duration-150 ease-out active:scale-[0.97]"
                      :disabled="busy"
                      @click="runAction(task)"
                    >
                      <AdaIcon name="check-circle" class="h-3 w-3" />
                      {{ task.actionLabel ?? 'Mark done' }}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <!-- Past + future stages preview -->
        <section>
          <h3 class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
            Pipeline overview
          </h3>
          <ol class="space-y-1.5">
            <li
              v-for="(s, idx) in STAGE_DEFINITIONS"
              :key="s.stage"
              class="flex items-center gap-2.5 text-[11px]"
            >
              <span
                class="flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                :class="{
                  'bg-success/15 text-success': isPastStage(s.stage),
                  'bg-brand/15 text-brand': isCurrentStage(s.stage),
                  'bg-ink-muted/10 text-ink-muted': !isPastStage(s.stage) && !isCurrentStage(s.stage),
                }"
              >{{ isPastStage(s.stage) ? '✓' : idx + 1 }}</span>
              <span
                class="flex-1"
                :class="isCurrentStage(s.stage) ? 'text-ink font-semibold' : 'text-ink-muted'"
              >{{ STAGE_META[s.stage].label }}</span>
              <span class="text-ink-disabled tabular-nums">{{ s.slaDays }}d</span>
            </li>
          </ol>
        </section>

        <!-- Action dialogs -->

        <!-- Contract URL prompt -->
        <div
          v-if="showContractUrlInput"
          class="rounded-card border border-brand/30 bg-brand/5 px-4 py-3"
        >
          <h4 class="text-[11px] font-semibold text-ink mb-1.5">
            {{ showContractUrlInput === 'sent' ? 'Mark contract as sent' : 'Mark contract as signed' }}
          </h4>
          <p class="text-[11px] text-ink-muted mb-2">
            Optionally paste a URL (e-sign link or PDF in Drive). Leave blank to just track the status.
          </p>
          <input
            v-model="contractUrlInput"
            type="url"
            placeholder="https://..."
            class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-[12px] text-ink focus:border-brand focus:outline-none mb-2"
          />
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="text-[11px] text-ink-muted hover:text-ink px-2 py-1"
              @click="showContractUrlInput = null; contractUrlInput = ''"
            >Cancel</button>
            <button
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-3 py-1 text-[11px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity duration-150"
              :disabled="busy"
              @click="confirmContractAction"
            >Confirm</button>
          </div>
        </div>

        <!-- Payment prompt -->
        <div
          v-if="showPaymentDialog"
          class="rounded-card border border-brand/30 bg-brand/5 px-4 py-3"
        >
          <h4 class="text-[11px] font-semibold text-ink mb-1.5">Record payment received</h4>
          <label class="block mb-2">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Method</span>
            <select
              v-model="paymentMethod"
              class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-[12px] text-ink focus:border-brand focus:outline-none"
            >
              <option value="invoice">Invoice (manual)</option>
              <option value="stripe">Stripe</option>
              <option value="wire">Wire</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label class="block mb-2">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Reference (optional)</span>
            <input
              v-model="paymentReference"
              type="text"
              placeholder="Stripe customer id, invoice #, etc."
              class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-[12px] text-ink focus:border-brand focus:outline-none"
            />
          </label>
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="text-[11px] text-ink-muted hover:text-ink px-2 py-1"
              @click="showPaymentDialog = false"
            >Cancel</button>
            <button
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-3 py-1 text-[11px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity duration-150"
              :disabled="busy"
              @click="confirmPayment"
            >Confirm</button>
          </div>
        </div>

        <!-- Kickoff date prompt -->
        <div
          v-if="showKickoffDialog"
          class="rounded-card border border-brand/30 bg-brand/5 px-4 py-3"
        >
          <h4 class="text-[11px] font-semibold text-ink mb-1.5">Schedule kickoff call</h4>
          <input
            v-model="kickoffDate"
            type="datetime-local"
            class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-[12px] text-ink focus:border-brand focus:outline-none mb-2"
          />
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="text-[11px] text-ink-muted hover:text-ink px-2 py-1"
              @click="showKickoffDialog = false"
            >Cancel</button>
            <button
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-3 py-1 text-[11px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity duration-150"
              :disabled="busy || !kickoffDate"
              @click="confirmKickoff"
            >Confirm</button>
          </div>
        </div>

        <!-- Discovery brief link shown — kept around for copy/paste even after the email goes out -->
        <div
          v-if="discoveryLinkShown && !pendingEmail"
          class="rounded-card border border-success/30 bg-success/5 px-4 py-3"
        >
          <h4 class="text-[11px] font-semibold text-ink mb-1.5">Discovery brief link</h4>
          <p class="text-[11px] text-ink-muted mb-2">
            The customer's email is on the way. Keep this link handy in case you need to re-share.
          </p>
          <div class="flex items-center gap-2">
            <input
              :value="discoveryLinkShown"
              readonly
              class="flex-1 rounded-md border border-divider bg-surface-raised px-2 py-1 text-[11px] text-ink-muted tabular-nums truncate"
            />
            <button
              type="button"
              class="flex-shrink-0 rounded-md bg-brand text-ink-inverse px-2.5 py-1 text-[10px] font-semibold hover:opacity-90 transition-opacity duration-150"
              @click="copyDiscoveryLink"
            >Copy</button>
          </div>
        </div>

        <!-- Email preview modal (renders inside the drawer, not a separate overlay) -->
        <div
          v-if="pendingEmail"
          class="rounded-card border border-brand/30 bg-brand/5 px-4 py-3"
        >
          <div class="flex items-baseline justify-between mb-2">
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
                Email preview · {{ EMAIL_LABELS[pendingEmail.key] }}
              </div>
              <p class="text-[10.5px] text-ink-muted mt-0.5 italic">
                This is what the customer sees. Edit the recipient or close to skip.
              </p>
            </div>
            <button
              type="button"
              class="text-[10px] text-ink-muted hover:text-ink"
              @click="pendingEmail = null"
            >Close ✕</button>
          </div>

          <!-- Recipient (editable) -->
          <label class="block mb-2">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">To</span>
            <input
              v-model="editingTo"
              type="email"
              class="mt-0.5 w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-[12px] text-ink focus:border-brand focus:outline-none"
            />
          </label>

          <!-- Subject (read-only) -->
          <div class="mb-2">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Subject</span>
            <div class="mt-0.5 rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-[12px] text-ink">
              {{ pendingEmail.content.subject }}
            </div>
          </div>

          <!-- Body (read-only, scrollable) -->
          <div class="mb-3">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Body</span>
            <pre class="mt-0.5 rounded-md border border-divider bg-surface-raised px-2.5 py-2 text-[11px] text-ink font-sans whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">{{ pendingEmail.content.body }}</pre>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="text-[11px] text-ink-muted hover:text-ink px-2 py-1"
              @click="pendingEmail = null"
            >Skip send</button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-[11px] font-semibold hover:opacity-90 disabled:opacity-40 transition-[opacity,transform] duration-150 ease-out active:scale-[0.97]"
              :disabled="busy || !editingTo"
              @click="confirmSendEmail"
            >
              <AdaIcon name="email_marketing" class="h-3 w-3" />
              {{ busy ? 'Sending…' : 'Send real email' }}
            </button>
          </div>
        </div>

        <!-- Result message -->
        <p
          v-if="msg"
          class="text-[11px]"
          :class="msg.kind === 'ok' ? 'text-success' : 'text-danger'"
        >{{ msg.text }}</p>
      </div>

      <!-- Footer: advance controls -->
      <footer class="flex-shrink-0 border-t border-divider bg-surface-elevated px-5 py-3">
        <div class="flex items-center justify-between gap-3">
          <button
            type="button"
            class="text-[11px] text-ink-muted hover:text-ink disabled:opacity-50 px-2 py-1"
            :disabled="customer.onboarding_stage === 'signed' || busy"
            @click="revert"
          >⟵ Revert stage</button>

          <div class="flex items-center gap-2">
            <span
              v-if="!advanceCheck.ok"
              class="text-[10px] text-warn italic"
              :title="advanceCheck.blockers.map((b) => b.label).join(', ')"
            >Blocked by {{ advanceCheck.blockers.length }} task{{ advanceCheck.blockers.length === 1 ? '' : 's' }}</span>
            <button
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-[11px] font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-[opacity,transform] duration-150 ease-out active:scale-[0.97]"
              :disabled="!advanceCheck.ok || busy"
              :title="advanceCheck.ok ? 'Advance to next stage' : 'Resolve blocking tasks first'"
              @click="advance"
            >
              {{ customer.onboarding_stage === 'live' ? 'Activate ✓' : 'Advance ⟶' }}
            </button>
          </div>
        </div>
      </footer>
    </aside>
  </transition>
</template>
