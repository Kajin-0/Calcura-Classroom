import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getWorkspaceEntitlement,
  parseWorkspaceEntitlement,
  workspaceHasCapability,
} from '../../src/features/workspaces/entitlements/entitlementService';
import type { Database } from '../../src/types/database.generated';

const freeRpcRow = {
  workspace_id: 'workspace-a',
  plan: 'teacher_free',
  status: 'active',
  source: 'default',
  effective_at: '2026-09-26T12:00:00Z',
  expires_at: null,
  capabilities: ['basic_classroom', 'basic_assignments', 'basic_analytics'],
};

function clientMock(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe('workspace entitlement service', () => {
  it('parses a server-resolved Free entitlement without deriving the plan client-side', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [freeRpcRow], error: null });

    await expect(
      getWorkspaceEntitlement('workspace-a', clientMock(rpc)),
    ).resolves.toEqual({
      ok: true,
      value: {
        workspaceId: 'workspace-a',
        plan: 'teacher_free',
        status: 'active',
        source: 'default',
        effectiveAt: '2026-09-26T12:00:00Z',
        expiresAt: null,
        capabilities: [
          'basic_classroom',
          'basic_assignments',
          'basic_analytics',
        ],
      },
    });
    expect(rpc).toHaveBeenCalledWith('get_workspace_entitlement', {
      p_workspace_id: 'workspace-a',
    });
  });

  it('keeps the same user workspace-scoped by requesting each workspace independently', async () => {
    const pro = {
      ...freeRpcRow,
      workspace_id: 'workspace-b',
      plan: 'pro',
      source: 'manual',
      capabilities: [
        'basic_classroom',
        'basic_assignments',
        'basic_analytics',
        'advanced_analytics',
        'result_export',
        'larger_class_limits',
      ],
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [freeRpcRow], error: null })
      .mockResolvedValueOnce({ data: [pro], error: null });
    const client = clientMock(rpc);

    const workspaceA = await getWorkspaceEntitlement('workspace-a', client);
    const workspaceB = await getWorkspaceEntitlement('workspace-b', client);

    expect(workspaceA.ok && workspaceA.value.plan).toBe('teacher_free');
    expect(workspaceB.ok && workspaceB.value.plan).toBe('pro');
    expect(rpc.mock.calls.map(([name, args]) => [name, args])).toEqual([
      ['get_workspace_entitlement', { p_workspace_id: 'workspace-a' }],
      ['get_workspace_entitlement', { p_workspace_id: 'workspace-b' }],
    ]);
  });

  it('rejects malformed, duplicate, or foreign-workspace rows', () => {
    expect(
      parseWorkspaceEntitlement(
        { ...freeRpcRow, plan: 'unlimited' },
        'workspace-a',
      ),
    ).toBeNull();
    expect(
      parseWorkspaceEntitlement(
        { ...freeRpcRow, capabilities: ['basic_classroom', 'basic_classroom'] },
        'workspace-a',
      ),
    ).toBeNull();
    expect(parseWorkspaceEntitlement(freeRpcRow, 'workspace-b')).toBeNull();
    expect(
      parseWorkspaceEntitlement(
        { ...freeRpcRow, capabilities: ['unknown'] },
        'workspace-a',
      ),
    ).toBeNull();
  });

  it('requires exactly one resolver row and maps authorization failures safely', async () => {
    const empty = await getWorkspaceEntitlement(
      'workspace-a',
      clientMock(vi.fn().mockResolvedValue({ data: [], error: null })),
    );
    expect(empty).toMatchObject({ ok: false, error: { code: 'unexpected' } });

    const denied = await getWorkspaceEntitlement(
      'workspace-a',
      clientMock(
        vi.fn().mockResolvedValue({
          data: null,
          error: { code: '42501', message: 'private policy detail' },
        }),
      ),
    );
    expect(denied).toMatchObject({
      ok: false,
      error: { code: 'not_authorized' },
    });
    expect(JSON.stringify(denied)).not.toContain('private policy detail');
  });

  it('uses the server capability probe and rejects malformed responses', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await expect(
      workspaceHasCapability('workspace-b', 'result_export', clientMock(rpc)),
    ).resolves.toEqual({ ok: true, value: true });
    expect(rpc).toHaveBeenCalledWith('workspace_has_capability', {
      p_workspace_id: 'workspace-b',
      p_capability: 'result_export',
    });

    rpc.mockResolvedValueOnce({ data: 'true', error: null });
    await expect(
      workspaceHasCapability('workspace-b', 'result_export', clientMock(rpc)),
    ).resolves.toMatchObject({ ok: false, error: { code: 'unexpected' } });
  });
});
