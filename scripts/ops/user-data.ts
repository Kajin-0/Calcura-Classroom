// Operator-only: never import into src/, an Edge Function, or a browser entry.
// Read-only database access. Final Auth deletion deliberately remains manual.
import { createClient } from '@supabase/supabase-js';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import path from 'node:path';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Row = Record<string, Json>;
export type Account = { id: string; email: string; created_at: string };
export type Query = {
  table: string;
  columns: readonly string[];
  ownerColumn: string;
  ownerId: string;
  key: string;
  after?: string;
  limit: number;
};
export interface Reader {
  account(userId: string): Promise<Account>;
  page(query: Query): Promise<unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 500;
const MAX_PAGES = 2_000;
export const personalTables = [
  {
    table: 'communication_preferences',
    owner: 'user_id',
    key: 'user_id',
    columns:
      'user_id,product_updates,classroom_updates,prompt_completed,consent_version,product_updates_opted_in_at,classroom_updates_opted_in_at,created_at,updated_at',
  },
  {
    table: 'practice_attempts',
    owner: 'user_id',
    key: 'attempt_id',
    columns:
      'user_id,attempt_id,client_timestamp_ms,mode,outcome,skill_id,family,variant,technique,source_difficulty,tier,title,selected_difficulty,problem_id,schema_version,attempts,surrenders,time_seconds,grade_points,created_at',
  },
  {
    table: 'class_enrollments',
    owner: 'student_user_id',
    key: 'class_id',
    columns: 'class_id,student_user_id,status,joined_at,updated_at',
  },
  {
    table: 'assignment_problem_results',
    owner: 'student_user_id',
    key: 'id',
    columns:
      'id,assignment_item_id,student_user_id,problem_ordinal,client_result_id,outcome,attempts,surrenders,time_seconds,grade_points,client_timestamp_ms,skill_id,family,variant,technique,source_difficulty,tier,schema_version,created_at',
  },
  {
    table: 'workspace_members',
    owner: 'user_id',
    key: 'workspace_id',
    columns: 'workspace_id,user_id,role,created_at',
  },
] as const;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid operator response');
  return value as Record<string, unknown>;
}
function json(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(json);
  const output: Record<string, Json> = {};
  for (const [key, field] of Object.entries(record(value))) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error('Invalid operator field');
    output[key] = json(field);
  }
  return output;
}
export function validateIdentity(userId: string, email: string): void {
  if (
    !UUID.test(userId) ||
    !email ||
    email !== email.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    throw new Error('Exact user UUID and email are required');
}
export async function readRows(
  reader: Reader,
  query: Omit<Query, 'after' | 'limit'>,
): Promise<Row[]> {
  const result: Row[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await reader.page({ ...query, after, limit: PAGE_SIZE });
    if (!Array.isArray(data) || data.length > PAGE_SIZE)
      throw new Error('Invalid operator page');
    for (const value of data) {
      const row = record(value);
      if (row[query.ownerColumn] !== query.ownerId)
        throw new Error('Cross-account operator response refused');
      const key = row[query.key];
      if (
        typeof key !== 'string' ||
        !key ||
        (after !== undefined && key <= after)
      )
        throw new Error('Invalid/non-advancing operator cursor');
      const projected: Row = {};
      for (const column of query.columns) {
        if (!(column in row)) throw new Error('Incomplete operator response');
        projected[column] = json(row[column]);
      }
      result.push(projected);
      after = key;
    }
    if (data.length < PAGE_SIZE) return result;
  }
  throw new Error(
    'Export limit reached; use reviewed snapshot procedure instead',
  );
}
export async function collectUser(
  reader: Reader,
  userId: string,
  email: string,
) {
  validateIdentity(userId, email);
  const identity = await reader.account(userId);
  if (identity.id !== userId || identity.email !== email)
    throw new Error('Identity confirmation mismatch');
  const tables: Record<string, Row[]> = {};
  for (const spec of personalTables) {
    tables[spec.table] = await readRows(reader, {
      table: spec.table,
      columns: spec.columns.split(','),
      ownerColumn: spec.owner,
      ownerId: userId,
      key: spec.key,
    });
  }
  const memberships = tables.workspace_members ?? [];
  const workspaces: Row[] = [];
  const billing: Row[] = [];
  for (const member of memberships) {
    const workspaceId = member.workspace_id;
    if (typeof workspaceId !== 'string' || !UUID.test(workspaceId))
      throw new Error('Invalid workspace membership');
    const workspaceRows = await readRows(reader, {
      table: 'workspaces',
      columns: [
        'id',
        'workspace_type',
        'name',
        'personal_owner_user_id',
        'status',
        'created_at',
      ],
      ownerColumn: 'id',
      ownerId: workspaceId,
      key: 'id',
    });
    if (workspaceRows.length !== 1)
      throw new Error('Missing workspace; repeat preflight');
    workspaces.push(...workspaceRows);
    billing.push(
      ...(await readRows(reader, {
        table: 'workspace_billing',
        columns: [
          'workspace_id',
          'subscription_status',
          'billing_interval',
          'current_period_end',
          'cancel_at_period_end',
        ],
        ownerColumn: 'workspace_id',
        ownerId: workspaceId,
        key: 'workspace_id',
      })),
    );
  }
  return {
    format_version: 1,
    exported_at: new Date().toISOString(),
    account: {
      id: identity.id,
      email: identity.email,
      created_at: identity.created_at,
    },
    tables,
    workspaces,
    billing,
  };
}
export async function deletionPreflight(
  reader: Reader,
  userId: string,
  email: string,
) {
  const data = await collectUser(reader, userId, email);
  const blockers = new Set<string>();
  for (const member of data.tables.workspace_members ?? []) {
    const workspace = data.workspaces.find(
      (row) => row.id === member.workspace_id,
    );
    if (member.role === 'owner' && workspace?.workspace_type === 'organization')
      blockers.add(
        'Organization owner: transfer/review required before Auth deletion',
      );
  }
  // Discover personal ownership independently: do not assume its membership survived.
  const owned = await readRows(reader, {
    table: 'workspaces',
    columns: ['id', 'workspace_type', 'personal_owner_user_id'],
    ownerColumn: 'personal_owner_user_id',
    ownerId: userId,
    key: 'id',
  });
  for (const workspace of owned) {
    if (typeof workspace.id !== 'string')
      throw new Error('Invalid owned workspace');
    const rows = await readRows(reader, {
      table: 'workspace_billing',
      columns: [
        'workspace_id',
        'stripe_customer_id',
        'stripe_subscription_id',
        'subscription_status',
        'checkout_attempt_id',
        'checkout_session_id',
        'checkout_lock_expires_at',
        'checkout_session_expires_at',
        'cancel_at_period_end',
      ],
      ownerColumn: 'workspace_id',
      ownerId: workspace.id,
      key: 'workspace_id',
    });
    for (const row of rows) {
      if (
        row.stripe_customer_id ||
        row.stripe_subscription_id ||
        row.checkout_attempt_id ||
        row.checkout_session_id ||
        row.checkout_lock_expires_at ||
        row.checkout_session_expires_at
      )
        blockers.add(
          'Stripe mapping/checkout exists: canonical Stripe cancellation and reconciliation require operator review',
        );
      if (
        row.subscription_status &&
        !['canceled', 'incomplete_expired'].includes(
          String(row.subscription_status),
        )
      )
        blockers.add(
          'Unresolved billing state: refuse deletion (period-end cancellation is not completion)',
        );
    }
  }
  // This tool cannot establish a snapshot, institution authorization or Stripe's
  // external state. Even a clean plan is NOT permission to run Auth deletion.
  return {
    mode: 'DRY RUN — NO MUTATIONS',
    counts: Object.fromEntries(
      Object.entries(data.tables).map(([table, rows]) => [table, rows.length]),
    ),
    personal_workspaces_deleted_by_auth_cascade: owned.length,
    organization_owner_review_required: blockers.has(
      'Organization owner: transfer/review required before Auth deletion',
    ),
    blockers: [...blockers],
    final_step:
      'Manual review of ACCOUNT_DELETION_RUNBOOK.md; no automatic Auth deletion',
    scope:
      'Own records only; shared/cascading class, assignment and other-student counts require the runbook preflight',
  };
}

export function createReader(url: string, key: string): Reader {
  const host = new URL(url);
  if (host.href !== 'https://qsuacjqcrpswognhhikv.supabase.co/' || !key)
    throw new Error(
      'Expected production project and operator credential required',
    );
  const privileged =
    key.startsWith('sb_secret_') ||
    (() => {
      try {
        return (
          JSON.parse(
            Buffer.from(key.split('.')[1] ?? '', 'base64url').toString(),
          ).role === 'service_role'
        );
      } catch {
        return false;
      }
    })();
  if (!privileged)
    throw new Error(
      'Server administrative credential required; never use a browser key',
    );
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
    },
  });
  return {
    async account(userId) {
      const { data, error } = await client.auth.admin.getUserById(userId);
      if (error || !data.user?.email)
        throw new Error('Account lookup failed; no identity established');
      return {
        id: data.user.id,
        email: data.user.email,
        created_at: data.user.created_at,
      };
    },
    async page(query) {
      let request = client
        .from(query.table)
        .select(query.columns.join(','))
        .eq(query.ownerColumn, query.ownerId)
        .order(query.key, { ascending: true })
        .limit(query.limit);
      if (query.after !== undefined)
        request = request.gt(query.key, query.after);
      const { data, error } = await request;
      if (error || !data)
        throw new Error(
          'Operator read failed; no complete plan/export produced',
        );
      return data;
    },
  };
}
export async function writeExport(
  data: Awaited<ReturnType<typeof collectUser>>,
  directory: string,
  repository: string,
): Promise<string> {
  if (!path.isAbsolute(directory))
    throw new Error(
      'Export directory must be absolute and outside the repository',
    );
  const repo = await realpath(repository);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    (stat.mode & 0o077) !== 0 ||
    stat.uid !== process.getuid?.()
  )
    throw new Error(
      'Export directory must be operator-owned, private (0700), and not a symlink',
    );
  const resolved = await realpath(directory);
  if (resolved === repo || resolved.startsWith(repo + path.sep))
    throw new Error('Never export personal data inside the repository');
  const filename = path.join(
    resolved,
    `user-${data.account.id}-${new Date().toISOString().replaceAll(':', '-')}.json`,
  );
  const file = await open(
    filename,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(JSON.stringify(data, null, 2) + '\n');
    await file.sync();
  } finally {
    await file.close();
  }
  return filename;
}
