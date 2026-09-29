import { describe, expect, it, vi } from 'vitest';
import {
  createClient,
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import {
  createBillingPortalSession,
  createCheckoutSession,
  getWorkspaceBillingSummary,
  parseWorkspaceBillingSummary,
  reconcileWorkspaceBilling,
} from '../../src/features/billing/billingService';
import type { Database } from '../../src/types/database.generated';

const workspaceId = 'a7e04ca0-0864-48f2-9990-86df20d74bc2';
const unexpected = {
  ok: false,
  error: {
    code: 'unexpected',
    message: 'We could not complete that request. Try again.',
  },
};

// Match FunctionsClient.invoke: non-2xx responses return data:null and an
// exported FunctionsHttpError with the unread fetch Response as its context.
function httpFailure(body: string, status = 409) {
  const response = new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  return { data: null, error: new FunctionsHttpError(response), response };
}

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

  it.each(['monthly', 'annual'] as const)(
    'sends only workspace and %s interval to Checkout',
    async (interval) => {
      const invoke = vi.fn().mockResolvedValue({
        data: { checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_123' },
        error: null,
      });
      const result = await createCheckoutSession(
        workspaceId,
        interval,
        clientMock(invoke),
      );
      expect(result).toEqual({
        ok: true,
        value: 'https://checkout.stripe.com/c/pay/cs_test_123',
      });
      expect(invoke).toHaveBeenCalledWith('billing-checkout', {
        body: { workspace_id: workspaceId, billing_interval: interval },
      });
      expect(JSON.stringify(invoke.mock.calls)).not.toContain('price_');
    },
  );

  it.each([
    'https://attacker.example/collect',
    'http://checkout.stripe.com/c/pay/test',
    'https://checkout.stripe.com.attacker.example/collect',
    'https://checkout.stripe.com@attacker.example/collect',
    'javascript:alert(1)',
    '/relative/checkout',
    'not a URL',
  ])('rejects a non-Stripe or insecure Checkout redirect: %s', async (url) => {
    const invoke = vi.fn().mockResolvedValue({
      data: { checkout_url: url },
      error: null,
    });
    await expect(
      createCheckoutSession(workspaceId, 'monthly', clientMock(invoke)),
    ).resolves.toEqual(unexpected);
  });

  it('preserves the saved Checkout URL when the same interval is resumed', async () => {
    const url = 'https://checkout.stripe.com/c/pay/cs_test_saved';
    const invoke = vi
      .fn()
      .mockResolvedValue({ data: { checkout_url: url }, error: null });
    const client = clientMock(invoke);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        createCheckoutSession(workspaceId, 'monthly', client),
      ).resolves.toEqual({ ok: true, value: url });
    }
    expect(invoke).toHaveBeenCalledTimes(2);
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

describe('billing function HTTP error boundary', () => {
  it.each([
    [
      'checkout_in_progress',
      409,
      'Another checkout is already active for this workspace. Open the plan you previously selected to resume it, or wait for that checkout to expire before changing billing interval.',
    ],
    [
      'checkout_processing',
      409,
      'Your checkout has completed and Stripe is still confirming the subscription. Check plan status again shortly.',
    ],
    [
      'checkout_expired',
      409,
      'That checkout has expired. Try opening checkout again.',
    ],
    [
      'subscription_exists',
      409,
      'This workspace already has a Stripe subscription. Use Manage billing to make changes.',
    ],
    [
      'billing_unavailable',
      502,
      'Billing is temporarily unavailable. Try again shortly.',
    ],
    ['not_authorized', 401, 'You do not have access to this Classroom item.'],
  ] as const)(
    'maps %s to bounded copy, ignoring provider text and identifiers',
    async (code, status, message) => {
      const failure = httpFailure(
        JSON.stringify({
          error: code,
          message: 'PRIVATE provider exception',
          stripe_customer_id: 'cus_private',
          retry: true,
        }),
        status,
      );
      const invoke = vi.fn().mockResolvedValue(failure);
      await expect(
        createCheckoutSession(workspaceId, 'annual', clientMock(invoke)),
      ).resolves.toEqual({
        ok: false,
        error: { code, message },
      });
      expect(failure.response.bodyUsed).toBe(false);
      await expect(failure.response.json()).resolves.toMatchObject({
        error: code,
      });
    },
  );

  it('handles the actual installed Supabase invoke implementation over mocked fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        httpFailure(
          JSON.stringify({ error: 'checkout_in_progress', retry: true }),
        ).response,
    );
    const client = createClient<Database>(
      'https://billing.example.test',
      'sb_publishable_test_fixture',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: fetchMock },
      },
    );
    const sdkResult = await client.functions.invoke('billing-checkout', {
      body: { workspace_id: workspaceId, billing_interval: 'annual' },
    });
    expect(sdkResult.error).toBeInstanceOf(FunctionsHttpError);
    expect(sdkResult.error.context).toBe(sdkResult.response);
    expect(sdkResult.response?.bodyUsed).toBe(false);
    await expect(
      createCheckoutSession(workspaceId, 'annual', client),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'checkout_in_progress',
        message: expect.stringContaining('Another checkout is already active'),
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).endsWith('/functions/v1/billing-checkout'),
      ),
    ).toBe(true);
  });

  it.each([
    '',
    '{broken JSON',
    '<html>PRIVATE upstream failure</html>',
    'null',
    '[]',
    '"checkout_in_progress"',
    '{}',
    '{"error":"something_else","message":"PRIVATE provider failure"}',
    '{"error":{"code":"checkout_in_progress"}}',
    '{"error":123}',
    '{"error":"CHECKOUT_IN_PROGRESS"}',
    '{"error":"constructor"}',
  ])('safely falls back for malformed/unrecognized body %j', async (body) => {
    const invoke = vi.fn().mockResolvedValue(httpFailure(body));
    await expect(
      createCheckoutSession(workspaceId, 'monthly', clientMock(invoke)),
    ).resolves.toEqual(unexpected);
  });

  it('does not throw if the response body was already consumed', async () => {
    const failure = httpFailure('{"error":"checkout_in_progress"}');
    await failure.response.text();
    const invoke = vi.fn().mockResolvedValue(failure);
    await expect(
      createCheckoutSession(workspaceId, 'monthly', clientMock(invoke)),
    ).resolves.toEqual(unexpected);
  });

  it('does not throw if the response stream cannot be read', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('PRIVATE stream failure'));
        },
      }),
      { status: 502 },
    );
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(response),
      response,
    });
    await expect(
      createCheckoutSession(workspaceId, 'monthly', clientMock(invoke)),
    ).resolves.toEqual(unexpected);
  });

  it('also handles a rejected invocation without throwing into its caller', async () => {
    const { error } = httpFailure('{"error":"checkout_expired"}');
    const invoke = vi.fn().mockRejectedValue(error);
    await expect(
      createCheckoutSession(workspaceId, 'monthly', clientMock(invoke)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'checkout_expired' },
    });
  });

  it.each([
    { code: '42501', message: 'PRIVATE permission detail' },
    { code: 'P0001', message: 'not_authorized' },
  ])('preserves ordinary authorization mapping for $code', async (error) => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error });
    await expect(
      createCheckoutSession(workspaceId, 'monthly', clientMock(invoke)),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'not_authorized',
        message: 'You do not have access to this Classroom item.',
      },
    });
  });

  it.each([
    new Error('PRIVATE Stripe exception'),
    new FunctionsFetchError(new Error('PRIVATE network failure')),
    new FunctionsRelayError(
      new Response('{"error":"checkout_in_progress"}', { status: 502 }),
    ),
    new FunctionsHttpError({ error: 'checkout_in_progress' }),
  ])(
    'never displays raw provider messages or parses a non-HTTP response ($name)',
    async (error) => {
      const invoke = vi.fn().mockResolvedValue({ data: null, error });
      await expect(
        createCheckoutSession(workspaceId, 'monthly', clientMock(invoke)),
      ).resolves.toEqual(unexpected);
    },
  );

  it.each([
    ['summary', getWorkspaceBillingSummary],
    ['portal', createBillingPortalSession],
    ['reconciliation', reconcileWorkspaceBilling],
  ] as const)(
    'uses the same bounded mapping for %s failures',
    async (_name, service) => {
      const invoke = vi
        .fn()
        .mockResolvedValue(httpFailure('{"error":"billing_unavailable"}', 502));
      await expect(service(workspaceId, clientMock(invoke))).resolves.toEqual({
        ok: false,
        error: {
          code: 'billing_unavailable',
          message: 'Billing is temporarily unavailable. Try again shortly.',
        },
      });
    },
  );
});
