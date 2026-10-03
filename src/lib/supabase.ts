import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isConfigured, supabaseAnonKey, supabaseUrl } from './env'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isConfigured()) throw new Error('supabase_not_configured')
  if (!client) {
    client = createClient(supabaseUrl(), supabaseAnonKey(), {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}
