import {
  canManageWorkspaceBilling,
  parseWorkspaceId,
} from '../_shared/billingPolicy.ts';
import {
  jsonResponse,
  logBillingEvent,
  optionsResponse,
  readJsonObject,
  rejectDisallowedOrigin,
} from '../_shared/http.ts';
import { applyCanonicalSubscription } from '../_shared/subscriptionReconciliation.ts';
import { runtime } from '../_shared/runtime.ts';
import {
  authenticateRequest,
  createAdminClient,
  workspaceBillingRole,
} from '../_shared/supabase.ts';
import { getStripe } from '../_shared/stripe.ts';

runtime.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  const disallowed = rejectDisallowedOrigin(request);
  if (disallowed) return disallowed;
  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'method_not_allowed' }, 405);
  }

  let workspaceId: string | null = null;
  try {
    const body = await readJsonObject(request);
    workspaceId = parseWorkspaceId(body?.workspace_id);
    if (!workspaceId)
      return jsonResponse(request, { error: 'invalid_request' }, 400);

    const { userId } = await authenticateRequest(request);
    const admin = createAdminClient();
    const role = await workspaceBillingRole(admin, workspaceId, userId);
    if (!canManageWorkspaceBilling(role)) {
      return jsonResponse(request, { error: 'not_authorized' }, 403);
    }

    const { data: billing, error } = await admin
      .from('workspace_billing')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!billing || typeof billing.stripe_customer_id !== 'string') {
      return jsonResponse(request, { result: 'no_subscription' });
    }

    const stripe = getStripe();
    let subscription: Record<string, unknown>;
    if (typeof billing.stripe_subscription_id === 'string') {
      subscription = await stripe.subscriptions
        .retrieve(billing.stripe_subscription_id)
        .then((value) => value as unknown as Record<string, unknown>);
    } else {
      const list = await stripe.subscriptions.list({
        customer: billing.stripe_customer_id,
        status: 'all',
        limit: 100,
      });
      const newest = list.data.reduce<(typeof list.data)[number] | null>(
        (current, candidate) =>
          !current || candidate.created > current.created ? candidate : current,
        null,
      );
      if (!newest) return jsonResponse(request, { result: 'no_subscription' });
      subscription = newest as unknown as Record<string, unknown>;
    }
    if (subscription.customer !== billing.stripe_customer_id) {
      throw new Error('stripe_customer_mapping_mismatch');
    }

    // The existing atomic receipt RPC deduplicates Stripe event IDs. Internal
    // reconciliations use a unique evt_-shaped receipt with an explicit
    // internal.reconciliation event_type rather than inventing an ID policy.
    const eventId = `evt_reconcile${crypto.randomUUID().replaceAll('-', '')}`;
    const result = await applyCanonicalSubscription({
      admin,
      stripe,
      workspaceId,
      subscription,
      eventId,
      eventType: 'internal.reconciliation',
    });
    logBillingEvent({
      event_id: eventId,
      event_type: 'internal.reconciliation',
      workspace_id: workspaceId,
      stripe_customer_id: billing.stripe_customer_id,
      stripe_subscription_id: subscription.id,
      result,
    });
    return jsonResponse(request, { result });
  } catch (error) {
    const denied = error instanceof Error && error.message === 'not_authorized';
    logBillingEvent({
      action: 'reconciliation_failed',
      workspace_id: workspaceId,
      result: denied ? 'denied' : 'error',
    });
    return jsonResponse(
      request,
      { error: denied ? 'not_authorized' : 'billing_unavailable' },
      denied ? 401 : 502,
    );
  }
});
