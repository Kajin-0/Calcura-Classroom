import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  isValidEmail,
  loadSession,
  normalizeEmail,
  normalizeOtp,
  sendEmailOtp,
  signOut,
  verifyEmailOtp,
} from '../../src/features/auth/authService';

const session = {
  user: { id: 'user-1' },
} as Session;
const client = {
  auth: {
    getSession: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    signOut: vi.fn(),
  },
} as unknown as SupabaseClient;

describe('auth service', () => {
  beforeEach(() => {
    vi.mocked(client.auth.getSession).mockResolvedValue({
      data: { session },
      error: null,
    });
    vi.mocked(client.auth.signInWithOtp).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    vi.mocked(client.auth.verifyOtp).mockResolvedValue({
      data: { user: session.user, session },
      error: null,
    });
    vi.mocked(client.auth.signOut).mockResolvedValue({ error: null });
  });

  it('normalizes and validates email addresses', () => {
    expect(normalizeEmail('  Teacher@Example.COM ')).toBe(
      'teacher@example.com',
    );
    expect(isValidEmail('teacher@example.com')).toBe(true);
    expect(isValidEmail('invalid-address')).toBe(false);
  });

  it('normalizes OTP input to six numeric digits', () => {
    expect(normalizeOtp('12-34 56')).toBe('123456');
    expect(normalizeOtp('1234567')).toBe('1234567');
    expect(normalizeOtp('12ab')).toBe('12');
  });

  it('sends email OTP using the normalized address and shared-user behavior', async () => {
    await expect(
      sendEmailOtp(' Teacher@Example.COM ', client),
    ).resolves.toEqual({
      ok: true,
      value: { email: 'teacher@example.com' },
    });
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'teacher@example.com',
      options: { shouldCreateUser: true },
    });
  });

  it('rejects invalid email and malformed OTP before contacting Supabase', async () => {
    await expect(sendEmailOtp('bad', client)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_email' },
    });
    await expect(
      verifyEmailOtp('teacher@example.com', '123', client),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'incorrect_code' },
    });
    await expect(
      verifyEmailOtp('teacher@example.com', '1234567', client),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'incorrect_code' },
    });
    expect(client.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('verifies a normalized email code with the email OTP flow', async () => {
    await expect(
      verifyEmailOtp(' Teacher@Example.COM ', '123 456', client),
    ).resolves.toEqual({ ok: true, value: session });
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'teacher@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('returns a useful error when a code is rejected', async () => {
    vi.mocked(client.auth.verifyOtp).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'invalid token' } as never,
    });
    await expect(
      verifyEmailOtp('teacher@example.com', '123456', client),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'incorrect_code' },
    });
  });

  it('loads the saved session and signs out through Supabase Auth', async () => {
    await expect(loadSession(client)).resolves.toEqual({
      ok: true,
      value: session,
    });
    await expect(signOut(client)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(client.auth.signOut).toHaveBeenCalledOnce();
  });

  it('does not expose raw provider details when loading a saved session fails', async () => {
    vi.mocked(client.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: { message: 'private provider detail', status: 500 } as never,
    });
    await expect(loadSession(client)).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'provider',
        message:
          'Could not check your sign-in status. Reload the page or check your connection.',
      },
    });
  });
});
