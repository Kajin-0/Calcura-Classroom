import {
  createClient,
  type SupabaseClient,
} from 'npm:@supabase/supabase-js@2.117.1';
import { requiredEnv } from './runtime.ts';

export type DbClient = SupabaseClient;

export function createAdminClient(): DbClient {
  const url = requiredEnv('SUPABASE_URL');
  const secret =
    runtimeEnv('SUPABASE_SERVICE_ROLE_KEY') ??
    runtimeEnv('SUPABASE_SECRET_KEY');
  if (!secret) throw new Error('Missing trusted Supabase server key.');
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAuthenticatedClient(authorization: string): DbClient {
  const url = requiredEnv('SUPABASE_URL');
  const publishableKey =
    runtimeEnv('SUPABASE_ANON_KEY') ?? runtimeEnv('SUPABASE_PUBLISHABLE_KEY');
  if (!publishableKey) throw new Error('Missing Supabase publishable key.');
  return createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function runtimeEnv(name: string): string | undefined {
  return (
    globalThis as typeof globalThis & {
      Deno?: { env: { get(key: string): string | undefined } };
    }
  ).Deno?.env.get(name);
}

export async function authenticateRequest(request: Request): Promise<{
  userId: string;
  userClient: DbClient;
}> {
  const authorization = request.headers.get('Authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!authorization || !match) throw new Error('not_authorized');

  const userClient = createAuthenticatedClient(authorization);
  const { data, error } = await userClient.auth.getUser(match[1]);
  if (error || !data.user) throw new Error('not_authorized');
  return { userId: data.user.id, userClient };
}

export async function workspaceBillingRole(
  admin: DbClient,
  workspaceId: string,
  userId: string,
): Promise<string | null> {
  const { data: membership, error: membershipError } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership || typeof membership.role !== 'string') return null;

  const { data: workspace, error: workspaceError } = await admin
    .from('workspaces')
    .select('status')
    .eq('id', workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace || workspace.status !== 'active') return null;
  return membership.role;
}
