# Phase 1 RLS and database security model

**Scope:** Local Phase 1 schema and RLS implementation. The hosted Calcura database has not been baselined or changed.

## Access boundaries

| Table               | Authenticated staff                                                    | Enrolled student                                                           | Unrelated user / anon |
| ------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------- |
| `workspaces`        | Read active workspace when a workspace-member row matches `auth.uid()` | No access                                                                  | No access             |
| `workspace_members` | Read members in own active workspace                                   | No access, including own classroom's staff list                            | No access             |
| `classes`           | Read, create, rename, archive, reactivate within own active workspace  | Read only classes with own active enrollment; no creator UUID or join code | No access             |
| `class_enrollments` | Read enrollments for classes in own active workspace                   | Read only own enrollment rows                                              | No access             |

Grants and RLS are separate controls. The migration revokes existing public/anon/authenticated table grants first, grants authenticated only the required table/column operations, and enables RLS on all four exposed tables. Client hard deletes are not granted. Direct membership and enrollment writes are not granted.

Workspace staff authorization comes from immutable database membership (owner, admin, educator); student authorization comes from a class-scoped enrollment row. A student never becomes a workspace member by joining a class. The private schema is not in Supabase's exposed API schema list.

## Bootstrap and class creation

- `ensure_personal_workspace()` is an authenticated-only, no-argument, SECURITY DEFINER RPC because workspace creation and owner-membership insertion must be atomic, and existing owner rows are not visible until membership exists. It obtains the sole owner identity from `auth.uid()`, relies on a unique nullable `personal_owner_user_id` constraint to serialize races, returns the existing workspace when present, and never accepts a caller-supplied user UUID.
- It is lazy by design: a Calcura-only student does not receive a Classroom workspace unless they enter Classroom and call the RPC.
- Class inserts are available only to active workspace staff, with RLS independently checking the workspace membership and an insert trigger setting `created_by` from `auth.uid()`. Column-level grants allow only `workspace_id` and `name` on insert, and only `name` and `status` on update. A trigger independently prevents updates to class ID, workspace, creator, or join code.
- `created_by` is provenance, not authorization. It is not selectable from the browser, and creator deletion sets it null without deleting the class/workspace.

## Join codes and enrollment

A 10-character code uses a cryptographically random Base32-like alphabet that avoids visually ambiguous characters (30 symbols, about 49 bits of entropy). PostgreSQL creates it; a unique constraint prevents duplicates. Codes normalize case, ASCII whitespace, and hyphen separators only. Fuzzy matching is not used.

`join_code` and `created_by` are not readable through the ordinary classes table API. Authenticated workspace staff may call `get_class_join_code(class_id)`, which checks the caller's staff membership and returns only that class's invitation token. Knowing a UUID or join code does not make the class table readable.

`join_class_by_code(code)` is an authenticated-only SECURITY DEFINER RPC because a prospective student cannot read the target class before enrollment. It requires `auth.uid()`, normalizes and exactly matches the code, requires an active class in an active workspace, inserts/restores only that caller's enrollment, and returns only class ID/name/workspace ID/enrollment status. It accepts no user ID and exposes no roster. Repeated active joins are idempotent; a removed enrollment is restored in place.

## SECURITY DEFINER functions

The migration uses SECURITY DEFINER only for narrowly scoped operations that must bypass RLS safely:

- `classroom_private.has_workspace_role`, `is_class_staff`, and `is_active_class_enrollee` read their own underlying authorization tables without triggering recursive RLS evaluation. Each derives identity from `auth.uid()` and exposes only a boolean.
- `classroom_private.generate_join_code` produces an unpredictable token for the class column default; it takes no input and reads only to avoid ordinary collisions.
- `classroom_private.protect_and_generate_class_fields` is a trigger boundary that sets class creator provenance and rejects scope/code changes.
- `public.ensure_personal_workspace()`, `public.get_class_join_code(uuid)`, and `public.join_class_by_code(text)` are the user-facing operations described above.

All use an empty fixed `search_path`, schema-qualified objects, no dynamic SQL, and explicit execution grants. Private helpers are not exposed by PostgREST. No helper accepts an arbitrary user UUID or performs broad administrator checks.

## Verification

`supabase/tests/database/classroom_security.test.sql` creates isolated test users inside a rollback-only transaction and exercises role claims for owner A, educator A, two students, owner B, outsider, and anon. It covers cross-tenant IDOR attempts, bootstrap idempotency/uniqueness, class creation/update scope, exact normalized joining, archive rejection, roster privacy, helper privileges, anonymous denial, and account-deletion semantics. RLS recursion is also exercised by querying workspace/class/enrollment policies under authenticated roles.

The tests prove PostgreSQL grants/RLS behavior for the local migration. The local PostgREST HTTP API was not left running: the pinned CLI returned only `DB_URL` on API startup and a full start required pulling the unrelated Studio image. Current Supabase documentation was reviewed for PostgREST column-privilege behavior, but a live HTTP-level column-selection test remains unverified. None of this certifies the unbaselined hosted Calcura project.
