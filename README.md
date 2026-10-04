# Calcura Classroom

## Launch privacy operations

Server/operator-only personal export and read-only deletion preflight are available
through `npm run ops:export-user` and `npm run ops:preflight-user-deletion` (Node 24).
Both require the exact verified user UUID/email and securely provisioned admin
environment; there is no browser admin endpoint or automatic Auth deletion.
See [Privacy implementation](docs/PRIVACY_IMPLEMENTATION.md),
[request/export runbook](docs/PRIVACY_REQUEST_RUNBOOK.md),
[billing-before-deletion](docs/ACCOUNT_DELETION_RUNBOOK.md),
[backup/restore](docs/BACKUP_RESTORE_RUNBOOK.md), and
[observable Auth settings](docs/AUTH_SETTINGS_LAUNCH_CHECK.md).

Calcura Classroom is the teacher and institutional control plane for Calcura. It provides workspace dashboards, Stripe-backed Pro billing, versioned Guided assignments, and Pro problem-slot editing. Students solve through Calcura, which remains the only mathematics engine and stays free. Production Classroom schema/functions and the teacher-app host are separate deployment concerns; see [Production deployment preparation](docs/PRODUCTION_DEPLOYMENT.md). The Calcura student feature gate remains disabled by default unless separately activated.

## Repository responsibilities

- [`Kajin-0/Calcura`](https://github.com/Kajin-0/Calcura) owns student practice, the single mathematics engine, grading, student performance, Android, and the student browser/PWA experience.
- `Kajin-0/Calcura-Classroom` owns teacher authentication UX, workspace and classroom administration, assignment intent, teacher analytics, future billing integration, migrations, and Edge Functions.
- `Kajin-0/Calcura-Site` owns public marketing and pricing.

Classroom and Calcura use the same Supabase project and Auth users. Calcura still owns mathematical generation, checking, grading, and generic personal `AttemptRecord` history. Classroom stores assignment intent plus one minimal terminal result per assigned problem slot. Correct and surrendered slots count as complete; abandoned attempts do not. Outcome, performance, and taxonomy fields are client-reported context, not cryptographically verified academic truth. The result RPC validates authenticated identity, active enrollment, item/assignment relationship, lifecycle state, ordinal bounds, and idempotency. Teacher identity and assignment aggregates are returned only by narrowly authorized RPCs; students cannot read classmates' results or teacher analytics.

## Local setup

Requirements: Node.js 24 LTS, npm, and Docker-compatible runtime for the optional local Supabase stack.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set only these browser-safe values in `.env.local`:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Until valid values are configured, the app shows an explicit sign-in configuration message and does not construct a Supabase client. Use the shared Calcura project and its existing email OTP/Auth configuration. Never place service-role, secret, SMTP, or Stripe credentials in a `VITE_` variable.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:ci
```

Playwright browser setup, when needed:

```bash
npx playwright install chromium
```

## Supabase local development

The checked-in CLI is pinned in `package.json`. Initialize configuration with:

```bash
npm run supabase -- init
npm run supabase -- start
npm run supabase -- status
npm run supabase -- stop
```

The local migrations create the workspace/class foundation, assignment-intent model with published-content immutability, and assignment-slot result contract. They are the data boundary used by both teacher and student surfaces, but have not been deployed remotely. Starting the local stack requires Docker:

```bash
npm run supabase:start
npm run supabase:reset
npm run test:db
npm run test:assignment-analytics:local
npm run types:db
npm run supabase:stop
```

These commands target the local stack only. Do not run linked resets, pushes, or migration-history repair. The hosted Calcura schema must first be baselined and reconciled; production Supabase remains untouched. See [Development](docs/DEVELOPMENT.md), [RLS security model](docs/RLS_SECURITY_MODEL.md), and [Supabase baseline](docs/SUPABASE_BASELINE.md).

## Security and architecture

See [AGENTS.md](AGENTS.md) for mandatory engineering rules, [Auth](docs/AUTH.md) for the OTP contract, [Architecture](docs/ARCHITECTURE.md) for ownership boundaries, [Data model](docs/DATA_MODEL.md) for the implemented local schema, and [Entitlements](docs/ENTITLEMENTS.md) for workspace plan/capability resolution.

Every exposed Supabase table requires explicit grants and RLS. A publishable key is not an authorization rule. Workspace staff access comes from server-side membership; student reads and terminal result submissions are class-enrollment scoped. Result writes are RPC-only; authenticated clients have select-only access to their own result rows.

## Roadmap

The planned order is recorded in [Roadmap](docs/ROADMAP.md). Dashboard completion is completed student-assignment pairs divided by all active student-assignment pairs. Accuracy is correct terminal results divided by all terminal results; surrendered slots complete an assignment but are not correct, and empty denominators display as unavailable rather than 0%. The dashboard uses one teacher-authorized, read-only workspace aggregate RPC; no new student telemetry or generated mathematics is stored. Rich learning events, step-level telemetry, Team, School, and University remain deferred. Production billing and application deployment require the separate readiness gates in [Production deployment preparation](docs/PRODUCTION_DEPLOYMENT.md).
