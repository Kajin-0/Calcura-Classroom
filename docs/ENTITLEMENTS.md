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

## Testing

`supabase/tests/database/workspace_entitlements_security.test.sql` covers the fallback, plan inheritance, expiry/cancellation, multi-workspace isolation, RLS, and denied self-promotion/foreign/anonymous mutations. The local-only entitlement smoke provisions test identities and workspaces through its harness, exercises the public Data API with ordinary authenticated clients, verifies expiry and workspace switching, then cleans up its temporary records. It never connects to a hosted project.
