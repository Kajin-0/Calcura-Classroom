import {
  collectUser,
  createReader,
  deletionPreflight,
  validateIdentity,
  writeExport,
} from './user-data.ts';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const option = args[i];
    const value = args[i + 1];
    if (
      !option ||
      !['--user-id', '--email', '--output-dir'].includes(option) ||
      !value ||
      value.startsWith('--') ||
      options.has(option)
    )
      throw new Error(
        'Usage: export|preflight --user-id UUID --email EXACT_EMAIL [--output-dir ABSOLUTE_PRIVATE_DIRECTORY]. No --execute: final Auth deletion is manual.',
      );
    options.set(option, value);
  }
  if (!['export', 'preflight'].includes(command ?? ''))
    throw new Error('Choose export or preflight');
  const id = options.get('--user-id') ?? '';
  const email = options.get('--email') ?? '';
  validateIdentity(id, email);
  const reader = createReader(
    process.env.CALCURA_OPS_SUPABASE_URL ?? '',
    process.env.CALCURA_OPS_SUPABASE_ADMIN_KEY ?? '',
  );
  if (command === 'preflight') {
    const plan = await deletionPreflight(reader, id, email);
    console.log(JSON.stringify(plan, null, 2));
    if (plan.blockers.length) process.exitCode = 2;
    return;
  }
  const data = await collectUser(reader, id, email);
  const filename = await writeExport(
    data,
    options.get('--output-dir') ?? '/tmp/calcura-exports',
    process.cwd(),
  );
  console.log(
    JSON.stringify({
      export_file: filename,
      counts: Object.fromEntries(
        Object.entries(data.tables).map(([table, rows]) => [
          table,
          rows.length,
        ]),
      ),
      warning:
        'Contains personal data. Deliver privately after identity verification, then remove the operator copy under the runbook.',
    }),
  );
}
main().catch(() => {
  // Do not log SDK errors, request headers, keys, email or record contents.
  console.error(
    'Privacy operation refused or failed. Verify exact identity, private output directory, production project and administrative configuration. No server mutation was attempted.',
  );
  process.exitCode = 1;
});
