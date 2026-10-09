export const DEFAULT_AUTH_RETURN_DESTINATION = '/app';

export function safeAuthReturnDestination(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_AUTH_RETURN_DESTINATION;

  // Require an application path before URL parsing can normalize the input.
  if (!/^\/app(?:\/|[?#]|$)/.test(value) || /[\\\s\p{Cc}]/u.test(value)) {
    return DEFAULT_AUTH_RETURN_DESTINATION;
  }

  try {
    // Reject malformed escapes and traversal outside the application path.
    decodeURI(value);
    const url = new URL(value, 'https://classroom.calcura.study');
    const isAppPath =
      url.pathname === '/app' || url.pathname.startsWith('/app/');
    if (!isAppPath) return DEFAULT_AUTH_RETURN_DESTINATION;
    return value;
  } catch {
    return DEFAULT_AUTH_RETURN_DESTINATION;
  }
}

export function authReturnDestinationFromState(state: unknown): string {
  if (!state || typeof state !== 'object' || !('from' in state)) {
    return DEFAULT_AUTH_RETURN_DESTINATION;
  }

  return safeAuthReturnDestination(state.from);
}
