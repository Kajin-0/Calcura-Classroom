import {
  canManageWorkspaceBilling,
  parseWorkspaceId,
} from '../_shared/billingPolicy.ts';
import {
  jsonResponse,
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
import { appReturnUrl, getTestStripe } from '../_shared/stripe.ts';

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
      .select('stripe_customer_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!billing || typeof billing.stripe_customer_id !== 'string') {
      return jsonResponse(request, { error: 'billing_not_available' }, 409);
    }

    const stripe = getTestStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: appReturnUrl('/app/billing'),
    });
    if (session.livemode !== false)
      throw new Error('stripe_live_mode_rejected');
    return jsonResponse(request, { portal_url: session.url });
  } catch (error) {
    const denied = error instanceof Error && error.message === 'not_authorized';
    return jsonResponse(
      request,
      { error: denied ? 'not_authorized' : 'billing_unavailable' },
      denied ? 401 : 502,
    );
  }
});
