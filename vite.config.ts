import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { classroomSecurityPolicy } from './build/securityPolicy';

const pagesBasePath = process.env.PAGES_BASE_PATH?.trim() ?? '';
const normalizedPagesBasePath = pagesBasePath.replace(/^\/+|\/+$/g, '');
const base = normalizedPagesBasePath ? `/${normalizedPagesBasePath}/` : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: 'classroom-production-security-policy',
      apply: 'build',
      transformIndexHtml: {
        order: 'pre',
        handler() {
          const env = {
            ...loadEnv('production', process.cwd(), 'VITE_'),
            ...Object.fromEntries(
              Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                  entry[0].startsWith('VITE_') && entry[1] !== undefined,
              ),
            ),
          };
          return [
            {
              tag: 'meta',
              attrs: {
                'http-equiv': 'Content-Security-Policy',
                content: classroomSecurityPolicy(env),
              },
              injectTo: 'head-prepend',
            },
          ];
        },
      },
    },
  ],
  test: {
    // Exercise the real Edge handler under Vitest using the installed, same
    // pinned SDK; this alias does not affect the browser production build.
    alias: {
      'npm:stripe@22.4.0': fileURLToPath(import.meta.resolve('stripe')),
    },
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.tsx'],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    isolate: true,
    testTimeout: 15_000,
    restoreMocks: true,
    clearMocks: true,
  },
});
