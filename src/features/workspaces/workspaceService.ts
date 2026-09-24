import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.generated';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  failure,
  mapClassroomError,
  type ServiceResult,
} from '../../lib/supabase/serviceResult';

type Client = SupabaseClient<Database>;
type WorkspaceRow = Database['public']['Tables']['workspaces']['Row'];
export type WorkspaceSummary = Pick<
  WorkspaceRow,
  'id' | 'workspace_type' | 'name' | 'status'
>;

const resolveClient = (client: Client | null): ServiceResult<Client> =>
  client ? { ok: true, value: client } : failure('not_configured');

export async function ensurePersonalWorkspace(
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<WorkspaceSummary>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  let response;
  try {
    response = await resolved.value.rpc('ensure_personal_workspace');
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: mapClassroomError(error) };
  const workspace = data?.[0];
  if (!workspace) return failure('workspace_not_found');

  return {
    ok: true,
    value: {
      id: workspace.workspace_id,
      workspace_type: workspace.workspace_type,
      name: workspace.name,
      status: workspace.status,
    },
  };
}

export async function listMyWorkspaces(
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<WorkspaceSummary[]>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  let response;
  try {
    response = await resolved.value
      .from('workspaces')
      .select('id, workspace_type, name, status')
      .order('created_at', { ascending: true });
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: mapClassroomError(error) };

  return { ok: true, value: data };
}
