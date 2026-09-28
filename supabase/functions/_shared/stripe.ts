import Stripe from 'npm:stripe@22.4.0';
import {
  parseStripeBillingConfiguration,
  stripePriceMatches,
  stripeProductMatches,
  type BillingInterval,
  type StripeBillingConfiguration,
  type StripeMode,
} from './billingPolicy.ts';
import { trustedAppReturnUrl } from './appOrigin.ts';
import { requiredEnv } from './runtime.ts';

export function configuredStripeMode(): StripeMode {
  return stripeConfiguration().mode;
}

export function getStripe(): Stripe {
  const configuration = stripeConfiguration();
  return new Stripe(configuration.secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function configuredPriceId(interval: BillingInterval): string {
  const configuration = stripeConfiguration();
  return interval === 'monthly'
    ? configuration.monthlyPriceId
    : configuration.annualPriceId;
}

export async function verifyConfiguredPrice(
  stripe: Stripe,
  interval: BillingInterval,
): Promise<string> {
  const configuration = stripeConfiguration();
  const { mode } = configuration;
  const priceId =
    interval === 'monthly'
      ? configuration.monthlyPriceId
      : configuration.annualPriceId;
  const productId = configuration.productId;
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  if (!stripePriceMatches(interval, price, priceId, productId, mode)) {
    throw new Error(
      'Configured Stripe Price does not match the supported plan.',
    );
  }
  const productReference = price.product;
  const product =
    typeof productReference === 'string'
      ? await stripe.products.retrieve(productReference)
      : productReference;
  if (
    !product ||
    typeof product !== 'object' ||
    !stripeProductMatches(product, productId, mode)
  ) {
    throw new Error('Configured Stripe Product does not match STRIPE_MODE.');
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

function stripeConfiguration(): StripeBillingConfiguration {
  const configuration = parseStripeBillingConfiguration({
    mode: requiredEnv('STRIPE_MODE'),
    secretKey: requiredEnv('STRIPE_SECRET_KEY'),
    productId: requiredEnv('STRIPE_PRO_PRODUCT_ID'),
    monthlyPriceId: requiredEnv('STRIPE_PRO_MONTHLY_PRICE_ID'),
    annualPriceId: requiredEnv('STRIPE_PRO_ANNUAL_PRICE_ID'),
  });
  if (!configuration) {
    throw new Error(
      'Stripe mode, secret key, Product, and Price configuration must match.',
    );
  }
  return configuration;
}

export function appReturnUrl(path: string): string {
  return trustedAppReturnUrl(requiredEnv('APP_ORIGIN'), path);
}

export function stripeObjectId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (typeof value === 'string') return value;
  return value && typeof value.id === 'string' ? value.id : null;
}
