import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.generated';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  failure,
  mapClassroomError,
  type ServiceResult,
} from '../../lib/supabase/serviceResult';
import type { BillingInterval } from './billingTypes';

type Client = SupabaseClient<Database>;

export interface WorkspaceBillingSummary {
  billingInterval: BillingInterval | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canManageBilling: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function billingFunctionFailure(
  error: unknown,
): Promise<ServiceResult<never>> {
  if (error instanceof FunctionsHttpError) {
    try {
      const response: unknown = error.context;
      if (response instanceof Response) {
        // Supabase leaves non-2xx bodies unread. Preserve the original response
        // and accept only exact contract codes, never provider display text.
        const body: unknown = await response.clone().json();
        if (isRecord(body)) {
          switch (body.error) {
            case 'checkout_in_progress':
            case 'checkout_processing':
            case 'checkout_expired':
            case 'subscription_exists':
            case 'billing_unavailable':
            case 'not_authorized':
              return failure(body.error);
          }
        }
      }
    } catch {
      // Malformed, consumed, or unreadable responses keep the safe fallback.
    }
    return failure('unexpected');
  }
  return { ok: false, error: mapClassroomError(error) };
}

export function parseWorkspaceBillingSummary(
  value: unknown,
): WorkspaceBillingSummary | null {
  if (!isRecord(value)) return null;
  if (
    (value.billing_interval !== null &&
      value.billing_interval !== 'monthly' &&
      value.billing_interval !== 'annual') ||
    (value.subscription_status !== null &&
      typeof value.subscription_status !== 'string') ||
    (value.current_period_end !== null &&
      (typeof value.current_period_end !== 'string' ||
        !Number.isFinite(Date.parse(value.current_period_end)))) ||
    typeof value.cancel_at_period_end !== 'boolean' ||
    typeof value.can_manage_billing !== 'boolean'
  ) {
    return null;
  }
  return {
    billingInterval: value.billing_interval,
    subscriptionStatus: value.subscription_status,
    currentPeriodEnd: value.current_period_end,
    cancelAtPeriodEnd: value.cancel_at_period_end,
    canManageBilling: value.can_manage_billing,
  };
}

function resolveClient(client: Client | null): ServiceResult<Client> {
  return client ? { ok: true, value: client } : failure('not_configured');
}

export async function getWorkspaceBillingSummary(
  workspaceId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<WorkspaceBillingSummary>> {
  if (!workspaceId.trim()) return failure('workspace_not_found');
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;
  try {
    const { data, error } = await resolved.value.functions.invoke(
      'billing-summary',
      { body: { workspace_id: workspaceId } },
    );
    if (error) return billingFunctionFailure(error);
    const parsed = parseWorkspaceBillingSummary(data);
    return parsed ? { ok: true, value: parsed } : failure('unexpected');
  } catch (error) {
    return billingFunctionFailure(error);
  }
}

async function invokeHostedUrl(
  functionName: 'billing-portal',
  workspaceId: string,
  client: Client | null,
): Promise<ServiceResult<string>> {
  if (!workspaceId.trim()) return failure('workspace_not_found');
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;
  try {
    const { data, error } = await resolved.value.functions.invoke(
      functionName,
      {
        body: { workspace_id: workspaceId },
      },
    );
    if (error) return billingFunctionFailure(error);
    const url = isRecord(data) ? data.portal_url : null;
    if (typeof url !== 'string') return failure('unexpected');
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'billing.stripe.com'
    ) {
      return failure('unexpected');
    }
    return { ok: true, value: url };
  } catch (error) {
    return billingFunctionFailure(error);
  }
}

export async function createCheckoutSession(
  workspaceId: string,
  interval: BillingInterval,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<string>> {
  if (!workspaceId.trim()) return failure('workspace_not_found');
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;
  try {
    const { data, error } = await resolved.value.functions.invoke(
      'billing-checkout',
      { body: { workspace_id: workspaceId, billing_interval: interval } },
    );
    if (error) return billingFunctionFailure(error);
    if (!isRecord(data) || typeof data.checkout_url !== 'string') {
      return failure('unexpected');
    }
    const parsed = new URL(data.checkout_url);
    return parsed.protocol === 'https:' &&
      parsed.hostname === 'checkout.stripe.com'
      ? { ok: true, value: data.checkout_url }
      : failure('unexpected');
  } catch (error) {
    return billingFunctionFailure(error);
  }
}

export async function reconcileWorkspaceBilling(
  workspaceId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<string>> {
  if (!workspaceId.trim()) return failure('workspace_not_found');
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;
  try {
    const { data, error } = await resolved.value.functions.invoke(
      'billing-reconcile',
      { body: { workspace_id: workspaceId } },
    );
    if (error) return billingFunctionFailure(error);
    if (
      !isRecord(data) ||
      ![
        'processed',
        'stale',
        'duplicate',
        'ignored',
        'no_subscription',
      ].includes(String(data.result))
    ) {
      return failure('unexpected');
    }
    return { ok: true, value: String(data.result) };
  } catch (error) {
    return billingFunctionFailure(error);
  }
}

export function createBillingPortalSession(
  workspaceId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<string>> {
  return invokeHostedUrl('billing-portal', workspaceId, client);
}
