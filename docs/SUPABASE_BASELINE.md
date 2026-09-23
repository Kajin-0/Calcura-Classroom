# Supabase baseline status

## Phase 0 findings

- Supabase CLI before this work: not installed on the VPS PATH.
- CLI authentication: no Supabase access-token file was present in the local CLI directory. No credential contents were inspected or copied.
- Project reference: not available from the local Calcura environment. Its `.env.local` is absent, the checked-in `.env.example` is placeholder-only, and no existing CLI link state was found. No project ID is guessed.
- Existing project access: unavailable from this VPS state. No remote database connection or schema pull was attempted.
- Local Supabase project: initialized from the current repo-pinned CLI with `supabase init`; its safe `config.toml` is committed. Docker-backed local database was not started during Phase 0.
- The generated local config currently selects PostgreSQL major version 17, the CLI template default. The remote project's actual PostgreSQL major version was not available and must be confirmed before treating the local database as a faithful baseline.
- Baseline migration: none generated. Classroom has no SQL migrations yet.
- Remote project changes: none. No remote link, pull, migration-history write, push, or database mutation was performed.

## Existing Calcura repository evidence

The read-only Calcura checkout documents an existing `public.communication_preferences` table in `docs/SUPABASE_AUTH_SETUP.md` and `supabase/schemas/communication_preferences.sql`. That schema uses `auth.users(id)` as its key, enables RLS, revokes anonymous access, and scopes authenticated reads/writes to `auth.uid() = user_id`. The checkout also contains a later privilege-hardening migration. `supabase/schemas/practice_attempts.sql` is present in the repository, but its presence is not evidence that the object exists in production. No full remote public schema inventory can be established from local files alone.

## Current official CLI workflow

Supabase's current local-development guide documents `supabase init` for configuration. To move an existing hosted project into migration history, it documents authenticating and linking the project, then `supabase db pull`; the first pull creates a baseline migration and may offer to mark it applied in the remote `supabase_migrations.schema_migrations` table. That bookkeeping is a remote write. It was intentionally not accepted or attempted during this foundation phase.

## Before the first production migration

1. Obtain the confirmed project reference and database connection method from the project operator without placing credentials in Git.
2. Authenticate the pinned CLI through the approved Supabase account workflow and link the intended project.
3. Choose an explicitly read-only schema inspection/export procedure and review the generated SQL for personal data, secrets, and unsupported platform objects.
4. Review the exact first-pull migration-history behavior and obtain phase authorization before recording a baseline remotely.
5. Verify the baseline locally, document the complete public schema, and only then design Workspace/Classroom migrations and RLS tests.

Useful current CLI commands once those prerequisites are met:

```bash
npm run supabase -- --version
npm run supabase -- help
npm run supabase -- init
npm run supabase -- link --project-ref CONFIRMED_PROJECT_REF
npm run supabase -- db pull
```

Exact local initialization commands run in this phase:

```bash
npm install --no-audit --no-fund
npm run supabase -- --version
npm run supabase -- --help
npm run supabase -- init
```

`db pull` is not a command to run blindly: its schema read is followed by optional migration-history recording. Do not run `db push` or `db reset --linked` against production.
