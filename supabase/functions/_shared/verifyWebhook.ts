export async function verifyStripeWebhookEvent<T>(
  rawBody: string,
  signature: string | null,
  webhookSecret: string,
  verify: (body: string, signature: string, secret: string) => Promise<T>,
): Promise<T> {
  if (!signature) throw new Error('missing_stripe_signature');
  return await verify(rawBody, signature, webhookSecret);
}
