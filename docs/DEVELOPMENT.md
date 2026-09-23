# Development workflow

## Web application

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app handles missing or invalid Supabase settings without a runtime crash. Add local values only to `.env.local`; it is ignored by Git. A valid project URL and publishable key are needed to contact the shared Auth service.

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

The pinned project CLI is the documented npm installation method. Initialize once and start the local stack when Docker is available:

```bash
npm run supabase -- init
npm run supabase -- start
npm run supabase -- status
npm run supabase -- stop
```

`supabase start` prints local API values; use them only for local development. `supabase db reset` recreates the local database and applies checked-in migrations. It is destructive to local Supabase data. Do not use `--linked` in this phase. `supabase db pull` and `supabase db push` target a linked remote project by default and are not routine Phase 0 commands.

The initial remote baseline needs an explicit review because the first `db pull` may record a migration as applied in Supabase's remote migration-history table. See [Supabase baseline](SUPABASE_BASELINE.md). No migration history is to be written remotely during this phase.

## Repository workflow

Keep Calcura student source read-only. Make Classroom changes in this repository, add contract tests alongside behavior, and keep cross-repository event changes versioned and documented.
