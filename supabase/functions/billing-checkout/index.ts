import {
  canManageWorkspaceBilling,
  parseBillingInterval,
  parseWorkspaceId,
  stripeObjectMatchesMode,
} from '../_shared/billingPolicy.ts';
import { validateWorkspaceCheckoutSession } from '../_shared/checkoutSession.ts';
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

interface CheckoutReservation {
  reservation_state: string;
  attempt_id: string | null;
  stripe_customer_id: string | null;
  checkout_session_id: string | null;
}

function parseReservation(data: unknown): CheckoutReservation {
  const row = Array.isArray(data) ? data[0] : null;
  if (
    !row ||
    typeof row.reservation_state !== 'string' ||
    ![row.attempt_id, row.stripe_customer_id, row.checkout_session_id].every(
      (value) => value === null || typeof value === 'string',
    )
  )
    throw new Error('invalid_checkout_reservation');
  return row;
}

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

    const conflict = () =>
      jsonResponse(
        request,
        { error: 'checkout_in_progress', retry: true },
        409,
      );
    const processing = () =>
      jsonResponse(request, { error: 'checkout_processing', retry: true }, 409);
    let reservation: CheckoutReservation | null = null;
    // Includes handoffs and stale-state re-evaluations; never recurse/retry
    // indefinitely. An uncertain Stripe operation never releases its attempt.
    for (let evaluation = 0; evaluation < 3; evaluation += 1) {
      if (!reservation) {
        const { data, error } = await admin.rpc('reserve_workspace_checkout', {
          p_workspace_id: workspaceId,
          p_actor_user_id: userId,
          p_billing_interval: interval,
        });
        if (error) throw error;
        reservation = parseReservation(data);
      }
      const attemptId = reservation.attempt_id;
      if (reservation.reservation_state === 'existing_subscription') {
        return jsonResponse(
          request,
          { error: 'subscription_exists', manage_billing: true },
          409,
        );
      }
      if (reservation.reservation_state === 'in_progress') return conflict();
      if (reservation.reservation_state === 'unavailable') {
        throw new Error('checkout_creation_unresolved');
      }

      if (
        ['existing_session', 'switch_session'].includes(
          reservation.reservation_state,
        )
      ) {
        const sessionId = reservation.checkout_session_id;
        const customerId = reservation.stripe_customer_id;
        if (!sessionId || !attemptId || !customerId)
          throw new Error('invalid_saved_checkout');
        const expected = {
          mode,
          sessionId,
          customerId,
          workspaceId,
          ...(reservation.reservation_state === 'existing_session'
            ? { interval }
            : {}),
        };
        let savedSession = await stripe.checkout.sessions.retrieve(sessionId);
        validateWorkspaceCheckoutSession(savedSession, expected);
        if (savedSession.status === 'complete') return processing();
        if (savedSession.status === 'open') {
          if (reservation.reservation_state === 'existing_session') {
            if (!savedSession.url) throw new Error('invalid_saved_checkout');
            return jsonResponse(request, { checkout_url: savedSession.url });
          }
          // Validate the target configuration before invalidating a usable URL.
          await verifyConfiguredPrice(stripe, interval);
          try {
            savedSession = await stripe.checkout.sessions.expire(
              sessionId,
              {},
              {
                idempotencyKey: `workspace-checkout-expire-${attemptId}-${sessionId}`,
              },
            );
          } catch {
            // Expiration can lose to completion (or succeed with a lost reply).
            // Only a canonical expired result allows the atomic handoff.
            savedSession = await stripe.checkout.sessions.retrieve(sessionId);
          }
          validateWorkspaceCheckoutSession(savedSession, expected);
          if (savedSession.status === 'complete') return processing();
        }
        if (savedSession.status !== 'expired')
          throw new Error('checkout_expiration_unconfirmed');

        const { data, error } = await admin.rpc(
          'replace_workspace_checkout_after_expire',
          {
            p_workspace_id: workspaceId,
            p_actor_user_id: userId,
            p_expected_attempt_id: attemptId,
            p_expected_session_id: sessionId,
            p_billing_interval: interval,
          },
        );
        if (error) throw error;
        const replacement = parseReservation(data);
        if (
          !['reserved', 'stale', 'existing_subscription'].includes(
            replacement.reservation_state,
          )
        ) {
          throw new Error('invalid_checkout_replacement');
        }
        logBillingEvent({
          action: 'checkout_replacement',
          workspace_id: workspaceId,
          billing_interval: interval,
          result: replacement.reservation_state,
        });
        reservation =
          replacement.reservation_state === 'stale' ? null : replacement;
        continue;
      }

      if (
        reservation.reservation_state !== 'reserved' ||
        !attemptId ||
        reservation.checkout_session_id
      ) {
        throw new Error('invalid_checkout_reservation');
      }
      const priceId = await verifyConfiguredPrice(stripe, interval);
      let customerId = reservation.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create(
          { metadata: { workspace_id: workspaceId } },
          { idempotencyKey: `workspace-customer-${workspaceId}` },
        );
        if (!stripeObjectMatchesMode(customer, mode))
          throw new Error('stripe_customer_mode_mismatch');
        customerId = customer.id;
        const { error } = await admin.rpc('save_workspace_stripe_customer', {
          p_workspace_id: workspaceId,
          p_actor_user_id: userId,
          p_attempt_id: attemptId,
          p_stripe_customer_id: customerId,
        });
        if (error) throw error;
      } else {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted || !stripeObjectMatchesMode(customer, mode))
          throw new Error('stripe_customer_mode_mismatch');
      }

      // Keep creation parameters and the attempt-scoped idempotency key stable
      // for recovery of an in-flight/lost creation response.
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: customerId,
          client_reference_id: workspaceId,
          line_items: [{ price: priceId, quantity: 1 }],
          metadata: { workspace_id: workspaceId, billing_interval: interval },
          subscription_data: {
            metadata: { workspace_id: workspaceId, billing_interval: interval },
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
        { idempotencyKey: `workspace-checkout-${attemptId}` },
      );
      validateWorkspaceCheckoutSession(session, {
        mode,
        sessionId: session.id,
        customerId,
        workspaceId,
        interval,
      });
      if (session.status === 'complete') return processing();
      if (session.status !== 'open' || !session.url || !session.expires_at) {
        throw new Error('invalid_stripe_checkout_session');
      }
      const { error } = await admin.rpc('save_workspace_checkout_session', {
        p_workspace_id: workspaceId,
        p_actor_user_id: userId,
        p_attempt_id: attemptId,
        p_stripe_session_id: session.id,
        p_session_expires_at: new Date(session.expires_at * 1000).toISOString(),
      });
      if (error) {
        if (
          error.code === 'P0001' &&
          error.message === 'checkout_reservation_expired'
        ) {
          reservation = null;
          continue;
        }
        throw error;
      }
      logBillingEvent({
        action: 'checkout_created',
        workspace_id: workspaceId,
        billing_interval: interval,
        stripe_customer_id: stripeObjectId(customerId),
        result: 'success',
      });
      return jsonResponse(request, { checkout_url: session.url });
    }
    return conflict();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const denied =
      message === 'not_authorized' ||
      (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '42501');
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
