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
  onboarding_completed_at: string | null
  // Welcome email tracking (mig 0045) — written by customer-welcome-send
  welcome_sent_at: string | null
  welcome_email_subject: string | null
  welcome_email_body: string | null
  welcome_send_error: string | null
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
   *  Used when activation auto-send failed, or to manually re-trigger. */
  async function sendWelcome(id: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
    const { data, error: fnErr } = await supabase.functions.invoke('customer-welcome-send', {
      body: { customer_id: id, force: opts.force ?? false },
    })
    if (fnErr) return { ok: false, error: fnErr.message }
    const result = data as { ok?: boolean; error?: string } | null
    if (!result?.ok) return { ok: false, error: result?.error ?? 'Welcome send returned no ok' }
    await load()
    return { ok: true }
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
    sendWelcome,
  }
}
