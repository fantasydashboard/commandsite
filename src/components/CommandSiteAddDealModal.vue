<script setup lang="ts">
/**
 * CommandSite — Add Deal modal.
 * Quick form for logging a manual deal (LinkedIn intro, coffee chat,
 * inbound demo, anything that didn't come through the cold-email
 * sequence engine).
 */
import { ref, computed } from 'vue'
import { STAGE_META, SOURCE_LABEL } from '@/lib/clients/commandsite/pipeline'
import type { CsDealStage, CsDealSource, CsDealTouchKind } from '@/types/database'
import type { CreateDealInput } from '@/lib/clients/commandsite/dealsApi'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', input: CreateDealInput): void
}>()

const company_name = ref('')
const contact_name = ref('')
const contact_email = ref('')
const contact_title = ref('')
const industry = ref('')
const city = ref('')
const state = ref('')
const team_size = ref<number | null>(null)
const stage = ref<CsDealStage>('cold')
const source = ref<CsDealSource>('manual')
const estimated_arr = ref<number | null>(null)
const next_action = ref('')
const next_action_due_at = ref('')
const notes = ref('')
const last_touch_kind = ref<CsDealTouchKind>('note')

const submitting = ref(false)
const error = ref<string | null>(null)

const stageOptions: CsDealStage[] = [
  'cold','researched','contacted','replied','demo_booked','demo_done','proposal','closed_won','closed_lost',
]
const sourceOptions: CsDealSource[] = [
  'manual','cold_email','cold_call','linkedin_dm','inbound_demo','referral','event','reddit','apollo','social_engager','other',
]
const touchOptions: CsDealTouchKind[] = ['note','email','call','meeting','linkedin']

const canSubmit = computed(() =>
  company_name.value.trim().length > 0 && contact_name.value.trim().length > 0,
)

function reset() {
  company_name.value = ''
  contact_name.value = ''
  contact_email.value = ''
  contact_title.value = ''
  industry.value = ''
  city.value = ''
  state.value = ''
  team_size.value = null
  stage.value = 'cold'
  source.value = 'manual'
  estimated_arr.value = null
  next_action.value = ''
  next_action_due_at.value = ''
  notes.value = ''
  last_touch_kind.value = 'note'
  error.value = null
}

function close() {
  emit('close')
  // delay reset slightly so the form doesn't visually flash before transition
  setTimeout(reset, 200)
}

async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  error.value = null
  try {
    const payload: CreateDealInput = {
      company_name: company_name.value.trim(),
      contact_name: contact_name.value.trim(),
      contact_email: contact_email.value.trim() || undefined,
      contact_title: contact_title.value.trim() || undefined,
      industry: industry.value.trim() || undefined,
      city: city.value.trim() || undefined,
      state: state.value.trim() || undefined,
      team_size: team_size.value ?? undefined,
      stage: stage.value,
      source: source.value,
      estimated_arr_cents: estimated_arr.value ? Math.round(estimated_arr.value * 100) : 0,
      next_action: next_action.value.trim() || undefined,
      next_action_due_at: next_action_due_at.value || null,
      notes: notes.value.trim() || undefined,
      last_touch_kind: last_touch_kind.value,
    }
    emit('created', payload)
    close()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="props.open"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4"
        @click.self="close"
      >
        <div class="w-full max-w-2xl rounded-card bg-surface shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
          <!-- Header -->
          <div class="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
            <div>
              <h3 class="text-lg font-semibold text-ink">Add a deal</h3>
              <p class="text-xs text-ink-muted mt-0.5">
                Log a prospect from anywhere — LinkedIn DM, coffee chat, referral, inbound demo. Lands in your pipeline at whichever stage you choose.
              </p>
            </div>
            <button type="button" class="text-ink-muted hover:text-ink text-2xl leading-none p-1 -mr-1" @click="close" aria-label="Close">×</button>
          </div>

          <!-- Body -->
          <div class="overflow-y-auto px-5 py-4 flex-1">
            <form @submit.prevent="submit" class="space-y-4">
              <!-- Required: company + contact -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="kpi-label block mb-1">Company *</label>
                  <input
                    v-model="company_name"
                    type="text"
                    required
                    placeholder="Cool Comfort HVAC"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label class="kpi-label block mb-1">Contact name *</label>
                  <input
                    v-model="contact_name"
                    type="text"
                    required
                    placeholder="Brett Whitaker"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label class="kpi-label block mb-1">Email</label>
                  <input
                    v-model="contact_email"
                    type="email"
                    placeholder="brett@example.com"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label class="kpi-label block mb-1">Title</label>
                  <input
                    v-model="contact_title"
                    type="text"
                    placeholder="Owner"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              <!-- Company context -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label class="kpi-label block mb-1">Industry</label>
                  <input
                    v-model="industry"
                    type="text"
                    placeholder="HVAC"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label class="kpi-label block mb-1">City</label>
                  <input
                    v-model="city"
                    type="text"
                    placeholder="Jacksonville"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label class="kpi-label block mb-1">State</label>
                  <input
                    v-model="state"
                    type="text"
                    placeholder="FL"
                    maxlength="2"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink uppercase focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label class="kpi-label block mb-1">Techs</label>
                  <input
                    v-model.number="team_size"
                    type="number"
                    min="0"
                    placeholder="6"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              <!-- Pipeline state -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="kpi-label block mb-1">Stage</label>
                  <select
                    v-model="stage"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  >
                    <option v-for="s in stageOptions" :key="s" :value="s">{{ STAGE_META[s].label }}</option>
                  </select>
                </div>
                <div>
                  <label class="kpi-label block mb-1">Source</label>
                  <select
                    v-model="source"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  >
                    <option v-for="s in sourceOptions" :key="s" :value="s">{{ SOURCE_LABEL[s] }}</option>
                  </select>
                </div>
                <div>
                  <label class="kpi-label block mb-1">Est. annual value ($)</label>
                  <input
                    v-model.number="estimated_arr"
                    type="number"
                    min="0"
                    step="100"
                    placeholder="5988"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  />
                  <div class="mt-1 text-[10px] text-ink-disabled leading-snug">
                    What they'd pay over a year. Starter $2,388 · Pro $5,988 · Scale $11,988.
                  </div>
                </div>
              </div>

              <!-- Next action -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="sm:col-span-2">
                  <label class="kpi-label block mb-1">Next action</label>
                  <input
                    v-model="next_action"
                    type="text"
                    placeholder="Send Calendly link"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label class="kpi-label block mb-1">Due</label>
                  <input
                    v-model="next_action_due_at"
                    type="datetime-local"
                    class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              <!-- Last touch kind -->
              <div class="grid grid-cols-1 gap-3">
                <div>
                  <label class="kpi-label block mb-1">How did you last touch them?</label>
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="t in touchOptions"
                      :key="t"
                      type="button"
                      class="chip"
                      :class="last_touch_kind === t ? 'chip-active' : ''"
                      @click="last_touch_kind = t"
                    >{{ t }}</button>
                  </div>
                </div>
              </div>

              <!-- Notes -->
              <div>
                <label class="kpi-label block mb-1">Notes</label>
                <textarea
                  v-model="notes"
                  rows="3"
                  placeholder="Met at the trade show — said his admin is drowning in callbacks. Decision-maker, no current SaaS, asked about Pro pricing."
                  class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink resize-y focus:outline-none focus:border-brand"
                ></textarea>
              </div>

              <p v-if="error" class="text-sm text-danger">{{ error }}</p>
            </form>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-2 border-t border-divider px-5 py-3 bg-surface">
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink"
              @click="close"
            >Cancel</button>
            <button
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-4 py-1.5 text-sm font-semibold disabled:opacity-50 hover:opacity-90"
              :disabled="!canSubmit || submitting"
              @click="submit"
            >{{ submitting ? 'Adding…' : 'Add deal' }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 120ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
