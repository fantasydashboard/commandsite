<script setup lang="ts">
/**
 * Customer onboarding wizard — 5 steps to take a closed-won deal
 * into a fully-configured paying customer with a live dashboard.
 *
 * 1. Org & Plan — name, slug, persona, tier, billing
 * 2. Branding — primary color, wordmark, logo
 * 3. Contacts — pastor/owner team (name, role, email, phone)
 * 4. Persona — enabled roles, languages, optional persona override
 * 5. Review & Activate — summary + "Go live"
 *
 * Pre-fills from a cs_deal when launched via "Convert to customer"
 * on the Pipeline. Saves draft on every step (in-memory). On final
 * step, inserts cs_customers row and emits 'saved'.
 */
import { ref, computed, watch } from 'vue'
import { slugify, type PersonaType, type CustomerContact } from '@/lib/clients/commandsite/customersApi'
import type { CsDeal } from '@/types/database'

const props = defineProps<{
  open: boolean
  /** Optional source deal — pre-fills fields when promoting from pipeline */
  sourceDeal?: CsDeal | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', input: Record<string, unknown>): void
}>()

const STEPS = [
  { key: 'org', label: 'Org & plan' },
  { key: 'branding', label: 'Branding' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'persona', label: 'Persona' },
  { key: 'review', label: 'Review' },
] as const
type StepKey = typeof STEPS[number]['key']

const stepIdx = ref(0)
const stepKey = computed<StepKey>(() => STEPS[stepIdx.value].key)

// ── Step 1: Org & Plan ────────────────────────────────────────────────
const orgName = ref('')
const slug = ref('')
const slugTouched = ref(false)
const personaType = ref<PersonaType>('grace')
const industry = ref('')
const city = ref('')
const state = ref('')
const timezone = ref('America/New_York')
const tier = ref('standard')
const foundingPartner = ref(true)
const billingPeriod = ref<'monthly' | 'annual'>('monthly')
const setupFee = ref(0)
const monthlyRate = ref(0)
const signedDate = ref('')

// Auto-slug from org name unless user typed their own slug
watch(orgName, (val) => {
  if (!slugTouched.value) slug.value = slugify(val)
})

// ── Step 2: Branding ──────────────────────────────────────────────────
const primaryColor = ref('#A78BFA')
const wordmarkText = ref('')
const logoUrl = ref('')

// ── Step 3: Contacts ─────────────────────────────────────────────────
const contacts = ref<CustomerContact[]>([
  { name: '', role: '', email: '', phone: '', primary: true },
])

function addContact() {
  contacts.value = [...contacts.value, { name: '', role: '', email: '', phone: '', primary: false }]
}
function removeContact(idx: number) {
  contacts.value = contacts.value.filter((_, i) => i !== idx)
  // If we removed the primary, mark the first as primary
  if (contacts.value.length > 0 && !contacts.value.some((c) => c.primary)) {
    contacts.value[0].primary = true
  }
}
function setPrimary(idx: number) {
  contacts.value = contacts.value.map((c, i) => ({ ...c, primary: i === idx }))
}

// ── Step 4: Persona ──────────────────────────────────────────────────
const ROLES_BY_PERSONA: Record<PersonaType, { key: string; label: string; description: string }[]> = {
  grace: [
    { key: 'front_desk', label: 'Front desk', description: 'Catches calls + connect cards' },
    { key: 'guest_followup', label: 'Guest follow-up', description: 'Personal welcome to first-time visitors' },
    { key: 'drift_detection', label: 'Drift detection', description: 'Watches household-level signals for at-risk families' },
    { key: 'care_triage', label: 'Care triage', description: 'Routes pastoral emergencies + drafts check-ins' },
    { key: 'reengagement', label: 'Re-engagement', description: 'Notices dormant members + drafts soft outreach' },
    { key: 'communications', label: 'Communications', description: 'Drafts newsletters, cards, life-event notes' },
    { key: 'volunteer_coord', label: 'Volunteer coordination', description: 'Spots Sunday gaps + suggests fills' },
    { key: 'stories', label: 'Story engine', description: 'Captures testimonies after baptisms / milestones' },
  ],
  ada: [
    { key: 'front_desk', label: 'Front desk', description: 'Catches every call, books appointments' },
    { key: 'quote_followup', label: 'Quote follow-up', description: 'Day 1/3/7 nudges on stale quotes' },
    { key: 'review_engine', label: 'Review engine', description: 'Asks for Google reviews after every job' },
    { key: 'customer_reactivation', label: 'Customer reactivation', description: 'Seasonal nudges to dormant customers' },
    { key: 'communications', label: 'Communications', description: 'Drafts comms + campaigns in your voice' },
    { key: 'dispatch', label: 'Dispatch', description: 'Manages schedule, tech rotation, ETAs' },
  ],
}

const enabledRoles = ref<string[]>([])
const languages = ref<string[]>(['English'])
const newLanguage = ref('')
const personaNameOverride = ref('')
const greetingOverride = ref('')

function toggleRole(key: string) {
  if (enabledRoles.value.includes(key)) {
    enabledRoles.value = enabledRoles.value.filter((r) => r !== key)
  } else {
    enabledRoles.value = [...enabledRoles.value, key]
  }
}
function addLanguage() {
  const clean = newLanguage.value.trim()
  if (!clean) return
  if (languages.value.includes(clean)) return
  languages.value = [...languages.value, clean]
  newLanguage.value = ''
}
function removeLanguage(lang: string) {
  languages.value = languages.value.filter((l) => l !== lang)
}

const personaName = computed(() => personaNameOverride.value.trim() || (personaType.value === 'grace' ? 'Grace' : 'Ada'))

// ── Pre-fill from source deal when opened ────────────────────────────
let initialized = false
const isOpen = computed(() => {
  if (props.open && !initialized) {
    initialized = true
    if (props.sourceDeal) {
      const d = props.sourceDeal
      orgName.value = d.company_name ?? ''
      slug.value = slugify(d.company_name ?? '')
      slugTouched.value = false
      industry.value = d.industry ?? ''
      city.value = d.city ?? ''
      state.value = d.state ?? ''
      // Industry hints persona
      if (/church|ministry/i.test(d.industry ?? '')) {
        personaType.value = 'grace'
        primaryColor.value = '#0EA5A0'  // emerald — church default
      } else {
        personaType.value = 'ada'
        primaryColor.value = '#A78BFA'  // Builder's Blue — service default
      }
      wordmarkText.value = d.company_name ?? ''
      // Seed first contact from the deal
      contacts.value = [{
        name: d.contact_name ?? '',
        role: 'Primary contact',
        email: d.contact_email ?? '',
        phone: '',
        primary: true,
      }]
      signedDate.value = new Date().toISOString().slice(0, 10)
    }
  } else if (!props.open && initialized) {
    initialized = false
    stepIdx.value = 0
  }
  return props.open
})

// ── Validation ────────────────────────────────────────────────────────
const stepValid = computed(() => {
  if (stepKey.value === 'org') {
    return orgName.value.trim().length > 0 && /^[a-z0-9][a-z0-9-]*$/.test(slug.value) && monthlyRate.value > 0
  }
  if (stepKey.value === 'branding') {
    return /^#[0-9a-f]{6}$/i.test(primaryColor.value)
  }
  if (stepKey.value === 'contacts') {
    return contacts.value.length > 0 &&
           contacts.value.every((c) => c.name.trim().length > 0 && c.email.trim().length > 0) &&
           contacts.value.some((c) => c.primary)
  }
  if (stepKey.value === 'persona') {
    return enabledRoles.value.length > 0 && languages.value.length > 0
  }
  return true
})

function next() {
  if (!stepValid.value) return
  if (stepIdx.value < STEPS.length - 1) stepIdx.value++
}
function prev() {
  if (stepIdx.value > 0) stepIdx.value--
}

// ── Final save ────────────────────────────────────────────────────────
function buildPayload(): Record<string, unknown> {
  const year1 = setupFee.value + monthlyRate.value * 12
  return {
    deal_id: props.sourceDeal?.id ?? null,
    lead_id: (props.sourceDeal as { lead_id?: string | null } | null)?.lead_id ?? null,
    org_name: orgName.value.trim(),
    slug: slug.value.trim(),
    persona_type: personaType.value,
    industry: industry.value.trim() || null,
    city: city.value.trim() || null,
    state: state.value.trim() || null,
    timezone: timezone.value,
    tier: tier.value,
    founding_partner: foundingPartner.value,
    billing_period: billingPeriod.value,
    setup_fee_cents: Math.round(setupFee.value * 100),
    monthly_rate_cents: Math.round(monthlyRate.value * 100),
    year1_cost_cents: Math.round(year1 * 100),
    signed_at: signedDate.value ? new Date(signedDate.value).toISOString() : new Date().toISOString(),
    billing_start_at: signedDate.value ? new Date(signedDate.value).toISOString() : new Date().toISOString(),
    founding_lock_until: foundingPartner.value
      ? new Date(new Date(signedDate.value || Date.now()).setFullYear(new Date(signedDate.value || Date.now()).getFullYear() + 1)).toISOString().slice(0, 10)
      : null,
    status: 'onboarding',
    primary_color: primaryColor.value,
    wordmark_text: wordmarkText.value.trim() || orgName.value.trim(),
    logo_url: logoUrl.value.trim() || null,
    contacts: contacts.value.filter((c) => c.name.trim() && c.email.trim()),
    enabled_roles: enabledRoles.value,
    languages: languages.value,
    persona_name_override: personaNameOverride.value.trim() || null,
    greeting_override: greetingOverride.value.trim() || null,
    onboarding_step: STEPS.length - 1,
  }
}

function onActivate() {
  emit('save', buildPayload())
}

const totalYear1 = computed(() => setupFee.value + monthlyRate.value * 12)
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
        v-if="isOpen"
        class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-6 overflow-y-auto"
        @click.self="emit('close')"
      >
        <div class="w-full max-w-3xl bg-surface rounded-2xl shadow-2xl my-8 overflow-hidden flex flex-col" style="min-height: 540px">
          <!-- Header with step indicator -->
          <header class="px-6 py-4 border-b border-divider">
            <div class="flex items-center justify-between mb-3">
              <div>
                <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Customer onboarding</div>
                <h2 class="text-lg font-bold text-ink mt-0.5">{{ orgName || 'New customer' }}</h2>
              </div>
              <button type="button" class="text-ink-muted hover:text-ink text-2xl leading-none px-2" @click="emit('close')">×</button>
            </div>
            <!-- Step pills -->
            <div class="flex items-center gap-1">
              <div
                v-for="(s, i) in STEPS"
                :key="s.key"
                class="flex-1 flex items-center gap-2"
              >
                <div
                  class="flex-1 h-1 rounded-full transition-colors"
                  :class="i <= stepIdx ? 'bg-brand' : 'bg-divider'"
                />
                <span
                  v-if="i === stepIdx"
                  class="text-[10px] font-semibold text-brand whitespace-nowrap"
                >{{ s.label }}</span>
              </div>
            </div>
          </header>

          <!-- Step content -->
          <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <!-- STEP 1: Org & Plan -->
            <template v-if="stepKey === 'org'">
              <section>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-3">Organization</div>
                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Org name *</label>
                    <input v-model="orgName" type="text" class="input" placeholder="Focal Point Church" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">URL slug *</label>
                    <input
                      v-model="slug"
                      type="text"
                      class="input font-mono"
                      placeholder="focal-point-church"
                      @input="slugTouched = true"
                    />
                    <p class="text-[11px] text-ink-muted mt-1">Their dashboard will live at <code class="text-brand">/dashboard/{{ slug || '<slug>' }}</code>. Lowercase + dashes only.</p>
                  </div>
                  <div class="grid grid-cols-3 gap-3">
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Industry</label>
                      <input v-model="industry" type="text" class="input" placeholder="church" />
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
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Persona</label>
                    <div class="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        class="rounded-lg border p-3 text-left transition-colors"
                        :class="personaType === 'grace' ? 'border-brand bg-brand/5' : 'border-divider hover:border-brand/40'"
                        @click="personaType = 'grace'"
                      >
                        <div class="text-sm font-bold text-ink">Grace</div>
                        <div class="text-[11px] text-ink-muted">For churches + ministries</div>
                      </button>
                      <button
                        type="button"
                        class="rounded-lg border p-3 text-left transition-colors"
                        :class="personaType === 'ada' ? 'border-brand bg-brand/5' : 'border-divider hover:border-brand/40'"
                        @click="personaType = 'ada'"
                      >
                        <div class="text-sm font-bold text-ink">Ada</div>
                        <div class="text-[11px] text-ink-muted">For service businesses (HVAC, plumbing, electrical, remodelers)</div>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section class="pt-4 border-t border-divider">
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-3">Plan</div>
                <div class="space-y-3">
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Tier</label>
                      <select v-model="tier" class="input">
                        <option value="compact">Compact</option>
                        <option value="standard">Standard</option>
                        <option value="large">Large</option>
                        <option value="multi-congregation">Multi-congregation</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Billing</label>
                      <select v-model="billingPeriod" class="input">
                        <option value="monthly">Monthly</option>
                        <option value="annual">Annual (prepay)</option>
                      </select>
                    </div>
                  </div>
                  <div class="grid grid-cols-3 gap-3">
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Setup fee ($)</label>
                      <input v-model.number="setupFee" type="number" min="0" class="input" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Monthly rate ($) *</label>
                      <input v-model.number="monthlyRate" type="number" min="0" class="input" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Signed date</label>
                      <input v-model="signedDate" type="date" class="input" />
                    </div>
                  </div>
                  <label class="flex items-center gap-2 text-sm text-ink">
                    <input v-model="foundingPartner" type="checkbox" class="h-4 w-4 rounded border-divider" />
                    <span>Founding partner — rate locked for 12 months</span>
                  </label>
                  <p class="text-[11px] text-ink-muted">
                    Year-one total: <strong class="text-ink">${{ totalYear1.toLocaleString() }}</strong>
                    ({{ billingPeriod === 'annual' ? 'annual prepay' : 'monthly' }})
                  </p>
                </div>
              </section>
            </template>

            <!-- STEP 2: Branding -->
            <template v-else-if="stepKey === 'branding'">
              <section>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-3">Brand identity</div>
                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Primary color *</label>
                    <div class="flex items-center gap-3">
                      <input v-model="primaryColor" type="color" class="h-10 w-16 rounded border border-divider" />
                      <input v-model="primaryColor" type="text" class="input font-mono flex-1" placeholder="#A78BFA" />
                    </div>
                    <p class="text-[11px] text-ink-muted mt-1">Used throughout their dashboard chrome — buttons, highlights, badges.</p>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Wordmark text</label>
                    <input v-model="wordmarkText" type="text" class="input" :placeholder="orgName" />
                    <p class="text-[11px] text-ink-muted mt-1">Shown at the top of their dashboard. Defaults to the org name.</p>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Logo URL (optional)</label>
                    <input v-model="logoUrl" type="url" class="input" placeholder="https://focalpointchurch.com/logo.png" />
                    <p class="text-[11px] text-ink-muted mt-1">Hosted image URL. Skip for now if you don't have one.</p>
                  </div>
                  <!-- Preview -->
                  <div class="mt-4 rounded-lg border border-divider overflow-hidden">
                    <div class="px-4 py-3 text-white text-sm font-bold" :style="{ backgroundColor: primaryColor }">
                      {{ wordmarkText || orgName || 'Preview' }}
                    </div>
                    <div class="px-4 py-3 bg-surface">
                      <button
                        type="button"
                        class="rounded px-3 py-1.5 text-xs font-semibold text-white"
                        :style="{ backgroundColor: primaryColor }"
                      >Sample button</button>
                    </div>
                  </div>
                </div>
              </section>
            </template>

            <!-- STEP 3: Contacts -->
            <template v-else-if="stepKey === 'contacts'">
              <section>
                <div class="flex items-baseline justify-between mb-3">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Contacts</div>
                  <button type="button" class="text-[11px] text-brand font-semibold hover:underline" @click="addContact">+ Add contact</button>
                </div>
                <p class="text-[11px] text-ink-muted mb-3">Pastor / owner team. Mark one as primary — they're who Josh routes urgent things to.</p>
                <div class="space-y-3">
                  <div
                    v-for="(c, i) in contacts"
                    :key="i"
                    class="rounded-lg border border-divider p-3 space-y-2"
                    :class="c.primary ? 'bg-brand/5 border-brand/30' : 'bg-canvas/40'"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <label class="flex items-center gap-2 text-xs">
                        <input
                          type="radio"
                          :checked="c.primary"
                          @change="setPrimary(i)"
                          class="h-3.5 w-3.5"
                        />
                        <span :class="c.primary ? 'text-brand font-semibold' : 'text-ink-muted'">Primary contact</span>
                      </label>
                      <button
                        v-if="contacts.length > 1"
                        type="button"
                        class="text-ink-disabled hover:text-danger text-lg leading-none"
                        @click="removeContact(i)"
                      >×</button>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      <input v-model="c.name" type="text" class="input !text-sm" placeholder="Name" />
                      <input v-model="c.role" type="text" class="input !text-sm" placeholder="Role (Pastor / Owner / GM)" />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      <input v-model="c.email" type="email" class="input !text-sm" placeholder="email@org.com" />
                      <input v-model="c.phone" type="tel" class="input !text-sm" placeholder="Phone" />
                    </div>
                  </div>
                </div>
              </section>
            </template>

            <!-- STEP 4: Persona config -->
            <template v-else-if="stepKey === 'persona'">
              <section>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-3">Which of {{ personaName }}'s roles are active in week 1?</div>
                <p class="text-[11px] text-ink-muted mb-3">Pick what to enable at launch. Others can be turned on as the customer grows comfortable.</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    v-for="role in ROLES_BY_PERSONA[personaType]"
                    :key="role.key"
                    type="button"
                    class="rounded-lg border p-3 text-left transition-colors"
                    :class="enabledRoles.includes(role.key) ? 'border-brand bg-brand/5' : 'border-divider hover:border-brand/40'"
                    @click="toggleRole(role.key)"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="text-sm font-semibold text-ink">{{ role.label }}</div>
                      <span v-if="enabledRoles.includes(role.key)" class="text-brand text-sm">✓</span>
                    </div>
                    <div class="text-[11px] text-ink-muted mt-0.5">{{ role.description }}</div>
                  </button>
                </div>
              </section>

              <section class="pt-4 border-t border-divider">
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-3">Languages supported</div>
                <div class="flex flex-wrap gap-1.5 mb-2">
                  <span
                    v-for="lang in languages"
                    :key="lang"
                    class="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand text-[11px] font-semibold px-2 py-0.5"
                  >
                    {{ lang }}
                    <button v-if="languages.length > 1" type="button" class="text-brand/70 hover:text-brand text-sm leading-none" @click="removeLanguage(lang)">×</button>
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model="newLanguage"
                    type="text"
                    placeholder="Add a language and hit Enter"
                    class="input !text-sm flex-1"
                    @keydown.enter.prevent="addLanguage"
                  />
                  <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand" @click="addLanguage">Add</button>
                </div>
              </section>

              <section class="pt-4 border-t border-divider">
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-3">Persona overrides (optional)</div>
                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Custom persona name</label>
                    <input v-model="personaNameOverride" type="text" class="input" :placeholder="`Default: ${personaType === 'grace' ? 'Grace' : 'Ada'}`" />
                    <p class="text-[11px] text-ink-muted mt-1">Rare — most customers keep the default.</p>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Custom greeting</label>
                    <input v-model="greetingOverride" type="text" class="input" :placeholder="`Hi ${contacts[0]?.name?.split(' ')[0] || '[Name]'} — I'm ${personaName}.`" />
                  </div>
                </div>
              </section>
            </template>

            <!-- STEP 5: Review -->
            <template v-else-if="stepKey === 'review'">
              <section>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-3">Ready to activate</div>
                <div class="space-y-3 text-sm">
                  <div class="rounded-lg bg-canvas/40 border border-divider p-3">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">Organization</div>
                    <div class="text-ink font-semibold">{{ orgName }}</div>
                    <div class="text-[11px] text-ink-muted">
                      <code class="text-brand">/dashboard/{{ slug }}</code> · {{ personaType === 'grace' ? 'Grace (church)' : 'Ada (service)' }}
                      <template v-if="city && state"> · {{ city }}, {{ state }}</template>
                    </div>
                  </div>
                  <div class="rounded-lg bg-canvas/40 border border-divider p-3">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">Plan</div>
                    <div class="text-ink">{{ tier }} tier · {{ billingPeriod }}{{ foundingPartner ? ' · founding partner' : '' }}</div>
                    <div class="text-[11px] text-ink-muted">
                      ${{ setupFee.toLocaleString() }} setup + ${{ monthlyRate.toLocaleString() }}/mo · year-one total ${{ totalYear1.toLocaleString() }}
                    </div>
                  </div>
                  <div class="rounded-lg bg-canvas/40 border border-divider p-3">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">Contacts ({{ contacts.length }})</div>
                    <ul class="space-y-1">
                      <li v-for="c in contacts" :key="c.email" class="text-[12px] text-ink">
                        <span class="font-semibold">{{ c.name }}</span>
                        <span class="text-ink-muted"> · {{ c.role }} · {{ c.email }}</span>
                        <span v-if="c.primary" class="text-brand font-semibold ml-1">(primary)</span>
                      </li>
                    </ul>
                  </div>
                  <div class="rounded-lg bg-canvas/40 border border-divider p-3">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">{{ personaName }}'s active roles ({{ enabledRoles.length }})</div>
                    <div class="text-[12px] text-ink-muted">
                      {{ enabledRoles.map((r) => ROLES_BY_PERSONA[personaType].find((rr) => rr.key === r)?.label).filter(Boolean).join(', ') || 'none yet' }}
                    </div>
                    <div class="text-[11px] text-ink-disabled mt-1">Languages: {{ languages.join(', ') }}</div>
                  </div>
                </div>
                <p class="text-[11px] text-ink-muted mt-4 italic">
                  Hitting "Activate" creates the customer record (status: onboarding) and stages everything for go-live. You'll send the welcome email separately.
                </p>
              </section>
            </template>
          </div>

          <!-- Footer -->
          <footer class="px-6 py-3 border-t border-divider bg-canvas/30 flex items-center justify-between flex-shrink-0">
            <button
              v-if="stepIdx > 0"
              type="button"
              class="rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand"
              @click="prev"
            >← Back</button>
            <span v-else class="text-[11px] text-ink-disabled">Step {{ stepIdx + 1 }} of {{ STEPS.length }}</span>

            <div class="flex items-center gap-2">
              <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink" @click="emit('close')">Cancel</button>
              <button
                v-if="stepIdx < STEPS.length - 1"
                type="button"
                class="rounded-md bg-brand text-white px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-40"
                :disabled="!stepValid"
                @click="next"
              >Next →</button>
              <button
                v-else
                type="button"
                class="rounded-md bg-success text-white px-4 py-1.5 text-xs font-semibold hover:opacity-90"
                @click="onActivate"
              >🎉 Activate customer</button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
