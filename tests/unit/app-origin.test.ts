import { describe, expect, it } from 'vitest';
import {
  parseTrustedAppOrigin,
  trustedAppReturnUrl,
} from '../../supabase/functions/_shared/appOrigin';

describe('trusted Classroom application origin', () => {
  it('accepts an exact HTTPS production origin and local development origins', () => {
    expect(parseTrustedAppOrigin('https://classroom.calcura.study')).toBe(
      'https://classroom.calcura.study',
    );
    expect(parseTrustedAppOrigin('https://classroom.calcura.study/')).toBe(
      'https://classroom.calcura.study',
    );
    expect(parseTrustedAppOrigin('http://127.0.0.1:5174')).toBe(
      'http://127.0.0.1:5174',
    );
  });

  it.each([
    'https://classroom.calcura.study/app',
    'https://user:pass@classroom.calcura.study',
    'http://classroom.calcura.study',
    'https://classroom.calcura.study/?next=https://attacker.example',
  ])('rejects non-origin APP_ORIGIN values: %s', (value) => {
    expect(() => parseTrustedAppOrigin(value)).toThrow();
  });

  it('pins Stripe return URLs to APP_ORIGIN and rejects hostile paths', () => {
    expect(
      trustedAppReturnUrl(
        'https://classroom.calcura.study',
        '/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      ),
    ).toBe(
      'https://classroom.calcura.study/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    );
    expect(() =>
      trustedAppReturnUrl('https://classroom.calcura.study', '//evil.example'),
    ).toThrow();
  });
});
