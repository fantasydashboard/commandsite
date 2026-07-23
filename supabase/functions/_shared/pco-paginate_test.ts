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
