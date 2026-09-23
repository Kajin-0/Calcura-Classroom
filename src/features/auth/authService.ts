import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../lib/supabase/client';

export const RESEND_COOLDOWN_MS = 60_000;

export type AuthFailureCode =
  | 'invalid_email'
  | 'incorrect_code'
  | 'rate_limited'
  | 'network'
  | 'not_configured'
  | 'provider';

export interface AuthFailure {
  code: AuthFailureCode;
  message: string;
}

export type AuthResult<T> =
  { ok: true; value: T } | { ok: false; error: AuthFailure };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value: string): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

export const isValidEmail = (value: string): boolean =>
  emailPattern.test(normalizeEmail(value));

export const normalizeOtp = (value: string): string =>
  String(value ?? '').replace(/\D/g, '');

const failure = (code: AuthFailureCode, message: string): AuthFailure => ({
  code,
  message,
});

const providerFailure = (
  error: unknown,
  action: 'send' | 'verify' | 'sign_out' | 'session',
): AuthFailure => {
  const authError = error as Partial<AuthError> & {
    message?: string;
    status?: number;
  };
  const status = authError.status;
  const message = authError.message?.toLowerCase() ?? '';

  if (status === 429 || message.includes('rate limit')) {
    return failure(
      'rate_limited',
      'Too many attempts. Wait a little before trying again.',
    );
  }
  if (message.includes('network') || message.includes('fetch')) {
    return failure(
      'network',
      'Could not reach the sign-in service. Check your connection and try again.',
    );
  }
  if (action === 'session') {
    return failure(
      'provider',
      'Could not check your sign-in status. Reload the page or check your connection.',
    );
  }
  if (action === 'verify') {
    return failure(
      'incorrect_code',
      'That code is invalid or has expired. Request a new code and try again.',
    );
  }
  if (action === 'send') {
    return failure(
      'provider',
      'We could not send a sign-in code. Check the email address and try again.',
    );
  }
  return failure('provider', 'We could not sign you out. Try again.');
};

const clientOrFailure = (
  client: SupabaseClient | null,
): AuthResult<SupabaseClient> =>
  client
    ? { ok: true, value: client }
    : {
        ok: false,
        error: failure(
          'not_configured',
          'Sign in is not configured on this installation.',
        ),
      };

export async function loadSession(
  client: SupabaseClient | null = getSupabaseClient(),
): Promise<AuthResult<Session | null>> {
  const resolved = clientOrFailure(client);
  if (!resolved.ok) return resolved;
  try {
    const { data, error } = await resolved.value.auth.getSession();
    if (error) return { ok: false, error: providerFailure(error, 'session') };
    return { ok: true, value: data.session };
  } catch (error) {
    return { ok: false, error: providerFailure(error, 'session') };
  }
}

export async function sendEmailOtp(
  email: string,
  client: SupabaseClient | null = getSupabaseClient(),
): Promise<AuthResult<{ email: string }>> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    return {
      ok: false,
      error: failure('invalid_email', 'Enter a valid email address.'),
    };
  }
  const resolved = clientOrFailure(client);
  if (!resolved.ok) return resolved;

  try {
    const { error } = await resolved.value.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: true },
    });
    if (error) return { ok: false, error: providerFailure(error, 'send') };
    return { ok: true, value: { email: normalized } };
  } catch (error) {
    return { ok: false, error: providerFailure(error, 'send') };
  }
}

export async function verifyEmailOtp(
  email: string,
  token: string,
  client: SupabaseClient | null = getSupabaseClient(),
): Promise<AuthResult<Session>> {
  const normalized = normalizeEmail(email);
  const otp = normalizeOtp(token);
  if (!isValidEmail(normalized)) {
    return {
      ok: false,
      error: failure('invalid_email', 'Enter a valid email address.'),
    };
  }
  if (otp.length !== 6) {
    return {
      ok: false,
      error: failure(
        'incorrect_code',
        'Enter the six-digit code from your email.',
      ),
    };
  }
  const resolved = clientOrFailure(client);
  if (!resolved.ok) return resolved;

  try {
    const { data, error } = await resolved.value.auth.verifyOtp({
      email: normalized,
      token: otp,
      type: 'email',
    });
    if (error || !data.session) {
      return {
        ok: false,
        error: providerFailure(error ?? new Error('Missing session'), 'verify'),
      };
    }
    return { ok: true, value: data.session };
  } catch (error) {
    return { ok: false, error: providerFailure(error, 'verify') };
  }
}

export async function signOut(
  client: SupabaseClient | null = getSupabaseClient(),
): Promise<AuthResult<void>> {
  const resolved = clientOrFailure(client);
  if (!resolved.ok) return resolved;
  try {
    const { error } = await resolved.value.auth.signOut();
    if (error) return { ok: false, error: providerFailure(error, 'sign_out') };
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: providerFailure(error, 'sign_out') };
  }
}
