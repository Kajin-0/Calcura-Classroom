# Calcura Classroom engineering rules

This repository is the teacher and institutional control plane. Read `README.md`, then the relevant contract below before changing architecture or auth.

## Source of truth

- Auth behavior and session lifecycle: `src/features/auth/`.
- Supabase environment parsing and browser client: `src/lib/supabase/`.
- Domain contracts: `src/types/domain.ts` and `docs/DATA_MODEL.md`.
- Database configuration and migrations: `supabase/config.toml` and `supabase/migrations/`.
- Database policy/RPC security boundary: `docs/RLS_SECURITY_MODEL.md` and `supabase/tests/database/`.
- Typed database-facing behavior: `src/features/workspaces/`, `src/features/classes/`, and generated `src/types/database.generated.ts`.
- Authenticated teacher shell and class routes: `src/app/TeacherLayout.tsx`, `src/app/routes.tsx`, and feature-scoped class/workspace pages and hooks.
- Unit, integration, and browser checks: `tests/`.
- Architecture decisions and cross-repository contracts: `docs/`.

## Critical invariants

- Calcura (`Kajin-0/Calcura`) remains the only mathematics engine. Do not duplicate solver, grading, equivalence, generation, or student mathematical correctness logic here.
- Use the same Supabase project and Auth users as Calcura. Browser code may use only the URL and publishable key. Never put service-role, secret, SMTP, or Stripe credentials in Vite code, public files, or client-readable environment variables.
- Never authorize from `user_metadata` or another user-editable claim. Authorization is workspace-scoped and must be derived from immutable server-side membership and database policy predicates.
- Phase 1 authorizes local Supabase development only. Never run linked/remote migration, reset, repair, or schema mutation commands without explicit authorization for that phase. The hosted Calcura schema must be baselined before production deployment.
- Every exposed table must have RLS enabled and reviewed policies. `TO authenticated` by itself is not authorization. UPDATE policies need appropriate `USING` and `WITH CHECK` predicates.
- RLS predicates use immutable server-side membership/enrollment rows and `(select auth.uid())`; never use user-editable metadata or a browser-supplied UUID as authorization. Keep policy helpers in the non-exposed `classroom_private` schema and avoid recursion.
- Do not grant ordinary clients hard-delete access to tenant rows. Workspace membership writes and student enrollment writes are limited to the reviewed database RPC paths.
- SECURITY DEFINER functions are exceptional: fixed empty `search_path`, fully qualified objects, no dynamic SQL, caller derived from `auth.uid()`, minimal return shape, and explicit execution grants. Document and adversarially test each one.
- Class join codes are invitation tokens: never return them through ordinary class reads; only workspace staff may retrieve them. A join code grants only the narrow `join_class_by_code` operation.
- The four Phase 1 exposed tables (`workspaces`, `workspace_members`, `classes`, `class_enrollments`) all require explicit grants plus RLS. Students are class enrollees, never workspace members.
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
npm run supabase:reset
npm run test:db
npm run types:db
npm run supabase -- db advisors --local
```

Run the checks relevant to the change. Never claim that production data or remote policies were tested by local client tests.
