import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production deployment quality boundary', () => {
  it('gates Pages on all CI jobs and builds the same SHA', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toContain(
      'needs: [foundation, browser-smoke, database-security]',
    );
    expect(workflow).toContain(
      "github.ref == 'refs/heads/main' && github.event_name != 'pull_request'",
    );
    expect(workflow).toContain('ref: ${{ github.sha }}');
    expect(workflow).toContain('needs: pages-build');
    expect(workflow).toContain('group: classroom-${{ github.ref }}');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).not.toMatch(/npm install/);
    expect(existsSync('.github/workflows/deploy-pages.yml')).toBe(false);
  });
});
