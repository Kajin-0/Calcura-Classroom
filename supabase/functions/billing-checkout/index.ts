import {
  canManageWorkspaceBilling,
  parseBillingInterval,
  parseWorkspaceId,
  stripeCheckoutSessionMatchesMode,
  stripeObjectMatchesMode,
} from '../_shared/billingPolicy.ts';
import {
  jsonResponse,
  logBillingEvent,
  optionsResponse,
  readJsonObject,
  rejectDisallowedOrigin,
} from '../_shared/http.ts';
import { runtime } from '../_shared/runtime.ts';
import {
  authenticateRequest,
  createAdminClient,
  workspaceBillingRole,
} from '../_shared/supabase.ts';
import {
  appReturnUrl,
  configuredStripeMode,
  getStripe,
  stripeObjectId,
  verifyConfiguredPrice,
} from '../_shared/stripe.ts';

runtime.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  const disallowed = rejectDisallowedOrigin(request);
  if (disallowed) return disallowed;
  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'method_not_allowed' }, 405);
  }

  try {
    const body = await readJsonObject(request);
    const workspaceId = parseWorkspaceId(body?.workspace_id);
    const interval = parseBillingInterval(body?.billing_interval);
    if (!workspaceId || !interval) {
      return jsonResponse(request, { error: 'invalid_request' }, 400);
    }

    const { userId } = await authenticateRequest(request);
    const mode = configuredStripeMode();
    const stripe = getStripe();
    const successUrl = appReturnUrl(
      '/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    );
    const cancelUrl = appReturnUrl('/app/billing?checkout=cancelled');
    const admin = createAdminClient();
    const role = await workspaceBillingRole(admin, workspaceId, userId);
    if (!canManageWorkspaceBilling(role)) {
      return jsonResponse(request, { error: 'not_authorized' }, 403);
    }

    const { data: reservations, error: reserveError } = await admin.rpc(
      'reserve_workspace_checkout',
      {
        p_workspace_id: workspaceId,
        p_actor_user_id: userId,
        p_billing_interval: interval,
      },
    );
    if (reserveError) throw reserveError;
    const reservation = Array.isArray(reservations) ? reservations[0] : null;
    if (!reservation || typeof reservation.reservation_state !== 'string') {
      throw new Error('invalid_checkout_reservation');
    }
    const attemptId =
      typeof reservation.attempt_id === 'string'
        ? reservation.attempt_id
        : null;

    if (reservation.reservation_state === 'existing_subscription') {
      return jsonResponse(
        request,
        { error: 'subscription_exists', manage_billing: true },
        409,
      );
    }
    if (reservation.reservation_state === 'in_progress') {
      return jsonResponse(
        request,
        { error: 'checkout_in_progress', retry: true },
        409,
      );
    }

    if (reservation.reservation_state === 'existing_session') {
      const sessionId =
        typeof reservation.checkout_session_id === 'string'
          ? reservation.checkout_session_id
          : null;
      if (!sessionId || !attemptId) throw new Error('invalid_saved_checkout');
      const savedSession = await stripe.checkout.sessions.retrieve(sessionId);
      if (
        !stripeCheckoutSessionMatchesMode(savedSession, mode) ||
        savedSession.mode !== 'subscription'
      ) {
        throw new Error('invalid_saved_checkout');
      }
      if (savedSession.status === 'open' && savedSession.url) {
        return jsonResponse(request, { checkout_url: savedSession.url });
      }
      if (savedSession.status === 'complete') {
        return jsonResponse(
          request,
          { error: 'checkout_processing', retry: true },
          409,
        );
      }
      const { error: releaseError } = await admin.rpc(
        'release_workspace_checkout',
        {
          p_workspace_id: workspaceId,
          p_attempt_id: attemptId,
        },
      );
      if (releaseError) throw releaseError;
      return jsonResponse(
        request,
        { error: 'checkout_expired', retry: true },
        409,
      );
    }

    if (reservation.reservation_state !== 'reserved' || !attemptId) {
      throw new Error('invalid_checkout_reservation');
    }

    const priceId = await verifyConfiguredPrice(stripe, interval);
    let customerId =
      typeof reservation.stripe_customer_id === 'string'
        ? reservation.stripe_customer_id
        : null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { metadata: { workspace_id: workspaceId } },
        { idempotencyKey: `workspace-customer-${workspaceId}` },
      );
      if (!stripeObjectMatchesMode(customer, mode)) {
        throw new Error('stripe_customer_mode_mismatch');
      }
      customerId = customer.id;
      const { error: customerError } = await admin.rpc(
        'save_workspace_stripe_customer',
        {
          p_workspace_id: workspaceId,
          p_actor_user_id: userId,
          p_attempt_id: attemptId,
          p_stripe_customer_id: customerId,
        },
      );
      if (customerError) throw customerError;
    } else {
      const customer = await stripe.customers.retrieve(customerId);
      if (!stripeObjectMatchesMode(customer, mode)) {
        throw new Error('stripe_customer_mode_mismatch');
      }
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        client_reference_id: workspaceId,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          workspace_id: workspaceId,
          billing_interval: interval,
        },
        subscription_data: {
          metadata: {
            workspace_id: workspaceId,
            billing_interval: interval,
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      { idempotencyKey: `workspace-checkout-${attemptId}` },
    );
    if (
      !stripeCheckoutSessionMatchesMode(session, mode) ||
      !session.url ||
      !session.expires_at
    ) {
      throw new Error('invalid_stripe_checkout_session');
    }

    const { error: sessionError } = await admin.rpc(
      'save_workspace_checkout_session',
      {
        p_workspace_id: workspaceId,
        p_actor_user_id: userId,
        p_attempt_id: attemptId,
        p_stripe_session_id: session.id,
        p_session_expires_at: new Date(session.expires_at * 1000).toISOString(),
      },
    );
    if (sessionError) throw sessionError;

    logBillingEvent({
      action: 'checkout_created',
      workspace_id: workspaceId,
      billing_interval: interval,
      stripe_customer_id: stripeObjectId(customerId),
      result: 'success',
    });
    return jsonResponse(request, { checkout_url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const denied = message === 'not_authorized';
    logBillingEvent({
      action: 'checkout_failed',
      result: denied ? 'denied' : 'error',
    });
    return jsonResponse(
      request,
      { error: denied ? 'not_authorized' : 'billing_unavailable' },
      denied ? 401 : 502,
    );
  }
});
