// Who owns each page.
//
// The ownership model only works if it is visible. A queue with one accountable
// owner beats a queue everyone can see, because shared visibility produces
// diffusion of responsibility: the more people who could act, the less likely
// any one of them does. Naming the owner on the page itself is what turns that
// from a policy into something people can see they are failing.
//
// Stored in church_settings.page_leads alongside privacy, same read/write shape.
// Deliberately NOT seeded with a placeholder name: an invented owner reads as
// real, and an unset page that says so is a prompt to decide rather than a lie.
import { supabase } from '@/lib/supabase'

export type PageKey = 'front-desk-guests' | 'care-drift' | 'sundays-comms' | 'insights' | 'giving'

export interface PageLead {
  /** Person accountable for working this page. Empty means nobody has decided. */
  name: string
  /** When they work it, e.g. "Tuesdays". Free text: a church's rhythm is its own. */
  cadence?: string
}

export type PageLeads = Partial<Record<PageKey, PageLead>>

/** The cadence we suggest when a page has no owner yet. Guidance, not a default
 *  value: it renders as a hint next to "unassigned", never as a fact. */
export const SUGGESTED_CADENCE: Record<PageKey, string> = {
  'front-desk-guests': 'Mondays, weekly',
  'care-drift': 'Mondays, weekly',
  'sundays-comms': 'Wednesdays, before Sunday',
  insights: 'Monthly',
  giving: 'Monthly',
}

export const PAGE_LABEL: Record<PageKey, string> = {
  'front-desk-guests': 'Front Desk & Guests',
  'care-drift': 'Care & Drift',
  'sundays-comms': 'Serving',
  insights: 'Insights',
  giving: 'Giving',
}

// church_settings is absent from the generated types (added after codegen), so
// query through an untyped handle, matching privacy.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export async function getPageLeads(clientId: string): Promise<PageLeads> {
  const { data, error } = await sb
    .from('church_settings')
    .select('page_leads')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error || !data?.page_leads) return {}
  return data.page_leads as PageLeads
}

export async function savePageLeads(clientId: string, leads: PageLeads): Promise<void> {
  const { error } = await sb
    .from('church_settings')
    .upsert({ client_id: clientId, page_leads: leads }, { onConflict: 'client_id' })
  if (error) throw new Error(error.message)
}
