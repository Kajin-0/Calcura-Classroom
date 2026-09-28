import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilityGate } from '../../src/features/workspaces/entitlements/CapabilityGate';
import { WorkspacePlanLabel } from '../../src/features/workspaces/entitlements/WorkspacePlanLabel';
import { getWorkspaceEntitlement } from '../../src/features/workspaces/entitlements/entitlementService';
import type { WorkspaceContextValue } from '../../src/features/workspaces/WorkspaceContext';
import { WorkspaceContext } from '../../src/features/workspaces/WorkspaceContext';
import type { WorkspaceEntitlement } from '../../src/features/workspaces/entitlements/entitlementTypes';
import type { ServiceResult } from '../../src/lib/supabase/serviceResult';

vi.mock(
  '../../src/features/workspaces/entitlements/entitlementService',
  () => ({
    getWorkspaceEntitlement: vi.fn(),
    workspaceHasCapability: vi.fn(),
  }),
);

const freeEntitlement: WorkspaceEntitlement = {
  workspaceId: 'workspace-a',
  plan: 'teacher_free',
  status: 'active',
  source: 'default',
  effectiveAt: '2026-09-26T12:00:00Z',
  expiresAt: null,
  capabilities: ['basic_classroom', 'basic_assignments', 'basic_analytics'],
};
const proEntitlement: WorkspaceEntitlement = {
  ...freeEntitlement,
  workspaceId: 'workspace-b',
  plan: 'pro',
  source: 'manual',
  capabilities: [
    ...freeEntitlement.capabilities,
    'advanced_analytics',
    'result_export',
    'larger_class_limits',
    'advanced_assignment_editing',
  ],
};

function contextValue(workspaceId: string): WorkspaceContextValue {
  return {
    workspace: {
      id: workspaceId,
      workspace_type: 'organization',
      name: workspaceId,
      status: 'active',
    },
    loading: false,
    error: null,
    retry: vi.fn(),
  };
}

function renderEntitlement(workspaceId: string) {
  return render(
    <WorkspaceContext.Provider value={contextValue(workspaceId)}>
      <WorkspacePlanLabel />
      <CapabilityGate capability="result_export" label="Result export">
        <p>Export controls</p>
      </CapabilityGate>
    </WorkspaceContext.Provider>,
  );
}

describe('workspace entitlement presentation', () => {
  beforeEach(() => vi.resetAllMocks());

  it('shows the minimal current plan and a reusable unavailable-feature state', async () => {
    vi.mocked(getWorkspaceEntitlement).mockResolvedValue({
      ok: true,
      value: freeEntitlement,
    });
    renderEntitlement('workspace-a');

    expect(await screen.findByText('Plan · Teacher Free')).toBeVisible();
    expect(
      screen.getByText('Not included in this workspace plan.'),
    ).toBeVisible();
    expect(screen.queryByText('Export controls')).not.toBeInTheDocument();
  });

  it('switches capability presentation with the active workspace, not user identity', async () => {
    vi.mocked(getWorkspaceEntitlement).mockImplementation(
      async (workspaceId) =>
        workspaceId === 'workspace-a'
          ? { ok: true, value: freeEntitlement }
          : { ok: true, value: proEntitlement },
    );
    const view = renderEntitlement('workspace-a');

    expect(await screen.findByText('Plan · Teacher Free')).toBeVisible();
    expect(screen.queryByText('Export controls')).not.toBeInTheDocument();

    view.rerender(
      <WorkspaceContext.Provider value={contextValue('workspace-b')}>
        <WorkspacePlanLabel />
        <CapabilityGate capability="result_export" label="Result export">
          <p>Export controls</p>
        </CapabilityGate>
      </WorkspaceContext.Provider>,
    );

    expect(await screen.findByText('Plan · Pro')).toBeVisible();
    expect(await screen.findByText('Export controls')).toBeVisible();
    await waitFor(() =>
      expect(getWorkspaceEntitlement).toHaveBeenCalledWith('workspace-b'),
    );
  });

  it('fails closed and offers retry when workspace entitlement cannot load', async () => {
    let shouldFail = true;
    vi.mocked(getWorkspaceEntitlement).mockImplementation(async () =>
      shouldFail
        ? {
            ok: false,
            error: {
              code: 'not_authorized',
              message: 'You do not have access to this Classroom item.',
            },
          }
        : { ok: true, value: freeEntitlement },
    );
    render(
      <WorkspaceContext.Provider value={contextValue('workspace-a')}>
        <CapabilityGate capability="result_export" label="Result export">
          <p>Export controls</p>
        </CapabilityGate>
      </WorkspaceContext.Provider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Workspace access could not be verified.',
    );
    expect(screen.queryByText('Export controls')).not.toBeInTheDocument();
    shouldFail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('Not included in this workspace plan.'),
    ).toBeVisible();
  });

  it('announces loading until the workspace entitlement response arrives', async () => {
    let resolveResult!: (result: ServiceResult<WorkspaceEntitlement>) => void;
    const pending = new Promise<ServiceResult<WorkspaceEntitlement>>(
      (resolve) => {
        resolveResult = resolve;
      },
    );
    vi.mocked(getWorkspaceEntitlement).mockReturnValue(pending);
    render(
      <WorkspaceContext.Provider value={contextValue('workspace-a')}>
        <CapabilityGate capability="result_export" label="Result export">
          <p>Export controls</p>
        </CapabilityGate>
      </WorkspaceContext.Provider>,
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Checking workspace access…',
    );
    resolveResult({ ok: true, value: freeEntitlement });
    expect(
      await screen.findByText('Not included in this workspace plan.'),
    ).toBeVisible();
  });
});
