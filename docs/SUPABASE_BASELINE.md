# Supabase baseline status

## Phase 0 remote baseline findings

- Supabase CLI before this work: not installed on the VPS PATH.
- CLI authentication: no Supabase access-token file was present in the local CLI directory. No credential contents were inspected or copied.
- Project reference: not available from the local Calcura environment. Its `.env.local` is absent, the checked-in `.env.example` is placeholder-only, and no existing CLI link state was found. No project ID is guessed.
- Existing project access: unavailable from this VPS state. No remote database connection or schema pull was attempted.
- Local Supabase project: initialized from the current repo-pinned CLI with `supabase init`; its safe `config.toml` is committed. Docker-backed local database was not started during Phase 0.
- The generated local config currently selects PostgreSQL major version 17, the CLI template default. The remote project's actual PostgreSQL major version was not available and must be confirmed before treating the local database as a faithful baseline.
- Remote baseline migration: none generated. The hosted schema still needs a reviewed baseline before the first production migration.
- Remote project changes: none. No remote link, pull, migration-history write, push, or database mutation was performed.

## Phase 1 local migration status

- Supabase CLI: project-pinned `2.117.0` (verified with the repository script).
- Local Supabase initialization: completed during Phase 0; `supabase/config.toml` is the checked-in local configuration.
- Local database migration: `supabase/migrations/20260924002726_classroom_foundation.sql` was created with `npm run supabase -- migration new classroom_foundation`. It creates only new Classroom tables/functions/policies and is intended for local development and testing in this phase.
- Local database: the CLI's database-only local service started successfully via `npm run supabase:start`; `npm run supabase:reset` rebuilt PostgreSQL 17 from the checked-in migration, and `npm run test:db` passed all 93 pgTAP assertions. `supabase start` attempts returned only the local DB URL and stopped API services; a full start began pulling the latest Studio image and was stopped. Thus PostgreSQL privilege behavior is certified locally, but no PostgREST HTTP probe was completed. Current official column-grant guidance was reviewed.
- Remote access/schema inspection: unavailable from existing VPS configuration; no project reference was discovered, no Supabase remote was linked, and no production schema was inspected or invented.
- Baseline migration for production: not generated. The Phase 1 migration must not be applied to production until the existing Calcura objects and migration history have been safely reconciled.
- Production Supabase changes: none.

## Phase 3 local assignment migration status

- The CLI-created local migration `supabase/migrations/20260924111016_assignment_foundation.sql` adds only `public.assignments`, `public.assignment_items`, local helper functions, grants, lifecycle/reorder RPCs, and RLS policies. The Phase 1 migration is unchanged.
- A clean local `npm run supabase:reset` applied both migrations successfully. `npm run test:db` runs the Phase 1 and Phase 3 pgTAP files through the pinned CLI; the known earlier host-port failure was not reproducible during Phase 3 diagnosis.
- TypeScript database types were generated from the local schema with `npm run types:db`.
- Local validation passed 172 pgTAP assertions, `supabase db lint --local` reported no schema errors, and `supabase db advisors --local --type all --level info --fail-on error` reported no Phase 3 findings after adding an index for `assignments.created_by`. Its only remaining findings are INFO-level missing indexes for the Phase 1 `classes.created_by` and `workspaces.created_by` provenance foreign keys; the Phase 1 migration remains unchanged.
- The migration is preparation for later deployment only. The hosted project still has no safely reconciled baseline. Do not link, pull, repair, push, or otherwise apply this migration to production until the existing schema and history have been reviewed.
- Production Supabase changes: none.

## Existing Calcura repository evidence

The read-only Calcura checkout documents an existing `public.communication_preferences` table in `docs/SUPABASE_AUTH_SETUP.md` and `supabase/schemas/communication_preferences.sql`. That schema uses `auth.users(id)` as its key, enables RLS, revokes anonymous access, and scopes authenticated reads/writes to `auth.uid() = user_id`. The checkout also contains a later privilege-hardening migration. `supabase/schemas/practice_attempts.sql` is present in the repository, but its presence is not evidence that the object exists in production. No full remote public schema inventory can be established from local files alone.

## Current official CLI workflow

Supabase's current local-development guide documents `supabase init` for configuration. To move an existing hosted project into migration history, it documents authenticating and linking the project, then `supabase db pull`; the first pull creates a baseline migration and may offer to mark it applied in the remote `supabase_migrations.schema_migrations` table. That bookkeeping is a remote write. It was intentionally not accepted or attempted during this foundation phase.

## Before the first production migration

1. Obtain the confirmed project reference and database connection method without placing credentials in Git.
2. Choose a reviewed, read-only schema inspection/export procedure; review generated SQL for personal data, secrets, and unsupported platform objects.
3. Reconcile existing public objects—including Calcura's `communication_preferences`—with a checked-in baseline and migration history.
4. Review the exact first-pull migration-history behavior and obtain authorization before any remote history write.
5. Only after baseline review, plan a separate authorized production deployment. The locally certified Phase 1 migration is not a substitute for a remote baseline.

Useful current CLI commands once those prerequisites are met:

```bash
npm run supabase -- --version
npm run supabase -- help
npm run supabase -- init
npm run supabase -- link --project-ref CONFIRMED_PROJECT_REF
npm run supabase -- db pull
```

Those commands are intentionally not run by Phase 1. Local-only commands are `npm run supabase:start`, `npm run supabase:reset`, and `npm run test:db`; none includes `--linked`.

Exact local initialization commands run in this phase:

```bash
npm install --no-audit --no-fund
npm run supabase -- --version
npm run supabase -- --help
npm run supabase -- init
```

`db pull` is not a command to run blindly: its schema read is followed by optional migration-history recording. Do not run `db push` or `db reset --linked` against production.
