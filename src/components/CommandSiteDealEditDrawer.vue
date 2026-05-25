<script setup lang="ts">
/**
 * Deal edit drawer — opens when a deal card / row is clicked.
 * Edits the deal-specific fields Josh hit in SQL:
 *  - scheduled_at, scheduled_call_duration_min
 *  - stage (full enum)
 *  - next_action, next_action_due_at
 *  - notes
 *  - post_call_notes (interest_level, specific_concern, next_step, extra_notes)
 *  - contact info (kept in sync with the deal, separate from cs_leads)
 */
import { ref, computed, watch } from 'vue'
import type { CsDeal } from '@/types/database'

const props = defineProps<{
  open: boolean
  deal: CsDeal | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', input: { id: string; fields: Record<string, unknown> }): void
  (e: 'delete', id: string): void
}>()

// NOTE: 'demo_done' is the dealsApi convention used by discoveryApi but
// the CsDealStage enum in the DB schema doesn't currently include it
// (legacy). We cast to any when assigning; the DB column is plain text.
const STAGES: { value: string; label: string }[] = [
  { value: 'cold',          label: 'Cold' },
  { value: 'researched',    label: 'Researched' },
  { value: 'contacted',     label: 'Contacted' },
  { value: 'replied',       label: 'Replied' },
  { value: 'demo_booked',   label: 'Demo booked' },
  { value: 'demo_done',     label: 'Demo done' },
  { value: 'proposal',      label: 'Proposal' },
  { value: 'closed_won',    label: 'Closed won' },
  { value: 'closed_lost',   label: 'Closed lost' },
]

const companyName = ref('')
const contactName = ref('')
const contactEmail = ref('')
const industry = ref('')
const city = ref('')
const state = ref('')
const stage = ref<string>('cold')
const scheduledAtLocal = ref('')
const durationMin = ref<number | ''>(30)
const nextAction = ref('')
const nextActionDueLocal = ref('')
const notes = ref('')
// Post-call
const interestLevel = ref<'hot' | 'warm' | 'lukewarm' | 'cold' | ''>('')
const specificConcern = ref('')
const postCallNextStep = ref('')
const extraNotes = ref('')

const saving = ref(false)
const showDeleteConfirm = ref(false)

function isoToLocal(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localToIso(local: string): string | null {
  if (!local) return null
  return new Date(local).toISOString()
}

watch(
  () => props.deal?.id,
  () => {
    if (!props.deal) return
    const d = props.deal as CsDeal & {
      scheduled_at?: string | null
      scheduled_call_duration_min?: number | null
      // deno-lint-ignore no-explicit-any
      post_call_notes?: any
    }
    companyName.value = d.company_name ?? ''
    contactName.value = d.contact_name ?? ''
    contactEmail.value = d.contact_email ?? ''
    industry.value = d.industry ?? ''
    city.value = d.city ?? ''
    state.value = d.state ?? ''
    stage.value = (d.stage as string) ?? 'cold'
    scheduledAtLocal.value = isoToLocal(d.scheduled_at ?? null)
    durationMin.value = d.scheduled_call_duration_min ?? 30
    nextAction.value = d.next_action ?? ''
    nextActionDueLocal.value = isoToLocal(d.next_action_due_at ?? null)
    notes.value = d.notes ?? ''
    const pc = d.post_call_notes ?? {}
    interestLevel.value = (pc.interest_level ?? '') as typeof interestLevel.value
    specificConcern.value = pc.specific_concern ?? ''
    postCallNextStep.value = pc.next_step ?? ''
    extraNotes.value = pc.extra_notes ?? ''
    showDeleteConfirm.value = false
  },
  { immediate: true },
)

function save() {
  if (!props.deal || saving.value) return
  saving.value = true

  const hasPostCall =
    interestLevel.value ||
    specificConcern.value.trim() ||
    postCallNextStep.value.trim() ||
    extraNotes.value.trim()

  emit('save', {
    id: props.deal.id,
    fields: {
      company_name: companyName.value.trim(),
      contact_name: contactName.value.trim() || null,
      contact_email: contactEmail.value.trim() || null,
      industry: industry.value.trim() || null,
      city: city.value.trim() || null,
      state: state.value.trim() || null,
      stage: stage.value,
      scheduled_at: localToIso(scheduledAtLocal.value),
      scheduled_call_duration_min: typeof durationMin.value === 'number' ? durationMin.value : null,
      next_action: nextAction.value.trim() || null,
      next_action_due_at: localToIso(nextActionDueLocal.value),
      notes: notes.value.trim() || null,
      post_call_notes: hasPostCall
        ? {
            interest_level: interestLevel.value || null,
            specific_concern: specificConcern.value.trim() || null,
            next_step: postCallNextStep.value.trim() || null,
            extra_notes: extraNotes.value.trim() || null,
            logged_at: new Date().toISOString(),
          }
        : null,
    },
  })
  saving.value = false
}

function onDeleteConfirm() {
  if (!props.deal) return
  emit('delete', props.deal.id)
  showDeleteConfirm.value = false
}

const isStageShowingPostCall = computed(() => stage.value === 'demo_done' || stage.value === 'proposal')
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
        v-if="open && deal"
        class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end"
        @click.self="emit('close')"
      >
        <Transition
          enter-active-class="transition-transform duration-[250ms] ease-out-quart"
          enter-from-class="translate-x-full"
          enter-to-class="translate-x-0"
        >
          <aside
            v-if="open && deal"
            class="w-full max-w-xl bg-surface shadow-2xl flex flex-col h-full overflow-hidden"
          >
            <header class="px-6 py-4 border-b border-divider flex items-center justify-between flex-shrink-0">
              <div>
                <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Edit deal</div>
                <h2 class="text-lg font-bold text-ink mt-0.5">{{ companyName || 'Deal' }}</h2>
              </div>
              <button type="button" class="text-ink-muted hover:text-ink text-2xl leading-none px-2" @click="emit('close')">×</button>
            </header>

            <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <!-- Identity -->
              <section>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Identity</div>
                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Company name</label>
                    <input v-model="companyName" type="text" class="input" />
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Contact name</label>
                      <input v-model="contactName" type="text" class="input" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Contact email</label>
                      <input v-model="contactEmail" type="email" class="input" />
                    </div>
                  </div>
                  <div class="grid grid-cols-3 gap-3">
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Industry</label>
                      <input v-model="industry" type="text" class="input" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">City</label>
                      <input v-model="city" type="text" class="input" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">State</label>
                      <input v-model="state" type="text" class="input" maxlength="2" />
                    </div>
                  </div>
                </div>
              </section>

              <!-- Stage + schedule -->
              <section>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Stage + schedule</div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Stage</label>
                    <select v-model="stage" class="input">
                      <option v-for="s in STAGES" :key="s.value" :value="s.value">{{ s.label }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Duration (min)</label>
                    <input v-model.number="durationMin" type="number" min="5" max="240" class="input" />
                  </div>
                </div>
                <div class="mt-3">
                  <label class="block text-xs font-semibold text-ink mb-1.5">Scheduled at</label>
                  <input v-model="scheduledAtLocal" type="datetime-local" class="input" />
                  <p class="text-[11px] text-ink-muted mt-1">When the call is/was. Demos tab uses this to split upcoming vs. past.</p>
                </div>
              </section>

              <!-- Next action -->
              <section>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Next action</div>
                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">What's next</label>
                    <input v-model="nextAction" type="text" class="input" placeholder="Follow-up call next Tuesday" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Due</label>
                    <input v-model="nextActionDueLocal" type="datetime-local" class="input" />
                  </div>
                </div>
              </section>

              <!-- Post-call notes (only for late-stage) -->
              <section v-if="isStageShowingPostCall">
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
                    <label class="block text-xs font-semibold text-ink mb-1.5">Next step (post-call)</label>
                    <input v-model="postCallNextStep" type="text" class="input" placeholder="Send proposal Wed" />
                  </div>
                </div>
                <div class="mt-3">
                  <label class="block text-xs font-semibold text-ink mb-1.5">Specific concern</label>
                  <input v-model="specificConcern" type="text" class="input" placeholder="Wanted to talk to elders before deciding" />
                </div>
                <div class="mt-3">
                  <label class="block text-xs font-semibold text-ink mb-1.5">Extra notes</label>
                  <textarea v-model="extraNotes" rows="3" class="input" placeholder="Anything else worth remembering" />
                </div>
              </section>

              <!-- Free-form notes -->
              <section>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Deal notes</div>
                <textarea v-model="notes" rows="3" class="input" />
              </section>

              <!-- Delete -->
              <section class="pt-4 border-t border-divider">
                <div class="text-[10px] font-bold uppercase tracking-wider text-danger mb-2">Danger zone</div>
                <button
                  v-if="!showDeleteConfirm"
                  type="button"
                  class="rounded-md border border-danger/30 text-danger bg-danger/5 px-3 py-1.5 text-xs font-semibold hover:bg-danger/10"
                  @click="showDeleteConfirm = true"
                >Delete this deal</button>
                <div v-else class="flex items-center gap-2">
                  <span class="text-xs text-danger font-semibold">Are you sure? This can't be undone.</span>
                  <button type="button" class="rounded-md bg-danger text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90" @click="onDeleteConfirm">Yes, delete</button>
                  <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand" @click="showDeleteConfirm = false">Cancel</button>
                </div>
              </section>
            </div>

            <footer class="px-6 py-3 border-t border-divider bg-surface-elevated/30 flex items-center justify-end gap-2 flex-shrink-0">
              <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand" @click="emit('close')">Close</button>
              <button
                type="button"
                class="rounded-md bg-brand text-ink-inverse px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-40"
                :disabled="saving"
                @click="save"
              >{{ saving ? 'Saving…' : 'Save' }}</button>
            </footer>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
