# Conceptual data model

The four entities below are implemented by the local Phase 1 migration and covered by pgTAP security tests. The hosted database is still unbaselined, and this migration has not been deployed.

## Implemented Phase 1 entities

| Entity              | Columns and behavior                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaces`        | `id`, `workspace_type` (`personal`/`organization`), `name`, nullable provenance `created_by`, nullable `personal_owner_user_id`, `status` (`active`/`archived`), `created_at`, `updated_at`. Personal ownership is unique per Auth user; deleting the personal owner cascades the personal workspace. Organization identity survives deletion of its creator. |
| `workspace_members` | `(workspace_id, user_id)` primary key, `role` (`owner`/`admin`/`educator`), `created_at`. User/workspace deletion cascades. Only workspace staff can read the staff roster; client writes are not granted.                                                                                                                                                    |
| `classes`           | `id`, `workspace_id`, nullable provenance `created_by`, trimmed `name` (1–120 chars), unique generated 10-character `join_code`, `status` (`active`/`archived`), `created_at`, `updated_at`. Workspace/class identity and join code are immutable to ordinary clients. Creator deletion nulls provenance.                                                     |
| `class_enrollments` | `(class_id, student_user_id)` primary key, `status` (`active`/`removed`), `joined_at`, `updated_at`. Class/Auth-user deletion cascades. Students can read only their own row; staff can read enrollments for their workspace's classes. Rejoining restores the existing row.                                                                                  |

Personal workspaces are lazily bootstrapped by `ensure_personal_workspace()`; a new Calcura Auth user does not automatically receive a Classroom workspace. Students join only through `join_class_by_code(code)` and never become workspace members. Join codes are invitation tokens, not class visibility grants. See [RLS security model](RLS_SECURITY_MODEL.md) for grants, policies, privileged helpers, and adversarial coverage.

## Future conceptual entities

| Concept        | Purpose                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| Assignment     | Teacher-authored work associated with a class                                           |
| AssignmentItem | Reference to a Calcura problem/activity in an assignment, not an embedded solver        |
| Attempt        | A future validated student interaction/completion record, subject to privacy design     |
| LearningEvent  | Versioned semantic event contract emitted by Calcura and validated before analytics use |
| Plan           | Billing/product plan attached to a workspace or access grant                            |
| Entitlement    | Server-computed capability available to a workspace under plan and policy rules         |

## Expected relationships

```text
User ──< WorkspaceMember >── Workspace ──< Class ──< Enrollment >── User
                                  │
                                  └──< Assignment ──< AssignmentItem
                                                           │
User ──< Attempt / LearningEvent ──────────────────────────┘
Workspace ── Plan ── Entitlement
```

This future relationship map is a planning aid, not a finalized relational design for the conceptual entities. Phase 1 keys, lifecycle, deletion behavior, join-code flow, indexes, grants, and RLS are implemented in the local migration.

## Workspace and role contract

```ts
type WorkspaceType = 'personal' | 'organization';
type WorkspaceRole = 'owner' | 'admin' | 'educator';
```

Students join classes through enrollment records. No `student` workspace role is defined.

Future entitlements beyond the implemented Phase 1 staff/enrollment boundary are derived from:

```text
Authenticated User + Active Workspace + Workspace Role + Plan
                         = Effective Entitlements
```

No client-supplied workspace identifier or user metadata alone can establish authorization.

## Learning event evolution

`LearningEventV1` in `src/types/domain.ts` is an initial conceptual example. The contract is versioned from its first implementation. Its field set is intentionally not immutable; event taxonomy, minimization, validation, and compatibility rules require a cross-repository review before ingestion is built.

## Billing boundary

Stripe will remain the billing authority. Trusted Edge Functions update billing state and a Postgres access grant; application policies and server-side logic compute workspace entitlements. Stripe details are not part of this schema phase.
