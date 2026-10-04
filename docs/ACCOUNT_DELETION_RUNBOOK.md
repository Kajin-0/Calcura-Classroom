# Account deletion — billing before Auth deletion

Reviewed: 2026-10-04. Final deletion is a manual privileged operation, not a public
endpoint. No production deletion is performed by the provided CLI.

## Required order

1. Receive and verify the request under [Privacy requests](PRIVACY_REQUEST_RUNBOOK.md).
   Confirm exact Auth UUID/email and request scope. Offer a personal export first.
2. Run the read-only dry-run:

   ```sh
   npm run ops:preflight-user-deletion -- --user-id "$CALCURA_REQUEST_USER_ID" --email "$CALCURA_REQUEST_EMAIL"
   ```

   Provision the same secure environment as export. Exit 2 means a review blocker;
   exit 1 means failed/ambiguous preflight. Neither is permission to proceed. There
   is intentionally no `--execute`; no server mutation exists in this tool.

3. Review ALL workspace roles and any personal workspace owned by the UUID,
   including ownership without a membership row. Organization owners require
   an authorized ownership transfer and institutional review. Mere `created_by`
   provenance is not ownership; shared organization data may survive with
   provenance cleared. A staff member cannot unilaterally erase students' records.
4. Review shared-data impact and full cascade counts before approval. The CLI
   counts only the subject's personal rows and personal workspaces, not every
   student row that a workspace cascade could remove. In a secure administrative
   read-only SQL session, filter workspaces by `personal_owner_user_id`; traverse
   classes by workspace ID, assignments by class ID, items/slots by assignment ID,
   and results by item ID. Count enrollments/results for those classes/items
   without printing their contents. Include entitlement/billing rows. Explain
   that deleting a personal owner removes their personal workspace and its class
   content, potentially including other students' enrollments/results. Resolve
   transfer/retention requirements before proceeding; never improvise a transfer.
5. **Reconcile Stripe before deleting any paying personal owner.** In the correct
   live/test mode, inspect the trusted workspace billing mapping and canonical
   Stripe customer, all subscriptions, invoices, pending payment state and open
   Checkout sessions. Do not rely on database `subscription_status` alone. A
   cancel-at-period-end flag is NOT an ended subscription. Resolve refunds,
   disputes or amounts due according to approved policy/law; no automatic refund
   promise is made here. Use the existing authorized Billing portal/cancellation
   procedure, or a separately authorized Stripe operator procedure.
6. Expire/cancel pending Checkout where required and verify there is no reservation
   or in-flight retry that could create a new subscription. Allow trusted webhooks
   or `billing-reconcile` to converge entitlements/mappings; compare canonical
   Stripe state to the workspace summary. Do not directly change an entitlement,
   delete webhook receipts, or erase customer mappings to make the preflight pass.
   The helper deliberately refuses ANY existing customer/subscription/checkout
   mapping, even a canceled one: operator sign-off must establish external state.
7. Reverify target identity and rerun the plan immediately before final action.
   Require recorded approval for personal-workspace cascades and resolved billing.
   If identity, membership, billing or concurrent work changed, stop and re-review.
8. Only now delete the exact verified user through Supabase Dashboard
   **Authentication → Users → verified user → Delete user**, using the intended
   permanent Auth deletion, not an unreviewed SQL delete/soft-delete variant.
   The production owner/operator must explicitly confirm the user UUID/email
   and cascade scope. Do not batch-delete users or disable FK/RLS protections.
9. Read-only postcheck: Auth user absent; own attempts, preferences, enrollments,
   results, memberships and private progress sequencing state absent as required
   by deployed cascade FKs; personal workspace absent if intended; organization
   data retained with nullable provenance cleared; no surviving membership grants
   the deleted user access. Reconfirm Stripe has no unintended renewal/Checkout.
10. Complete the restricted audit note and requester response. Explain retained
    billing/security/external records and user-device storage. Do not claim immediate
    revocation of every already-issued JWT: tokens can persist until expiry, while
    ownership/membership data is removed. Review project session behavior before
    making a stronger claim; request sign-out and clearing local site/app data.

## Stop conditions

Ambiguous identity, organization-owner transfer pending, personal-workspace student
data not reviewed, unresolved subscription/invoice/Checkout, legal hold, unsupported
minor/institutional process, incomplete export, unexpected FK behavior or failed
postcheck. Escalate to the owner; never bypass the guard or manually clear mappings.

Auth deletion does not cancel Stripe. It does not delete Formspree support records,
Stripe accounting records, all historical webhook receipts or browser-only copies.
Provider deletion/retention obligations require their own review. Operational backups
may retain data until their actual lifecycle expires; do not invent a retention period.
