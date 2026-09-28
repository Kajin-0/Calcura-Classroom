import {
  parseWorkspaceId,
  stripeObjectMatchesMode,
  type StripeMode,
} from '../_shared/billingPolicy.ts';
import { logBillingEvent } from '../_shared/http.ts';
import { requiredEnv, runtime } from '../_shared/runtime.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import { applyCanonicalSubscription } from '../_shared/subscriptionReconciliation.ts';
import { verifyStripeWebhookEvent } from '../_shared/verifyWebhook.ts';
import { configuredStripeMode, getStripe } from '../_shared/stripe.ts';
import Stripe from 'npm:stripe@22.4.0';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const valueRecord = record(value);
  return typeof valueRecord?.id === 'string' ? valueRecord.id : null;
}

function invoiceSubscriptionId(invoice: UnknownRecord): string | null {
  const direct = idOf(invoice.subscription);
  if (direct) return direct;

  const parent = record(invoice.parent);
  const details = record(parent?.subscription_details);
  const parentSubscription = idOf(details?.subscription);
  if (parentSubscription) return parentSubscription;

  const lines = record(invoice.lines);
  const data = Array.isArray(lines?.data) ? lines.data : [];
  for (const line of data) {
    const lineRecord = record(line);
    const lineParent = record(lineRecord?.parent);
    const itemDetails = record(lineParent?.subscription_item_details);
    const subscriptionId = idOf(itemDetails?.subscription);
    if (subscriptionId) return subscriptionId;
  }
  return null;
}

const RELEVANT_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

async function recordNoop(
  eventId: string,
  eventType: string,
  result: 'ignored' | 'unmapped',
  workspaceId: string | null = null,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('record_stripe_webhook_noop', {
    p_event_id: eventId,
    p_event_type: eventType,
    p_result: result,
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
  return typeof data === 'string' ? data : result;
}

runtime.serve(async (request) => {
  if (request.method !== 'POST')
    return new Response('Method not allowed', { status: 405 });

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature)
    return new Response('Invalid Stripe signature', { status: 400 });

  let stripe: Stripe;
  let mode: StripeMode;
  let webhookSecret: string;
  try {
    mode = configuredStripeMode();
    stripe = getStripe();
    webhookSecret = requiredEnv('STRIPE_WEBHOOK_SECRET');
  } catch {
    return new Response('Stripe webhook is not configured', { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = await verifyStripeWebhookEvent(
      rawBody,
      signature,
      webhookSecret,
      (body, signatureHeader, secret) =>
        stripe.webhooks.constructEventAsync(
          body,
          signatureHeader,
          secret,
          undefined,
          Stripe.createSubtleCryptoProvider(),
        ),
    );
  } catch {
    return new Response('Invalid Stripe signature', { status: 400 });
  }

  if (!stripeObjectMatchesMode(event, mode)) {
    return new Response('Stripe event mode does not match deployment mode', {
      status: 400,
    });
  }

  try {
    if (!RELEVANT_EVENTS.has(event.type)) {
      const result = await recordNoop(event.id, event.type, 'ignored');
      logBillingEvent({ event_id: event.id, event_type: event.type, result });
      return Response.json({ received: true, result });
    }

    const eventObject = record(event.data.object);
    if (!eventObject) {
      const result = await recordNoop(event.id, event.type, 'ignored');
      logBillingEvent({ event_id: event.id, event_type: event.type, result });
      return Response.json({ received: true, result });
    }

    let subscriptionId: string | null = null;
    if (event.type === 'checkout.session.completed') {
      if (eventObject.mode !== 'subscription') {
        const result = await recordNoop(event.id, event.type, 'ignored');
        return Response.json({ received: true, result });
      }
      subscriptionId = idOf(eventObject.subscription);
    } else if (event.type.startsWith('customer.subscription.')) {
      subscriptionId = idOf(eventObject.id);
    } else {
      subscriptionId = invoiceSubscriptionId(eventObject);
    }

    if (!subscriptionId) {
      const result = await recordNoop(event.id, event.type, 'ignored');
      logBillingEvent({ event_id: event.id, event_type: event.type, result });
      return Response.json({ received: true, result });
    }

    let subscription: UnknownRecord;
    try {
      subscription = await stripe.subscriptions
        .retrieve(subscriptionId)
        .then((value) => value as unknown as UnknownRecord);
    } catch (error) {
      const details = error as { statusCode?: number; code?: string };
      if (
        event.type === 'customer.subscription.deleted' &&
        (details.statusCode === 404 || details.code === 'resource_missing') &&
        eventObject.status === 'canceled'
      ) {
        subscription = eventObject;
      } else {
        throw error;
      }
    }

    if (subscription.id !== subscriptionId) {
      throw new Error('invalid_canonical_subscription');
    }

    const customerId = idOf(subscription.customer);
    if (!customerId) throw new Error('missing_subscription_customer');
    const admin = createAdminClient();
    const { data: billing, error: billingError } = await admin
      .from('workspace_billing')
      .select('workspace_id, stripe_customer_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (billingError) throw billingError;
    if (!billing || typeof billing.workspace_id !== 'string') {
      const result = await recordNoop(event.id, event.type, 'unmapped');
      logBillingEvent({
        event_id: event.id,
        event_type: event.type,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        result,
      });
      return Response.json({ received: true, result });
    }

    const workspaceId = parseWorkspaceId(billing.workspace_id);
    if (!workspaceId || billing.stripe_customer_id !== customerId) {
      const result = await recordNoop(event.id, event.type, 'unmapped');
      return Response.json({ received: true, result });
    }

    const sessionMetadata = record(eventObject.metadata);
    const sessionWorkspace =
      event.type === 'checkout.session.completed'
        ? sessionMetadata?.workspace_id
        : null;
    if (
      typeof sessionWorkspace === 'string' &&
      sessionWorkspace !== workspaceId
    ) {
      const result = await recordNoop(
        event.id,
        event.type,
        'ignored',
        workspaceId,
      );
      logBillingEvent({
        event_id: event.id,
        event_type: event.type,
        workspace_id: workspaceId,
        result,
      });
      return Response.json({ received: true, result });
    }

    const result = await applyCanonicalSubscription({
      admin,
      stripe,
      workspaceId,
      subscription,
      eventId: event.id,
      eventType: event.type,
    });
    logBillingEvent({
      event_id: event.id,
      event_type: event.type,
      workspace_id: workspaceId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      result,
    });
    return Response.json({ received: true, result });
  } catch {
    // A 5xx leaves the durable receipt uncommitted so Stripe can safely retry.
    return new Response('Webhook reconciliation failed', { status: 500 });
  }
});
