export const BILLING_INTERVALS = ['monthly', 'annual'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const STRIPE_SUBSCRIPTION_STATUSES = [
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
  'trialing',
] as const;
export type StripeSubscriptionStatus =
  (typeof STRIPE_SUBSCRIPTION_STATUSES)[number];

export function canManageWorkspaceBilling(role: unknown): boolean {
  return role === 'owner' || role === 'admin';
}

export function parseBillingInterval(value: unknown): BillingInterval | null {
  return value === 'monthly' || value === 'annual' ? value : null;
}

export function parseWorkspaceId(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return null;
  }
  return value;
}

export function isSubscriptionStatus(
  value: unknown,
): value is StripeSubscriptionStatus {
  return STRIPE_SUBSCRIPTION_STATUSES.includes(
    value as StripeSubscriptionStatus,
  );
}

export interface StripePriceExpectation {
  interval: 'month' | 'year';
  intervalCount: number;
  unitAmount: number;
  currency: string;
}

export function priceExpectation(
  interval: BillingInterval,
): StripePriceExpectation {
  return {
    interval: interval === 'monthly' ? 'month' : 'year',
    intervalCount: 1,
    unitAmount: interval === 'monthly' ? 1900 : 14900,
    currency: 'usd',
  };
}

export interface EntitlementDecisionInput {
  status: StripeSubscriptionStatus;
  supportedPrice: boolean;
  currentPeriodEnd: Date | null;
  pastDueSince: Date | null;
  now: Date;
}

export interface EntitlementDecision {
  plan: 'teacher_free' | 'pro';
  expiresAt: Date | null;
  nextPastDueSince: Date | null;
}

export function decideEntitlement({
  status,
  supportedPrice,
  currentPeriodEnd,
  pastDueSince,
  now,
}: EntitlementDecisionInput): EntitlementDecision {
  const free = (nextPastDueSince: Date | null = null): EntitlementDecision => ({
    plan: 'teacher_free',
    expiresAt: null,
    nextPastDueSince,
  });

  if (
    !supportedPrice ||
    !currentPeriodEnd ||
    currentPeriodEnd.getTime() <= now.getTime()
  ) {
    return free(status === 'past_due' ? (pastDueSince ?? now) : null);
  }

  if (status === 'active' || status === 'canceled') {
    return { plan: 'pro', expiresAt: currentPeriodEnd, nextPastDueSince: null };
  }

  if (status === 'past_due') {
    const firstPastDue = pastDueSince ?? now;
    const graceEnd = new Date(firstPastDue.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (graceEnd.getTime() > now.getTime()) {
      return {
        plan: 'pro',
        expiresAt:
          graceEnd.getTime() < currentPeriodEnd.getTime()
            ? graceEnd
            : currentPeriodEnd,
        nextPastDueSince: firstPastDue,
      };
    }
    return free(firstPastDue);
  }

  // Trials are intentionally disabled; incomplete, unpaid, and paused
  // subscriptions fail closed to Teacher Free.
  return free(null);
}

export function stripePriceMatches(
  interval: BillingInterval,
  price: {
    id?: unknown;
    active?: unknown;
    livemode?: unknown;
    currency?: unknown;
    unit_amount?: unknown;
    recurring?: { interval?: unknown; interval_count?: unknown } | null;
  },
  configuredPriceId: string,
): boolean {
  const expectation = priceExpectation(interval);
  return (
    price.id === configuredPriceId &&
    price.active === true &&
    price.livemode === false &&
    price.currency === expectation.currency &&
    price.unit_amount === expectation.unitAmount &&
    price.recurring?.interval === expectation.interval &&
    (price.recurring.interval_count ?? 1) === expectation.intervalCount
  );
}
