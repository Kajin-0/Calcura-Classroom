export const BILLING_INTERVALS = ['monthly', 'annual'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const STRIPE_MODES = ['test', 'live'] as const;
export type StripeMode = (typeof STRIPE_MODES)[number];

export interface StripeBillingConfiguration {
  mode: StripeMode;
  secretKey: string;
  productId: string;
  monthlyPriceId: string;
  annualPriceId: string;
}

export function parseStripeBillingConfiguration(input: {
  mode: unknown;
  secretKey: unknown;
  productId: unknown;
  monthlyPriceId: unknown;
  annualPriceId: unknown;
}): StripeBillingConfiguration | null {
  const mode = parseStripeMode(input.mode);
  const isProductId =
    typeof input.productId === 'string' &&
    /^prod_[A-Za-z0-9_]+$/.test(input.productId);
  const isPriceId = (value: unknown): value is string =>
    typeof value === 'string' && /^price_[A-Za-z0-9_]+$/.test(value);

  if (
    !mode ||
    typeof input.secretKey !== 'string' ||
    !stripeSecretMatchesMode(input.secretKey, mode) ||
    !isProductId ||
    !isPriceId(input.monthlyPriceId) ||
    !isPriceId(input.annualPriceId) ||
    input.monthlyPriceId === input.annualPriceId
  ) {
    return null;
  }

  return {
    mode,
    secretKey: input.secretKey,
    productId: input.productId as string,
    monthlyPriceId: input.monthlyPriceId,
    annualPriceId: input.annualPriceId,
  };
}

export function parseStripeMode(value: unknown): StripeMode | null {
  return value === 'test' || value === 'live' ? value : null;
}

export function stripeModeIsLive(mode: StripeMode): boolean {
  return mode === 'live';
}

export function stripeSecretMatchesMode(
  secretKey: unknown,
  mode: StripeMode,
): boolean {
  return (
    typeof secretKey === 'string' &&
    secretKey.startsWith(mode === 'live' ? 'sk_live_' : 'sk_test_')
  );
}

export function stripeObjectMatchesMode(
  value: { livemode?: unknown },
  mode: StripeMode,
): boolean {
  return value.livemode === stripeModeIsLive(mode);
}

export function stripeCheckoutSessionMatchesMode(
  session: { id?: unknown; livemode?: unknown },
  mode: StripeMode,
): boolean {
  const expectedPrefix = mode === 'live' ? 'cs_live_' : 'cs_test_';
  return (
    stripeObjectMatchesMode(session, mode) &&
    typeof session.id === 'string' &&
    session.id.startsWith(expectedPrefix)
  );
}

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
    product?: unknown;
    currency?: unknown;
    unit_amount?: unknown;
    recurring?: { interval?: unknown; interval_count?: unknown } | null;
  },
  configuredPriceId: string,
  configuredProductId: string,
  mode: StripeMode,
): boolean {
  const expectation = priceExpectation(interval);
  const priceProduct = price.product;
  const actualProductId =
    typeof priceProduct === 'string'
      ? priceProduct
      : typeof priceProduct === 'object' &&
          priceProduct !== null &&
          'id' in priceProduct
        ? (priceProduct as { id?: unknown }).id
        : null;
  return (
    price.id === configuredPriceId &&
    price.active === true &&
    price.livemode === stripeModeIsLive(mode) &&
    actualProductId === configuredProductId &&
    price.currency === expectation.currency &&
    price.unit_amount === expectation.unitAmount &&
    price.recurring?.interval === expectation.interval &&
    (price.recurring.interval_count ?? 1) === expectation.intervalCount
  );
}

export function stripeProductMatches(
  product: { id?: unknown; active?: unknown; livemode?: unknown },
  configuredProductId: string,
  mode: StripeMode,
): boolean {
  return (
    product.id === configuredProductId &&
    product.active === true &&
    stripeObjectMatchesMode(product, mode)
  );
}
