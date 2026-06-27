// Supabase clients.
//   - supabaseAdmin(): service-role, SERVER-ONLY. Used by API routes + the Telegram agent.
//     RLS is disabled in v1 (single-user); the service key is the trust boundary, so it must
//     never reach the client. Guarded below.
//   - createServerSupabase(): SSR client bound to request cookies, for magic-link auth.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin() must never run in the browser — service role key");
  }
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env not set (URL / SERVICE_ROLE_KEY)");
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}
