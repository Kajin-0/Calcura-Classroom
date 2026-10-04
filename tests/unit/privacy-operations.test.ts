// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  collectUser,
  createReader,
  deletionPreflight,
  personalTables,
  readRows,
  validateIdentity,
  writeExport,
} from '../../scripts/ops/user-data.ts';
import type { Query, Reader } from '../../scripts/ops/user-data.ts';

const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const workspace = '20000000-0000-4000-8000-000000000001';
const email = 'synthetic@invalid.test';
type Fixtures = Record<string, Record<string, unknown>[]>;
function reader(fixtures: Fixtures = {}, calls: Query[] = []): Reader {
  return {
    account: async () => ({
      id: user,
      email,
      created_at: '2026-10-04T00:00:00Z',
    }),
    async page(query) {
      calls.push(query);
      return (fixtures[query.table] ?? [])
        .filter(
          (row) =>
            row[query.ownerColumn] === query.ownerId &&
            (!query.after || String(row[query.key]) > query.after),
        )
        .sort((a, b) =>
          String(a[query.key]).localeCompare(String(b[query.key])),
        )
        .slice(0, query.limit)
        .map((row) =>
          Object.fromEntries(
            query.columns.map((column) => [column, row[column] ?? null]),
          ),
        );
    },
  };
}
function personalBilling(
  status: string | null,
  extra: Record<string, unknown> = {},
): Fixtures {
  return {
    workspace_members: [
      { user_id: user, workspace_id: workspace, role: 'owner' },
    ],
    workspaces: [
      {
        id: workspace,
        workspace_type: 'personal',
        personal_owner_user_id: user,
      },
    ],
    workspace_billing: [
      { workspace_id: workspace, subscription_status: status, ...extra },
    ],
  };
}
describe('read-only privacy operations', () => {
  it('rejects --execute without credentials or any server request', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/ops/privacy-cli.ts', 'preflight', '--execute'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CALCURA_OPS_SUPABASE_ADMIN_KEY: '',
          CALCURA_OPS_SUPABASE_URL: '',
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No server mutation was attempted');
    expect(result.stdout).toBe('');
  });
  it('requires an exact UUID/email identity pair', () => {
    expect(() => validateIdentity('not-uuid', email)).toThrow();
    expect(() => validateIdentity(user, ' ' + email)).toThrow();
    expect(() => validateIdentity(user, '')).toThrow();
  });
  it('refuses a mismatched account before querying user data', async () => {
    const calls: Query[] = [];
    await expect(
      collectUser(reader({}, calls), user, 'another@invalid.test'),
    ).rejects.toThrow('Identity');
    expect(calls).toHaveLength(0);
  });
  it('exports only allowlisted own data, not other users or authentication secrets', async () => {
    const source = reader({
      practice_attempts: [
        { user_id: user, attempt_id: 'own', access_token: 'DO_NOT_EXPORT' },
        { user_id: other, attempt_id: 'foreign' },
      ],
    });
    const result = await collectUser(source, user, email);
    expect(result.tables.practice_attempts).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('DO_NOT_EXPORT');
    expect(JSON.stringify(result)).not.toContain('foreign');
    expect(Object.keys(result.account)).toEqual(['id', 'email', 'created_at']);
  });
  it('reads all keyset pages without silent truncation', async () => {
    const fixtures = {
      practice_attempts: Array.from({ length: 1_207 }, (_, i) => ({
        user_id: user,
        attempt_id: `attempt-${String(i).padStart(6, '0')}`,
      })),
    };
    const calls: Query[] = [];
    const result = await collectUser(reader(fixtures, calls), user, email);
    expect(result.tables.practice_attempts).toHaveLength(1_207);
    const pages = calls.filter((query) => query.table === 'practice_attempts');
    expect(pages).toHaveLength(3);
    expect(pages[1]?.after).toBe('attempt-000499');
  });
  it('refuses a cross-account backend response despite administrative privileges', async () => {
    const source = reader();
    source.page = async () => [{ user_id: other, attempt_id: 'bad' }];
    await expect(collectUser(source, user, email)).rejects.toThrow(
      'Cross-account',
    );
  });
  it('refuses incomplete records and a non-advancing page', async () => {
    const spec = {
      table: 'practice_attempts',
      columns: ['user_id', 'attempt_id', 'outcome'],
      ownerColumn: 'user_id',
      ownerId: user,
      key: 'attempt_id',
    };
    const source = reader();
    source.page = async () => [{ user_id: user, attempt_id: 'a' }];
    await expect(readRows(source, spec)).rejects.toThrow('Incomplete');
    source.page = async () => [
      { user_id: user, attempt_id: 'a', outcome: 'correct' },
      { user_id: user, attempt_id: 'a', outcome: 'correct' },
    ];
    await expect(readRows(source, spec)).rejects.toThrow('cursor');
  });
  it('does not produce a partial export after a failed page', async () => {
    const source = reader({
      practice_attempts: Array.from({ length: 500 }, (_, i) => ({
        user_id: user,
        attempt_id: String(i).padStart(6, '0'),
      })),
    });
    const original = source.page;
    source.page = async (query) => {
      if (query.after) throw new Error('network');
      return original(query);
    };
    await expect(collectUser(source, user, email)).rejects.toThrow('network');
  });
  it('returns an empty account plan without granting automatic deletion', async () => {
    const result = await deletionPreflight(reader(), user, email);
    expect(result.blockers).toEqual([]);
    expect(result.mode).toContain('NO MUTATIONS');
    expect(result.final_step).toContain('Manual');
    expect(Object.values(result.counts)).toEqual([0, 0, 0, 0, 0]);
  });
  it('blocks organization owner deletion until transfer/review', async () => {
    const result = await deletionPreflight(
      reader({
        workspace_members: [
          { user_id: user, workspace_id: workspace, role: 'owner' },
        ],
        workspaces: [{ id: workspace, workspace_type: 'organization' }],
      }),
      user,
      email,
    );
    expect(result.organization_owner_review_required).toBe(true);
    expect(result.blockers.join(' ')).toContain('transfer');
  });
  it.each([
    'active',
    'past_due',
    'unpaid',
    'trialing',
    'incomplete',
    'paused',
    'unexpected-status',
  ])('blocks unresolved personal subscription %s', async (status) => {
    const result = await deletionPreflight(
      reader(personalBilling(status)),
      user,
      email,
    );
    expect(result.blockers.join(' ')).toContain('Unresolved billing');
  });
  it('does not treat period-end cancellation as billing reconciliation', async () => {
    const result = await deletionPreflight(
      reader(personalBilling('active', { cancel_at_period_end: true })),
      user,
      email,
    );
    expect(result.blockers.length).toBeGreaterThan(0);
  });
  it('requires canonical external review even for a canceled customer mapping', async () => {
    const result = await deletionPreflight(
      reader(
        personalBilling('canceled', {
          stripe_customer_id: 'cus_private',
          stripe_subscription_id: 'sub_private',
        }),
      ),
      user,
      email,
    );
    expect(result.blockers.join(' ')).toContain('canonical Stripe');
    expect(JSON.stringify(result)).not.toContain('cus_private');
    expect(JSON.stringify(result)).not.toContain('sub_private');
  });
  it('blocks a checkout even when ownership membership is missing', async () => {
    const fixtures = personalBilling(null, {
      checkout_attempt_id: 'reserved',
      checkout_session_id: 'cs_private',
    });
    fixtures.workspace_members = [];
    const result = await deletionPreflight(reader(fixtures), user, email);
    expect(result.blockers.join(' ')).toContain('checkout');
  });
  it('omits Stripe identifiers from export', async () => {
    const result = await collectUser(
      reader(personalBilling('active', { stripe_customer_id: 'cus_private' })),
      user,
      email,
    );
    expect(JSON.stringify(result)).not.toContain('cus_private');
    expect(result.billing[0]?.subscription_status).toBe('active');
  });
  it('refuses browser keys or another project before making network calls', () => {
    expect(() =>
      createReader(
        'https://qsuacjqcrpswognhhikv.supabase.co',
        'sb_publishable_not_admin',
      ),
    ).toThrow('administrative');
    expect(() =>
      createReader('https://wrong.supabase.co', 'sb_secret_fixture'),
    ).toThrow('project');
  });
  it('writes a private JSON export outside the repository', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'calcura-privacy-fixture-'));
    const result = await collectUser(reader(), user, email);
    const output = await writeExport(result, dir, process.cwd());
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect(JSON.parse(await readFile(output, 'utf8')).account.email).toBe(
      email,
    );
    await expect(
      writeExport(result, process.cwd(), process.cwd()),
    ).rejects.toThrow();
  });
  it('refuses public directories and symlink export directories', async () => {
    const parent = await mkdtemp(
      path.join(tmpdir(), 'calcura-privacy-fixture-'),
    );
    const publicDir = path.join(parent, 'public');
    await mkdir(publicDir, { mode: 0o755 });
    const result = await collectUser(reader(), user, email);
    await expect(writeExport(result, publicDir, process.cwd())).rejects.toThrow(
      'private',
    );
    const link = path.join(parent, 'link');
    await symlink(parent, link);
    await expect(writeExport(result, link, process.cwd())).rejects.toThrow(
      'symlink',
    );
  });
  it('keeps admin operations out of browser and public endpoints', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? files(path.join(dir, entry.name))
          : [path.join(dir, entry.name)],
      );
    for (const file of files('src'))
      expect(readFileSync(file, 'utf8')).not.toMatch(
        /scripts\/ops|privacy-cli|CALCURA_OPS_SUPABASE_ADMIN_KEY/,
      );
    const cli = readFileSync('scripts/ops/privacy-cli.ts', 'utf8');
    expect(cli).not.toMatch(
      /\.deleteUser\(|\.delete\(|\.update\(|\.insert\(|\.upsert\(|\.rpc\(/,
    );
    expect(cli).toContain('No --execute');
    expect(personalTables.every((table) => !table.columns.includes('*'))).toBe(
      true,
    );
  });
});
