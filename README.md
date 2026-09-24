# Calcura Classroom

Calcura Classroom is the teacher and institutional control plane for Calcura. **Phases 0–5 are complete locally**: engineering foundation, workspace/class RLS, teacher class management, assignment authoring, student Calcura integration, and terminal assignment-result reporting. Teachers can publish versioned practice-family assignments and view each active enrollee's completed/total problem slots. Students solve through Calcura, which remains the only mathematics engine. These features require the shared Classroom schema; it has not been deployed to the hosted Supabase project, and the Calcura student feature gate remains disabled by default.

## Repository responsibilities

- [`Kajin-0/Calcura`](https://github.com/Kajin-0/Calcura) owns student practice, the single mathematics engine, grading, student performance, Android, and the student browser/PWA experience.
- `Kajin-0/Calcura-Classroom` owns teacher authentication UX, workspace and classroom administration, assignment intent, teacher analytics, future billing integration, migrations, and Edge Functions.
- `Kajin-0/Calcura-Site` owns public marketing and pricing.

Classroom and Calcura use the same Supabase project and Auth users. Calcura still owns mathematical generation, checking, grading, and generic personal `AttemptRecord` history. Classroom stores assignment intent plus one minimal terminal result per assigned problem slot. Correct and surrendered slots count as complete; abandoned attempts do not. Outcome, performance, and taxonomy fields are client-reported context, not cryptographically verified academic truth. The result RPC validates authenticated identity, active enrollment, item/assignment relationship, lifecycle state, ordinal bounds, and idempotency. Teacher identity is returned only by a narrowly authorized progress RPC; students cannot read classmates' results.

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
npm run types:db
npm run supabase:stop
```

These commands target the local stack only. Do not run linked resets, pushes, or migration-history repair. The hosted Calcura schema must first be baselined and reconciled; production Supabase remains untouched. See [Development](docs/DEVELOPMENT.md), [RLS security model](docs/RLS_SECURITY_MODEL.md), and [Supabase baseline](docs/SUPABASE_BASELINE.md).

## Security and architecture

See [AGENTS.md](AGENTS.md) for mandatory engineering rules, [Auth](docs/AUTH.md) for the OTP contract, [Architecture](docs/ARCHITECTURE.md) for ownership boundaries, and [Data model](docs/DATA_MODEL.md) for the implemented local schema and future conceptual entities.

Every exposed Supabase table requires explicit grants and RLS. A publishable key is not an authorization rule. Workspace staff access comes from server-side membership; student reads and terminal result submissions are class-enrollment scoped. Result writes are RPC-only; authenticated clients have select-only access to their own result rows.

## Roadmap

The planned order is recorded in [Roadmap](docs/ROADMAP.md). The next phase is **Phase 6 — Basic Analytics**. Rich learning events, step-level telemetry, analytics, billing, entitlements, Team, School, and University remain deferred.
