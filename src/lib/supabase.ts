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

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
