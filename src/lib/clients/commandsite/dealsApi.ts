/**
 * CommandSite Pipeline data layer.
 *
 * Reads deals from Supabase (`cs_deals` table). Falls back to the
 * fixture data if Supabase returns empty — keeps the demo at the
 * `commandsite-demo` slug usable while the live `commandsite` slug
 * starts populating with real deals.
 *
 * Module shape stays identical to the fixture's Deal type so the
 * Pipeline component doesn't have to know which source it's reading.
 */
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import type { CsDeal, CsDealStage, CsDealSource, CsDealTouchKind } from '@/types/database'
import {
  deals as fixtureDeals,
  type Deal as FixtureDeal,
  type PipelineStage,
  type LeadSource,
  type TouchKind,
} from './pipeline'

/**
 * The shape the Pipeline module consumes — same as the fixture's Deal,
 * so swapping the source is invisible to the UI.
 */
export type Deal = FixtureDeal

/**
 * Convert a Supabase row into the fixture-shaped Deal the module expects.
 * Adds derived fields (`days_in_stage`) computed from `stage_entered_at`.
 */
function fromSupabase(row: CsDeal): Deal {
  const now = Date.now()
  const stageEntered = new Date(row.stage_entered_at).getTime()
  const days_in_stage = Math.max(0, Math.floor((now - stageEntered) / (24 * 60 * 60 * 1000)))

  return {
    id: row.id,
    company_name: row.company_name,
    contact_name: row.contact_name,
    contact_email: row.contact_email ?? '',
    contact_title: row.contact_title ?? '',
    industry: row.industry ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    team_size: row.team_size ?? 0,
    stage: row.stage as PipelineStage,
    source: row.source as LeadSource,
    estimated_arr_cents: row.estimated_arr_cents,
    days_in_stage,
    next_action: row.next_action ?? '',
    next_action_due_at: row.next_action_due_at ?? new Date().toISOString(),
    last_touch_at: row.last_touch_at,
    last_touch_kind: (row.last_touch_kind ?? 'note') as TouchKind,
    notes: row.notes ?? '',
  }
}

export interface CreateDealInput {
  company_name: string
  contact_name: string
  contact_email?: string
  contact_title?: string
  industry?: string
  city?: string
  state?: string
  team_size?: number
  stage?: CsDealStage
  source?: CsDealSource
  estimated_arr_cents?: number
  next_action?: string
  next_action_due_at?: string | null
  notes?: string
  last_touch_kind?: CsDealTouchKind
}

/**
 * Composable that loads deals from Supabase + exposes mutations.
 *
 * Falls back to the fixture data if Supabase has zero rows — that way
 * the demo at /dashboard/commandsite-demo keeps showing the design
 * without any DB dependency, and the live slug starts using real data
 * the moment the first deal is added.
 */
export function useDeals() {
  const supabaseDeals = ref<Deal[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const usingFixture = ref(false)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: e } = await supabase
      .from('cs_deals')
      .select('*')
      .order('created_at', { ascending: false })

    if (e) {
      error.value = e.message
      // On error (e.g. table missing because migration hasn't run),
      // fall back to fixture so the UI still works.
      usingFixture.value = true
      supabaseDeals.value = []
    } else if (!data || data.length === 0) {
      // Empty table — fall back to fixture so the dashboard isn't blank
      // before the first deal is added.
      usingFixture.value = true
      supabaseDeals.value = []
    } else {
      usingFixture.value = false
      supabaseDeals.value = (data as CsDeal[]).map(fromSupabase)
    }
    loading.value = false
  }

  /** The deals the UI renders — fixture or real depending on state */
  const deals = computed<Deal[]>(() =>
    usingFixture.value ? fixtureDeals : supabaseDeals.value,
  )

  async function createDeal(input: CreateDealInput) {
    const { data, error: e } = await supabase
      .from('cs_deals')
      .insert({
        company_name: input.company_name,
        contact_name: input.contact_name,
        contact_email: input.contact_email || null,
        contact_title: input.contact_title || null,
        industry: input.industry || null,
        city: input.city || null,
        state: input.state || null,
        team_size: input.team_size || null,
        stage: input.stage || 'cold',
        source: input.source || 'manual',
        estimated_arr_cents: input.estimated_arr_cents || 0,
        next_action: input.next_action || null,
        next_action_due_at: input.next_action_due_at || null,
        notes: input.notes || null,
        last_touch_at: new Date().toISOString(),
        last_touch_kind: input.last_touch_kind || 'note',
      })
      .select()
      .single()

    if (e) throw new Error(e.message)
    if (data) {
      // Inserted — flip off fixture mode + refresh
      usingFixture.value = false
      await load()
    }
    return data as CsDeal | null
  }

  async function updateStage(dealId: string, newStage: CsDealStage) {
    if (usingFixture.value) {
      throw new Error('Cannot update fixture deals — add a real deal first')
    }
    const { error: e } = await supabase
      .from('cs_deals')
      .update({ stage: newStage })
      .eq('id', dealId)
    if (e) throw new Error(e.message)
    await load()
  }

  async function deleteDeal(dealId: string) {
    if (usingFixture.value) {
      throw new Error('Cannot delete fixture deals')
    }
    const { error: e } = await supabase.from('cs_deals').delete().eq('id', dealId)
    if (e) throw new Error(e.message)
    await load()
  }

  onMounted(load)

  return {
    deals,
    loading,
    error,
    usingFixture,
    load,
    createDeal,
    updateStage,
    deleteDeal,
  }
}
