<script setup lang="ts">
/**
 * Customer-facing Discovery Brief form.
 *
 * Public route /onboarding/discovery/:token. Customer arrives via the
 * email link the operator sent; we look up cs_customers by
 * discovery_brief_token. Form sections shown depend on persona_type
 * (Ada vs Grace).
 *
 * Anti-abuse: token is the auth. Submit writes to
 * discovery_brief_data + discovery_brief_returned_at, then disables
 * the form. Re-arriving with the same link after submit shows a "thank
 * you" state but no editing (operator must re-send a fresh link).
 */
import { onMounted, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

interface CustomerForBrief {
  id: string
  org_name: string
  persona_type: 'ada' | 'grace'
  contacts: Array<{ name: string; role: string; email: string }>
  discovery_brief_returned_at: string | null
  discovery_brief_data: Record<string, unknown> | null
}

const customer = ref<CustomerForBrief | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const submitting = ref(false)
const submitted = ref(false)

// ── Form state ────────────────────────────────────────────────────
// Shared across personas
const ownerTone = ref('')               // describe your voice/tone
const sampleEmail = ref('')             // paste a real email they've sent
const bannedTopics = ref('')            // what NOT to say
const customerFAQs = ref('')            // top 10 things customers ask

// Ada-specific
const serviceTypes = ref('')            // list of services
const serviceArea = ref('')             // ZIP codes / cities
const hoursOfOperation = ref('')
const idealCustomer = ref('')           // ICP description
const existingCrm = ref('')             // ServiceTitan / Housecall Pro / etc.
const adaRoles = ref<string[]>([])      // which roles to enable first

// Grace-specific
const congregationSize = ref('')
const ministriesActive = ref('')        // youth, worship, small groups, etc.
const visitorVolume = ref('')           // per week
const careTeamSize = ref('')
const existingChms = ref('')            // Planning Center / ChurchTrac / etc.
const graceRoles = ref<string[]>([])

const ADA_ROLE_OPTIONS = [
  { key: 'front_desk',       label: 'Front Desk (missed calls / form fills)' },
  { key: 'quote_followup',   label: 'Quote Follow-Up (chase un-responded quotes)' },
  { key: 'review_engine',    label: 'Review Engine (post-job review requests)' },
  { key: 'customer_health',  label: 'Customer Health (dormant-customer reactivation)' },
  { key: 'schedule',         label: 'Schedule Coordination (dispatch board)' },
  { key: 'email_marketing',  label: 'Email Marketing (campaigns to past customers)' },
  { key: 'performance',      label: 'Performance Reporting (daily/weekly metrics)' },
]

const GRACE_ROLE_OPTIONS = [
  { key: 'front_desk_guests', label: 'Front Desk & Guest Follow-Up' },
  { key: 'care_drift',        label: 'Care & Drift Detection' },
  { key: 'sundays_comms',     label: 'Sundays & Comms' },
  { key: 'giving',            label: 'Giving Trends' },
  { key: 'volunteers',        label: 'Volunteer Coordination' },
  { key: 'story_engine',      label: 'Story Engine (capture testimonies)' },
]

async function load() {
  if (!token.value) {
    error.value = 'Missing link token. Ask CommandSite to send a fresh link.'
    loading.value = false
    return
  }
  const { data, error: e } = await supabase
    .from('cs_customers')
    .select('id, org_name, persona_type, contacts, discovery_brief_returned_at, discovery_brief_data')
    .eq('discovery_brief_token', token.value)
    .maybeSingle()
  if (e) {
    error.value = `Could not load: ${e.message}`
  } else if (!data) {
    error.value = 'This link is invalid or expired. Ask CommandSite to send a fresh one.'
  } else {
    customer.value = data as unknown as CustomerForBrief
    submitted.value = !!customer.value.discovery_brief_returned_at
  }
  loading.value = false
}

async function submit() {
  if (!customer.value || submitting.value) return
  submitting.value = true
  error.value = null

  // Capture the answers per persona — extra blanks are harmless.
  const brief: Record<string, unknown> = {
    submitted_at: new Date().toISOString(),
    owner_tone: ownerTone.value.trim(),
    sample_email: sampleEmail.value.trim(),
    banned_topics: bannedTopics.value.trim(),
    customer_faqs: customerFAQs.value.trim(),
  }
  if (customer.value.persona_type === 'ada') {
    Object.assign(brief, {
      service_types: serviceTypes.value.trim(),
      service_area: serviceArea.value.trim(),
      hours_of_operation: hoursOfOperation.value.trim(),
      ideal_customer: idealCustomer.value.trim(),
      existing_crm: existingCrm.value.trim(),
      ada_roles: adaRoles.value,
    })
  } else {
    Object.assign(brief, {
      congregation_size: congregationSize.value.trim(),
      ministries_active: ministriesActive.value.trim(),
      visitor_volume: visitorVolume.value.trim(),
      care_team_size: careTeamSize.value.trim(),
      existing_chms: existingChms.value.trim(),
      grace_roles: graceRoles.value,
    })
  }

  const { error: e } = await supabase
    .from('cs_customers')
    .update({
      discovery_brief_data: brief,
      discovery_brief_returned_at: new Date().toISOString(),
    } as never)
    .eq('id', customer.value.id)

  submitting.value = false
  if (e) {
    error.value = `Submission failed: ${e.message}`
    return
  }
  submitted.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(load)

const personaName = computed(() => (customer.value?.persona_type === 'grace' ? 'Grace' : 'Ada'))
</script>

<template>
  <main class="min-h-screen bg-canvas">
    <div class="mx-auto max-w-3xl px-6 py-10">

      <!-- Loading -->
      <div v-if="loading" class="text-center text-sm text-ink-muted py-12">
        Loading…
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rounded-card border border-danger/30 bg-danger/5 px-5 py-4">
        <h1 class="text-base font-semibold text-danger mb-1">Link issue</h1>
        <p class="text-sm text-ink-muted">{{ error }}</p>
      </div>

      <!-- Submitted state -->
      <div v-else-if="submitted" class="rounded-card border border-success/30 bg-success/5 px-5 py-6 text-center">
        <h1 class="text-xl font-semibold text-ink mb-1">Thank you</h1>
        <p class="text-sm text-ink-muted">
          We got your discovery brief. CommandSite is reviewing it now. You'll hear back within 2 business days
          with next steps + a kickoff confirmation.
        </p>
      </div>

      <!-- Form -->
      <template v-else-if="customer">
        <!-- Header -->
        <header class="mb-8">
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-2">
            CommandSite · Discovery Brief
          </div>
          <h1 class="text-2xl font-semibold text-ink">Tell {{ personaName }} about {{ customer.org_name }}</h1>
          <p class="text-sm text-ink-muted mt-2 leading-relaxed">
            This is how we learn your voice, your services, and what {{ personaName }} should know about your work.
            Spend ~20 minutes on this. Plain language is fine — the more specific the better.
          </p>
        </header>

        <form class="space-y-8" @submit.prevent="submit">

          <!-- Shared section: Voice + tone -->
          <section class="card space-y-4">
            <h2 class="text-base font-semibold text-ink">Your voice</h2>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">How would you describe your tone?</span>
              <span class="text-[11px] text-ink-muted block mb-1.5">
                Plain-spoken? Warm and casual? Direct, no-nonsense? A specific phrase you say a lot?
              </span>
              <textarea
                v-model="ownerTone"
                rows="3"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: Warm and direct. I usually start with 'Hey,' and sign off with 'Talk soon.' Not corporate."
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">Paste a sample email you've sent</span>
              <span class="text-[11px] text-ink-muted block mb-1.5">
                A real one. To a customer or prospect. This is the gold for matching your voice.
              </span>
              <textarea
                v-model="sampleEmail"
                rows="6"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink font-mono"
                placeholder="Paste the email text here..."
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">What should {{ personaName }} NOT say?</span>
              <span class="text-[11px] text-ink-muted block mb-1.5">
                Competitors to never mention. Words/phrases that feel wrong for you. Topics off-limits.
              </span>
              <textarea
                v-model="bannedTopics"
                rows="3"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: Don't say 'reach out' or 'circle back.' Never mention [competitor]."
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">Top 10 questions customers ask you</span>
              <span class="text-[11px] text-ink-muted block mb-1.5">
                One per line. The questions you hear over and over.
              </span>
              <textarea
                v-model="customerFAQs"
                rows="6"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="What's your service area?\nDo you offer financing?\nHow soon can you come out?\n..."
              />
            </label>
          </section>

          <!-- Ada-specific section -->
          <section v-if="customer.persona_type === 'ada'" class="card space-y-4">
            <h2 class="text-base font-semibold text-ink">Your services</h2>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">What services do you offer?</span>
              <textarea
                v-model="serviceTypes"
                rows="3"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: AC repair, AC install, ductless mini-split, duct cleaning, maintenance plans"
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">Service area</span>
              <span class="text-[11px] text-ink-muted block mb-1.5">Cities, neighborhoods, or ZIP codes.</span>
              <input
                v-model="serviceArea"
                type="text"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: Miami-Dade County: ZIPs 33125, 33133..."
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">Hours of operation</span>
              <input
                v-model="hoursOfOperation"
                type="text"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: Mon-Fri 7a-7p · Sat 8a-2p · Emergency 24/7"
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">Who's your ideal customer?</span>
              <textarea
                v-model="idealCustomer"
                rows="3"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: Homeowners 40+, household income $80k+, in 33xxx ZIP codes, projects $2k+..."
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">What CRM/dispatch software do you use today?</span>
              <input
                v-model="existingCrm"
                type="text"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: ServiceTitan / Housecall Pro / Jobber / spreadsheet / nothing"
              />
            </label>

            <div>
              <span class="text-xs font-semibold text-ink mb-1 block">Which Ada roles do you want first?</span>
              <span class="text-[11px] text-ink-muted block mb-2">
                Pick the 2-4 most painful. The rest can come in month 2.
              </span>
              <label
                v-for="role in ADA_ROLE_OPTIONS"
                :key="role.key"
                class="flex items-start gap-2 mb-1.5 cursor-pointer"
              >
                <input
                  v-model="adaRoles"
                  type="checkbox"
                  :value="role.key"
                  class="mt-1 accent-brand"
                />
                <span class="text-sm text-ink">{{ role.label }}</span>
              </label>
            </div>
          </section>

          <!-- Grace-specific section -->
          <section v-if="customer.persona_type === 'grace'" class="card space-y-4">
            <h2 class="text-base font-semibold text-ink">Your ministry</h2>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">Approximate weekly attendance?</span>
              <input
                v-model="congregationSize"
                type="text"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: ~250 across two services"
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">Active ministries</span>
              <textarea
                v-model="ministriesActive"
                rows="3"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: Sunday worship, youth ministry, small groups, missions team, kids ministry"
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">First-time visitors per week (rough average)</span>
              <input
                v-model="visitorVolume"
                type="text"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: 5-10 typical weeks, 20+ on Easter / Christmas"
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">Care team size + structure</span>
              <textarea
                v-model="careTeamSize"
                rows="2"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: 2 pastoral staff + 8 lay volunteers; small-group leaders also help with care"
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-ink mb-1 block">What ChMS / systems do you use today?</span>
              <input
                v-model="existingChms"
                type="text"
                class="w-full rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm text-ink"
                placeholder="Example: Planning Center, MailChimp, Tithe.ly, Slack..."
              />
            </label>

            <div>
              <span class="text-xs font-semibold text-ink mb-1 block">Which Grace roles do you want first?</span>
              <span class="text-[11px] text-ink-muted block mb-2">
                Pick the 2-3 most pressing.
              </span>
              <label
                v-for="role in GRACE_ROLE_OPTIONS"
                :key="role.key"
                class="flex items-start gap-2 mb-1.5 cursor-pointer"
              >
                <input
                  v-model="graceRoles"
                  type="checkbox"
                  :value="role.key"
                  class="mt-1 accent-brand"
                />
                <span class="text-sm text-ink">{{ role.label }}</span>
              </label>
            </div>
          </section>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-3 pt-3">
            <p v-if="error" class="text-sm text-danger flex-1">{{ error }}</p>
            <button
              type="submit"
              class="rounded-md bg-brand text-ink-inverse px-5 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-[opacity,transform] duration-150 ease-out active:scale-[0.97]"
              :disabled="submitting"
            >
              {{ submitting ? 'Submitting…' : 'Submit discovery brief' }}
            </button>
          </div>
        </form>
      </template>
    </div>
  </main>
</template>
