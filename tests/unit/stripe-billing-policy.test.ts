import { describe, expect, it } from 'vitest';
import {
  canManageWorkspaceBilling,
  decideEntitlement,
  parseBillingInterval,
  parseWorkspaceId,
  priceExpectation,
  stripePriceMatches,
} from '../../supabase/functions/_shared/billingPolicy';

const now = new Date('2026-09-27T12:00:00.000Z');
const periodEnd = new Date('2026-10-27T12:00:00.000Z');

describe('Stripe billing policy', () => {
  it('accepts only the two bounded billing intervals and valid workspace IDs', () => {
    expect(parseBillingInterval('monthly')).toBe('monthly');
    expect(parseBillingInterval('annual')).toBe('annual');
    expect(parseBillingInterval('weekly')).toBeNull();
    expect(parseWorkspaceId('a7e04ca0-0864-48f2-9990-86df20d74bc2')).toBe(
      'a7e04ca0-0864-48f2-9990-86df20d74bc2',
    );
    expect(parseWorkspaceId('known-but-not-a-uuid')).toBeNull();
  });

  it('permits billing only for workspace owners and admins', () => {
    expect(canManageWorkspaceBilling('owner')).toBe(true);
    expect(canManageWorkspaceBilling('admin')).toBe(true);
    expect(canManageWorkspaceBilling('educator')).toBe(false);
    expect(canManageWorkspaceBilling('student')).toBe(false);
    expect(canManageWorkspaceBilling(null)).toBe(false);
  });

  it('locks the configured amounts, currency, recurrence, active status, and test mode', () => {
    expect(priceExpectation('monthly')).toEqual({
      interval: 'month',
      intervalCount: 1,
      unitAmount: 1900,
      currency: 'usd',
    });
    expect(priceExpectation('annual').unitAmount).toBe(14900);
    const monthly = {
      id: 'price_test_monthly',
      active: true,
      livemode: false,
      currency: 'usd',
      unit_amount: 1900,
      recurring: { interval: 'month', interval_count: 1 },
    };
    expect(stripePriceMatches('monthly', monthly, 'price_test_monthly')).toBe(
      true,
    );
    expect(
      stripePriceMatches(
        'monthly',
        { ...monthly, unit_amount: 100 },
        'price_test_monthly',
      ),
    ).toBe(false);
    expect(
      stripePriceMatches(
        'monthly',
        { ...monthly, livemode: true },
        'price_test_monthly',
      ),
    ).toBe(false);
    expect(
      stripePriceMatches(
        'monthly',
        { ...monthly, recurring: { interval: 'year', interval_count: 1 } },
        'price_test_monthly',
      ),
    ).toBe(false);
  });

  it('grants Pro only for a supported price and a current paid period', () => {
    expect(
      decideEntitlement({
        status: 'active',
        supportedPrice: true,
        currentPeriodEnd: periodEnd,
        pastDueSince: null,
        now,
      }),
    ).toEqual({ plan: 'pro', expiresAt: periodEnd, nextPastDueSince: null });

    expect(
      decideEntitlement({
        status: 'active',
        supportedPrice: false,
        currentPeriodEnd: periodEnd,
        pastDueSince: null,
        now,
      }).plan,
    ).toBe('teacher_free');
    expect(
      decideEntitlement({
        status: 'active',
        supportedPrice: true,
        currentPeriodEnd: new Date(now.getTime() - 1),
        pastDueSince: null,
        now,
      }).plan,
    ).toBe('teacher_free');
  });

  it('keeps scheduled cancellation through period end and uses a bounded non-renewing grace period', () => {
    expect(
      decideEntitlement({
        status: 'canceled',
        supportedPrice: true,
        currentPeriodEnd: periodEnd,
        pastDueSince: null,
        now,
      }).plan,
    ).toBe('pro');

    expect(
      decideEntitlement({
        status: 'past_due',
        supportedPrice: true,
        currentPeriodEnd: periodEnd,
        pastDueSince: null,
        now,
      }).expiresAt?.toISOString(),
    ).toBe('2026-10-04T12:00:00.000Z');

    expect(
      decideEntitlement({
        status: 'past_due',
        supportedPrice: true,
        currentPeriodEnd: periodEnd,
        pastDueSince: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        now,
      }).plan,
    ).toBe('teacher_free');
  });

  it.each([
    'trialing',
    'incomplete',
    'incomplete_expired',
    'unpaid',
    'paused',
  ] as const)('fails closed to Free for %s', (status) => {
    expect(
      decideEntitlement({
        status,
        supportedPrice: true,
        currentPeriodEnd: periodEnd,
        pastDueSince: null,
        now,
      }).plan,
    ).toBe('teacher_free');
  });
});
