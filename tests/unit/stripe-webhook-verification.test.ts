import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { stripeObjectMatchesMode } from '../../supabase/functions/_shared/billingPolicy';
import { verifyStripeWebhookEvent } from '../../supabase/functions/_shared/verifyWebhook';

const signingSecret = 'whsec_local_phase9_test_secret';
const stripe = new Stripe('sk_test_phase9_unit_key');

function payload(livemode = false): string {
  return `${JSON.stringify({
    id: 'evt_phase9signature01',
    object: 'event',
    api_version: '2025-06-30.basil',
    created: 1790500000,
    data: { object: { id: 'sub_phase9signature' } },
    livemode,
    pending_webhooks: 1,
    request: null,
    type: 'customer.subscription.updated',
  })}\n  `;
}

function signatureFor(body: string): string {
  return stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: signingSecret,
    timestamp: Math.floor(Date.now() / 1000),
  });
}

describe('Stripe raw-body signature boundary', () => {
  it('accepts a valid signature over the exact raw request body', async () => {
    const rawBody = payload();
    const signature = signatureFor(rawBody);
    const verify = vi.fn((body: string, header: string, secret: string) =>
      stripe.webhooks.constructEventAsync(body, header, secret),
    );

    const event = await verifyStripeWebhookEvent(
      rawBody,
      signature,
      signingSecret,
      verify,
    );

    expect(event).toMatchObject({
      id: 'evt_phase9signature01',
      type: 'customer.subscription.updated',
      livemode: false,
    });
    expect(verify).toHaveBeenCalledExactlyOnceWith(
      rawBody,
      signature,
      signingSecret,
    );
  });

  it('rejects a missing signature before calling Stripe verification', async () => {
    const verify = vi.fn();
    await expect(
      verifyStripeWebhookEvent(payload(), null, signingSecret, verify),
    ).rejects.toThrow('missing_stripe_signature');
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature', async () => {
    const rawBody = payload();
    const verify = (body: string, header: string, secret: string) =>
      stripe.webhooks.constructEventAsync(body, header, secret);
    await expect(
      verifyStripeWebhookEvent(
        rawBody,
        `${signatureFor(rawBody)}x`,
        signingSecret,
        verify,
      ),
    ).rejects.toThrow(/signature/i);
  });

  it('rejects a body changed after Stripe signed it', async () => {
    const original = payload();
    const signature = signatureFor(original);
    const modified = `${original} `;
    const verify = (body: string, header: string, secret: string) =>
      stripe.webhooks.constructEventAsync(body, header, secret);
    await expect(
      verifyStripeWebhookEvent(modified, signature, signingSecret, verify),
    ).rejects.toThrow(/signature/i);
  });

  it('rejects a correctly signed event from the other configured mode', async () => {
    const rawBody = payload(true);
    const signature = signatureFor(rawBody);
    const event = await verifyStripeWebhookEvent(
      rawBody,
      signature,
      signingSecret,
      (body, header, secret) =>
        stripe.webhooks.constructEventAsync(body, header, secret),
    );

    expect(event.livemode).toBe(true);
    expect(stripeObjectMatchesMode(event, 'test')).toBe(false);
    expect(stripeObjectMatchesMode(event, 'live')).toBe(true);
  });
});
