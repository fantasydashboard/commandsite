/**
 * CommandSite Leads data layer.
 *
 * Wraps cs_leads. Includes the local ICP scorer that grades each row
 * against the current cs_settings ICP definition, plus bulk import,
 * status updates, and the "promote to pipeline" action that creates
 * the corresponding cs_deals row.
 *
 * Falls back to fixture data if the migration hasn't run yet so the
 * UI is always functional.
 */
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import type { CsLead, CsLeadInsert, CsLeadStatus, CsSettings } from '@/types/database'
import type { CreateDealInput } from './dealsApi'

const FIXTURE_BATCH_ID = 'fixture-batch-0001'

const FIXTURE_LEADS: CsLead[] = [
  {
    id: 'fix-1', source: 'apollo_csv',
    imported_batch_id: FIXTURE_BATCH_ID,
    imported_batch_label: 'Apollo · HVAC Sun Belt · 2026-04',
    company_name: 'Pinnacle Heating & Air',
    contact_name: 'Travis Reeves', contact_email: 'travis@pinnacle-air.com',
    contact_title: 'Owner', contact_phone: '+1-512-555-2188',
    linkedin_url: 'https://linkedin.com/in/travisreeves', company_url: 'pinnacle-air.com',
    industry: 'HVAC', city: 'Austin', state: 'TX', country: 'US',
    team_size: 8, annual_revenue_estimate: 2_400_000,
    icp_score: 92, icp_score_reason: 'Sweet-spot industry, sweet-spot size, sweet-spot geo',
    status: 'new', notes: null, tags: [], promoted_deal_id: null,
    google_maps_place_id: null,
    google_maps_enriched_at: null,
    review_excerpts: null,
    website_extract: null,
    draft_cold_email_subject: null,
    draft_cold_email_body: null,
    draft_cold_email_rationale: null,
    draft_cold_email_signal: null,
    draft_cold_email_at: null,
    draft_cold_email_model: null,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 'fix-2', source: 'apollo_csv',
    imported_batch_id: FIXTURE_BATCH_ID,
    imported_batch_label: 'Apollo · HVAC Sun Belt · 2026-04',
    company_name: 'Sunshine Plumbing Co.',
    contact_name: 'Maria Castillo', contact_email: 'maria@sunshineplumbing.co',
    contact_title: 'GM', contact_phone: '+1-407-555-9921',
    linkedin_url: 'https://linkedin.com/in/mariacastillo', company_url: 'sunshineplumbing.co',
    industry: 'Plumbing', city: 'Orlando', state: 'FL', country: 'US',
    team_size: 12, annual_revenue_estimate: 3_800_000,
    icp_score: 88, icp_score_reason: 'In-ICP industry + size + geo',
    status: 'queued', notes: null, tags: ['ad campaign reply'],
    promoted_deal_id: null,
    google_maps_place_id: null,
    google_maps_enriched_at: null,
    review_excerpts: null,
    website_extract: null,
    draft_cold_email_subject: null,
    draft_cold_email_body: null,
    draft_cold_email_rationale: null,
    draft_cold_email_signal: null,
    draft_cold_email_at: null,
    draft_cold_email_model: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    id: 'fix-3', source: 'apollo_csv',
    imported_batch_id: FIXTURE_BATCH_ID,
    imported_batch_label: 'Apollo · HVAC Sun Belt · 2026-04',
    company_name: 'BigCo National Plumbing',
    contact_name: 'Derrick Powell', contact_email: 'derrick@bignationalplumbing.com',
    contact_title: 'Operations Director', contact_phone: null,
    linkedin_url: null, company_url: 'bignationalplumbing.com',
    industry: 'Plumbing', city: 'Dallas', state: 'TX', country: 'US',
    team_size: 220, annual_revenue_estimate: 48_000_000,
    icp_score: 22, icp_score_reason: 'Way too big — outside team-size ICP (220 vs 4-25)',
    status: 'disqualified', notes: 'Above ICP size cap', tags: [],
    promoted_deal_id: null,
    google_maps_place_id: null,
    google_maps_enriched_at: null,
    review_excerpts: null,
    website_extract: null,
    draft_cold_email_subject: null,
    draft_cold_email_body: null,
    draft_cold_email_rationale: null,
    draft_cold_email_signal: null,
    draft_cold_email_at: null,
    draft_cold_email_model: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    id: 'fix-4', source: 'manual_entry',
    imported_batch_id: null, imported_batch_label: null,
    company_name: 'BlueRidge Roofing',
    contact_name: 'Wesley Tate', contact_email: 'wesley@blueridge-roof.com',
    contact_title: 'Owner', contact_phone: '+1-704-555-1041',
    linkedin_url: 'https://linkedin.com/in/wesleytate', company_url: 'blueridge-roof.com',
    industry: 'Roofing', city: 'Charlotte', state: 'NC', country: 'US',
    team_size: 6, annual_revenue_estimate: 1_400_000,
    icp_score: 85, icp_score_reason: 'In-ICP industry, perfect size, in-ICP geo',
    status: 'contacted', notes: 'Met at trade show. Sent first email yesterday.',
    tags: ['warm', 'trade show'],
    promoted_deal_id: null,
    google_maps_place_id: null,
    google_maps_enriched_at: null,
    review_excerpts: null,
    website_extract: null,
    draft_cold_email_subject: null,
    draft_cold_email_body: null,
    draft_cold_email_rationale: null,
    draft_cold_email_signal: null,
    draft_cold_email_at: null,
    draft_cold_email_model: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
  },
  {
    id: 'fix-5', source: 'social_engager',
    imported_batch_id: null, imported_batch_label: null,
    company_name: 'Coastal Pool Service',
    contact_name: 'Jessica Lin', contact_email: null,
    contact_title: 'Owner', contact_phone: null,
    linkedin_url: 'https://linkedin.com/in/jessicalin', company_url: 'coastalpoolsvc.com',
    industry: 'Pool service', city: 'San Diego', state: 'CA', country: 'US',
    team_size: 5, annual_revenue_estimate: 900_000,
    icp_score: 78, icp_score_reason: 'In-ICP industry + size; CA outside Sun Belt preference (-)',
    status: 'new', notes: 'Engaged on 3 Reddit posts about scheduling tools',
    tags: ['reddit'],
    promoted_deal_id: null,
    google_maps_place_id: null,
    google_maps_enriched_at: null,
    review_excerpts: null,
    website_extract: null,
    draft_cold_email_subject: null,
    draft_cold_email_body: null,
    draft_cold_email_rationale: null,
    draft_cold_email_signal: null,
    draft_cold_email_at: null,
    draft_cold_email_model: null,
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
]

// ── ICP Scorer ───────────────────────────────────────────────────────────
//
// Local heuristic. Outputs (score 0-100, reason text). Lives in JS so the
// UI can re-score on import without a server roundtrip. Phase 4+ may
// replace with an LLM call for nuanced scoring.

export function scoreLead(
  lead: Pick<CsLead, 'industry' | 'team_size' | 'state' | 'country'>,
  settings: CsSettings,
): { score: number; reason: string } {
  const reasons: string[] = []
  let score = 50  // Start from neutral

  // Industry match
  if (lead.industry && settings.icp_industries.length > 0) {
    const match = settings.icp_industries.some(
      (i) => i.toLowerCase() === lead.industry?.toLowerCase(),
    )
    if (match) {
      score += 25
      reasons.push('in-ICP industry')
    } else {
      score -= 20
      reasons.push(`industry "${lead.industry}" not in ICP list`)
    }
  }

  // Team size match
  if (lead.team_size != null) {
    const min = settings.icp_team_size_min ?? 0
    const max = settings.icp_team_size_max ?? 999_999
    if (lead.team_size >= min && lead.team_size <= max) {
      score += 20
      reasons.push('in-ICP size')
    } else if (lead.team_size < min) {
      score -= 25
      reasons.push(`too small (${lead.team_size} < ${min})`)
    } else {
      score -= 30
      reasons.push(`too big (${lead.team_size} > ${max})`)
    }
  }

  // Geo match (loose — checks if any geo string mentions the lead's state or country)
  if (lead.state && settings.icp_geos.length > 0) {
    const geoBlob = settings.icp_geos.join(' ').toLowerCase()
    const stateLower = lead.state.toLowerCase()
    // Sun Belt + Southeast common abbreviations — loose check
    const sunBeltStates = ['fl', 'ga', 'sc', 'nc', 'tn', 'al', 'ms', 'la', 'tx', 'az', 'nm']
    const isSunBelt = sunBeltStates.includes(stateLower)
    if (geoBlob.includes('sun belt') || geoBlob.includes('southeast')) {
      if (isSunBelt) {
        score += 5
        reasons.push('in-preference geo')
      } else {
        score -= 5
        reasons.push(`${lead.state.toUpperCase()} outside preferred geo`)
      }
    }
  }

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score))

  return {
    score,
    reason: reasons.length ? reasons.join(' · ') : 'Default neutral score',
  }
}

// ── Composable ───────────────────────────────────────────────────────────

export function useLeads() {
  const leads = ref<CsLead[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const usingFixture = ref(false)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: e } = await supabase
      .from('cs_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (e) {
      // Real DB error — usually means migration hasn't run yet. Fall back
      // to fixture data so the demo UI is still functional.
      error.value = e.message
      leads.value = FIXTURE_LEADS
      usingFixture.value = true
    } else {
      // Empty array != missing table. If the user has no leads yet, show
      // the real (empty) state so the import flow actually works. Loading
      // fixtures here was the bug that made imports silently no-op via
      // handleImported's `if (usingFixture.value)` short-circuit.
      leads.value = (data ?? []) as CsLead[]
      usingFixture.value = false
    }
    loading.value = false
  }

  /** Bulk insert. Caller has already scored them locally. Returns the
   *  IDs of the actually-inserted rows so the caller can immediately
   *  pipeline them into enrichment without a roundtrip. */
  async function importLeads(rows: CsLeadInsert[]): Promise<{ inserted: number; failed: number; insertedIds: string[] }> {
    if (!rows.length) return { inserted: 0, failed: 0, insertedIds: [] }
    const { data, error: e } = await supabase
      .from('cs_leads')
      .insert(rows)
      .select('id')
    if (e) {
      error.value = e.message
      return { inserted: 0, failed: rows.length, insertedIds: [] }
    }
    const insertedIds = ((data ?? []) as { id: string }[]).map((r) => r.id)
    await load()
    return {
      inserted: insertedIds.length,
      failed: rows.length - insertedIds.length,
      insertedIds,
    }
  }

  async function updateStatus(id: string, status: CsLeadStatus) {
    // Optimistic local update
    const idx = leads.value.findIndex((l) => l.id === id)
    if (idx >= 0) leads.value[idx] = { ...leads.value[idx], status }
    if (usingFixture.value) return
    const { error: e } = await supabase.from('cs_leads').update({ status }).eq('id', id)
    if (e) error.value = e.message
  }

  async function archive(id: string) { await updateStatus(id, 'archived') }
  async function disqualify(id: string) { await updateStatus(id, 'disqualified') }
  async function requeue(id: string) { await updateStatus(id, 'new') }

  /** Update a draft cold email's subject + body in place. */
  async function updateDraftEmail(id: string, subject: string, body: string): Promise<void> {
    const idx = leads.value.findIndex((l) => l.id === id)
    if (idx >= 0) {
      leads.value[idx] = {
        ...leads.value[idx],
        draft_cold_email_subject: subject,
        draft_cold_email_body: body,
      }
    }
    if (usingFixture.value) return
    const { error: e } = await supabase
      .from('cs_leads')
      .update({ draft_cold_email_subject: subject, draft_cold_email_body: body })
      .eq('id', id)
    if (e) error.value = e.message
  }

  /** Tag the draft as approved. Sending happens elsewhere. */
  async function approveDraft(id: string): Promise<void> {
    const lead = leads.value.find((l) => l.id === id)
    if (!lead) return
    const tags = [...new Set([...(lead.tags ?? []), 'cold_email_approved'])]
    const idx = leads.value.findIndex((l) => l.id === id)
    if (idx >= 0) leads.value[idx] = { ...leads.value[idx], tags }
    if (usingFixture.value) return
    const { error: e } = await supabase.from('cs_leads').update({ tags }).eq('id', id)
    if (e) error.value = e.message
  }

  /** Clear a draft. Strips draft_cold_email_* + the cold_email_drafted
   *  tag, leaving the lead itself intact. */
  async function discardDraft(id: string): Promise<void> {
    const lead = leads.value.find((l) => l.id === id)
    if (!lead) return
    const tags = (lead.tags ?? []).filter(
      (t) => t !== 'cold_email_drafted' && t !== 'cold_email_approved',
    )
    const idx = leads.value.findIndex((l) => l.id === id)
    if (idx >= 0) {
      leads.value[idx] = {
        ...leads.value[idx],
        draft_cold_email_subject: null,
        draft_cold_email_body: null,
        draft_cold_email_rationale: null,
        draft_cold_email_signal: null,
        draft_cold_email_at: null,
        draft_cold_email_model: null,
        tags,
      }
    }
    if (usingFixture.value) return
    const { error: e } = await supabase
      .from('cs_leads')
      .update({
        draft_cold_email_subject: null,
        draft_cold_email_body: null,
        draft_cold_email_rationale: null,
        draft_cold_email_signal: null,
        draft_cold_email_at: null,
        draft_cold_email_model: null,
        tags,
      })
      .eq('id', id)
    if (e) error.value = e.message
  }

  /** Promote a lead to a deal. Creates the cs_deals row + sets
   *  lead.promoted_deal_id + flips status. Returns the new deal id. */
  async function promoteToDeal(id: string): Promise<string | null> {
    const lead = leads.value.find((l) => l.id === id)
    if (!lead) return null

    if (usingFixture.value) {
      // Fixture mode: just mark as promoted locally, no server call
      const idx = leads.value.findIndex((l) => l.id === id)
      if (idx >= 0) leads.value[idx] = { ...leads.value[idx], status: 'promoted_to_pipeline', promoted_deal_id: 'fixture-deal' }
      return 'fixture-deal'
    }

    const dealPayload: CreateDealInput = {
      company_name: lead.company_name,
      contact_name: lead.contact_name ?? 'Unknown',
      contact_email: lead.contact_email ?? undefined,
      contact_title: lead.contact_title ?? undefined,
      industry: lead.industry ?? undefined,
      city: lead.city ?? undefined,
      state: lead.state ?? undefined,
      team_size: lead.team_size ?? undefined,
      stage: 'researched',
      source: lead.source === 'social_engager' ? 'social_engager' : 'manual',
      estimated_arr_cents: 0,
      next_action: 'Send first cold email',
      notes: lead.notes ?? undefined,
      last_touch_kind: 'note',
    }

    const { data: dealData, error: dealErr } = await supabase
      .from('cs_deals').insert(dealPayload).select('id').single()
    if (dealErr || !dealData) {
      error.value = dealErr?.message ?? 'Failed to create deal'
      return null
    }
    const dealId = (dealData as { id: string }).id

    const { error: leadErr } = await supabase
      .from('cs_leads')
      .update({ status: 'promoted_to_pipeline', promoted_deal_id: dealId })
      .eq('id', id)
    if (leadErr) error.value = leadErr.message

    await load()
    return dealId
  }

  onMounted(load)

  return {
    leads, loading, error, usingFixture,
    load, importLeads, updateStatus, archive, disqualify, requeue, promoteToDeal,
    updateDraftEmail, approveDraft, discardDraft,
  }
}
