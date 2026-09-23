import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  readSupabaseConfig,
  supabaseConfigMessage,
} from '../../lib/supabase/config';
import {
  normalizeOtp,
  RESEND_COOLDOWN_MS,
  sendEmailOtp,
  verifyEmailOtp,
} from './authService';
import { useAuthSession } from './useAuthSession';

export function SignInPage() {
  const { session, initializationError } = useAuthSession();
  const config = readSupabaseConfig();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!cooldownUntil) return undefined;
    const interval = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= cooldownUntil) window.clearInterval(interval);
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  if (session) return <Navigate to="/app" replace />;

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1_000));
  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await sendEmailOtp(email);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setEmail(result.value.email);
    setCodeSent(true);
    setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
    setNow(Date.now());
    setMessage('If this address can sign in, a six-digit code is on its way.');
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await verifyEmailOtp(email, code);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage(null);
  };

  const handleResend = async () => {
    if (cooldownSeconds > 0 || busy) return;
    setBusy(true);
    setMessage(null);
    const result = await sendEmailOtp(email);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
    setNow(Date.now());
    setMessage('A new code has been sent.');
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="signin-title">
        <a className="wordmark" href="/" aria-label="Calcura Classroom home">
          Calcura Classroom
        </a>
        <h1 id="signin-title">Sign in</h1>
        <p className="muted-copy">
          Use the email address you use with Calcura.
        </p>

        {!config.configured && (
          <p className="notice" role="status">
            {supabaseConfigMessage(config.problem)}
          </p>
        )}
        {initializationError && (
          <p className="notice" role="alert">
            {initializationError}
          </p>
        )}
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}

        {!codeSent ? (
          <form onSubmit={handleSend} className="form-stack">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy || !config.configured}
            />
            <button
              className="button button-primary"
              type="submit"
              disabled={busy || !config.configured}
            >
              {busy ? 'Sending…' : 'Send sign-in code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="form-stack">
            <label htmlFor="code">Six-digit code</label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(normalizeOtp(event.target.value))}
              disabled={busy}
              autoFocus
            />
            <button
              className="button button-primary"
              type="submit"
              disabled={busy || code.length !== 6}
            >
              {busy ? 'Verifying…' : 'Verify code'}
            </button>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => void handleResend()}
              disabled={busy || cooldownSeconds > 0}
            >
              {cooldownSeconds > 0
                ? `Resend code in ${cooldownSeconds}s`
                : 'Resend code'}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setCodeSent(false);
                setCode('');
                setMessage(null);
              }}
              disabled={busy}
            >
              Use a different email
            </button>
          </form>
        )}
        <p className="auth-footnote">
          Email codes are delivered through the shared Calcura sign-in service.
        </p>
      </section>
    </main>
  );
}
