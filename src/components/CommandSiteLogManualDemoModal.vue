<script setup lang="ts">
/**
 * Log a manual demo — for any discovery call that didn't come through
 * the Calendly webhook (e.g. calls scheduled via email, by phone, or
 * from before the Calendly integration was wired).
 *
 * Inserts a cs_deals row with the right shape so the Demos tab finds
 * it (stage=demo_done OR demo_booked, with scheduled_at set).
 *
 * Two flows:
 *   - "From lead" picker — find an existing cs_leads row, hydrate
 *     contact info from it
 *   - "Manual entry" — type company + contact directly (rare)
 */
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { CsLead } from '@/types/database'

const props = defineProps<{
  open: boolean
  leads: CsLead[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', dealId: string): void
}>()

// Form state
const fromLead = ref(true)
const selectedLeadId = ref('')
const manualCompany = ref('')
const manualContactName = ref('')
const manualContactEmail = ref('')
const manualIndustry = ref('')
const manualCity = ref('')
const manualState = ref('')

const scheduledAtLocal = ref('')  // datetime-local format: YYYY-MM-DDTHH:MM
const durationMin = ref<number | ''>(30)
const stage = ref<'demo_booked' | 'demo_done'>('demo_done')
const nextAction = ref('')
const interestLevel = ref<'hot' | 'warm' | 'lukewarm' | 'cold' | ''>('')
const specificConcern = ref('')
const callNotes = ref('')

const saving = ref(false)
const errorMsg = ref<string | null>(null)

// Pre-populate scheduled_at to "right now" rounded to nearest 15 min
function nowRoundedLocal(): string {
  const d = new Date()
  d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function resetForm() {
  fromLead.value = true
  selectedLeadId.value = ''
  manualCompany.value = ''
  manualContactName.value = ''
  manualContactEmail.value = ''
  manualIndustry.value = ''
  manualCity.value = ''
  manualState.value = ''
  scheduledAtLocal.value = nowRoundedLocal()
  durationMin.value = 30
  stage.value = 'demo_done'
  nextAction.value = ''
  interestLevel.value = ''
  specificConcern.value = ''
  callNotes.value = ''
  errorMsg.value = null
}

// Initialize form when opened, reset on close
let initialized = false
const openState = computed(() => {
  if (props.open && !initialized) {
    resetForm()
    initialized = true
  } else if (!props.open && initialized) {
    initialized = false
  }
  return props.open
})

const selectedLead = computed<CsLead | null>(() =>
  props.leads.find((l) => l.id === selectedLeadId.value) ?? null,
)

const canSave = computed(() => {
  if (!scheduledAtLocal.value) return false
  if (fromLead.value) return !!selectedLeadId.value
  return manualCompany.value.trim().length > 0
})

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  errorMsg.value = null

  // Convert datetime-local (interpreted in user's local tz) to ISO
  const scheduledIso = new Date(scheduledAtLocal.value).toISOString()

  const lead = selectedLead.value
  const payload = {
    lead_id: fromLead.value ? lead?.id ?? null : null,
    company_name: fromLead.value ? (lead?.company_name ?? '') : manualCompany.value.trim(),
    contact_name: fromLead.value ? (lead?.contact_name ?? '') : manualContactName.value.trim(),
    contact_email: fromLead.value ? lead?.contact_email : (manualContactEmail.value.trim() || null),
    industry: fromLead.value ? lead?.industry : (manualIndustry.value.trim() || null),
    city: fromLead.value ? lead?.city : (manualCity.value.trim() || null),
    state: fromLead.value ? lead?.state : (manualState.value.trim() || null),
    stage: stage.value,
    source: 'manual',
    scheduled_at: scheduledIso,
    scheduled_call_duration_min: typeof durationMin.value === 'number' ? durationMin.value : 30,
    next_action: nextAction.value.trim() || (stage.value === 'demo_done'
      ? 'Follow-up after the call'
      : 'Run the discovery call'),
    next_action_due_at: stage.value === 'demo_done'
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : scheduledIso,
    last_touch_at: new Date().toISOString(),
    last_touch_kind: 'meeting',
    stage_entered_at: new Date().toISOString(),
    notes: callNotes.value.trim() || null,
    post_call_notes: stage.value === 'demo_done' && (interestLevel.value || specificConcern.value || callNotes.value)
      ? {
          interest_level: interestLevel.value || null,
          specific_concern: specificConcern.value.trim() || null,
          next_step: nextAction.value.trim() || null,
          extra_notes: callNotes.value.trim() || null,
          logged_at: new Date().toISOString(),
        }
      : null,
  }

  const { data, error } = await supabase
    .from('cs_deals').insert(payload as never).select('id').single()
  if (error) {
    errorMsg.value = error.message
    saving.value = false
    return
  }

  // If created from a lead, also flip the lead status to promoted
  if (fromLead.value && lead?.id) {
    await supabase
      .from('cs_leads')
      .update({ status: 'promoted_to_pipeline', promoted_deal_id: (data as { id: string }).id } as never)
      .eq('id', lead.id)
  }

  saving.value = false
  emit('saved', (data as { id: string }).id)
  emit('close')
}

function onCancel() {
  emit('close')
}
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
      <div
        v-if="openState"
        class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-6 overflow-y-auto"
        @click.self="onCancel"
      >
        <Transition
          enter-active-class="transition-[opacity,transform] duration-200 ease-out-quart"
          enter-from-class="opacity-0 translate-y-4"
          enter-to-class="opacity-100 translate-y-0"
        >
          <div class="w-full max-w-2xl bg-surface rounded-2xl shadow-2xl my-12 overflow-hidden">
            <header class="px-6 py-4 border-b border-divider flex items-center justify-between">
              <div>
                <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Log a manual demo</div>
                <h2 class="text-lg font-bold text-ink mt-0.5">Add a discovery call that didn't come through Calendly</h2>
              </div>
              <button type="button" class="text-ink-muted hover:text-ink text-2xl leading-none px-2" @click="onCancel">×</button>
            </header>

            <div class="px-6 py-5 space-y-4 max-h-[calc(100vh-14rem)] overflow-y-auto">
              <!-- Source toggle -->
              <div class="flex items-center gap-1 p-1 bg-surface-elevated rounded-md w-fit text-xs">
                <button
                  type="button"
                  class="px-3 py-1.5 rounded font-medium transition-colors"
                  :class="fromLead ? 'bg-brand text-ink-inverse' : 'text-ink-muted hover:text-ink'"
                  @click="fromLead = true"
                >From an existing lead</button>
                <button
                  type="button"
                  class="px-3 py-1.5 rounded font-medium transition-colors"
                  :class="!fromLead ? 'bg-brand text-ink-inverse' : 'text-ink-muted hover:text-ink'"
                  @click="fromLead = false"
                >Manual entry</button>
              </div>

              <!-- From-lead picker -->
              <div v-if="fromLead">
                <label class="block text-xs font-semibold text-ink mb-1.5">Lead</label>
                <select v-model="selectedLeadId" class="input">
                  <option value="">— pick a lead —</option>
                  <option
                    v-for="lead in leads"
                    :key="lead.id"
                    :value="lead.id"
                  >{{ lead.company_name }}{{ lead.contact_name ? ` · ${lead.contact_name}` : '' }}{{ lead.city ? ` · ${lead.city}` : '' }}</option>
                </select>
                <p v-if="selectedLead" class="text-[11px] text-ink-muted mt-1.5">
                  Will hydrate: {{ selectedLead.contact_email ?? 'no email' }} · {{ selectedLead.industry ?? 'no industry' }} · {{ [selectedLead.city, selectedLead.state].filter(Boolean).join(', ') || 'no location' }}
                </p>
              </div>

              <!-- Manual entry fields -->
              <div v-else class="space-y-3">
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">Company name *</label>
                  <input v-model="manualCompany" type="text" class="input" placeholder="Focal Point Church" />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Contact name</label>
                    <input v-model="manualContactName" type="text" class="input" placeholder="Andrew Daniel" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Contact email</label>
                    <input v-model="manualContactEmail" type="email" class="input" placeholder="adaniel@..." />
                  </div>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Industry</label>
                    <input v-model="manualIndustry" type="text" class="input" placeholder="church" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">City</label>
                    <input v-model="manualCity" type="text" class="input" placeholder="Orlando" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">State</label>
                    <input v-model="manualState" type="text" class="input" placeholder="FL" maxlength="2" />
                  </div>
                </div>
              </div>

              <!-- Demo details -->
              <div class="pt-2 border-t border-divider">
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Demo details</div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Scheduled at *</label>
                    <input v-model="scheduledAtLocal" type="datetime-local" class="input" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Duration (min)</label>
                    <input v-model.number="durationMin" type="number" min="5" max="240" class="input" />
                  </div>
                </div>
                <div class="mt-3">
                  <label class="block text-xs font-semibold text-ink mb-1.5">Stage</label>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      class="flex-1 rounded-md border px-3 py-2 text-xs font-semibold transition-colors"
                      :class="stage === 'demo_booked' ? 'border-brand bg-brand/5 text-brand' : 'border-divider text-ink-muted hover:border-brand/40'"
                      @click="stage = 'demo_booked'"
                    >Upcoming (demo booked)</button>
                    <button
                      type="button"
                      class="flex-1 rounded-md border px-3 py-2 text-xs font-semibold transition-colors"
                      :class="stage === 'demo_done' ? 'border-brand bg-brand/5 text-brand' : 'border-divider text-ink-muted hover:border-brand/40'"
                      @click="stage = 'demo_done'"
                    >Already happened (demo done)</button>
                  </div>
                </div>
              </div>

              <!-- Post-call (only when demo_done) -->
              <div v-if="stage === 'demo_done'" class="pt-2 border-t border-divider">
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Post-call notes</div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Interest level</label>
                    <select v-model="interestLevel" class="input">
                      <option value="">—</option>
                      <option value="hot">Hot</option>
                      <option value="warm">Warm</option>
                      <option value="lukewarm">Lukewarm</option>
                      <option value="cold">Cold</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Next action</label>
                    <input v-model="nextAction" type="text" class="input" placeholder="Follow-up call next Tue" />
                  </div>
                </div>
                <div class="mt-3">
                  <label class="block text-xs font-semibold text-ink mb-1.5">Specific concern raised</label>
                  <input v-model="specificConcern" type="text" class="input" placeholder="Wanted to talk to elders before deciding" />
                </div>
                <div class="mt-3">
                  <label class="block text-xs font-semibold text-ink mb-1.5">Call notes</label>
                  <textarea v-model="callNotes" rows="3" class="input" placeholder="Anything else worth remembering before next conversation"></textarea>
                </div>
              </div>

              <div v-else class="pt-2 border-t border-divider">
                <label class="block text-xs font-semibold text-ink mb-1.5">Next action</label>
                <input v-model="nextAction" type="text" class="input" placeholder="Run the discovery call" />
              </div>

              <p v-if="errorMsg" class="text-sm text-danger">{{ errorMsg }}</p>
            </div>

            <footer class="px-6 py-3 border-t border-divider bg-surface-elevated/30 flex items-center justify-end gap-2">
              <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand" @click="onCancel">Cancel</button>
              <button
                type="button"
                class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-40"
                :disabled="!canSave || saving"
                @click="save"
              >{{ saving ? 'Saving…' : 'Log demo' }}</button>
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
