import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const workdir = process.env.SUPABASE_WORKDIR ?? repoRoot;
const status = spawnSync(
  path.join(repoRoot, 'node_modules/.bin/supabase'),
  ['status', '-o', 'env'],
  {
    encoding: 'utf8',
    cwd: workdir,
    env: { ...process.env, PWD: workdir },
    maxBuffer: 2 * 1024 * 1024,
  },
);
if (status.status !== 0) {
  throw new Error(
    `Local Supabase must be running: ${(status.stderr || status.stdout).slice(0, 250)}`,
  );
}
const env = Object.fromEntries(
  status.stdout.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    return match ? [[match[1], match[2]]] : [];
  }),
);
const apiUrl = new globalThis.URL(env.API_URL ?? '');
if (
  apiUrl.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost', '::1'].includes(apiUrl.hostname)
) {
  throw new Error(
    'Refusing to run entitlement smoke outside loopback Supabase.',
  );
}
if (!env.SERVICE_ROLE_KEY || !env.ANON_KEY) {
  throw new Error('Local Supabase status omitted test credentials.');
}

// The service credential is confined to this local test harness. It provisions
// fixtures and trusted entitlement rows; browser-like clients use the anon key.
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = randomBytes(8).toString('hex');
const password = randomBytes(32).toString('base64url');
const emails = {
  owner: `phase8-owner-${suffix}@example.test`,
  foreign: `phase8-foreign-${suffix}@example.test`,
};
const userIds = [];
const workspacesToDelete = [];
const clients = [];

function unwrap(result, label) {
  if (result.error) {
    throw new Error(`${label} failed (${result.error.code ?? 'unknown'}).`);
  }
  return result.data;
}

async function provisionAndSignIn(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(
      `Local test-user provisioning failed (${error?.status ?? 'unknown'}).`,
    );
  }
  userIds.push(data.user.id);
  const client = createClient(env.API_URL, env.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) {
    throw new Error(`Local test-user sign-in failed (${signIn.error.status}).`);
  }
  clients.push(client);
  return { client, userId: data.user.id };
}

async function main() {
  const owner = await provisionAndSignIn(emails.owner);
  const foreignOwner = await provisionAndSignIn(emails.foreign);

  const ownerWorkspaceRows = unwrap(
    await owner.client.rpc('ensure_personal_workspace'),
    'owner personal workspace bootstrap',
  );
  const workspaceA = ownerWorkspaceRows?.[0]?.workspace_id;
  assert.ok(workspaceA);
  workspacesToDelete.push(workspaceA);

  const foreignWorkspaceRows = unwrap(
    await foreignOwner.client.rpc('ensure_personal_workspace'),
    'foreign personal workspace bootstrap',
  );
  const foreignWorkspaceId = foreignWorkspaceRows?.[0]?.workspace_id;
  assert.ok(foreignWorkspaceId);
  workspacesToDelete.push(foreignWorkspaceId);

  const workspaceB = unwrap(
    await admin
      .from('workspaces')
      .insert({
        workspace_type: 'organization',
        name: `Phase 8 Pro workspace ${suffix}`,
        created_by: owner.userId,
      })
      .select('id')
      .single(),
    'second workspace creation',
  ).id;
  workspacesToDelete.push(workspaceB);
  unwrap(
    await admin.from('workspace_members').insert({
      workspace_id: workspaceB,
      user_id: owner.userId,
      role: 'owner',
    }),
    'second workspace membership fixture',
  );
  unwrap(
    await admin.from('workspace_entitlements').insert({
      workspace_id: workspaceB,
      plan: 'pro',
      status: 'active',
      source: 'manual',
      effective_at: new Date(Date.now() - 60_000).toISOString(),
      expires_at: null,
    }),
    'trusted local Pro fixture',
  );

  const free = unwrap(
    await owner.client.rpc('get_workspace_entitlement', {
      p_workspace_id: workspaceA,
    }),
    'default Free resolution',
  )[0];
  assert.equal(free.plan, 'teacher_free');
  assert.equal(free.source, 'default');
  assert.deepEqual(free.capabilities, [
    'basic_classroom',
    'basic_assignments',
    'basic_analytics',
  ]);

  const pro = unwrap(
    await owner.client.rpc('get_workspace_entitlement', {
      p_workspace_id: workspaceB,
    }),
    'active Pro resolution',
  )[0];
  assert.equal(pro.plan, 'pro');
  assert.ok(pro.capabilities.includes('result_export'));
  assert.ok(!pro.capabilities.includes('multiple_teacher_workspace'));

  const backToFree = unwrap(
    await owner.client.rpc('get_workspace_entitlement', {
      p_workspace_id: workspaceA,
    }),
    'workspace switch back to Free',
  )[0];
  assert.equal(backToFree.plan, 'teacher_free');
  assert.ok(!backToFree.capabilities.includes('result_export'));

  const freeCapability = unwrap(
    await owner.client.rpc('workspace_has_capability', {
      p_workspace_id: workspaceA,
      p_capability: 'basic_assignments',
    }),
    'Free capability probe',
  );
  const proCapability = unwrap(
    await owner.client.rpc('workspace_has_capability', {
      p_workspace_id: workspaceB,
      p_capability: 'result_export',
    }),
    'Pro capability probe',
  );
  assert.equal(freeCapability, true);
  assert.equal(proCapability, true);

  const selfPromotion = await owner.client
    .from('workspace_entitlements')
    .insert({
      workspace_id: workspaceA,
      plan: 'pro',
      status: 'active',
      source: 'manual',
    });
  assert.equal(selfPromotion.error?.code, '42501');

  const foreignRead = await owner.client.rpc('get_workspace_entitlement', {
    p_workspace_id: foreignWorkspaceId,
  });
  assert.equal(foreignRead.error?.code, '42501');
  const foreignMutation = await owner.client
    .from('workspace_entitlements')
    .update({ plan: 'institution' })
    .eq('workspace_id', foreignWorkspaceId);
  assert.equal(foreignMutation.error?.code, '42501');

  const anon = createClient(env.API_URL, env.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonRead = await anon.rpc('get_workspace_entitlement', {
    p_workspace_id: workspaceA,
  });
  assert.equal(anonRead.error?.code, '42501');
  const anonMutation = await anon.from('workspace_entitlements').insert({
    workspace_id: workspaceA,
    plan: 'pro',
    status: 'active',
    source: 'manual',
  });
  assert.ok(anonMutation.error);

  const past = new Date(Date.now() - 120_000).toISOString();
  unwrap(
    await admin
      .from('workspace_entitlements')
      .update({
        effective_at: past,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .eq('workspace_id', workspaceB),
    'expire Pro test entitlement',
  );
  const expired = unwrap(
    await owner.client.rpc('get_workspace_entitlement', {
      p_workspace_id: workspaceB,
    }),
    'expired Pro resolution',
  )[0];
  assert.equal(expired.plan, 'teacher_free');
  assert.equal(expired.source, 'default');

  unwrap(
    await admin
      .from('workspace_entitlements')
      .update({ effective_at: past, expires_at: null })
      .eq('workspace_id', workspaceB),
    'restore active Pro fixture',
  );
  const restored = unwrap(
    await owner.client.rpc('get_workspace_entitlement', {
      p_workspace_id: workspaceB,
    }),
    'restored Pro resolution',
  )[0];
  assert.equal(restored.plan, 'pro');

  const stored = unwrap(
    await admin
      .from('workspace_entitlements')
      .select('workspace_id, plan, status, source, expires_at')
      .eq('workspace_id', workspaceB)
      .single(),
    'trusted entitlement state verification',
  );
  assert.equal(stored.plan, 'pro');
  assert.equal(stored.status, 'active');
  assert.equal(stored.source, 'manual');
  assert.equal(stored.expires_at, null);

  process.stdout.write(
    `${JSON.stringify(
      {
        localOnly: true,
        workspaceA: { plan: free.plan, capabilities: free.capabilities },
        workspaceB: {
          plan: restored.plan,
          capabilities: restored.capabilities,
        },
        expiredProFallback: expired.plan,
        restoredPro: restored.plan,
        selfPromotionRejected: true,
        foreignReadAndMutationRejected: true,
        anonymousReadAndMutationRejected: true,
        storedEntitlementVerified: true,
      },
      null,
      2,
    )}\n`,
  );
}

let smokeError;
try {
  await main();
} catch (error) {
  smokeError = error;
}

const cleanupFailures = [];
for (const workspaceId of workspacesToDelete) {
  const { error } = await admin
    .from('workspaces')
    .delete()
    .eq('id', workspaceId);
  if (error) cleanupFailures.push('workspace');
}
for (const userId of userIds) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) cleanupFailures.push('test user');
}
for (const client of clients) await client.auth.signOut();
if (smokeError) throw smokeError;
if (cleanupFailures.length > 0) {
  throw new Error(
    `Local entitlement smoke cleanup failed for ${[...new Set(cleanupFailures)].join(', ')}.`,
  );
}
