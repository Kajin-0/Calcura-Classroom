export function parseTrustedAppOrigin(value: string): string {
  const parsed = new URL(value);
  const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
  const isLocalHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

  if (
    parsed.origin !== normalized ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    (parsed.protocol !== 'https:' && !isLocalHttp)
  ) {
    throw new Error(
      'APP_ORIGIN must be an exact HTTPS or local development origin.',
    );
  }

  return parsed.origin;
}

export function trustedAppReturnUrl(originValue: string, path: string): string {
  const origin = parseTrustedAppOrigin(originValue);
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Billing return paths must be same-origin absolute paths.');
  }
  const url = new URL(path, origin);
  if (url.origin !== origin) {
    throw new Error('Billing return paths must remain on APP_ORIGIN.');
  }
  return `${origin}${path}`;
}
