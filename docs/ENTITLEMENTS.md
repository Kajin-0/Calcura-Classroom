# Workspace entitlements

Phase 8 introduces the authorization contract, not billing. Calcura remains free; current Teacher Free workspaces retain class creation, assignment authoring/lifecycle, enrollment flows, basic progress, and Phase-6 basic analytics.

## Resolution

Entitlement is attached to a workspace, never globally to an Auth user. The optional `workspace_entitlements` row is trusted state with a plan, lifecycle status, source, effective timestamp, optional expiry, and audit timestamps. A workspace with no row resolves deterministically to `teacher_free`. A row that is canceled, not yet effective, or expired also resolves to Teacher Free at read time; no cron job is required.

Architectural plan IDs are:

```text
teacher_free → pro → team → school → institution
```

`classroom_private.capabilities_for_plan` is the centralized ordered registry. Each capability has a minimum plan rank, so higher plans inherit lower-tier capability sets without repeating them. The current registry gives Teacher Free the basic Classroom, assignment, and analytics capabilities. Higher-tier entries establish names for future product work only; they do not implement analytics expansion, exports, team membership, school administration, or institutional integrations.

## Authority and client role

`get_workspace_entitlement(workspace_id)` and `workspace_has_capability(workspace_id, capability)` require an authenticated owner/admin/educator membership in the requested active workspace. Both use the caller's `auth.uid()` and reject known foreign workspace UUIDs. The functions are invoker-security, and the table's RLS independently limits reads to the same workspace membership boundary.

Authenticated and anonymous browser clients cannot mutate entitlement rows. `service_role` is reserved for trusted local fixtures and future server-side billing/grant code; it must never enter Vite environment variables or browser bundles. `source` distinguishes manual, future Stripe, or institutional grant provenance, but does not change authorization. No prices, Stripe product IDs, checkout, subscription, or webhook assumptions are stored here.

The client entitlement service validates the RPC response and exposes loading/error state. `WorkspacePlanLabel` is display-only. `CapabilityGate` is a reusable presentation pattern, not a security boundary. Any future operation restricted by plan must verify its capability in the database/RPC that performs the operation. Do not gate an existing Teacher Free operation merely to demonstrate this architecture.

## Phase 9 Stripe Pro billing

`workspace_billing` maps one workspace to its Stripe customer and current subscription. It is workspace-scoped; Stripe IDs and mutation fields are not available to browser roles. Authenticated staff receive only a narrow read summary, and only workspace owners/admins can create Checkout or Portal sessions. All price IDs are selected by the server from the requested `monthly` or `annual` interval. The client cannot supply a Stripe Price ID.

Stripe is a state source, not an authorization system. A raw-body, signature-verified webhook retrieves canonical subscription state and invokes the service-role-only reconciliation RPC. The RPC durably deduplicates event IDs and atomically updates billing state plus `workspace_entitlements`; the existing Phase-8 resolver remains the only plan/capability authority. Checkout return URLs never grant Pro. Reconciliation grants Pro only for a configured supported price and a current paid period; `cancel_at_period_end` remains Pro to the period boundary, `past_due` receives a non-renewing seven-day grace period, and unsupported, unpaid, incomplete, trialing, paused, or ended states resolve to Teacher Free. Expiry is also stored on the entitlement so missed events fail toward Free at read time.

The Edge Functions require `STRIPE_SECRET_KEY` (must begin `sk_test_`), `STRIPE_WEBHOOK_SECRET`, the test monthly/annual Price IDs, and `APP_ORIGIN`. Keep values in ignored `supabase/functions/.env` copied from the tracked placeholder `supabase/functions/.env.example`; never put Stripe secrets in Vite configuration. Local test-mode setup: create the two recurring test Prices ($19 USD/month and $149 USD/year) in the Stripe test dashboard, copy the IDs and a test secret into that local env file, run `supabase functions serve --env-file supabase/functions/.env`, run `stripe login`, then run `stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook` and copy the CLI's temporary `whsec_...` into the env file before restarting Functions. Use Stripe test payment methods only. No production Supabase deployment or live Stripe keys are part of Phase 9.

The database records event receipts in `stripe_webhook_events` in the same transaction as reconciliation. The owner/admin-only `billing-reconcile` Edge Function is the recovery path after a missed/delayed event; it locates the subscription from the workspace's trusted Stripe customer mapping, retrieves canonical Stripe state, and uses the same atomic reconciliation RPC with an `internal.reconciliation` receipt. The billing page's status check calls this trusted path; its return value never grants access directly. Stripe event order is not trusted: handlers retrieve the current subscription before applying it, and older distinct subscription identities cannot replace newer ones. Failed Stripe/API/database work is not acknowledged as processed, so Stripe can retry it. Unknown valid event types are durably recorded as no-ops.

## Testing

`supabase/tests/database/workspace_entitlements_security.test.sql` covers the fallback, plan inheritance, expiry/cancellation, multi-workspace isolation, RLS, and denied self-promotion/foreign/anonymous mutations. The local-only entitlement smoke provisions test identities and workspaces through its harness, exercises the public Data API with ordinary authenticated clients, verifies expiry and workspace switching, then cleans up its temporary records. It never connects to a hosted project.
