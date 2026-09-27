import { parseWorkspaceId } from '../_shared/billingPolicy.ts';
import {
  jsonResponse,
  optionsResponse,
  readJsonObject,
  rejectDisallowedOrigin,
} from '../_shared/http.ts';
import { runtime } from '../_shared/runtime.ts';
import { authenticateRequest } from '../_shared/supabase.ts';

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

    const { userClient } = await authenticateRequest(request);
    const { data, error } = await userClient.rpc(
      'get_workspace_billing_summary',
      { p_workspace_id: workspaceId },
    );
    if (error) {
      const denied = error.code === '42501';
      return jsonResponse(
        request,
        { error: denied ? 'not_authorized' : 'billing_unavailable' },
        denied ? 403 : 502,
      );
    }
    if (!Array.isArray(data) || data.length !== 1) {
      return jsonResponse(request, { error: 'billing_unavailable' }, 502);
    }
    const row = data[0] as Record<string, unknown>;
    return jsonResponse(request, {
      billing_interval: row.billing_interval ?? null,
      subscription_status: row.subscription_status ?? null,
      current_period_end: row.current_period_end ?? null,
      cancel_at_period_end: row.cancel_at_period_end === true,
      can_manage_billing: row.can_manage_billing === true,
    });
  } catch (error) {
    const denied = error instanceof Error && error.message === 'not_authorized';
    return jsonResponse(
      request,
      { error: denied ? 'not_authorized' : 'billing_unavailable' },
      denied ? 401 : 502,
    );
  }
});
