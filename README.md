# Calcura Classroom

Calcura Classroom is the future teacher and institutional control plane for Calcura. This repository is at **Phase 0: Engineering foundation**. It provides a buildable React application shell, shared Supabase email OTP compatibility, local development configuration, and engineering contracts. It is not yet a classroom management system.

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

The repository is intentionally initialized without classroom migrations. Starting the local stack is optional and requires Docker. See [Development](docs/DEVELOPMENT.md) and [Supabase baseline](docs/SUPABASE_BASELINE.md). Do not run linked resets, pushes, or migration-history repair against a remote project as part of Phase 0.

## Security and architecture

See [AGENTS.md](AGENTS.md) for mandatory engineering rules, [Auth](docs/AUTH.md) for the OTP contract, [Architecture](docs/ARCHITECTURE.md) for ownership boundaries, and [Data model](docs/DATA_MODEL.md) for concepts that are not yet SQL.

Every future exposed Supabase table requires RLS and membership-based policies. A publishable key is not an authorization rule. Workspace access is resolved server-side from authenticated identity, active workspace, role, plan, and policy-backed entitlements.

## Roadmap

The planned order is recorded in [Roadmap](docs/ROADMAP.md). The next phase is **Phase 1 — Workspace + Classroom schema + RLS**. This foundation does not create workspaces, classes, enrollments, assignments, analytics, or billing tables.
