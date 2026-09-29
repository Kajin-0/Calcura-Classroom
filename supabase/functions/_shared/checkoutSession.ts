import {
  parseBillingInterval,
  stripeCheckoutSessionMatchesMode,
  type BillingInterval,
  type StripeMode,
} from './billingPolicy.ts';

// Only intent/association fields; no card data or generated provider messages.
interface WorkspaceCheckoutSession {
  id: string;
  livemode: boolean;
  mode: string | null;
  status: string | null;
  customer: string | { id: string } | null;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
  subscription: string | { id: string } | null;
  payment_link: string | { id: string } | null;
  recovered_from: string | null;
  after_expiration: { recovery?: { enabled: boolean } | null } | null;
}

export function validateWorkspaceCheckoutSession(
  session: WorkspaceCheckoutSession,
  expected: {
    mode: StripeMode;
    sessionId: string;
    customerId: string;
    workspaceId: string;
    interval?: BillingInterval;
  },
): void {
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id;
  const interval = parseBillingInterval(session.metadata?.billing_interval);
  if (
    !stripeCheckoutSessionMatchesMode(session, expected.mode) ||
    session.id !== expected.sessionId ||
    session.mode !== 'subscription' ||
    customerId !== expected.customerId ||
    session.client_reference_id !== expected.workspaceId ||
    session.metadata?.workspace_id !== expected.workspaceId ||
    !interval ||
    (expected.interval !== undefined && interval !== expected.interval) ||
    !['open', 'complete', 'expired'].includes(session.status ?? '') ||
    (session.status !== 'complete' && session.subscription !== null) ||
    session.payment_link !== null ||
    session.recovered_from !== null ||
    session.after_expiration?.recovery?.enabled
  ) {
    throw new Error('invalid_workspace_checkout_session');
  }
}
