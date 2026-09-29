# Unpaid Checkout interval switching

Source change only. No production migration, function deployment, session
expiration, Stripe purchase, or secret change is authorized by this document.

## Invariant and ownership

At most one usable open Stripe Checkout Session per workspace. Only an active
workspace owner/admin can request Checkout. The browser supplies a workspace and
`monthly` / `annual`; Price IDs, saved-session identity, expiration, and reservation
rotation belong to the trusted server. This path never writes entitlements or
calls reconciliation. Existing verified webhooks/canonical subscription recovery
remain the only Stripe entitlement authority.

## State machine

| Reservation / Stripe state              | Action                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Existing subscription, including unpaid | `subscription_exists`; use Portal                                                               |
| Active creation/switch lease            | `checkout_in_progress`; no Stripe creation                                                      |
| Same interval, open saved session       | Return the existing URL; no expiration                                                          |
| Different interval, saved session       | Claim a two-minute switch lease; retrieve and validate Stripe state                             |
| Complete session                        | `checkout_processing`; never replace                                                            |
| Open session to switch                  | Verify target Price/Product, then expire at Stripe                                              |
| Expired session, either interval        | Atomically replace and create the requested Checkout in the same request                        |
| Lost expiration response                | Re-retrieve once; proceed only if expired; complete means processing; open/unknown fails closed |
| Lost compare-and-swap                   | Re-evaluate the reservation; reuse a winner's session or return a bounded conflict              |

There are at most three reservation evaluations per HTTP request. Stripe calls
run outside database transactions. No transaction is held across network I/O.

`replace_workspace_checkout_after_expire` locks the billing row, rechecks actor
and workspace eligibility and subscription state, compares the expected old
attempt and session, then rotates the attempt/interval, clears the session, and
sets a fresh two-minute creation lease and 30-minute provisional recovery window.
The customer mapping is preserved. No release/reserve gap exists. A stale caller
cannot clear or overwrite the winner. All three checkout persistence/reservation
RPCs remain `SECURITY INVOKER`, empty search path, service-role execution only.

The Edge validates session mode/livemode, ID, customer, client reference,
workspace/interval metadata, and the absence of payment-link/recovery flows.
Recovery-enabled expired sessions are rejected: recovery could otherwise create
an independent session. Validation is repeated after expiration/retrieval.
Both pre-existing sessions from this billing flow and newly created ones use the
same association contract; no new metadata requirement strands existing sessions.

## Failure recovery and delayed writers

- Saved session IDs are never discarded merely because the local expiry clock
  elapsed. Stripe may have completed the session while its webhook was delayed.
- A retry of session persistence is a true no-op for the same session, preserving
  any switch lease. Another session cannot overwrite it; a stale attempt fails.
- Creation parameters and `workspace-checkout-<attempt UUID>` stay stable for
  retries. Every confirmed-expired handoff gets a fresh UUID. Interval alone is
  never an idempotency key.
- If Stripe creation succeeds but its response/save is lost, the existing attempt
  is retained. A same-interval retry after the lease expires uses the same key
  within the 30-minute recovery window. A different interval must wait until the
  original creation is recovered. This is an exceptional ambiguous operation,
  not the normal saved-session switch path.
- After that recovery window, an unsaved/unknown creation returns
  `billing_unavailable` and fails closed instead of
  silently rotating or retrying beyond Stripe's idempotency retention guarantee.
  Operator investigation must establish canonical session/subscription state
  before any separately authorized recovery. Never clear a reservation just to
  make an error disappear. No automatic cleanup of unknown Stripe outcomes is
  introduced here.
- Expiration/network/validation failures retain the old identity. No failure
  grants Pro. No automatic Stripe operation uses client-supplied IDs.

## Migration and review/deployment order

`20260929194344_checkout_interval_switching.sql` replaces
`reserve_workspace_checkout` and `save_workspace_checkout_session`, and adds
`replace_workspace_checkout_after_expire`. It depends on the existing Phase 9
billing model and Phase 10.6 mode contract. No table rewrite, backfill, RLS policy,
or entitlement change. Old migration files are unchanged.

After separate approval: review/land source, apply this migration, then deploy
only `billing-checkout` and its shared helper. Do not deploy the new function
before the RPC exists. The older function fails closed on the new switch state
during a migration-first rollout. Stop on any migration/deployment failure.
Prefer a forward fix; reverting only the function restores the older restrictive
UX but must not drop billing rows or repair migration history. No webhook, price,
secret, frontend, or student feature activation is required.

## Repeatable local checks

```bash
timeout 120s npm test -- tests/unit/billing-checkout-handler.test.ts tests/unit/billing-service.test.ts tests/unit/stripe-billing-policy.test.ts tests/unit/stripe-webhook-verification.test.ts
timeout 180s npm run test:billing-db -- --focused
timeout 180s npm run test:billing-db
timeout 60s npm run typecheck:billing-edge
timeout 300s npm run test:ci
timeout 300s npm run test:e2e
git diff --check
```

`test:billing-db` only targets `supabase_db_calcura-classroom`, makes a disposable
database from its **schema only** (no user rows), applies missing local source
migrations there, runs pgTAP and real two-connection races, lints the three changed
functions, and deletes only its own disposable database. It does not reset or
migrate the active preview DB, and asserts its migration history is unchanged.
Optional `--generate-types` runs the pinned Supabase type generator against that
disposable database and formats `src/types/database.generated.ts`.

The handler tests invoke the actual Edge entrypoint and actual mode/Price/Product
helpers, with Stripe mocked at the installed SDK boundary and database/auth
adapters mocked separately. pgTAP and connection races exercise the actual RPCs
and grants. Browser tests fulfill every Stripe navigation locally; no purchase
or live Stripe API call is performed.

Stripe references: [session expiration](https://docs.stripe.com/api/checkout/sessions/expire)
and [idempotency retention](https://docs.stripe.com/api/idempotent_requests).
