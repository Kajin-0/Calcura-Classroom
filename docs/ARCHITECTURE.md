# Architecture

## Current application boundary

```text
Browser
  ↓
Calcura Classroom React SPA
  ↓  Supabase JS with project URL + publishable key
Supabase Auth / Data API / narrowly scoped RPCs / future Edge Functions
  ↓
Postgres with grants + RLS
```

The browser owns presentation and short-lived interaction state. Supabase Auth owns identity and session issuance. Postgres grants and row policies together are the authorization boundary for exposed data. Phase 1 adds a lazy personal-workspace RPC and a narrow join-by-code RPC; no privileged credentials enter the browser. Future Edge Functions handle trusted operations that cannot safely run through narrowly scoped database operations.

The teacher surface resolves the authenticated user's personal workspace once at the `/app` boundary. Phase 2 reads and manages only classes visible through staff membership; join codes use the staff-only `get_class_join_code` RPC, and class counts expose no student identities. Phase 3 adds class-scoped assignment intent and practice blocks through typed services. Phase 4 consumes that intent through Calcura's existing guided math runtime. Phase 5 adds a narrow terminal-result RPC and teacher progress RPC: students can submit only for their own active enrollment and active published assignment; teacher progress is independently authorized by workspace membership and returns only active enrollees plus email/progress fields. Phase 6 adds a single membership-authorized aggregate RPC over those same terminal result rows for compact assignment, practice-block, assignment-position, and active-student summaries. Result table mutation is RPC-only and student SELECT is own-row only. No generated mathematical content is stored or reconstructed.

The local Phase 1 tenancy model is `Auth user → workspace membership (staff)` and `Auth user → class enrollment (student)`. Students do not become workspace members. `classroom_private` holds RLS helpers and is not an exposed Data API schema. Hosted schema reconciliation is still required before deploying these migrations.

## Repository ownership

| Repository        | Owns                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calcura           | Student mathematics execution, generation, grading/equivalence, student practice, local performance, Android, student PWA/browser app                                         |
| Calcura-Classroom | Teacher/control plane, workspaces, classes, enrollment administration, assignments, basic teacher analytics, migrations, RLS tests, future Edge Functions and billing backend |
| Calcura-Site      | Public product marketing, pricing, and entry links                                                                                                                            |

There is one mathematics engine: Calcura. Classroom never computes mathematical correctness and will not import Calcura's private implementation files. `src/contracts/assignmentActivities.ts` owns versioned teacher-selected practice-family keys; Calcura maps those keys to its current generator capabilities. Students solve using Calcura's normal Guided runtime. Classroom stores one terminal result per assigned problem slot, never an equation, answer, solution, or problem object. Result outcomes/performance/taxonomy are client-reported context; the database certifies identity, authorization, slot/lifecycle validity, and idempotency, not academic truth.

## Identity and authorization

Both applications use the same Supabase project and Auth user identities. Authentication proves who a caller is. It does not establish access to a workspace or class. Future authorization requires authenticated identity plus active workspace, server-side workspace role, and plan-derived entitlements. Membership rows and policy predicates are authoritative; user-editable metadata is not.

```text
Authenticated User + Active Workspace + Workspace Role + Plan
                         = Effective Entitlements
```

Students will be class enrollees, not administrative workspace members. Workspace roles are `owner`, `admin`, and `educator`.

## Future billing boundary

```text
Stripe
  ↓ signed events / trusted requests
Supabase Edge Functions
  ↓ validated billing state
Postgres billing state and workspace access grant
  ↓
Workspace entitlements
  ↓
React authorization UX
```

Stripe is the billing authority. Supabase/Postgres is the application authorization authority. The browser never decides entitlements from a checkout result or a client-editable field. No Stripe implementation is part of Phase 1.

## Learning data boundary

```text
Calcura terminal assignment results
  ↓ existing Phase-5 result contract
Cloud validation and aggregation
  ↓ authorized workspace/class views
Classroom teacher analytics
```

Calcura's local performance implementation is not copied into Classroom. Phase 6 implements only assignment-scoped completion, accuracy, attempts/time, surrender, practice-block, slot-position, and active-enrollee summaries from the existing terminal-result contract. Skill mastery, trend buckets, focus recommendations, first-attempt analytics, and export semantics remain future concepts requiring separate definitions and privacy review.

## Security boundaries

- The Vite application receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Every exposed table must enable RLS and use explicit ownership or membership predicates.
- Server-side privileged work must authorize the caller before exercising privileged access.
- Local Supabase is a development environment; it is not a production deployment.
- Production migrations require a reviewed baseline and explicit authorization in a later phase.
