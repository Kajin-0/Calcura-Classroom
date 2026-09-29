// Local-only upgrade/pgTAP/race certification. Never contacts a hosted project,
// resets a database, copies user rows, or changes the active preview schema.
import assert from 'node:assert/strict';
import console from 'node:console';
import { execFileSync, spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

const container = 'supabase_db_calcura-classroom';
const database = `billing_switch_test_${process.pid}`;
let created = false;
const docker = (args, input) =>
  execFileSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 24 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
const sql = (query, db = database) =>
  docker(
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-U',
      'supabase_admin',
      '-d',
      db,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    query,
  );
const history = () =>
  sql(
    'select version from supabase_migrations.schema_migrations order by version;',
    'postgres',
  );
const before = history();

// Separate connections are necessary to test actual row-lock/CAS races.
function concurrentSql(query, onOutput = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-X',
        '-U',
        'supabase_admin',
        '-d',
        database,
        '-v',
        'ON_ERROR_STOP=1',
        '-At',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    let error = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Concurrent SQL timeout'));
    }, 15_000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      onOutput(output);
    });
    child.stderr.on('data', (chunk) => {
      error += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(error));
    });
    child.stdin.end(query);
  });
}

try {
  docker([
    'exec',
    container,
    'createdb',
    '-U',
    'supabase_admin',
    '-T',
    'template0',
    database,
  ]);
  created = true;
  // Metadata only, including the real local Supabase role grants/defaults.
  const schema = docker([
    'exec',
    container,
    'pg_dump',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '--schema-only',
  ]);
  sql(schema);
  const applied = new Set(before.trim().split('\n'));
  for (const file of readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    if (!applied.has(file.split('_')[0])) {
      sql(
        `begin;\n${readFileSync(`supabase/migrations/${file}`, 'utf8')}\ncommit;`,
      );
      console.log(`Disposable DB applied: ${file}`);
    }
  }
  const focused = process.argv.includes('--focused');
  const files = readdirSync('supabase/tests/database')
    .filter(
      (file) =>
        file.endsWith('.sql') &&
        (!focused || /stripe_|checkout_interval/.test(file)),
    )
    .sort();
  let assertions = 0;
  for (const file of files) {
    const output = sql(readFileSync(`supabase/tests/database/${file}`, 'utf8'));
    assert.doesNotMatch(output, /^not ok\b|^Bail out!/m, `${file}\n${output}`);
    const plan = output.match(/^1\.\.(\d+)$/m);
    const passed = output.match(/^ok \d+\b/gm)?.length ?? 0;
    assert.ok(plan && passed > 0, `Missing pgTAP results: ${file}\n${output}`);
    assert.equal(passed, Number(plan[1]), `${file}: pgTAP plan mismatch`);
    assertions += passed;
    console.log(`${file}: ${passed}/${passed} PASS`);
  }
  console.log(`pgTAP: ${assertions} assertions, ${files.length} files PASS`);

  const workspace = '96000000-0000-4000-8000-000000000001';
  const actor = '86000000-0000-4000-8000-000000000001';
  const attempt = 'a6000000-0000-4000-8000-000000000001';
  sql(`insert into auth.users(id) values ('${actor}');
    insert into public.workspaces(id,workspace_type,name) values ('${workspace}','organization','Disposable race fixture');
    insert into public.workspace_members(workspace_id,user_id,role) values ('${workspace}','${actor}','owner');
    insert into public.workspace_billing(workspace_id,stripe_customer_id,checkout_attempt_id,checkout_interval,checkout_session_id,checkout_session_expires_at)
    values ('${workspace}','cus_racetest','${attempt}','monthly','cs_test_race',now()+interval '1 day');`);
  let announceClaim;
  const claimed = new Promise((resolve) => {
    announceClaim = resolve;
  });
  const first = concurrentSql(
    `begin; set local role service_role;
    select reservation_state from public.reserve_workspace_checkout('${workspace}','${actor}','annual');
    select 'lease_claimed'; select pg_sleep(0.5); commit;`,
    (output) => {
      if (output.includes('lease_claimed')) announceClaim();
    },
  );
  await Promise.race([
    claimed,
    first.then(() => {
      throw new Error('Missing claim signal');
    }),
  ]);
  const second = concurrentSql(
    `set role service_role; select reservation_state from public.reserve_workspace_checkout('${workspace}','${actor}','monthly');`,
  );
  const [a, b] = await Promise.all([first, second]);
  assert.match(a, /^switch_session$/m);
  assert.match(b, /^in_progress$/m);
  console.log('Concurrent switch vs resume: serialized PASS');
  const replace = `set role service_role; select reservation_state from public.replace_workspace_checkout_after_expire('${workspace}','${actor}','${attempt}','cs_test_race','annual');`;
  const winners = await Promise.all([
    concurrentSql(replace),
    concurrentSql(replace),
  ]);
  assert.equal(
    winners.filter((result) => /^reserved$/m.test(result)).length,
    1,
  );
  assert.equal(winners.filter((result) => /^stale$/m.test(result)).length, 1);
  console.log('Concurrent atomic handoff: exactly one winner PASS');

  // Compile PL/pgSQL with the installed lint extension (same backend as db lint).
  sql('create extension if not exists plpgsql_check with schema extensions;');
  const lint = sql(`select p.proname || ': ' || c.message
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral extensions.plpgsql_check_function_tb(p.oid) c
    where n.nspname='public' and p.proname in ('reserve_workspace_checkout','replace_workspace_checkout_after_expire','save_workspace_checkout_session')
      and c.level in ('error','warning','warning extra');`);
  assert.equal(lint.trim(), '', `Billing function DB lint: ${lint}`);
  console.log('Billing function DB lint: PASS');

  if (process.argv.includes('--generate-types')) {
    // Standard pinned Supabase generator, explicitly targeting only the local
    // disposable DB. The local development password is not a production key.
    const types = execFileSync(
      'node_modules/.bin/supabase',
      [
        'gen',
        'types',
        '--db-url',
        `postgresql://postgres:postgres@127.0.0.1:54322/${database}`,
        '--schema',
        'public,graphql_public',
      ],
      {
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    assert.match(types, /replace_workspace_checkout_after_expire/);
    writeFileSync('src/types/database.generated.ts', types);
    execFileSync('node_modules/.bin/prettier', [
      '--write',
      'src/types/database.generated.ts',
    ]);
    console.log('Generated DB types from disposable schema: PASS');
  }
} finally {
  if (created) {
    assert.match(database, /^billing_switch_test_\d+$/);
    docker(['exec', container, 'dropdb', '-U', 'supabase_admin', database]);
    console.log('Removed only disposable database (no user rows were copied).');
  }
  assert.equal(history(), before, 'Active preview migration history changed');
  console.log('Active preview migration history: UNCHANGED');
}
