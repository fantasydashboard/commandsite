// pco-paginate_test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { makePager } from './pco-paginate.ts'

// A fake pcoFetch that returns two pages then stops, and 429s once.
function fakeFetch() {
  const pages: Record<string, any> = {
    '/x?per_page=2': { data: [1, 2], links: { next: 'https://api.planningcenteronline.com/x?offset=2' } },
    '/x?offset=2':   { data: [3], links: {} },
  }
  let failedOnce = false
  return async (_tenant: string, path: string): Promise<Response> => {
    if (!failedOnce) { failedOnce = true; return new Response('rate', { status: 429, headers: { 'retry-after': '0' } }) }
    const body = pages[path]
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

Deno.test('pcoAll follows links.next and retries 429', async () => {
  const { pcoAll } = makePager(fakeFetch())
  const rows = await pcoAll('t', '/x?per_page=2')
  assertEquals(rows, [1, 2, 3])
})

Deno.test('pcoUntil stops at the cutoff and does not over-fetch later pages', async () => {
  const pages: Record<string, any> = {
    '/p': { data: [{ d: '2026-05-10' }, { d: '2026-05-03' }, { d: '2026-04-01' }], links: { next: 'https://api.planningcenteronline.com/p?o=3' } },
    '/p?o=3': { data: [{ d: '2026-03-01' }], links: {} },
  }
  let page2fetched = false
  const fetcher = async (_tenant: string, path: string): Promise<Response> => {
    if (path === '/p?o=3') page2fetched = true
    return new Response(JSON.stringify(pages[path]), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const { pcoUntil } = makePager(fetcher)
  const rows = await pcoUntil('t', '/p', (r: any) => r.d < '2026-05-01')
  assertEquals(rows.map((r: any) => r.d), ['2026-05-10', '2026-05-03'])
  assertEquals(page2fetched, false)
})
