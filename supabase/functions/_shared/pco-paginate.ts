// pco-paginate.ts
import { pcoFetch } from './pco-auth.ts'

type Fetcher = (tenant: string, path: string, init?: RequestInit) => Promise<Response>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// links.next is an absolute URL; pcoFetch prepends the host, so strip it.
const rel = (u: string) => u.replace(/^https?:\/\/api\.planningcenteronline\.com/, '')

// Factory so tests can inject a fake fetcher. Production uses pcoFetch.
export function makePager(fetcher: Fetcher) {
  async function getRaw(tenant: string, path: string): Promise<any> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await fetcher(tenant, path)
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after') ?? '3')
        await sleep((retry + 1) * 1000)
        continue
      }
      if (!res.ok) throw new Error(`PCO ${res.status} on ${path}: ${await res.text()}`)
      return await res.json()
    }
    throw new Error(`PCO gave up after retries on ${path}`)
  }
  async function allPages(tenant: string, path: string): Promise<any[]> {
    const out: any[] = []
    let next: string | null = path
    while (next) {
      const j = await getRaw(tenant, next)
      out.push(j)
      next = j?.links?.next ? rel(j.links.next) : null
      if (next) await sleep(100) // courtesy pause between calls
    }
    return out
  }
  async function all(tenant: string, path: string): Promise<any[]> {
    const pages = await allPages(tenant, path)
    return pages.flatMap((p) => p.data ?? [])
  }
  // Pages until `stop(row)` returns true, then stops WITHOUT fetching further
  // pages. Assumes the endpoint is ordered so the stop boundary is monotonic
  // (e.g. order=-sort_date with a date cutoff). Returns rows before the stop.
  async function until(tenant: string, path: string, stop: (row: any) => boolean): Promise<any[]> {
    const out: any[] = []
    let next: string | null = path
    while (next) {
      const j = await getRaw(tenant, next)
      for (const row of (j.data ?? [])) {
        if (stop(row)) return out
        out.push(row)
      }
      next = j?.links?.next ? rel(j.links.next) : null
      if (next) await sleep(100)
    }
    return out
  }
  // Like `until`, but returns full page objects (data + included) rather than
  // flattened rows. Stops after the page that first contains a `stop` row.
  async function untilPages(tenant: string, path: string, stop: (row: any) => boolean): Promise<any[]> {
    const out: any[] = []
    let next: string | null = path
    while (next) {
      const j = await getRaw(tenant, next)
      out.push(j)
      if ((j.data ?? []).some(stop)) break
      next = j?.links?.next ? rel(j.links.next) : null
      if (next) await sleep(100)
    }
    return out
  }
  return { pcoGet: getRaw, pcoAll: all, pcoAllPages: allPages, pcoUntil: until, pcoUntilPages: untilPages }
}

const prod = makePager(pcoFetch)
export const pcoGet = prod.pcoGet
export const pcoAll = prod.pcoAll
export const pcoAllPages = prod.pcoAllPages
export const pcoUntil = prod.pcoUntil
export const pcoUntilPages = prod.pcoUntilPages
