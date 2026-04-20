import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// .trim() guards against stray whitespace or newlines in env values
// (a common Vercel paste hazard — fetch throws if headers contain a newline).
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!url || !anonKey) {
  // Surface early — prevents confusing 401s later.
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in env')
}

// Temporary diagnostic — remove after verifying env vars land cleanly in prod.
// Logs lengths + first/last 4 chars so we can spot stray whitespace or malformed values
// without dumping the whole JWT in console.
if (typeof window !== 'undefined') {
  const peek = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})`
  console.log('[supabase init] url:', peek(url))
  console.log('[supabase init] key:', peek(anonKey))
  console.log('[supabase init] url raw JSON:', JSON.stringify(url))
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
