/**
 * Creates a Supabase client from environment variables.
 * Returns null when the required env vars are not configured.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _fallback = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (_client) return _client;

  const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.SUPABASE_ANON_KEY ||
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || url === "replace-with-supabase-url") {
    _fallback = true;
    return null;
  }

  _client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return _client;
}

export function isSupabaseConfigured(): boolean {
  getSupabaseClient(); // ensure we check once
  return !_fallback;
}
