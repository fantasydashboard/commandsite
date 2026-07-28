import { pcoUntilPages } from '../pco-paginate.ts'
import { monthsAgo } from '../pco-transforms/serving.ts'
import type { GuestsCursor } from './cursor.ts'

// deno-lint-ignore no-explicit-any
type Db = any
interface GuestsCfg { englishWorkflowId: string; brazilianWorkflowId: string; windowMonths: number }

// Resume by workflow: pull each Starting Point workflow's cards (newest first,
// bounded to the window), mirroring them into pco_workflow_cards. isOver() is
// checked before each workflow. Small data (a few hundred active cards) so this
// normally completes in one chunk. pages preserve `included` (Person carries the
// name, WorkflowStep the current step).
export async function fetchGuestCardsChunk(
  db: Db, clientId: string, tenant: string, cfg: GuestsCfg, cursor: GuestsCursor, isOver: () => boolean, cutoffOverride?: string,
): Promise<{ cursor: GuestsCursor; done: boolean }> {
  const cutoff = cutoffOverride ?? monthsAgo(new Date().toISOString().slice(0, 10), cfg.windowMonths)
  let { workflows, wIndex } = cursor
  if (!workflows || workflows.length === 0) {
    workflows = [
      { id: cfg.englishWorkflowId, campus: 'english' },
      { id: cfg.brazilianWorkflowId, campus: 'brazilian' },
    ]
    wIndex = 0
  }
  while (wIndex < workflows.length) {
    if (isOver()) return { cursor: { workflows, wIndex }, done: false }
    const wf = workflows[wIndex]
    const pages = await pcoUntilPages(tenant,
      `/people/v2/workflows/${wf.id}/cards?include=person,current_step&per_page=100&order=-created_at`,
      (c: any) => (c.attributes?.created_at ?? '').slice(0, 10) < cutoff)
    const rows: any[] = []
    for (const page of pages) {
      const persons: Record<string, string> = {}
      const steps: Record<string, string> = {}
      for (const inc of page.included ?? []) {
        if (inc.type === 'Person') persons[inc.id] = (inc.attributes?.name ?? '').trim()
        if (inc.type === 'WorkflowStep') steps[inc.id] = (inc.attributes?.name ?? '').trim()
      }
      for (const c of page.data ?? []) {
        const created = (c.attributes?.created_at ?? '').slice(0, 10)
        if (!created || created < cutoff) continue
        const name = persons[c.relationships?.person?.data?.id] ?? ''
        if (!name) continue
        rows.push({
          client_id: clientId, workflow_id: wf.id, card_id: c.id, campus: wf.campus, name,
          created_date: created,
          completed_date: c.attributes?.completed_at ? c.attributes.completed_at.slice(0, 10) : null,
          step_name: steps[c.relationships?.current_step?.data?.id] ?? '',
        })
      }
    }
    // Dedupe by PK (client_id,card_id) before upsert.
    const deduped = [...new Map(rows.map((r: any) => [r.card_id, r])).values()]
    if (deduped.length) {
      const { error } = await db.from('pco_workflow_cards').upsert(deduped, { onConflict: 'client_id,card_id' })
      if (error) throw new Error(`guest cards upsert: ${error.message}`)
    }
    wIndex++
  }
  return { cursor: { workflows, wIndex }, done: true }
}
