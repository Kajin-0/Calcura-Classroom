import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getRouterBasename } from '../../src/app/routerBasename';

const script = 'scripts/check-pages-config.mjs';
const expected = {
  VITE_SUPABASE_URL: 'https://qsuacjqcrpswognhhikv.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture_only',
  VITE_CALCURA_APP_URL: 'https://calcura.study/app/',
};

function publicEnv(overrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, PAGES_BASE_PATH: '' };
  for (const name of Object.keys(expected)) delete env[name];
  for (const [name, value] of Object.entries({ ...expected, ...overrides })) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  return env;
}

function runCheck(overrides: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: publicEnv(overrides),
    timeout: 10_000,
  });
}

function runArtifactCheck(
  appUrl = expected.VITE_CALCURA_APP_URL,
  overrides: Record<string, string | undefined> = {},
  extraUrl?: string,
) {
  const fixture = mkdtempSync(join(tmpdir(), 'calcura-pages-preview-'));
  try {
    const dist = join(fixture, 'dist');
    mkdirSync(join(dist, 'assets'), { recursive: true });
    const html =
      '<!doctype html><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script>';
    writeFileSync(join(dist, 'index.html'), html);
    writeFileSync(join(dist, '404.html'), html);
    writeFileSync(join(dist, 'assets/app.css'), 'body { color: black; }');
    writeFileSync(
      join(dist, 'assets/app.js'),
      `export const config = ${JSON.stringify({
        ...expected,
        VITE_CALCURA_APP_URL: appUrl,
        extraUrl,
      })};`,
    );
    return spawnSync(
      process.execPath,
      [resolve('scripts/verify-pages-artifact.mjs')],
      {
        cwd: fixture,
        encoding: 'utf8',
        env: publicEnv(overrides),
        timeout: 10_000,
      },
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
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

  it.each([
    'https://calcura.study/',
    'https://calcura.study/app',
    'https://calcura.study/other/',
    'http://calcura.study/app/',
    'https://example.com/app/',
    'https://user:pass@calcura.study/app/',
    'https://calcura.study/app/?x=1',
    'https://calcura.study/app/#x',
    'http://127.0.0.1:5173/',
    'https://calcura.study:443/app/',
    'https://calcura.study/other/../app/',
    'https://calcura.study/app/?',
    'https://calcura.study/app/#',
  ])('rejects noncanonical production Calcura app URL: %s', (appUrl) => {
    const result = runCheck({ VITE_CALCURA_APP_URL: appUrl });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expected.VITE_CALCURA_APP_URL);
    expect(result.stderr).not.toContain(expected.VITE_SUPABASE_PUBLISHABLE_KEY);
  });
});

describe('GitHub Pages preview artifact verification', () => {
  it('verifies the full /app/ target, assets, and deep-route fallback without printing the key', () => {
    const result = runArtifactCheck();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Pages artifact verified');
    expect(result.stdout).toContain('/app/classes/pages-smoke/assignments/new');
    expect(result.stdout).not.toContain(expected.VITE_SUPABASE_PUBLISHABLE_KEY);
  });

  it.each([
    'https://calcura.study',
    'https://calcura.study/',
    'https://calcura.study/other/',
  ])(
    'rejects origin-only or wrong-path embedded configuration: %s',
    (appUrl) => {
      const result = runArtifactCheck(appUrl);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('full application URL is missing');
      expect(result.stderr).not.toContain(
        expected.VITE_SUPABASE_PUBLISHABLE_KEY,
      );
    },
  );

  it('rejects a root verification contract even when /app/ is embedded', () => {
    const result = runArtifactCheck(expected.VITE_CALCURA_APP_URL, {
      VITE_CALCURA_APP_URL: 'https://calcura.study/',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('canonical production /app/ URL');
  });

  it.each(['http://localhost:5173/', 'http://127.0.0.1:54321/'])(
    'rejects embedded localhost URL: %s',
    (url) => {
      const result = runArtifactCheck(expected.VITE_CALCURA_APP_URL, {}, url);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('must not contain localhost URLs');
    },
  );
});
