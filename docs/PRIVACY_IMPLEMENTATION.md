# Privacy implementation and provider inventory

Reviewed: 2026-10-04. Factual companion to public policies, not legal certification.
Current authority: [Pre-sales hardening](PRE_SALES_HARDENING_2026-10.md), deployed
migrations, current application contracts and this operations pass. Older Phase
1–8 documents describe historical pre-production states, not today's deployment.

| Provider     | Purpose / data categories                                                                                                                                                                      | Where configured                                                                                      | Retention / owner action                                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase     | Auth email/identity/sessions; own practice history/preferences; Classroom memberships, enrollments, assignment intent/results; authorized derived analytics; trusted billing mappings/receipts | Calcura/Classroom public browser configuration; shared migrations; server Edge secrets                | No universal automatic expiry verified. Personal Auth-linked rows cascade where schema requires; shared organizational content/provenance and receipts differ. Backup/PITR/plan and full Auth settings require owner dashboard verification. |
| Stripe       | Checkout/payment processing, customer/subscription/invoice state, billing portal and signed events                                                                                             | Billing Edge Functions and server-only mode/price configuration; workspace billing/entitlement schema | External payment/accounting data does not disappear with Auth deletion. Reconcile cancellation before deleting a paid personal owner. No provider contract/DPA or universal retention period asserted.                                       |
| Formspree    | Contact form name/email/topic/message and request delivery                                                                                                                                     | Site `src/pages/contact/ContactForm.jsx`, endpoint `https://formspree.io/f/mjykvaky`                  | Owner must monitor the existing inbox and apply a request/retention process. Contact records are separate from Supabase Auth deletion/export. Do not ask users to submit secrets or sensitive student records.                               |
| GitHub Pages | Static Site, embedded student PWA and Classroom hosting; hosting request/network information                                                                                                   | Site/Classroom Pages workflows and domains                                                            | Hosting platform information is governed in part by provider practices. No verified per-user access-log retention claim. No private API response caching introduced.                                                                         |

No advertising/behavioral analytics integration was found in the current Site,
Classroom or student app inventory. Classroom performance analytics serve authorized
learning workflows, not advertising. No assertion of a DPA, certified compliance,
all-provider data residency or a worldwide legal basis is made here. Supabase's
observed database region is us-west-2; that does not establish every provider's
processing location or contractual international-transfer terms.

## Data and lifecycle scope

Personal: Auth identity/email; communication preferences; practice attempt metadata;
own enrollment and terminal assignment performance; staff memberships. Practice
and result contracts do not add generated mathematics/student answer text/solutions
to remote records. Local browser state includes offline attempts/outboxes and
account-scoped caches; signing out need not erase offline work. A manual deletion
requires a separate device-storage explanation. A server export cannot recover
unsynced local data from a user's device.

Shared: workspaces/classes/assignments/items/slots, authorized aggregate analytics,
entitlements and trusted billing linkage. Organization content may survive creator
deletion with provenance cleared. Personal-workspace owner deletion cascades its
classroom content, so other-student impact must be reviewed explicitly.

Retention is purpose/legal/security/billing dependent, with no invented automatic
expiry. Webhook deduplication/reconciliation receipts and external accounting
records may remain. Individual requests require identity verification, scope review
and a restricted completion note. Procedures:

- [Privacy requests/export](PRIVACY_REQUEST_RUNBOOK.md)
- [Deletion/billing sequencing](ACCOUNT_DELETION_RUNBOOK.md)
- [Backup/restore](BACKUP_RESTORE_RUNBOOK.md)
- [Education/minor boundary](EDUCATION_PRIVACY_BOUNDARY.md)

The operator tools are server-only, read-only, exact-identity confirmed, allowlist
exported, bounded and fail-closed. They do not implement a public privacy portal,
Stripe mutation or automatic Auth deletion. A clean preflight is not authorization.
