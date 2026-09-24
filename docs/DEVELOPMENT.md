# Development workflow

## Web application

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app handles missing or invalid Supabase settings without a runtime crash. Add local values only to `.env.local`; it is ignored by Git. A valid project URL and publishable key are needed to contact the shared Auth service.

The authenticated `/app` route lazily bootstraps a personal workspace and provides class creation, class details, join-code copying, enrollment counts, rename, archive, and reactivation. Class detail includes real assignment listing and the teacher draft builder (metadata, versioned practice blocks, ordering, publish/archive/reactivate/discard). It uses the Phase 1 and Phase 3 local schemas; do not deploy those migrations to the hosted project until its baseline has been reconciled.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:ci
```

To install the browser used by the smoke suite:

```bash
npx playwright install chromium
```

CI installs Chromium and runs the browser suite without project credentials.

## Local Supabase

Use Node 24 (`.nvmrc`) and npm. The pinned project CLI is run through the npm script, as in the current Supabase CLI guidance. Docker is required. Phase 1 uses Supabase CLI's database-only local service for migrations, pgTAP, and type generation. `supabase start` and `supabase start --exclude ...` were also attempted to exercise PostgREST, but CLI 2.117.0 returned only `DB_URL` and stopped the API containers; a full start began pulling the current Studio image. The REST/Auth/Studio stack was not left running. PostgreSQL grants are tested directly via pgTAP; the current Supabase column-privilege guidance was reviewed, but a local PostgREST HTTP probe remains unverified. Avoid pulling the unrelated Studio stack only for this phase. Phase 1 commands are explicitly local:

```bash
npm run supabase:start
npm run supabase:reset
npm run test:db
npm run types:db
npm run supabase -- db lint --local
npm run supabase -- db advisors --local
npm run supabase:stop
```

`supabase:reset` recreates only the local database and applies checked-in migrations; local database data is discarded. Run both `db lint --local` and `db advisors --local` against the local database. Phase 3's advisor run found no Phase 3 index/security issues; it reports two inherited INFO findings for the Phase 1 `classes.created_by` and `workspaces.created_by` provenance foreign keys. Those are left unchanged to avoid Phase 1 migration churn. The generated database type file is `src/types/database.generated.ts`; regenerate it after schema changes and commit it with the migration.

Phase 3 adds `20260924111016_assignment_foundation.sql` and `supabase/tests/database/assignment_security.test.sql`. The assignment test suite runs through the same verified local command `npm run test:db`; the Phase 1 93-assertion suite remains intact. Do not run remote/linking operations during local validation.

Do not use `--linked`, `db pull`, `db push`, remote migration repair, or a remote SQL editor during local Classroom implementation. The production Supabase schema is not baselined, and local migrations are not production-ready until the baseline is reconciled. See [Supabase baseline](SUPABASE_BASELINE.md).

## Repository workflow

Keep Calcura student source read-only. Make Classroom changes in this repository, add contract tests alongside behavior, and keep cross-repository event changes versioned and documented.
