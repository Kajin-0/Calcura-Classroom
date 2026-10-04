# Pre-sales hardening — October 2026

This is a factual implementation inventory, not a Privacy Policy, Terms of
Service, compliance certification, or promise of complete security. No real
user records were copied into this document. Discovery used production schema
metadata/aggregates and rollback-only synthetic local fixtures.

## Scope and threat model

Protect against anonymous callers, authenticated outsiders, known-UUID
cross-tenant access, hostile browser inputs, stale account callbacks, forged
Stripe events, duplicate/out-of-order delivery, and storage/network failure.
Database authorization, not hidden UI controls, is authoritative. Treat local
browser storage and customer-controlled request bodies as untrusted.

Repositories keep their existing boundaries: Calcura owns mathematics and
student runtime; Classroom owns teacher/control-plane data and billing; Site
owns marketing and embedded release artifacts; plots owns its public renderer.
No mathematics, generators, seeds, weights, canonical answers, or grading rules
were changed. Calcura remains on source `28beb603ec534cfea7abfd2d86147c921f8ebbc8`.
Its existing web/Android release parity is preserved, not replaced.

## Data inventory and lifecycle

| Data                                | Source/storage                                    | Browser read/write authority                                                                        | Server/lifecycle                                                                                                    |
| ----------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Auth identity, email                | Supabase Auth                                     | Own OTP/session; authorized staff receive only enrolled learner email through narrow analytics RPCs | Auth provider; no general browser `auth.users` read                                                                 |
| Practice attempts, history          | Calcura durable outbox/cache; `practice_attempts` | Own SELECT/INSERT through RLS; no client UPDATE/DELETE                                              | Server-owned commit-safe ordering; Auth deletion cascades attempts and private sequence state                       |
| Communication preferences           | `communication_preferences`                       | Own SELECT/INSERT/UPDATE with owner checks; no browser DELETE                                       | Auth deletion cascades                                                                                              |
| Workspace membership                | `workspaces`, `workspace_members`                 | Active staff in own workspace; no direct browser membership writes                                  | Personal owner deletion cascades personal tenant; organization creator deletion retains tenant with null provenance |
| Classes, enrollments                | Teacher intent and join-code RPC                  | Staff in own workspace; students only enrolled class metadata and own enrollment                    | Auth-derived joining; student deletion cascades enrollment; archived work unavailable                               |
| Assignments/items/slots             | Teacher intent and deterministic slot metadata    | Authorized staff edit drafts; active enrolled students read published work                          | Published content immutable; lifecycle and slot customization are authorized RPCs                                   |
| Assignment results                  | Calcura result outbox; result RPC                 | Student reads own results; no direct writes/deletes; staff use authorized aggregates                | First-result-wins, enrollment/lifecycle/ordinal checks; student deletion cascades results                           |
| Analytics                           | Derived RPCs                                      | Owner/admin/educator for target workspace/class only                                                | No separate analytics store; deletion changes derived aggregates                                                    |
| Entitlements                        | Trusted server state                              | Staff SELECT only; no browser plan mutation                                                         | Service-role-only reconciliation; workspace deletion cascades                                                       |
| Stripe/customer/subscription IDs    | Private Edge calls and `workspace_billing`        | Browser gets only limited safe billing fields/authorized Checkout or Portal URL                     | Workspace deletion cascades mapping, **not external Stripe cancellation**                                           |
| Webhook receipts                    | Verified Stripe webhook; `stripe_webhook_events`  | No anon/authenticated table privileges                                                              | Durable deduplication; workspace FK becomes null on deletion                                                        |
| Contact/support messages            | Site Formspree form                               | Visitor submits name/email/topic/message                                                            | External processor; retention/deletion must be confirmed by owner                                                   |
| Local saved work, progress, session | Browser localStorage/IndexedDB                    | Application account-scoped caches/outboxes; session token persistence supports login                | Unsynced work is deliberately retained; sign-out is not secure erasure of the device                                |

No documented automatic history/receipt retention expiration was found. Auth
session expiry and OTP validity do not constitute a product data-retention
policy. Browser storage is not encrypted against an OS user with developer-tool
access; account scoping prevents application cross-account display, not forensic
inspection of a shared device. Clear site/app storage on a shared device only
after unsynced work has been delivered/exported.

## Findings and disposition

| ID    | Priority | Finding                                                                                                              | Disposition                                                                                                                                                                                                                                 |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PS-01 | P2       | Billing JSON body was unbounded before parsing                                                                       | Fixed: 16 KiB **actual UTF-8 streamed-byte** limit, cancel on overflow, fail closed on malformed/disconnected input                                                                                                                         |
| PS-02 | P2       | Unsigned webhook consumed body before signature rejection; read failure escaped handler                              | Fixed: reject missing signature before reading, controlled 400 on read failure; exact signed bytes unchanged                                                                                                                                |
| PS-03 | P2       | Class immutable creator guard prevented FK `ON DELETE SET NULL` during legitimate Auth deletion                      | Fixed: migration `20261004155053_allow_deleted_class_creator_provenance.sql`; only nulling a genuinely deleted creator is allowed; tenant/id/join-code/live-creator protections retained                                                    |
| PS-04 | P2       | Only checkout Edge entrypoint received semantic type checking                                                        | Fixed: all five billing Edge entrypoints checked; deleted Stripe customers explicitly fail closed in Portal                                                                                                                                 |
| PS-05 | P2       | Marketing/Classroom lacked document CSP and explicit referrer policy                                                 | Fixed: document-scoped restrictive meta policies, production Classroom origins derived from validated configuration, no inline scripts/eval; compatible contact/preview/navigation                                                          |
| PS-06 | P2       | plots CLI 8.0.0 pulled vulnerable tar 6.2.1                                                                          | Fixed: same-major CLI 8.5.2 / tar 7.5.22; renderer JS/CSS byte-identical; current immutable Calcura runtime pin deliberately unchanged                                                                                                      |
| PS-07 | P2       | Leaked-password protection disabled despite password-bearing accounts                                                | Owner action: check availability and enable if supported; OTP-only UI does not eliminate provider password surface                                                                                                                          |
| PS-08 | P2       | Public privacy/terms, retention and deletion/export procedure not established                                        | Owner/legal approval needed before paid acquisition/student-data commitments; no legal text invented                                                                                                                                        |
| PS-09 | P2       | No self-service account deletion; deleting personal tenant does not cancel Stripe externally                         | Operator must reconcile/cancel billing and export/transfer required data before verified Auth deletion; do not introduce ad-hoc privileged browser deletion                                                                                 |
| PS-10 | P2       | GitHub Pages custom response-header limitations                                                                      | Accepted hosting limitation: meta CSP does not provide `frame-ancestors`, HSTS, nosniff or Permissions-Policy; no hosting migration made                                                                                                    |
| PS-11 | P2       | Calcura build-tool braces stack-exhaustion advisory; no same-major patch                                             | Retained: trusted Tailwind/file-glob build patterns only, not browser/worker runtime; Tailwind major migration out of scope                                                                                                                 |
| PS-12 | P2       | UUID advisory through Capacitor CLI/xcode                                                                            | Retained native-tooling path; product uses existing UUID contracts; no UUID override or behavioral rewrite                                                                                                                                  |
| PS-13 | P3       | Official Actions use major tags rather than immutable SHAs                                                           | Optional supply-chain ratchet; no `pull_request_target`/untrusted secret-bearing deployment found; quality gates and exact-SHA deployments retained                                                                                         |
| PS-14 | P2       | Live Auth rate-limit/CAPTCHA/redirect settings, backup/PITR readiness not fully observable via configured connection | Owner dashboard verification required; no unverified defaults reported as live facts                                                                                                                                                        |
| PS-15 | P2       | Inherited scheduled Calcura nightly cannot resolve a historical frozen-source branch                                 | Recorded: run `37207036445` on `7c3fbec` fails before unique certification because `codex/device-regression-hotfix-after-phase2-20260713` is unavailable; current `28beb603` PR Equivalence is green; no frozen source/hash or gate altered |

No bounded P0/P1 compromise was reproduced. This is not proof against every
possible vulnerability; coverage and inaccessible settings are documented.

## Authorization and advisors

Production has 13 public application tables plus one private sync-state table;
all have RLS. No application views/materialized views or storage buckets were
found. There are 49 application functions, 32 SECURITY DEFINER functions, and
20 public authenticated SECURITY DEFINER RPCs. All inspected functions use an
empty fixed search path, PUBLIC/anon execution is revoked, and no dynamic SQL
or user-metadata-based authorization was found. Column grants are significant:
`has_table_privilege=false` is not by itself proof of zero column access.

Workspace/staff checks use immutable membership and `auth.uid()`. Students are
class enrollees, not workspace members. Privileged helpers remain private;
authenticated execution needed by RLS is deliberate, not permission to read
private tables. Analytics authorize before returning enrolled-student emails.
Result payloads are client-reported academic context, not cryptographic proof
of correctness; identity/enrollment/first-winner integrity remains server-owned.

Advisor disposition:

- Private `calcura_progress_private.sync_state`: RLS/no policy is intentional;
  browser schema/table/trigger-function access denied.
- `stripe_webhook_events`: RLS/no policy is intentional; browser table grants
  absent. Only trusted server receipt paths operate on it.
- Twenty authenticated SECURITY DEFINER warnings correspond to authorized
  tenant-scoped RPCs. Removing required DEFINER authority would break RLS
  boundary operations, not make them safer.
- Leaked-password warning remains actionable; no Auth setting changed.
- Three unindexed FKs (`classes.created_by`, `workspaces.created_by`, receipt
  `workspace_id`) are small-table/deletion-growth observations, not measured
  hot-path defects. No speculative index added.
- Two currently unused indexes are retained for expected enrollment/creator
  query/delete paths; absence of traffic on a young database is not evidence
  for safe removal.

The lifecycle migration replaces one private trigger, with 5s lock and 30s
statement bounds, no backfill or data deletion. Empty search path, owner/ACL,
all grants and RLS remain unchanged. Post-deployment definition was verified
read-only. Synthetic deletion and anti-reassignment tests ran only in a
disposable database. The production migration tool allocated the recorded
version; the source filename matches that history (not a history repair).

## Auth, browser, PWA and billing controls

Both UIs use six-digit email OTP and resend cooldown. Provider confirmation is
enabled; anonymous login, phone and listed social providers are disabled in
public live settings. Password-bearing accounts exist. OTP expiry, provider
quotas, CAPTCHA, redirect allowlist and MFA configuration require privileged
dashboard inspection; documented provider defaults are not asserted as live
settings. No OTP, access/refresh token, or Authorization logging was found in
the reviewed auth paths. Stale callbacks and cache/outbox keys are account
scoped and certified by progress/result/session regressions.

Teacher labels/error text use React escaping. Math rendering uses KaTeX,
escaped fallback rendering and validated graph ASTs. Editable Mathfield
currently uses broader KaTeX trust for internal caret marker commands; a future
narrow marker-only trust callback is a parity-sensitive hardening opportunity,
not a demonstrated remote teacher-content execution defect. Calcura's current
CSP denies inline/eval execution; the graph fast evaluator catches CSP denial
and retains its trusted evaluator fallback.

Classroom build CSP permits only configured Supabase HTTP/WebSocket and the
already validated Calcura preview origin. Marketing CSP permits self-hosted
assets and the existing Formspree contact endpoint. Styles remain inline-capable
for current UI geometry; scripts do not gain `unsafe-inline`/`unsafe-eval`.
Meta policy does not propagate to navigated `/app/`; Calcura already has its own
CSP/referrer policy. No broad UI or keyboard redesign was made.

PWA runtime caching is empty: static application precache only, no Auth/REST/
billing runtime-cache route. Private billing JSON already uses `no-store`.
First-class session/account regressions remain required; shared device users
must understand retained local offline work.

Billing uses verified raw-body Stripe signatures and canonical subscription
retrieval, configured mode/product/price validation, server workspace-role
checks, idempotent receipts and atomic reconciliation. Only owner/admin may
manage billing; educator/student/outsider denial is independent of CORS. Missing
Origin is not authentication. Checkout lease/handoff races and uncertain Stripe
responses preserve safe retry state. Wrong mode/foreign workspace/metadata,
unsupported prices/intervals and stale/replayed events remain denied. No live
payment, subscription, cancellation or customer was created for testing.

## Supply chain and code health

Deterministic installs and audit were run in all four repos. Classroom and Site
audits are zero. Calcura has 5 high affected build-tool package entries from
one braces advisory and 3 moderate entries from one UUID advisory. plots now
has zero high/critical and the same 3 moderate UUID tooling entries. These are
package entries, not independent vulnerabilities. No forced audit fix or major
dependency modernization was used. Deprecated UUID/glob tooling remains
documented rather than changing application identity behavior.

Local Gitleaks 8.30.1 scanned all-ref Git history with 100% redaction. All flagged
matches were individually classified as versioned activity identifiers or
browser-public publishable/anon configuration; no unexplained secret remained.
Examples of environment configuration contain placeholders, not live server
credentials. The browser release was separately inspected for complete private
tokens/service-role JWTs, not misleading literal SDK classifier strings.

Calcura raw TypeScript remains zero. No unrelated prototypes/backup witnesses,
grading fixtures or frozen corpora were removed. Existing import boundaries and
lazy graph renderer remain unchanged. No speculative performance rewrite was
made; plots runtime output was byte-identical after its tooling patch.

## Verification and operations

- Classroom baseline: 262 unit/integration tests, 509 pgTAP assertions.
- Hardened Classroom: 291 unit/integration tests; all billing Edge entrypoints
  typechecked; 530 pgTAP assertions including 21 new lifecycle/security checks;
  existing checkout concurrency/lint pass; 17 existing browser tests pass.
- Built CSP mobile smoke: Site 24 checks, Classroom 13 checks at 390×844; no real
  Auth requests/contact emails generated. Tests execute hostile probes in the
  page's normal script context, not privileged browser-debug evaluation.
- Calcura: typecheck, auth, progress/IndexedDB/cache, active session, assignment,
  result/PWA guards, 13 graph browser cases, complete Free Play regression and
  production build. Progress DB: 42 isolated concurrency/security assertions.
- plots: typecheck/unit/public API/27 browser cases/build/library verifier;
  JS/CSS hashes unchanged; final exact-head CI green.
- Site: source deployment/a11y/entry/quality gates, build, 102 built-artifact
  checks; immutable embedded student artifact unchanged.

Production verification uses read-only homepage/app/Classroom GETs, anonymous
RPC denial and unauthorized Edge requests, malformed webhook denial, provenance
and static-asset byte comparisons. An authorized live OTP round trip and real
paid billing flow remain **owner manual checks**, not claimed as automated.

Before acquisition, owner should verify database backup availability/restore
procedure, PITR plan support, support inbox, provider Auth quotas/CAPTCHA/redirects,
Stripe webhook delivery monitoring, failed-function logs and CI notifications.
No plan upgrade or external observability vendor was introduced. Supabase/GitHub
logs and existing quality-gated deployments remain the operational mechanisms.

One inherited scheduled-nightly failure remains an operational follow-up, not a
new mathematical acceptance failure: the source census cannot resolve a required
historical branch before unique certification starts. Preserve the immutable
provenance witness when repairing its availability; do not remove the check or
reseal the corpus. The failed run is
[37207036445](https://github.com/Kajin-0/Calcura/actions/runs/37207036445).
The unchanged current Calcura source's PR Equivalence run is green. No scheduled
certification repair or new client release was attempted in this campaign.

Rollback coordinates are source Git commits and prior Edge source bundles;
the private-trigger correction can be forward-fixed/replaced without data
rollback. No database reset, session killing or history repair is authorized.

## Owner pre-sales actions

**BLOCKER for commercial commitments:** approve truthful Privacy/Terms/contact
surfaces, retention and data-deletion/export procedure, processor disclosures
(Supabase/Stripe/Formspree), and educational/minor-data handling with qualified
legal review. Confirm an operational backup/restore and billing-cancellation
procedure. This document makes no legal-compliance claim.

**SHOULD DO SOON:** inspect live password protection/provider settings and OTP
abuse limits; establish owner/admin support deletion/export workflow; test live
OTP/sign-out, teacher enrollment/results and paid billing only under the owner's
existing authorized test procedure. Never delete a paying personal owner before
reconciling the external subscription and preserving required records.
Restore the inherited nightly's access to its historical frozen-source witness
without weakening certification or substituting new provenance.

**OPTIONAL:** immutable Actions SHA pinning, narrow Mathfield trust in a future
signed web/Android parity release, FK index additions when growth/query plans
justify them, and host-level header support if hosting requirements change.

The next step is the **owner live production checkpoint**, not another generic
audit or feature campaign.

## Current upstream guidance consulted

- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database functions](https://supabase.com/docs/guides/database/functions)
- [Passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Password security](https://supabase.com/docs/guides/auth/password-security)
- [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [No-policy advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Authenticated DEFINER advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
