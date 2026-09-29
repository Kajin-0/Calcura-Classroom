import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { getRouterBasename } from '../../src/app/routerBasename';

const script = 'scripts/check-pages-config.mjs';
const expected = {
  VITE_SUPABASE_URL: 'https://qsuacjqcrpswognhhikv.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture_only',
  VITE_CALCURA_APP_URL: 'https://calcura.study/',
};

function runCheck(overrides: Record<string, string | undefined> = {}) {
  const env = { ...process.env };
  for (const name of Object.keys(expected)) delete env[name];
  for (const [name, value] of Object.entries({ ...expected, ...overrides })) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  return spawnSync(process.execPath, [script], { encoding: 'utf8', env });
}

describe('GitHub Pages public build configuration', () => {
  it.each([
    ['/', '/'],
    ['/Calcura-Classroom/', '/Calcura-Classroom'],
  ])('maps Vite base %s to Router basename %s', (baseUrl, expectedBasename) => {
    expect(getRouterBasename(baseUrl)).toBe(expectedBasename);
  });

  it('accepts the configured public production targets without printing the key', () => {
    const result = runCheck();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('values suppressed');
    expect(result.stdout).not.toContain(expected.VITE_SUPABASE_PUBLISHABLE_KEY);
  });

  it.each(Object.keys(expected))('fails clearly when %s is missing', (name) => {
    const result = runCheck({ [name]: undefined });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(name);
  });

  it('rejects non-production Supabase URLs and localhost URLs', () => {
    expect(
      runCheck({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }).status,
    ).toBe(1);
    expect(
      runCheck({ VITE_SUPABASE_URL: 'https://other-project.supabase.co' })
        .status,
    ).toBe(1);
  });

  it('rejects secret or privileged Supabase keys', () => {
    expect(
      runCheck({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test_fixture' })
        .status,
    ).toBe(1);
    const claims = Buffer.from(
      JSON.stringify({ role: 'service_role' }),
    ).toString('base64url');
    expect(
      runCheck({
        VITE_SUPABASE_PUBLISHABLE_KEY: `header.${claims}.signature`,
      }).status,
    ).toBe(1);
  });

  it('requires the production Calcura preview origin', () => {
    expect(
      runCheck({ VITE_CALCURA_APP_URL: 'http://127.0.0.1:5173/' }).status,
    ).toBe(1);
    expect(
      runCheck({ VITE_CALCURA_APP_URL: 'https://example.com/' }).status,
    ).toBe(1);
  });
});
