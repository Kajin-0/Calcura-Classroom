# Conceptual data model

**Conceptual — database implementation begins Phase 1.** No Classroom SQL, tables, policies, or remote changes are created in Phase 0.

## Anticipated entities

| Concept         | Purpose                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| User            | Shared Supabase Auth identity; one identity can use Calcura and Classroom               |
| Workspace       | Personal or organization container and future administrative boundary                   |
| WorkspaceMember | Server-side user-to-workspace relationship with `owner`, `admin`, or `educator` role    |
| Class           | Teaching group owned by one workspace                                                   |
| Enrollment      | Student relationship to a class; students are not workspace administrators              |
| Assignment      | Teacher-authored work associated with a class                                           |
| AssignmentItem  | Reference to a Calcura problem/activity in an assignment, not an embedded solver        |
| Attempt         | A future validated student interaction/completion record, subject to privacy design     |
| LearningEvent   | Versioned semantic event contract emitted by Calcura and validated before analytics use |
| Plan            | Billing/product plan attached to a workspace or access grant                            |
| Entitlement     | Server-computed capability available to a workspace under plan and policy rules         |

## Expected relationships

```text
User ──< WorkspaceMember >── Workspace ──< Class ──< Enrollment >── User
                                  │
                                  └──< Assignment ──< AssignmentItem
                                                           │
User ──< Attempt / LearningEvent ──────────────────────────┘
Workspace ── Plan ── Entitlement
```

This is a planning aid, not a finalized relational design. Phase 1 must decide keys, lifecycle, deletion behavior, invitations, joins, tenant isolation, indexes, grants, and RLS from explicit access cases.

## Workspace and role contract

```ts
type WorkspaceType = 'personal' | 'organization';
type WorkspaceRole = 'owner' | 'admin' | 'educator';
```

Students join classes through enrollment records. No `student` workspace role is defined.

Future access is derived from:

```text
Authenticated User + Active Workspace + Workspace Role + Plan
                         = Effective Entitlements
```

No client-supplied workspace identifier or user metadata alone can establish authorization.

## Learning event evolution

`LearningEventV1` in `src/types/domain.ts` is an initial conceptual example. The contract is versioned from its first implementation. Its field set is intentionally not immutable; event taxonomy, minimization, validation, and compatibility rules require a cross-repository review before ingestion is built.

## Billing boundary

Stripe will remain the billing authority. Trusted Edge Functions update billing state and a Postgres access grant; application policies and server-side logic compute workspace entitlements. Stripe details are not part of this schema phase.
