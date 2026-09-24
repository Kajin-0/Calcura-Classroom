import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.generated';
import { readSupabaseConfig } from './config';

let client: SupabaseClient<Database> | null | undefined;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;

  const config = readSupabaseConfig();
  if (!config.configured) {
    client = null;
    return client;
  }

  client = createClient<Database>(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export function resetSupabaseClientForTests(): void {
  client = undefined;
}
