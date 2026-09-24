# Data model

The Phase 1, 3, and 5 migrations implement and locally certify the workspace, classroom, assignment-intent, and terminal assignment-result entities described below. The hosted Supabase project remains unbaselined and has not received these migrations.

## Implemented entities

| Entity                       | Columns and behavior                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaces`                 | `id`, `workspace_type` (`personal`/`organization`), `name`, nullable provenance `created_by`, nullable `personal_owner_user_id`, `status` (`active`/`archived`), timestamps. Personal ownership is unique per Auth user; deleting that owner cascades the personal workspace. Organization identity survives creator deletion.                                                                                              |
| `workspace_members`          | `(workspace_id, user_id)` primary key, role (`owner`/`admin`/`educator`), `created_at`. This is the staff authorization boundary; client writes are not granted in the current phases. Students are not workspace members.                                                                                                                                                                                                  |
| `classes`                    | `id`, `workspace_id`, nullable provenance `created_by`, trimmed `name` (1–120), unique generated 10-character `join_code`, `status` (`active`/`archived`), timestamps. Tenant scope and join code are immutable to ordinary clients.                                                                                                                                                                                        |
| `class_enrollments`          | `(class_id, student_user_id)` primary key, `status` (`active`/`removed`), `joined_at`, `updated_at`. Students can read only their own row; staff can read enrollments in their workspace's classes. Joining restores a removed enrollment.                                                                                                                                                                                  |
| `assignments`                | `id`, `class_id`, nullable creator provenance `created_by`, trimmed `title` (1–160), optional `due_at`, `status` (`draft`/`published`/`archived`), `published_at`, timestamps. Class deletion cascades; creator deletion nulls provenance. Drafts have no publication timestamp; published and archived assignments retain the first publication timestamp.                                                                 |
| `assignment_items`           | `id`, `assignment_id`, nonnegative `position`, `activity_contract_version` (currently exactly 1), `activity_key` (the exact six V1 keys), `problem_count` (1–20), timestamps. `(assignment_id, position)` is unique and deferrable so the atomic reorder RPC can safely swap positions. Assignment deletion cascades blocks.                                                                                                |
| `assignment_problem_results` | One client-reported terminal result per `(assignment_item_id, student_user_id, problem_ordinal)`, with a per-student client idempotency key, terminal outcome, bounded performance counters, taxonomy snapshot, schema version, and server timestamp. Item/user FKs cascade; `correct` and `surrendered` count as complete, while `abandoned` is never an assignment result. No generated math or student answer is stored. |

## Assignment intent contract

An assignment item is a practice block, not an individual generated problem. It records only a versioned activity family and requested count; it does not contain generated LaTeX, a Calcura problem object, an answer, a solution, a guided step, solver seed, or correctness logic. See [Assignment activity contract](ASSIGNMENT_ACTIVITY_CONTRACT.md) for the stable V1 keys and current Calcura capability mappings.

Lifecycle:

```text
draft → published → archived → published
```

`published_at` is set on first publication and preserved through archive/reactivation. Published/archived practice blocks are immutable at the database layer; title and due date remain editable. Only drafts can be discarded. Publishing requires an active class/workspace and at least one practice block.

Students see only published assignments and items in an active class and workspace while their enrollment is active. Staff see all assignment statuses within their authorized workspace classes. Students record terminal results only through `record_assignment_problem_result`, which derives user identity from `auth.uid()`, validates active enrollment and assignment/item state, and returns `recorded` or an idempotent `duplicate` without overwriting a slot. Direct clients have SELECT-only access to their own result rows. `get_assignment_student_progress` verifies staff membership before returning one progress row per active enrollee, including only that student's email, completed/total count, status, and last result time. RLS and database grants enforce these rules. Browser clients use narrow lifecycle/result RPCs rather than changing tenant scope or assignment state directly.

## Relationships

```text
User ──< WorkspaceMember >── Workspace ──< Class ──< Enrollment >── User
                                  │            └──< Assignment ──< AssignmentItem ──< AssignmentProblemResult >── User
                                  │
                                  └── future billing/access state
```

Personal workspaces are lazily bootstrapped by `ensure_personal_workspace()`; Calcura-only Auth users do not automatically receive Classroom administrative rows. Students join classes through `join_class_by_code(code)` and do not become workspace members.

## Future conceptual entities

| Concept       | Purpose                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| LearningEvent | Future versioned pedagogical event contract; not implemented in Phase 5 |
| Plan          | Future billing/product plan attached to a workspace or access grant     |
| Entitlement   | Server-computed workspace capability under product and policy rules     |

Phase 5 stores terminal slot evidence only, not generated problem instances or step-level event data. The outcome, performance fields, and taxonomy are reported by the client; the server validates identity, enrollment, assignment/item relationship, lifecycle, ordinal bounds, constraints, and idempotency, not the mathematical truth of the reported outcome.

## Workspace authorization invariant

```ts
type WorkspaceType = 'personal' | 'organization';
type WorkspaceRole = 'owner' | 'admin' | 'educator';
```

Students are class enrollees, never workspace staff. A browser-supplied workspace or user UUID is not authorization. Effective workspace access will eventually combine identity, active workspace, database membership role, and server-derived plan entitlements.
