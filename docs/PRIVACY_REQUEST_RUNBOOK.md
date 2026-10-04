# Privacy requests — operator procedure

Reviewed: 2026-10-04. Server/operator use only; not a public self-service portal.

## Receive, verify, classify

Brooks Invest LLC operates Calcura. The owner confirmed on 2026-10-04 that the
established Formspree contact channel at https://calcura.study/contact/ is monitored
for support, privacy, billing, account deletion and data export requests.
Do not ask for passwords, OTP codes, session tokens or payment-card information.
Record receipt date, request type and a minimal case reference in restricted
operator records, not Git, public issues, CI artifacts or analytics.

Verify control of the account email through an established authenticated support
exchange. A supplied email/UUID or access to a class is not proof of identity.
The scripts require BOTH the exact Auth UUID and its current email; this protects
against an operator selecting the wrong account, but does not verify the requester.
If control cannot be established, stop and escalate. Verify institutional authority
separately for a workspace request. Do not return another student's data to a
teacher as a personal export.

Classify: personal export, account deletion, correction/support, or institutional
request. Ordinary requests should be handled within **7 business days where
practical**. This is an internal service target, not a statutory deadline or public
guarantee. Applicable legal deadlines and disputes require owner/legal review.

## Personal export

Use Node 24 from the Classroom repo, with `npm ci`. Securely provision
`CALCURA_OPS_SUPABASE_URL` and `CALCURA_OPS_SUPABASE_ADMIN_KEY` in the operator's
environment. The URL must be the reviewed production project
`https://qsuacjqcrpswognhhikv.supabase.co`. Never prefix the admin key with `VITE_`,
paste it in a command, browser, ticket or report, or enable shell tracing.

```sh
npm run ops:export-user -- --user-id "$CALCURA_REQUEST_USER_ID" --email "$CALCURA_REQUEST_EMAIL"
```

Default output: `/tmp/calcura-exports/`, directory 0700, JSON file 0600. An absolute
private directory outside the repository can be supplied with `--output-dir`.
The command prints path/counts, not personal rows or keys. Treat the path and
UUID as private too. The operation reads only; it does not delete or change data.
Any failed page/identity/schema check aborts rather than writing a partial export.

The versioned export includes minimal account identity; own communication
preferences, practice attempts, enrollments, assignment results and staff
memberships; associated workspace identity and limited billing display state.
It excludes authentication secrets/metadata, Stripe identifiers/objects,
webhook receipts, unrelated users, rosters and teacher analytics.
No generated problem, student answer or solution is added to the result contract.

Queries are bounded keyset pages, not an atomic database snapshot. Ask the user
to pause activity during the export; rerun and compare counts if activity continues
or memberships change. Where a legally complete point-in-time extract is needed,
use a reviewed read-only transaction/snapshot with explicit user filters rather
than promising this CLI is a snapshot. A large export exceeding its guard must
be escalated; never silently truncate it. Local browser-only unsynced work and
third-party support/payment records are outside this database export; explain
that scope and handle a broader request separately.

Review the JSON privately for scope, deliver over an authenticated private channel
after identity verification, record completion/date/scope, and remove the operator
copy once delivery and any required retention are resolved. Do not send personal
data through a public GitHub attachment or ordinary public contact response.
No backup/export is automatically uploaded or committed.

## Deletion and completion

Follow [Account deletion](ACCOUNT_DELETION_RUNBOOK.md) including billing and shared
data review. Offer an export first. Account deletion does not delete Stripe's
external accounting records, all security receipts or browser data on devices.
Explain retained categories/reasons without inventing an automatic expiry.

Record identity verification method (not authentication secrets), scope, blockers,
operator, approvals, actions, completion and any retained-record rationale in a
restricted audit note. Escalate disputed identity, legal holds, minors, organizational
ownership, incomplete billing reconciliation or requests about other users. Do not
invent consent or delete shared educational records without authorization.
