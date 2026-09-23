# Architecture

## Current application boundary

```text
Browser
  ↓
Calcura Classroom React SPA
  ↓  Supabase JS with project URL + publishable key
Supabase Auth / Data API / future Edge Functions
  ↓
Postgres with RLS
```

The browser owns presentation and short-lived interaction state. Supabase Auth owns identity and session issuance. Postgres policies are the authorization boundary for exposed data. Future Edge Functions handle trusted operations that must not run with browser privileges.

## Repository ownership

| Repository        | Owns                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calcura           | Student mathematics execution, generation, grading/equivalence, student practice, local performance, Android, student PWA/browser app                                   |
| Calcura-Classroom | Teacher/control plane, workspaces, classes, enrollment administration, assignments, teacher analytics, migrations, RLS tests, future Edge Functions and billing backend |
| Calcura-Site      | Public product marketing, pricing, and entry links                                                                                                                      |

There is one mathematics engine: Calcura. Classroom never computes mathematical correctness and will not import Calcura's private implementation files. Student assignments eventually send the student to Calcura to solve through its normal engine and emit a versioned completion event across an explicit contract.

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

Stripe is the billing authority. Supabase/Postgres is the application authorization authority. The browser never decides entitlements from a checkout result or a client-editable field. No Stripe implementation is part of Phase 0.

## Learning data boundary

```text
Calcura student events
  ↓ versioned semantic contract
Cloud validation and aggregation
  ↓ authorized workspace/class views
Classroom teacher analytics
```

Calcura's local performance implementation is not copied into Classroom. Summary, skill and technique evidence, trend buckets, focus recommendations, first-attempt outcomes, and export semantics are candidate concepts for a shared event/aggregation design. Their definitions and privacy context must be reviewed before aggregation is implemented.

## Security boundaries

- The Vite application receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Every exposed table must enable RLS and use explicit ownership or membership predicates.
- Server-side privileged work must authorize the caller before exercising privileged access.
- Local Supabase is a development environment; it is not a production deployment.
- Production migrations require a reviewed baseline and explicit authorization in a later phase.
