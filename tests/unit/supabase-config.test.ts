import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from '../../src/lib/supabase/config';

describe('readSupabaseConfig', () => {
  it('reports a missing project URL', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      }),
    ).toMatchObject({
      configured: false,
      problem: 'missing_url',
    });
  });

  it('reports a missing publishable key', () => {
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' }),
    ).toMatchObject({
      configured: false,
      problem: 'missing_publishable_key',
    });
  });

  it('rejects malformed and insecure non-local URLs', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'not a URL',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'key',
      }),
    ).toMatchObject({ configured: false, problem: 'invalid_url' });
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'http://example.com',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'key',
      }),
    ).toMatchObject({ configured: false, problem: 'invalid_url' });
  });

  it('accepts a valid hosted configuration and trims whitespace', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: ' https://example.supabase.co/ ',
        VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_test ',
      }),
    ).toEqual({
      configured: true,
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_test',
    });
  });
});
