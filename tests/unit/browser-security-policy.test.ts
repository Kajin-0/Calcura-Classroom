import { describe, expect, it } from 'vitest';
import { classroomSecurityPolicy } from '../../build/securityPolicy';

describe('production Classroom CSP', () => {
  it('allows only the configured public API and exact trusted preview origin', () => {
    const policy = classroomSecurityPolicy({
      VITE_SUPABASE_URL: 'https://qsuacjqcrpswognhhikv.supabase.co',
      VITE_CALCURA_APP_URL: 'https://calcura.study/app/',
    });
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).toContain(
      "connect-src 'self' https://qsuacjqcrpswognhhikv.supabase.co wss://qsuacjqcrpswognhhikv.supabase.co",
    );
    expect(policy).toContain('frame-src https://calcura.study');
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("form-action 'self'");
  });
  it('fails closed when public configuration is missing', () => {
    expect(classroomSecurityPolicy({})).toContain(
      "connect-src 'self'; frame-src 'none'",
    );
  });
  it('supports the same explicit loopback configuration as the existing preview contract', () => {
    const policy = classroomSecurityPolicy({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_CALCURA_APP_URL: 'http://127.0.0.1:5173/',
    });
    expect(policy).toContain('http://127.0.0.1:54321 ws://127.0.0.1:54321');
    expect(policy).toContain('frame-src http://127.0.0.1:5173');
  });
  it.each([
    'javascript:alert(1)',
    'https://user:pass@api.example',
    'http://insecure.example',
  ])('rejects an unsafe API origin: %s', (url) => {
    expect(() => classroomSecurityPolicy({ VITE_SUPABASE_URL: url })).toThrow();
  });
  it('does not turn invalid teacher-preview configuration into an allowed frame', () => {
    expect(
      classroomSecurityPolicy({
        VITE_CALCURA_APP_URL:
          'https://calcura.study/app/?redirect=https://evil.test',
      }),
    ).toContain("frame-src 'none'");
  });
});
