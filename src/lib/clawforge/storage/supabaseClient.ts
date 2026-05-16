/**
 * Creates a Supabase client from environment variables.
 * Returns null when the required env vars are not configured.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _configured = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (_client) return _client;

  const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.SUPABASE_ANON_KEY ||
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || url === "replace-with-supabase-url") {
    _configured = false;
    return null;
  }

  _configured = true;
  _client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return _client;
}

export function isSupabaseConfigured(): boolean {
  getSupabaseClient(); // ensure we check once
  return _configured;
}

export async function getCurrentUserId(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user?.id ?? null;
}
