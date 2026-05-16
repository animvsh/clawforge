import type { Account, AccountInput } from "./types";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";

function newId(): string {
  return `acc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// In-memory store for fallback mode
const _memory: Map<string, Account> = new Map();

export async function createAccount(input: AccountInput): Promise<Account> {
  const client = getSupabaseClient();
  const now = new Date().toISOString();

  if (!client) {
    const account: Account = {
      id: newId(),
      email: input.email,
      display_name: input.display_name,
      created_at: now,
      updated_at: now,
    };
    _memory.set(account.id, account);
    return account;
  }

  const { data, error } = await client
    .from("accounts")
    .insert({ email: input.email, display_name: input.display_name })
    .select()
    .single();

  if (error) throw error;
  return data as Account;
}

export async function getAccount(id: string): Promise<Account | null> {
  const client = getSupabaseClient();

  if (!client) {
    return _memory.get(id) ?? null;
  }

  const { data, error } = await client.from("accounts").select().eq("id", id).single();

  if (error) return null;
  return data as Account;
}

export async function updateAccount(
  id: string,
  input: Partial<AccountInput>,
): Promise<Account | null> {
  const client = getSupabaseClient();
  const now = new Date().toISOString();

  if (!client) {
    const existing = _memory.get(id);
    if (!existing) return null;
    const updated: Account = {
      ...existing,
      email: input.email ?? existing.email,
      display_name: input.display_name ?? existing.display_name,
      updated_at: now,
    };
    _memory.set(id, updated);
    return updated;
  }

  const { data, error } = await client
    .from("accounts")
    .update({ email: input.email, display_name: input.display_name, updated_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) return null;
  return data as Account;
}
