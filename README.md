# Calcura Classroom

Calcura Classroom is the future teacher and institutional control plane for Calcura. The repository has completed **Phase 0: Engineering foundation** and **Phase 1: Workspace + Classroom schema + RLS foundation** locally. It is not yet a classroom management product, and the migration has not been applied to the hosted Supabase project.

## Repository responsibilities

- [`Kajin-0/Calcura`](https://github.com/Kajin-0/Calcura) owns student practice, the single mathematics engine, grading, student performance, Android, and the student browser/PWA experience.
- `Kajin-0/Calcura-Classroom` owns teacher authentication UX, workspace and classroom administration, assignments, teacher analytics, future billing integration, migrations, and Edge Functions.
- `Kajin-0/Calcura-Site` owns public marketing and pricing.

Classroom uses the same Supabase project and Auth users as Calcura. Mathematical generation and correctness stay in Calcura. Student performance is currently primarily local; cloud sharing will require a versioned learning-event contract and explicit privacy rules.

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

The local migration creates workspaces, staff membership, classes, enrollments, personal workspace bootstrap, join codes, and RLS. Starting the local stack requires Docker:

```bash
npm run supabase:start
npm run supabase:reset
npm run test:db
npm run types:db
npm run supabase:stop
```

These commands target the local stack only. Do not run linked resets, pushes, or migration-history repair. The hosted Calcura schema must first be baselined and reconciled; production Supabase remains untouched in Phase 1. See [Development](docs/DEVELOPMENT.md), [RLS security model](docs/RLS_SECURITY_MODEL.md), and [Supabase baseline](docs/SUPABASE_BASELINE.md).

## Security and architecture

See [AGENTS.md](AGENTS.md) for mandatory engineering rules, [Auth](docs/AUTH.md) for the OTP contract, [Architecture](docs/ARCHITECTURE.md) for ownership boundaries, and [Data model](docs/DATA_MODEL.md) for the implemented local schema and future conceptual entities.

Every exposed Supabase table requires explicit grants and RLS. A publishable key is not an authorization rule. Phase 1 workspace access is resolved from active server-side workspace membership; student access is class-enrollment scoped.

## Roadmap

The planned order is recorded in [Roadmap](docs/ROADMAP.md). The next phase is **Phase 2 — Teacher Class Management UI**. Assignments, analytics, billing, plans, entitlements, Team, School, and University are not implemented.
