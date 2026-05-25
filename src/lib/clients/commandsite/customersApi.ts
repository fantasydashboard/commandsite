/**
 * CommandSite Customers — signed paying customers (real, not demos).
 *
 * Reads cs_customers. Creates new ones via the onboarding wizard.
 * The wizard hands off the deal_id + lead_id when promoting a closed
 * deal so we keep the lineage. Edits via updateCustomer.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

export type PersonaType = 'ada' | 'grace'
export type CustomerStatus = 'onboarding' | 'active' | 'paused' | 'churned'
export type BillingPeriod = 'monthly' | 'annual'

// Kanban pipeline stages for status='onboarding' customers. Ordered.
// (mig 0062)
export type OnboardingStage =
  | 'signed'        // verbal yes, awaiting payment
  | 'paid'          // Stripe webhook received, ready for kickoff call
  | 'discovery'     // kickoff done, persona interviewing them
  | 'provisioned'   // tenant + theme + modules + OAuth done
  | 'shadow'        // persona drafting only, staff reviewing
  | 'live'          // drafts auto-sending, verifying for ~2 weeks

export const ONBOARDING_STAGES: OnboardingStage[] = [
  'signed', 'paid', 'discovery', 'provisioned', 'shadow', 'live',
]

export const STAGE_META: Record<OnboardingStage, { label: string; description: string }> = {
  signed:      { label: 'Signed',      description: 'Verbal yes, contract / first email out, awaiting payment' },
  paid:        { label: 'Paid',        description: 'Payment received. Ready for kickoff call' },
  discovery:   { label: 'Discovery',   description: 'Persona interviewing them — services, ministries, staff, pain' },
  provisioned: { label: 'Provisioned', description: 'Tenant, theme, modules, OAuth — technical setup complete' },
  shadow:      { label: 'Shadow',      description: 'Drafting only — staff reviews everything before send' },
  live:        { label: 'Live',        description: 'Drafts auto-sending. Watching for ~2 weeks before "Active"' },
}

export interface CustomerContact {
  name: string
  role: string
  email: string
  phone: string
  primary: boolean
}

export interface Customer {
  id: string
  deal_id: string | null
  lead_id: string | null
  org_name: string
  slug: string
  persona_type: PersonaType
  industry: string | null
  city: string | null
  state: string | null
  timezone: string

  tier: string
  founding_partner: boolean
  billing_period: BillingPeriod
  setup_fee_cents: number
  monthly_rate_cents: number
  year1_cost_cents: number | null
  signed_at: string | null
  billing_start_at: string | null
  founding_lock_until: string | null
  status: CustomerStatus

  primary_color: string | null
  wordmark_text: string | null
  logo_url: string | null

  contacts: CustomerContact[]

  enabled_roles: string[]
  languages: string[]
  persona_name_override: string | null
  greeting_override: string | null

  planning_center_org_id: string | null
  twilio_phone_number: string | null
  google_business_profile_id: string | null
  integrations: Record<string, unknown>

  onboarding_step: number
  onboarding_stage: OnboardingStage | null
  stage_entered_at: string | null
  last_customer_action_at: string | null
  onboarding_completed_at: string | null
  // Welcome email tracking (mig 0045) — written by customer-welcome-send
  welcome_sent_at: string | null
  welcome_email_subject: string | null
  welcome_email_body: string | null
  welcome_send_error: string | null
  // Contract tracking (mig 0073) — per-stage signoff data
  contract_status: 'pending' | 'sent' | 'signed' | 'rejected'
  contract_sent_at: string | null
  contract_signed_at: string | null
  contract_url: string | null
  contract_template_version: string | null
  // Payment tracking (mig 0073) — Stripe webhook will fill these eventually
  payment_received_at: string | null
  payment_method: 'stripe' | 'invoice' | 'wire' | 'check' | 'other' | null
  payment_reference: string | null
  // Kickoff call tracking (mig 0073)
  kickoff_call_scheduled_at: string | null
  kickoff_call_completed_at: string | null
  kickoff_call_calendly_url: string | null
  // Discovery brief (mig 0073) — token gates the public form URL
  discovery_brief_token: string | null
  discovery_brief_sent_at: string | null
  discovery_brief_returned_at: string | null
  discovery_brief_data: Record<string, unknown> | null
  // Provisioning + shadow + live (mig 0073)
  voice_profile_built_at: string | null
  tenant_provisioned_at: string | null
  shadow_started_at: string | null
  shadow_drafts_approved_count: number
  shadow_drafts_total_count: number
  live_started_at: string | null
  notes: string | null

  created_at: string
  updated_at: string
}

export type CustomerInsert = Omit<Customer, 'id' | 'created_at' | 'updated_at'>
export type CustomerUpdate = Partial<CustomerInsert>

/** Slugify a free-form org name. "Focal Point Church" → "focal-point-church" */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'customer'
}

export function useCustomers() {
  const customers = ref<Customer[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: e } = await supabase
      .from('cs_customers')
      .select('*')
      .order('created_at', { ascending: false })
    if (e) error.value = e.message
    else customers.value = (data ?? []) as unknown as Customer[]
    loading.value = false
  }

  async function createCustomer(input: CustomerInsert): Promise<{ ok: boolean; id?: string; error?: string }> {
    // Make sure the slug is unique — bump with a numeric suffix if needed
    let slug = input.slug
    let attempt = 0
    while (attempt < 10) {
      const { data: clash } = await supabase
        .from('cs_customers').select('id').eq('slug', slug).maybeSingle()
      if (!clash) break
      attempt++
      slug = `${input.slug}-${attempt + 1}`
    }
    const payload = { ...input, slug }
    const { data, error: e } = await supabase
      .from('cs_customers').insert(payload as never).select('id').single()
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true, id: (data as { id: string }).id }
  }

  async function updateCustomer(id: string, fields: CustomerUpdate): Promise<{ ok: boolean; error?: string }> {
    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === 'string' && v.trim() === '') payload[k] = null
      else payload[k] = v
    }
    const { error: e } = await supabase
      .from('cs_customers').update(payload as never).eq('id', id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  async function deleteCustomer(id: string): Promise<{ ok: boolean; error?: string }> {
    const { error: e } = await supabase.from('cs_customers').delete().eq('id', id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  /** Mark onboarding complete and flip status to 'active'.
   *  Also fires the customer-welcome-send edge function so the new
   *  customer gets a persona-aware first-touch email automatically.
   *  Welcome failures don't block activation — they're recorded on
   *  cs_customers.welcome_send_error so Josh can retry from the UI. */
  async function activateCustomer(id: string): Promise<{ ok: boolean; error?: string; welcome_warning?: string }> {
    const { error: e } = await supabase
      .from('cs_customers')
      .update({
        status: 'active',
        onboarding_completed_at: new Date().toISOString(),
      } as never)
      .eq('id', id)
    if (e) return { ok: false, error: e.message }

    // Fire the welcome — fail soft so a transient send error doesn't
    // make the activation look broken.
    let welcomeWarning: string | undefined
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('customer-welcome-send', {
        body: { customer_id: id },
      })
      if (fnErr) welcomeWarning = `Welcome send failed: ${fnErr.message}`
      else {
        const result = data as { ok?: boolean; error?: string } | null
        if (!result?.ok) welcomeWarning = result?.error ?? 'Welcome send returned no ok'
      }
    } catch (err) {
      welcomeWarning = err instanceof Error ? err.message : 'Welcome send threw'
    }

    await load()
    return { ok: true, welcome_warning: welcomeWarning }
  }

  /** Re-send (or first-send) the welcome email for an existing customer.
   *  Used when activation auto-send failed, or to manually re-trigger.
   *
   *  Error surfacing: supabase.functions.invoke wraps any non-2xx
   *  response in a generic "non-2xx status code" message and stashes
   *  the actual Response on err.context. We unwrap that to surface the
   *  real reason (missing env var, missing Gmail token, etc.) instead
   *  of the useless wrapper text. */
  async function sendWelcome(id: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
    const { data, error: fnErr } = await supabase.functions.invoke('customer-welcome-send', {
      body: { customer_id: id, force: opts.force ?? false },
    })
    if (fnErr) {
      // Extract the real error body from the Response stashed on context.
      // Falls back to fnErr.message if the body isn't readable JSON.
      const ctx = (fnErr as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = await ctx.json() as { error?: string }
          return { ok: false, error: body.error ?? `${ctx.status} ${fnErr.message}` }
        } catch {
          try {
            const text = await ctx.text()
            return { ok: false, error: text || fnErr.message }
          } catch {
            return { ok: false, error: fnErr.message }
          }
        }
      }
      return { ok: false, error: fnErr.message }
    }
    const result = data as { ok?: boolean; error?: string } | null
    if (!result?.ok) return { ok: false, error: result?.error ?? 'Welcome send returned no ok' }
    await load()
    return { ok: true }
  }

  /** Advance a customer to the next onboarding stage. If they're at the
   *  final ('live') stage, calling this flips status to 'active' and fires
   *  the welcome email (same path as activateCustomer). */
  async function advanceStage(id: string): Promise<{ ok: boolean; error?: string; activated?: boolean }> {
    const customer = customers.value.find((c) => c.id === id)
    if (!customer) return { ok: false, error: 'Customer not found in local cache' }
    const current = customer.onboarding_stage
    const idx = current ? ONBOARDING_STAGES.indexOf(current) : -1
    const next = idx >= 0 && idx < ONBOARDING_STAGES.length - 1
      ? ONBOARDING_STAGES[idx + 1]
      : null

    if (next === null) {
      // From 'live' → activate
      const res = await activateCustomer(id)
      if (!res.ok) return { ok: false, error: res.error }
      // Clear the stage now that they're active
      await supabase
        .from('cs_customers')
        .update({ onboarding_stage: null } as never)
        .eq('id', id)
      await load()
      return { ok: true, activated: true }
    }

    const { error: e } = await supabase
      .from('cs_customers')
      .update({
        onboarding_stage: next,
        stage_entered_at: new Date().toISOString(),
      } as never)
      .eq('id', id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  /** Move a customer back one stage. Useful if discovery stalled and you
   *  want to send them back to 'paid' for a re-kickoff, etc. */
  async function revertStage(id: string): Promise<{ ok: boolean; error?: string }> {
    const customer = customers.value.find((c) => c.id === id)
    if (!customer || !customer.onboarding_stage) {
      return { ok: false, error: 'No stage to revert' }
    }
    const idx = ONBOARDING_STAGES.indexOf(customer.onboarding_stage)
    if (idx <= 0) return { ok: false, error: 'Already at first stage' }
    const prev = ONBOARDING_STAGES[idx - 1]
    const { error: e } = await supabase
      .from('cs_customers')
      .update({
        onboarding_stage: prev,
        stage_entered_at: new Date().toISOString(),
      } as never)
      .eq('id', id)
    if (e) return { ok: false, error: e.message }
    await load()
    return { ok: true }
  }

  // ── Onboarding task actions ──────────────────────────────────────
  // One-shot updates the Onboarding Drawer fires when the operator
  // marks a step done. Each sets the relevant timestamp + (where
  // applicable) the status enum. update() handles the reload.

  async function markContractSent(id: string, url?: string): Promise<{ ok: boolean; error?: string }> {
    return updateCustomer(id, {
      contract_status: 'sent',
      contract_sent_at: new Date().toISOString(),
      ...(url ? { contract_url: url } : {}),
    } as never)
  }

  async function markContractSigned(id: string, url?: string): Promise<{ ok: boolean; error?: string }> {
    return updateCustomer(id, {
      contract_status: 'signed',
      contract_signed_at: new Date().toISOString(),
      ...(url ? { contract_url: url } : {}),
    } as never)
  }

  async function markPaymentReceived(
    id: string,
    method: 'stripe' | 'invoice' | 'wire' | 'check' | 'other',
    reference?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    return updateCustomer(id, {
      payment_received_at: new Date().toISOString(),
      payment_method: method,
      ...(reference ? { payment_reference: reference } : {}),
    } as never)
  }

  async function scheduleKickoff(id: string, when: string): Promise<{ ok: boolean; error?: string }> {
    return updateCustomer(id, {
      kickoff_call_scheduled_at: when,
    } as never)
  }

  async function markKickoffComplete(id: string): Promise<{ ok: boolean; error?: string }> {
    return updateCustomer(id, {
      kickoff_call_completed_at: new Date().toISOString(),
    } as never)
  }

  /** Generate a random token + write it. The discovery brief URL is
   *  /onboarding/discovery/:token; we use a random slug instead of the
   *  customer id so it's unguessable + revocable (clear the token to
   *  invalidate the link). */
  async function sendDiscoveryBrief(id: string): Promise<{ ok: boolean; token?: string; error?: string }> {
    // 16-char base36 token — ~83 bits of entropy, plenty for a single-use form
    const token = Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 36).toString(36),
    ).join('')
    const res = await updateCustomer(id, {
      discovery_brief_token: token,
      discovery_brief_sent_at: new Date().toISOString(),
    } as never)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, token }
  }

  async function markVoiceProfileBuilt(id: string): Promise<{ ok: boolean; error?: string }> {
    return updateCustomer(id, {
      voice_profile_built_at: new Date().toISOString(),
    } as never)
  }

  async function markTenantProvisioned(id: string): Promise<{ ok: boolean; error?: string }> {
    return updateCustomer(id, {
      tenant_provisioned_at: new Date().toISOString(),
    } as never)
  }

  async function startShadowMode(id: string): Promise<{ ok: boolean; error?: string }> {
    return updateCustomer(id, {
      shadow_started_at: new Date().toISOString(),
    } as never)
  }

  async function startLiveMode(id: string): Promise<{ ok: boolean; error?: string }> {
    return updateCustomer(id, {
      live_started_at: new Date().toISOString(),
    } as never)
  }

  const activeCustomers = computed(() => customers.value.filter((c) => c.status === 'active'))
  const onboardingCustomers = computed(() => customers.value.filter((c) => c.status === 'onboarding'))

  onMounted(load)

  return {
    customers,
    activeCustomers,
    onboardingCustomers,
    loading,
    error,
    load,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    activateCustomer,
    advanceStage,
    revertStage,
    sendWelcome,
    // Onboarding task actions
    markContractSent,
    markContractSigned,
    markPaymentReceived,
    scheduleKickoff,
    markKickoffComplete,
    sendDiscoveryBrief,
    markVoiceProfileBuilt,
    markTenantProvisioned,
    startShadowMode,
    startLiveMode,
  }
}

/** Format cents as a USD string. */
export function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

/** Days between an ISO timestamp and now (clamped to ≥0). */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

/** Lifetime revenue earned from this customer (monthly_rate × months active). */
export function lifetimeCents(customer: Customer): number {
  if (!customer.billing_start_at) return customer.setup_fee_cents ?? 0
  const startMs = new Date(customer.billing_start_at).getTime()
  const elapsedMonths = (Date.now() - startMs) / (1000 * 60 * 60 * 24 * 30.4375)
  const months = Math.max(0, elapsedMonths)
  return Math.round((customer.monthly_rate_cents ?? 0) * months + (customer.setup_fee_cents ?? 0))
}

/** Health pill verdict — drives the colored badge in the active table.
 *  Heuristic: based on welcome delivery, days since onboarding completion,
 *  and last_customer_action_at if present. Replace with richer logic as
 *  per-customer telemetry lands. */
export type HealthStatus = 'healthy' | 'watch' | 'at_risk' | 'new'
export function healthStatus(customer: Customer): HealthStatus {
  if (customer.status !== 'active') return 'new'
  const daysSinceActivation = daysSince(customer.onboarding_completed_at)
  if (daysSinceActivation < 14) return 'new'
  if (customer.welcome_send_error) return 'at_risk'
  const daysSinceAction = customer.last_customer_action_at
    ? daysSince(customer.last_customer_action_at)
    : 999
  if (daysSinceAction <= 3) return 'healthy'
  if (daysSinceAction <= 14) return 'watch'
  return 'at_risk'
}
