import { isSubscriptionStatus, type BillingInterval } from './billingPolicy.ts';
import { intervalForConfiguredPrice, verifyConfiguredPrice } from './stripe.ts';
import type { DbClient } from './supabase.ts';
import type Stripe from 'npm:stripe@22.4.0';

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

function currentPeriodEnd(subscription: UnknownRecord): number | null {
  if (typeof subscription.current_period_end === 'number') {
    return subscription.current_period_end;
  }
  const items = record(subscription.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const itemEnds = data
    .map((item) => record(item)?.current_period_end)
    .filter((value): value is number => typeof value === 'number');
  return itemEnds.length ? Math.max(...itemEnds) : null;
}

export async function applyCanonicalSubscription(input: {
  admin: DbClient;
  stripe: Stripe;
  workspaceId: string;
  subscription: UnknownRecord;
  eventId: string;
  eventType: string;
}): Promise<string> {
  const { admin, stripe, workspaceId, subscription, eventId, eventType } =
    input;
  const subscriptionId = idOf(subscription.id);
  const customerId = idOf(subscription.customer);
  if (
    !subscriptionId ||
    !customerId ||
    (subscription.livemode !== undefined && subscription.livemode !== false)
  ) {
    throw new Error('invalid_canonical_subscription');
  }

  const metadata = record(subscription.metadata);
  if (
    typeof metadata?.workspace_id === 'string' &&
    metadata.workspace_id !== workspaceId
  ) {
    throw new Error('subscription_workspace_mismatch');
  }

  const { data: billing, error: billingError } = await admin
    .from('workspace_billing')
    .select('stripe_customer_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (billingError) throw billingError;
  if (!billing || billing.stripe_customer_id !== customerId) {
    throw new Error('stripe_customer_mapping_mismatch');
  }

  const items = record(subscription.items);
  const itemData = Array.isArray(items?.data) ? items.data : [];
  let priceId: string | null = null;
  let quantity = 0;
  if (itemData.length === 1) {
    const item = record(itemData[0]);
    priceId = idOf(item?.price);
    quantity = typeof item?.quantity === 'number' ? item.quantity : 0;
  }
  let interval: BillingInterval | null = priceId
    ? intervalForConfiguredPrice(priceId)
    : null;
  let supportedPrice = false;
  if (priceId && interval && quantity === 1) {
    await verifyConfiguredPrice(stripe, interval);
    supportedPrice = true;
  }

  const status = isSubscriptionStatus(subscription.status)
    ? subscription.status
    : 'paused';
  const created = subscription.created;
  if (typeof created !== 'number' || created <= 0) {
    throw new Error('invalid_subscription_created_timestamp');
  }
  const periodEnd = currentPeriodEnd(subscription);
  const metadataInterval = metadata?.billing_interval;
  if (
    supportedPrice &&
    typeof metadataInterval === 'string' &&
    metadataInterval !== interval
  ) {
    supportedPrice = false;
    interval = null;
  }

  const { data, error } = await admin.rpc(
    'apply_stripe_subscription_reconciliation',
    {
      p_event_id: eventId,
      p_event_type: eventType,
      p_workspace_id: workspaceId,
      p_stripe_customer_id: customerId,
      p_stripe_subscription_id: subscriptionId,
      p_stripe_price_id: priceId ?? 'price_unknown',
      p_billing_interval: interval,
      p_subscription_status: status,
      p_subscription_created_at: created,
      p_current_period_end:
        periodEnd === null ? null : new Date(periodEnd * 1000).toISOString(),
      p_cancel_at_period_end: subscription.cancel_at_period_end === true,
      p_supported_price: supportedPrice,
    },
  );
  if (error) throw error;
  return typeof data === 'string' ? data : 'processed';
}
