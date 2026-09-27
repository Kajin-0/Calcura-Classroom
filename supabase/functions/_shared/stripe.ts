import Stripe from 'npm:stripe@22.4.0';
import { stripePriceMatches, type BillingInterval } from './billingPolicy.ts';
import { requiredEnv } from './runtime.ts';

export function getTestStripe(): Stripe {
  const secret = requiredEnv('STRIPE_SECRET_KEY');
  if (!secret.startsWith('sk_test_')) {
    throw new Error('Stripe test mode is required for this deployment.');
  }
  return new Stripe(secret, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function configuredPriceId(interval: BillingInterval): string {
  const ids = configuredPriceIds();
  return ids[interval];
}

export async function verifyConfiguredPrice(
  stripe: Stripe,
  interval: BillingInterval,
): Promise<string> {
  const priceId = configuredPriceId(interval);
  const price = await stripe.prices.retrieve(priceId);
  if (!stripePriceMatches(interval, price, priceId)) {
    throw new Error(
      'Configured Stripe test Price does not match the supported plan.',
    );
  }
  return priceId;
}

export function intervalForConfiguredPrice(
  priceId: string,
): BillingInterval | null {
  const ids = configuredPriceIds();
  if (priceId === ids.monthly) return 'monthly';
  if (priceId === ids.annual) return 'annual';
  return null;
}

function configuredPriceIds(): Record<BillingInterval, string> {
  const monthly = requiredEnv('STRIPE_PRO_MONTHLY_PRICE_ID');
  const annual = requiredEnv('STRIPE_PRO_ANNUAL_PRICE_ID');
  if (monthly === annual) {
    throw new Error('Monthly and annual Stripe test Prices must be distinct.');
  }
  return { monthly, annual };
}

export function appReturnUrl(path: string): string {
  const origin = new URL(requiredEnv('APP_ORIGIN')).origin;
  return `${origin}${path}`;
}

export function stripeObjectId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (typeof value === 'string') return value;
  return value && typeof value.id === 'string' ? value.id : null;
}
