import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy, shared service-role client for HR background work (CV intake
// from webhooks). Mirrors the pattern used by the WhatsApp webhook
// handler and the automations/flows engines.
let _adminClient: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}
