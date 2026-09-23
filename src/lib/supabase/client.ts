import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './config';

let client: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;

  const config = readSupabaseConfig();
  if (!config.configured) {
    client = null;
    return client;
  }

  client = createClient(config.url, config.publishableKey, {
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
