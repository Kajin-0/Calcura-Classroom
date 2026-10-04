// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  serve: vi.fn(),
  verify: vi.fn(),
  admin: vi.fn(),
  stripe: vi.fn(),
}));
vi.mock('../../supabase/functions/_shared/runtime.ts', () => ({
  runtime: { serve: h.serve },
  requiredEnv: () => 'local-test-only',
}));
vi.mock('../../supabase/functions/_shared/supabase.ts', () => ({
  createAdminClient: h.admin,
}));
vi.mock(
  '../../supabase/functions/_shared/subscriptionReconciliation.ts',
  () => ({ applyCanonicalSubscription: vi.fn() }),
);
vi.mock('../../supabase/functions/_shared/verifyWebhook.ts', () => ({
  verifyStripeWebhookEvent: h.verify,
}));
vi.mock('../../supabase/functions/_shared/stripe.ts', () => ({
  configuredStripeMode: () => 'test',
  getStripe: h.stripe,
}));

let handler: (request: Request) => Promise<Response>;
beforeAll(async () => {
  const entry = '../../supabase/functions/stripe-webhook/index.ts';
  await import(entry);
  handler = h.serve.mock.calls[0]![0];
});
beforeEach(() => {
  h.verify.mockReset();
  h.admin.mockReset();
  h.stripe.mockReset();
  h.stripe.mockReturnValue({});
});

describe('actual Stripe webhook ingress', () => {
  it('rejects a missing signature without consuming an attacker-controlled body', async () => {
    const input = new Request('https://edge.example.test/stripe-webhook', {
      method: 'POST',
      body: 'untrusted',
    });
    const text = vi
      .spyOn(input, 'text')
      .mockRejectedValue(new Error('must not read'));
    expect((await handler(input)).status).toBe(400);
    expect(text).not.toHaveBeenCalled();
    expect(h.stripe).not.toHaveBeenCalled();
    expect(h.admin).not.toHaveBeenCalled();
  });

  it('returns a controlled denial for a disconnected signed body', async () => {
    const input = new Request('https://edge.example.test/stripe-webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'fixture' },
      body: 'body',
    });
    vi.spyOn(input, 'text').mockRejectedValue(new Error('disconnected'));
    expect((await handler(input)).status).toBe(400);
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.admin).not.toHaveBeenCalled();
  });

  it('preserves the exact raw body for signature verification and denies forged signatures', async () => {
    const raw = '{"event":"test"}\n  ';
    h.verify.mockRejectedValue(new Error('invalid signature'));
    const response = await handler(
      new Request('https://edge.example.test/stripe-webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'fixture' },
        body: raw,
      }),
    );
    expect(response.status).toBe(400);
    expect(h.verify.mock.calls[0]?.slice(0, 3)).toEqual([
      raw,
      'fixture',
      'local-test-only',
    ]);
    expect(h.admin).not.toHaveBeenCalled();
  });

  it('denies a verified wrong-mode event before touching the database', async () => {
    h.verify.mockResolvedValue({ livemode: true });
    expect(
      (
        await handler(
          new Request('https://edge.example.test/stripe-webhook', {
            method: 'POST',
            headers: { 'stripe-signature': 'fixture' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(400);
    expect(h.admin).not.toHaveBeenCalled();
  });

  it.each(['GET', 'PUT', 'OPTIONS'])(
    'denies method %s before consuming a body',
    async (method) => {
      expect(
        (
          await handler(
            new Request('https://edge.example.test/stripe-webhook', { method }),
          )
        ).status,
      ).toBe(405);
      expect(h.stripe).not.toHaveBeenCalled();
      expect(h.admin).not.toHaveBeenCalled();
    },
  );
});
