import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const pagesBasePath = process.env.PAGES_BASE_PATH?.trim() ?? '';
const normalizedPagesBasePath = pagesBasePath.replace(/^\/+|\/+$/g, '');
const base = normalizedPagesBasePath ? `/${normalizedPagesBasePath}/` : '/';

export default defineConfig({
  base,
  plugins: [react()],
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
