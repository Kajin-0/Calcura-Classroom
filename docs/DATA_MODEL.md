# Data model

The Phase 1 and Phase 3 migrations implement and locally certify the workspace, classroom, and assignment-intent entities described below. The hosted Supabase project remains unbaselined and has not received these migrations.

## Implemented entities

| Entity              | Columns and behavior                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaces`        | `id`, `workspace_type` (`personal`/`organization`), `name`, nullable provenance `created_by`, nullable `personal_owner_user_id`, `status` (`active`/`archived`), timestamps. Personal ownership is unique per Auth user; deleting that owner cascades the personal workspace. Organization identity survives creator deletion.                              |
| `workspace_members` | `(workspace_id, user_id)` primary key, role (`owner`/`admin`/`educator`), `created_at`. This is the staff authorization boundary; client writes are not granted in the current phases. Students are not workspace members.                                                                                                                                  |
| `classes`           | `id`, `workspace_id`, nullable provenance `created_by`, trimmed `name` (1–120), unique generated 10-character `join_code`, `status` (`active`/`archived`), timestamps. Tenant scope and join code are immutable to ordinary clients.                                                                                                                        |
| `class_enrollments` | `(class_id, student_user_id)` primary key, `status` (`active`/`removed`), `joined_at`, `updated_at`. Students can read only their own row; staff can read enrollments in their workspace's classes. Joining restores a removed enrollment.                                                                                                                  |
| `assignments`       | `id`, `class_id`, nullable creator provenance `created_by`, trimmed `title` (1–160), optional `due_at`, `status` (`draft`/`published`/`archived`), `published_at`, timestamps. Class deletion cascades; creator deletion nulls provenance. Drafts have no publication timestamp; published and archived assignments retain the first publication timestamp. |
| `assignment_items`  | `id`, `assignment_id`, nonnegative `position`, `activity_contract_version` (currently exactly 1), `activity_key` (the exact six V1 keys), `problem_count` (1–20), timestamps. `(assignment_id, position)` is unique and deferrable so the atomic reorder RPC can safely swap positions. Assignment deletion cascades blocks.                                |

## Assignment intent contract

An assignment item is a practice block, not an individual generated problem. It records only a versioned activity family and requested count; it does not contain generated LaTeX, a Calcura problem object, an answer, a solution, a guided step, solver seed, or correctness logic. See [Assignment activity contract](ASSIGNMENT_ACTIVITY_CONTRACT.md) for the stable V1 keys and current Calcura capability mappings.

Lifecycle:

```text
draft → published → archived → published
```

`published_at` is set on first publication and preserved through archive/reactivation. Published/archived practice blocks are immutable at the database layer; title and due date remain editable. Only drafts can be discarded. Publishing requires an active class/workspace and at least one practice block.

Students see only published assignments and items in an active class and workspace while their enrollment is active. Staff see all assignment statuses within their authorized workspace classes. RLS and database grants enforce these rules. Browser clients use narrow lifecycle/reorder RPCs rather than changing tenant scope or assignment state directly.

## Relationships

```text
User ──< WorkspaceMember >── Workspace ──< Class ──< Enrollment >── User
                                  │            └──< Assignment ──< AssignmentItem
                                  │
                                  └── future billing/access state
```

Personal workspaces are lazily bootstrapped by `ensure_personal_workspace()`; Calcura-only Auth users do not automatically receive Classroom administrative rows. Students join classes through `join_class_by_code(code)` and do not become workspace members.

## Future conceptual entities

| Concept       | Purpose                                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| Attempt       | Future validated student interaction/completion record, subject to privacy design   |
| LearningEvent | Versioned semantic event contract emitted by Calcura and validated before analytics |
| Plan          | Future billing/product plan attached to a workspace or access grant                 |
| Entitlement   | Server-computed workspace capability under product and policy rules                 |

Assignments do not yet have student attempts, generated problem instances, or event data. Their design begins in later phases after the student integration contract is reviewed.

## Workspace authorization invariant

```ts
type WorkspaceType = 'personal' | 'organization';
type WorkspaceRole = 'owner' | 'admin' | 'educator';
```

Students are class enrollees, never workspace staff. A browser-supplied workspace or user UUID is not authorization. Effective workspace access will eventually combine identity, active workspace, database membership role, and server-derived plan entitlements.
