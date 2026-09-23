# Calcura Classroom engineering rules

This repository is the teacher and institutional control plane. Read `README.md`, then the relevant contract below before changing architecture or auth.

## Source of truth

- Auth behavior and session lifecycle: `src/features/auth/`.
- Supabase environment parsing and browser client: `src/lib/supabase/`.
- Domain contracts: `src/types/domain.ts` and `docs/DATA_MODEL.md`.
- Database configuration and migrations: `supabase/config.toml` and `supabase/migrations/`.
- Unit, integration, and browser checks: `tests/`.
- Architecture decisions and cross-repository contracts: `docs/`.

## Critical invariants

- Calcura (`Kajin-0/Calcura`) remains the only mathematics engine. Do not duplicate solver, grading, equivalence, generation, or student mathematical correctness logic here.
- Use the same Supabase project and Auth users as Calcura. Browser code may use only the URL and publishable key. Never put service-role, secret, SMTP, or Stripe credentials in Vite code, public files, or client-readable environment variables.
- Never authorize from `user_metadata` or another user-editable claim. Authorization is workspace-scoped and must be derived from immutable server-side membership and database policy predicates.
- Do not run linked or remote Supabase migration commands without explicit authorization for that phase. Phase 0 does not authorize production schema changes.
- Every exposed table must have RLS enabled and reviewed policies. `TO authenticated` by itself is not authorization. UPDATE policies need appropriate `USING` and `WITH CHECK` predicates.
- Privileged server operations must authorize the caller before using privileged credentials.
- Do not ship fake student, class, assignment, analytics, revenue, or customer data in product components.
- Do not add institutional integrations before a defined product requirement. Do not implement Stripe or billing before the designated billing phase.
- Do not make destructive changes to the Calcura student repository. It is read-only reference material from this repository.
- Cross-repository contracts, including learning events, must be versioned and reviewed at both boundaries.
- Workspace roles are `owner`, `admin`, and `educator`. Students are class enrollees, not administrative workspace members.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:ci
```

Run the checks relevant to the change. Never claim that production data or remote policies were tested by local client tests.
