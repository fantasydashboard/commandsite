/**
 * useLinkedInQueue — the data hook for the "LinkedIn Today" surface.
 *
 * Surfaces top-ICP leads that haven't been contacted on LinkedIn yet,
 * with a Touch 1 connection-request message pre-drafted from lead
 * context. The operator copies the message + opens LinkedIn manually
 * (no auto-send — LinkedIn bans accounts that automate that step).
 *
 * Why template-based instead of AI-drafted: connection requests are
 * 300-char microcopy with very limited room for variation. The pattern
 * is deterministic: "Hey [Name] — saw [Company's] reviews on Google,
 * the comment about [thing] caught my eye. Building something for
 * [industry] owners in [city], wanted to connect." Adding an LLM call
 * per lead costs latency + tokens with no quality gain over a good
 * template + variable substitution.
 *
 * For Touch 2-5 (where personalization matters more), we'd move to AI
 * drafting. Phase 2 work.
 */
import { computed, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'

export interface LinkedInQueueLead {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string | null
  city: string | null
  state: string | null
  industry: string | null
  icp_score: number | null
  icp_score_reason: string | null
  notes: string | null
  tags: string[] | null
  linkedin_url: string | null
  /** Pre-drafted Touch 1 connection request (under 300 chars). */
  draftedMessage: string
  /** Best-guess Google search URL to find the prospect on LinkedIn. */
  linkedinSearchUrl: string
}

/** Limit per day. Anything above this and LinkedIn starts throttling
 *  acceptance rate even when sent manually. */
const QUEUE_LIMIT = 15

// ── Drafter ──────────────────────────────────────────────────────────

/** Pick the first name from a contact_name string. Falls back to "there"
 *  so the message never reads "Hey null —". */
function firstName(fullName: string | null): string {
  if (!fullName) return 'there'
  return fullName.trim().split(/\s+/)[0]
}

/** Build a Touch 1 connection request under 300 chars. Mentions the
 *  company by name, references their Google reviews as the specific
 *  thing that caught attention (universal — every business has them),
 *  ties to the city to feel local. */
function draftTouch1(lead: {
  contact_name: string | null
  company_name: string
  industry: string | null
  city: string | null
  state: string | null
}): string {
  const first = firstName(lead.contact_name)
  const co = lead.company_name
  const ind = lead.industry?.toLowerCase() ?? 'service business'
  const where = lead.city ? `${lead.city}` : 'your area'

  // Three template variants — rotate to avoid LinkedIn flagging repeat copy.
  const variants = [
    `Hey ${first} — saw ${co}'s reviews on Google, looked solid. Building something for ${ind} owners in ${where}, wanted to connect.`,
    `${first}, hey — came across ${co} this week and the reviews caught my eye. Working on something for ${ind} folks running shops in ${where}. Open to connecting?`,
    `Hi ${first} — noticed ${co} in ${where} while researching ${ind} shops. Building a tool for owners like you. Mind if we connect?`,
  ]

  // Deterministic variant selection so the same lead always gets the
  // same draft (no flicker on reload, and the operator can re-find it).
  const hash = (lead.company_name + lead.city).length % variants.length
  const draft = variants[hash]

  // Hard cap at 300 chars (LinkedIn limit). Truncate gracefully if any
  // company name overflows.
  return draft.length <= 300 ? draft : draft.slice(0, 297) + '...'
}

/** Build a Google search URL that surfaces the prospect's LinkedIn
 *  profile when we don't have it stored. Pattern: "Owner [Company]
 *  [City] site:linkedin.com" works well — the title-tag pattern of
 *  most owner profiles matches. */
function buildLinkedInSearchUrl(lead: {
  company_name: string
  city: string | null
  contact_name: string | null
}): string {
  const parts = []
  if (lead.contact_name) parts.push(lead.contact_name)
  parts.push(lead.company_name)
  if (lead.city) parts.push(lead.city)
  parts.push('site:linkedin.com')
  const q = encodeURIComponent(parts.join(' '))
  return `https://www.google.com/search?q=${q}`
}

// ── Composable ───────────────────────────────────────────────────────

export function useLinkedInQueue() {
  const leads = ref<LinkedInQueueLead[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null

    // Pull top-ICP leads that:
    //   • have not been contacted on LinkedIn yet
    //   • have a company name (always true but defensive)
    //   • are NOT outreach-paused (if paused on email reply, leave alone)
    //   • are NOT disqualified
    const { data, error: e } = await supabase
      .from('cs_leads')
      .select('id, company_name, contact_name, contact_email, city, state, industry, icp_score, icp_score_reason, notes, tags, linkedin_url')
      .is('linkedin_contacted_at', null)
      .eq('outreach_paused', false)
      .neq('status', 'disqualified')
      .not('company_name', 'is', null)
      .order('icp_score', { ascending: false, nullsFirst: false })
      .limit(QUEUE_LIMIT)

    if (e) {
      error.value = e.message
      loading.value = false
      return
    }

    leads.value = (data ?? []).map((raw) => {
      const lead = raw as {
        id: string
        company_name: string
        contact_name: string | null
        contact_email: string | null
        city: string | null
        state: string | null
        industry: string | null
        icp_score: number | null
        icp_score_reason: string | null
        notes: string | null
        tags: string[] | null
        linkedin_url: string | null
      }
      return {
        ...lead,
        draftedMessage: draftTouch1(lead),
        linkedinSearchUrl: buildLinkedInSearchUrl(lead),
      }
    })
    loading.value = false
  }

  /** Mark a lead as LinkedIn-contacted. Removes it from the queue
   *  immediately (optimistic) + writes the timestamp to the database. */
  async function markSent(leadId: string): Promise<{ ok: boolean; error?: string }> {
    // Optimistic: drop from local list first so the UI feels instant.
    leads.value = leads.value.filter((l) => l.id !== leadId)

    const { error: e } = await supabase
      .from('cs_leads')
      .update({ linkedin_contacted_at: new Date().toISOString() } as never)
      .eq('id', leadId)

    if (e) {
      // Rollback by reloading on failure so the lead reappears.
      await load()
      return { ok: false, error: e.message }
    }
    return { ok: true }
  }

  /** Save the LinkedIn URL the operator found, so future surfaces can
   *  jump straight to the profile instead of re-searching. */
  async function saveLinkedInUrl(leadId: string, url: string): Promise<{ ok: boolean; error?: string }> {
    const trimmed = url.trim()
    if (!trimmed) return { ok: true }

    const { error: e } = await supabase
      .from('cs_leads')
      .update({ linkedin_url: trimmed } as never)
      .eq('id', leadId)
    if (e) return { ok: false, error: e.message }

    // Update the local copy in place so the UI reflects the saved URL.
    const idx = leads.value.findIndex((l) => l.id === leadId)
    if (idx >= 0) leads.value[idx] = { ...leads.value[idx], linkedin_url: trimmed }
    return { ok: true }
  }

  const isEmpty = computed(() => !loading.value && leads.value.length === 0)
  const queueCount = computed(() => leads.value.length)

  onMounted(load)

  return {
    leads,
    loading,
    error,
    isEmpty,
    queueCount,
    load,
    markSent,
    saveLinkedInUrl,
  }
}
