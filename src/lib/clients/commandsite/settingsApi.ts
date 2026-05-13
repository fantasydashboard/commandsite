/**
 * CommandSite Settings data layer.
 *
 * Wraps the singleton `cs_settings` row in Supabase. Falls back to
 * sensible defaults if the row doesn't exist yet (e.g. migration not run)
 * so the UI is always functional.
 */
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import type { CsSettings } from '@/types/database'

const DEFAULTS: CsSettings = {
  id: 1,
  founder_name: 'Josh',
  founder_email: null,
  email_signature: null,
  calendly_link: null,
  product_demo_link: null,
  pricing_page_link: null,
  icp_description: '4-25 person home-services owner-operators in the US Sun Belt + Southeast.',
  icp_industries: ['HVAC','Plumbing','Electrical','Landscaping','Roofing','Pool service','Pest control','Cleaning'],
  icp_team_size_min: 4,
  icp_team_size_max: 25,
  icp_team_size_unit: 'techs',
  icp_geos: ['US (Sun Belt + Southeast preferred)'],
  icp_disqualifiers: [
    'Solo operator (1 person — too small for our pricing)',
    'Already has a full-time office manager + dedicated CSM tool (less wedge)',
    'Franchise location with no decision authority over software',
    'Trade companies under $200k annual revenue',
  ],
  ai_voice_prompt_guide: 'You are Josh, the solo founder of CommandSite — a vertical SaaS for home-services businesses. Write in first person, warm and direct, never corporate.',
  ai_voice_signature_phrases: ['— Josh', 'Founder DMs you back'],
  ai_voice_do_say: ['Genuinely', 'Fair pushback', 'No pressure'],
  ai_voice_dont_say: ['Synergy', 'Best-in-class', 'Game-changer'],
  reply_classifier_auto_threshold: 0.90,
  pipeline_promote_threshold: 0.90,
  social_engager_icp_threshold: 80,
  outreach_auto_approve: false,
  outreach_auto_draft_min_score: 65,
  gmail_refresh_token: null,
  gmail_account_email: null,
  gmail_connected_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export function useSettings() {
  const settings = ref<CsSettings>({ ...DEFAULTS })
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const usingDefaults = ref(false)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: e } = await supabase
      .from('cs_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (e) {
      error.value = e.message
      usingDefaults.value = true
    } else if (!data) {
      usingDefaults.value = true
    } else {
      usingDefaults.value = false
      settings.value = data as CsSettings
    }
    loading.value = false
  }

  async function save(patch: Partial<CsSettings>) {
    saving.value = true
    error.value = null
    // Optimistic local update so the form feels snappy
    settings.value = { ...settings.value, ...patch }
    // Strip id/timestamp fields — those are managed server-side
    const { id: _omitId, created_at: _omitCreated, updated_at: _omitUpdated, ...updateFields } = patch
    void _omitId; void _omitCreated; void _omitUpdated
    const { error: e } = await supabase
      .from('cs_settings')
      .update(updateFields)
      .eq('id', 1)
    if (e) error.value = e.message
    else usingDefaults.value = false
    saving.value = false
    await load()
  }

  onMounted(load)

  return { settings, loading, saving, error, usingDefaults, load, save }
}

/** Where a vendor (Smartlead / Calendly / Stripe) should POST webhooks.
 *  Wired up in Phases 4-7 — shown read-only here so you have the URLs
 *  ready to paste into the vendor dashboard when you're ready. */
export interface WebhookEndpointSpec {
  label: string
  description: string
  /** Final URL once the edge function is deployed.
   *  Domain is derived from the current host so it works in dev + prod. */
  pathSuffix: string
  /** Phase that wires it up */
  status: 'live' | 'phase_3' | 'phase_4' | 'phase_5' | 'phase_6' | 'phase_7'
  /** Vendor where you paste this URL */
  vendor: string
}

export const webhookSpecs: WebhookEndpointSpec[] = [
  {
    label: 'Smartlead reply webhook',
    description: 'POST every inbound reply here. Edge function classifies + auto-promotes to pipeline.',
    pathSuffix: '/functions/v1/smartlead-reply',
    status: 'phase_4',
    vendor: 'Smartlead → Webhooks → Reply event',
  },
  {
    label: 'Calendly booking webhook',
    description: 'POST when a prospect books a demo. Updates pipeline stage to Demo Booked + schedules 2h reminder.',
    pathSuffix: '/functions/v1/calendly-booked',
    status: 'phase_6',
    vendor: 'Calendly → Webhooks → invitee.created',
  },
  {
    label: 'Stripe subscription webhook',
    description: 'POST on subscription.created/updated/payment_failed. Creates customer record + dunning.',
    pathSuffix: '/functions/v1/stripe-events',
    status: 'phase_7',
    vendor: 'Stripe → Developers → Webhooks',
  },
]

/** Compose the full webhook URL using the current Supabase project URL.
 *  We expose the Supabase project URL in env at build time. */
export function fullWebhookUrl(spec: WebhookEndpointSpec): string {
  const base = (import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co').replace(/\/$/, '')
  return base + spec.pathSuffix
}
