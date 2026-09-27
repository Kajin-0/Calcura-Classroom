import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createBillingPortalSession,
  createCheckoutSession,
  parseWorkspaceBillingSummary,
  reconcileWorkspaceBilling,
} from '../../src/features/billing/billingService';
import type { Database } from '../../src/types/database.generated';

const workspaceId = 'a7e04ca0-0864-48f2-9990-86df20d74bc2';

function clientMock(invoke: ReturnType<typeof vi.fn>) {
  return {
    functions: { invoke },
  } as unknown as SupabaseClient<Database>;
}

describe('billing client contract', () => {
  it('accepts only the narrow billing summary response', () => {
    expect(
      parseWorkspaceBillingSummary({
        billing_interval: 'annual',
        subscription_status: 'active',
        current_period_end: '2026-10-01T00:00:00Z',
        cancel_at_period_end: false,
        can_manage_billing: true,
        stripe_customer_id: 'must not be returned',
      }),
    ).toEqual({
      billingInterval: 'annual',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: false,
      canManageBilling: true,
    });
    expect(
      parseWorkspaceBillingSummary({
        billing_interval: 'weekly',
        subscription_status: 'active',
        current_period_end: null,
        cancel_at_period_end: false,
        can_manage_billing: true,
      }),
    ).toBeNull();
    expect(
      parseWorkspaceBillingSummary({
        billing_interval: null,
        subscription_status: null,
        current_period_end: null,
        cancel_at_period_end: false,
        can_manage_billing: true,
        stripe_subscription_id: 'sub_secret',
      }),
    ).toEqual({
      billingInterval: null,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canManageBilling: true,
    });
  });

  it('sends only the bounded interval and workspace to the Checkout function', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_123' },
      error: null,
    });
    const result = await createCheckoutSession(
      workspaceId,
      'annual',
      clientMock(invoke),
    );
    expect(result).toEqual({
      ok: true,
      value: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
    expect(invoke).toHaveBeenCalledWith('billing-checkout', {
      body: { workspace_id: workspaceId, billing_interval: 'annual' },
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('price_');
  });

  it('rejects a non-Stripe or insecure Checkout redirect', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { checkout_url: 'https://attacker.example/collect' },
      error: null,
    });
    await expect(
      createCheckoutSession(workspaceId, 'monthly', clientMock(invoke)),
    ).resolves.toMatchObject({ ok: false });
  });

  it('opens only the Stripe billing portal returned by the server', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { portal_url: 'https://billing.stripe.com/p/session/test_123' },
      error: null,
    });
    await expect(
      createBillingPortalSession(workspaceId, clientMock(invoke)),
    ).resolves.toEqual({
      ok: true,
      value: 'https://billing.stripe.com/p/session/test_123',
    });
    expect(invoke).toHaveBeenCalledWith('billing-portal', {
      body: { workspace_id: workspaceId },
    });
  });

  it('requests canonical server reconciliation without sending plan authority', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { result: 'processed' },
      error: null,
    });
    await expect(
      reconcileWorkspaceBilling(workspaceId, clientMock(invoke)),
    ).resolves.toEqual({ ok: true, value: 'processed' });
    expect(invoke).toHaveBeenCalledWith('billing-reconcile', {
      body: { workspace_id: workspaceId },
    });
  });
});
