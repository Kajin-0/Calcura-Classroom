import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database.generated';
import { getSupabaseClient } from '../../../lib/supabase/client';
import {
  failure,
  mapClassroomError,
  type ServiceResult,
} from '../../../lib/supabase/serviceResult';
import {
  ENTITLEMENT_PLANS,
  WORKSPACE_CAPABILITIES,
  type EntitlementSource,
  type EntitlementStatus,
  type WorkspaceCapability,
  type WorkspaceEntitlement,
} from './entitlementTypes';

type Client = SupabaseClient<Database>;

const resolveClient = (client: Client | null): ServiceResult<Client> =>
  client ? { ok: true, value: client } : failure('not_configured');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

export function parseWorkspaceEntitlement(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceEntitlement | null {
  if (!isRecord(value)) return null;

  const capabilities = value.capabilities;
  if (
    value.workspace_id !== expectedWorkspaceId ||
    !ENTITLEMENT_PLANS.includes(
      value.plan as (typeof ENTITLEMENT_PLANS)[number],
    ) ||
    (value.status !== 'active' && value.status !== 'trialing') ||
    !['default', 'manual', 'stripe', 'institution'].includes(
      String(value.source),
    ) ||
    !isTimestamp(value.effective_at) ||
    (value.expires_at !== null && !isTimestamp(value.expires_at)) ||
    !Array.isArray(capabilities) ||
    !capabilities.every((capability) =>
      WORKSPACE_CAPABILITIES.includes(
        capability as (typeof WORKSPACE_CAPABILITIES)[number],
      ),
    ) ||
    new Set(capabilities).size !== capabilities.length
  ) {
    return null;
  }

  return {
    workspaceId: expectedWorkspaceId,
    plan: value.plan as WorkspaceEntitlement['plan'],
    status: value.status as EntitlementStatus,
    source: value.source as EntitlementSource,
    effectiveAt: value.effective_at,
    expiresAt: value.expires_at,
    capabilities: capabilities as WorkspaceCapability[],
  };
}

export async function getWorkspaceEntitlement(
  workspaceId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<WorkspaceEntitlement>> {
  if (!workspaceId.trim()) return failure('workspace_not_found');
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  try {
    const { data, error } = await resolved.value.rpc(
      'get_workspace_entitlement',
      { p_workspace_id: workspaceId },
    );
    if (error) return { ok: false, error: mapClassroomError(error) };
    if (!Array.isArray(data) || data.length !== 1) {
      return failure('unexpected');
    }
    const entitlement = parseWorkspaceEntitlement(data[0], workspaceId);
    return entitlement
      ? { ok: true, value: entitlement }
      : failure('unexpected');
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
}

export async function workspaceHasCapability(
  workspaceId: string,
  capability: WorkspaceCapability,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<boolean>> {
  if (!workspaceId.trim()) return failure('workspace_not_found');
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  try {
    const { data, error } = await resolved.value.rpc(
      'workspace_has_capability',
      { p_workspace_id: workspaceId, p_capability: capability },
    );
    if (error) return { ok: false, error: mapClassroomError(error) };
    return typeof data === 'boolean'
      ? { ok: true, value: data }
      : failure('unexpected');
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
}
