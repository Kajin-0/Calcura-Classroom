import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

describe('frontend credential boundary', () => {
  it('does not contain privileged credential variable names in browser source', async () => {
    const files = await sourceFiles(join(process.cwd(), 'src'));
    const contents = await Promise.all(
      files.map((path) => readFile(path, 'utf8')),
    );
    const combined = contents.join('\n');
    expect(combined).not.toMatch(/SERVICE_ROLE|SUPABASE_SECRET|STRIPE_SECRET/);
  });
});
