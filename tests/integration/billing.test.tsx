import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPage } from '../../src/features/billing/BillingPage';
import type { WorkspaceBillingSummary } from '../../src/features/billing/billingService';
import type { WorkspaceEntitlement } from '../../src/features/workspaces/entitlements/entitlementTypes';
import { WorkspaceContext } from '../../src/features/workspaces/WorkspaceContext';
import {
  createBillingPortalSession,
  createCheckoutSession,
  getWorkspaceBillingSummary,
  reconcileWorkspaceBilling,
} from '../../src/features/billing/billingService';
import { useWorkspaceEntitlement } from '../../src/features/workspaces/entitlements/useWorkspaceEntitlement';

vi.mock('../../src/features/billing/billingService', () => ({
  createBillingPortalSession: vi.fn(),
  createCheckoutSession: vi.fn(),
  getWorkspaceBillingSummary: vi.fn(),
  reconcileWorkspaceBilling: vi.fn(),
}));
vi.mock(
  '../../src/features/workspaces/entitlements/useWorkspaceEntitlement',
  () => ({
    useWorkspaceEntitlement: vi.fn(),
  }),
);

const workspaceId = 'a7e04ca0-0864-48f2-9990-86df20d74bc2';
const free: WorkspaceEntitlement = {
  workspaceId,
  plan: 'teacher_free',
  status: 'active',
  source: 'default',
  effectiveAt: '2026-09-27T12:00:00Z',
  expiresAt: null,
  capabilities: ['basic_classroom', 'basic_assignments', 'basic_analytics'],
};
const summary = (canManageBilling: boolean): WorkspaceBillingSummary => ({
  billingInterval: null,
  subscriptionStatus: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  canManageBilling,
});

function renderBilling(
  entitlement: WorkspaceEntitlement = free,
  billing = summary(true),
  initialEntry = '/app/billing',
) {
  const retry = vi.fn();
  vi.mocked(useWorkspaceEntitlement).mockReturnValue({
    workspaceId,
    loading: false,
    entitlement,
    error: null,
    retry,
  });
  vi.mocked(getWorkspaceBillingSummary).mockResolvedValue({
    ok: true,
    value: billing,
  });
  render(
    <WorkspaceContext.Provider
      value={{
        workspace: {
          id: workspaceId,
          workspace_type: 'personal',
          name: 'Calculus workspace',
          status: 'active',
        },
        loading: false,
        error: null,
        retry: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <BillingPage />
      </MemoryRouter>
    </WorkspaceContext.Provider>,
  );
  return retry;
}

describe('workspace billing page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createCheckoutSession).mockResolvedValue({
      ok: false,
      error: {
        code: 'unexpected',
        message: 'We could not complete that request. Try again.',
      },
    });
    vi.mocked(createBillingPortalSession).mockResolvedValue({
      ok: false,
      error: {
        code: 'unexpected',
        message: 'We could not complete that request. Try again.',
      },
    });
    vi.mocked(reconcileWorkspaceBilling).mockResolvedValue({
      ok: true,
      value: 'no_subscription',
    });
  });

  it('shows understated monthly and annual Pro choices while preserving Free functionality', async () => {
    renderBilling();
    expect(
      await screen.findByRole('heading', { name: 'Teacher Free' }),
    ).toBeVisible();
    expect(screen.getByText('$19')).toBeVisible();
    expect(screen.getByText('/ month')).toBeVisible();
    expect(screen.getByText('$149')).toBeVisible();
    expect(screen.getByText('/ year')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Upgrade monthly' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Upgrade annually' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        /current classroom, assignments, and basic analytics available/i,
      ),
    ).toBeVisible();
    expect(getWorkspaceBillingSummary).toHaveBeenCalledWith(workspaceId);
  });

  it('does not offer billing mutations to an educator without billing authority', async () => {
    renderBilling(free, summary(false));
    expect(await screen.findByText(/workspace owner or admin/i)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Upgrade monthly' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Upgrade annually' }),
    ).not.toBeInTheDocument();
  });

  it('sends only the selected interval to Checkout and reports a server failure', async () => {
    renderBilling();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Upgrade annually' }),
    );
    expect(createCheckoutSession).toHaveBeenCalledWith(workspaceId, 'annual');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not complete that request. Try again.',
    );
  });

  it('shows Stripe Pro management instead of a second upgrade offer', async () => {
    const pro: WorkspaceEntitlement = {
      ...free,
      plan: 'pro',
      source: 'stripe',
      expiresAt: '2026-10-27T12:00:00Z',
    };
    renderBilling(pro, {
      billingInterval: 'monthly',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-10-27T12:00:00Z',
      cancelAtPeriodEnd: false,
      canManageBilling: true,
    });
    expect(await screen.findByRole('heading', { name: 'Pro' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Manage billing' }),
    ).toBeVisible();
    expect(screen.queryByText('$19')).not.toBeInTheDocument();
  });

  it('does not treat Checkout return parameters as a Pro grant', async () => {
    const retry = renderBilling(
      free,
      summary(true),
      '/app/billing?checkout=success&session_id=not-authority',
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Payment received/i,
    );
    expect(
      await screen.findByRole('heading', { name: 'Teacher Free' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Check plan status' }));
    expect(reconcileWorkspaceBilling).toHaveBeenCalledWith(workspaceId);
    await waitFor(() => expect(retry).toHaveBeenCalled());
  });

  it('opens the customer portal through a server-created URL', async () => {
    const pro: WorkspaceEntitlement = {
      ...free,
      plan: 'pro',
      source: 'stripe',
    };
    renderBilling(pro, {
      billingInterval: 'annual',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2027-09-27T12:00:00Z',
      cancelAtPeriodEnd: false,
      canManageBilling: true,
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Manage billing' }),
    );
    expect(createBillingPortalSession).toHaveBeenCalledWith(workspaceId);
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});
